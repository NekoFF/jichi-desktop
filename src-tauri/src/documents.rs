//! Dokumente lesen und schreiben — ohne Office, ohne Python.
//!
//! jichi kann von sich aus nur Text lesen. Ein Lebenslauf als PDF, eine
//! Tabelle als .xlsx, ein Bericht als .docx sind für ihn Binärmüll. Dieses Modul
//! macht aus ihnen Text, den ein Modell lesen kann (Tabellen als Markdown), und
//! baut umgekehrt aus Markdown ein Word-Dokument, aus Zeilen eine Excel-Mappe
//! und aus Text ein PDF.
//!
//! Benutzt wird es an zwei Stellen: als MCP-Server für den Agenten
//! (`mcp_dokumente.rs`) und für Anhänge im Eingabefeld.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use quick_xml::events::Event;
use quick_xml::Reader;

/// Grösste Datei, die gelesen wird. Darüber ist es kein Dokument mehr, das man
/// einem Modell zu lesen gibt.
pub const MAX_BYTES: u64 = 40 * 1024 * 1024;
/// Obergrenze für den gelieferten Text. Ein Kontextfenster ist endlich.
pub const MAX_CHARS: usize = 200_000;
/// Zeilen je Tabellenblatt, die als Markdown ausgegeben werden.
const MAX_ROWS: usize = 2_000;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Pdf,
    Docx,
    Sheet,
    Pptx,
    Odt,
    Text,
}

pub fn kind_of(path: &Path) -> Option<Kind> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "pdf" => Kind::Pdf,
        "docx" | "docm" => Kind::Docx,
        "xlsx" | "xlsm" | "xlsb" | "xls" | "ods" => Kind::Sheet,
        "pptx" => Kind::Pptx,
        "odt" => Kind::Odt,
        "csv" | "tsv" | "txt" | "md" | "markdown" | "json" | "xml" | "html" | "htm" | "rtf" => Kind::Text,
        _ => return None,
    })
}

/// Ist das eine Datei, die dieses Modul lesbar macht (und nicht ohnehin Text)?
pub fn is_document(path: &Path) -> bool {
    matches!(kind_of(path), Some(k) if k != Kind::Text)
}

/// Welche Teile gelesen werden sollen.
#[derive(Default, Clone)]
pub struct Auswahl {
    /// PDF: Seiten, 1-basiert, einschliesslich. `None` = alle.
    pub pages: Option<(usize, usize)>,
    /// Tabellen: nur dieses Blatt.
    pub sheet: Option<String>,
    pub max_chars: Option<usize>,
}

fn kappen(mut text: String, max: usize) -> String {
    if text.chars().count() > max {
        let cut: String = text.chars().take(max).collect();
        text = format!("{cut}\n\n… (gekürzt nach {max} Zeichen — mit `pages` oder `sheet` gezielt weiterlesen)");
    }
    text
}

/// Ein Dokument als Text. Tabellen als Markdown, PDFs mit Seitenmarken.
pub fn read(path: &Path, auswahl: &Auswahl) -> Result<String, String> {
    let meta = path.metadata().map_err(|e| format!("{}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("{} ist keine Datei", path.display()));
    }
    if meta.len() > MAX_BYTES {
        return Err(format!("{} ist größer als 40 MB.", path.display()));
    }
    let kind = kind_of(path).ok_or_else(|| {
        format!("{}: dieses Format kann ich nicht lesen (PDF, DOCX, XLSX/XLS/ODS, PPTX, ODT, CSV, Text).", path.display())
    })?;
    let text = match kind {
        Kind::Pdf => read_pdf(path, auswahl.pages)?,
        Kind::Docx => read_docx(path)?,
        Kind::Sheet => read_sheet(path, auswahl.sheet.as_deref())?,
        Kind::Pptx => read_pptx(path)?,
        Kind::Odt => read_odt(path)?,
        Kind::Text => {
            let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };
    if text.trim().is_empty() {
        return Ok(match kind {
            Kind::Pdf => "(Das PDF enthält keinen auslesbaren Text — vermutlich gescannte Seiten.)".into(),
            _ => "(Das Dokument ist leer.)".into(),
        });
    }
    Ok(kappen(text, auswahl.max_chars.unwrap_or(MAX_CHARS).min(MAX_CHARS)))
}

// ── PDF ──────────────────────────────────────────────────────────────────────

fn read_pdf(path: &Path, pages: Option<(usize, usize)>) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    // Ein kaputtes PDF darf den Server nicht umwerfen.
    let seiten = std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem_by_pages(&bytes))
        .map_err(|_| "Das PDF ließ sich nicht lesen.".to_string())?
        .map_err(|e| format!("Das PDF ließ sich nicht lesen: {e}"))?;
    let (von, bis) = pages.unwrap_or((1, seiten.len().max(1)));
    let von = von.max(1);
    let mut out = format!("[PDF, {} Seiten]\n", seiten.len());
    for (i, text) in seiten.iter().enumerate() {
        let n = i + 1;
        if n < von || n > bis {
            continue;
        }
        out.push_str(&format!("\n--- Seite {n} ---\n{}\n", text.trim()));
    }
    Ok(out)
}

// ── Office Open XML / OpenDocument (Zip mit XML) ─────────────────────────────

fn zip_entry(path: &Path, name: &str) -> Result<Option<String>, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| format!("{} ist kein gültiges Office-Dokument.", path.display()))?;
    let result = match zip.by_name(name) {
        Ok(mut entry) => {
            let mut s = String::new();
            entry.read_to_string(&mut s).map_err(|e| format!("{name}: {e}"))?;
            Ok(Some(s))
        }
        Err(_) => Ok(None),
    };
    result
}

fn local(name: &str) -> &str {
    name.rsplit(':').next().unwrap_or(name)
}

fn attr(e: &quick_xml::events::BytesStart, key: &str) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| local(a.key.as_ref()) == key)
        .map(|a| a.value.to_string())
}

/// `&amp;`, `&#228;` usw. als Zeichen.
fn entity(r: &quick_xml::events::BytesRef) -> String {
    if let Ok(Some(c)) = r.resolve_char_ref() {
        return c.to_string();
    }
    match r.as_ref() {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        _ => "",
    }
    .to_string()
}

/// `word/document.xml` zu Markdown: Überschriften, Absätze, Listen, Tabellen.
fn read_docx(path: &Path) -> Result<String, String> {
    let xml = zip_entry(path, "word/document.xml")?.ok_or("Das Dokument enthält keinen Text (word/document.xml fehlt).")?;
    Ok(docx_xml_to_markdown(&xml))
}

pub fn docx_xml_to_markdown(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    let mut out = String::new();
    let mut para = String::new();
    let mut style: Option<String> = None;
    let mut list = false;
    let mut in_text = false;
    // Tabellen: Zeilen aus Zellen aus Absätzen.
    let mut tabelle: Vec<Vec<String>> = Vec::new();
    let mut zeile: Vec<String> = Vec::new();
    let mut zelle = String::new();
    let mut tiefe = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local(e.name().as_ref()) {
                "p" => {
                    para.clear();
                    style = None;
                    list = false;
                }
                "pStyle" => style = attr(&e, "val"),
                "numPr" => list = true,
                "t" => in_text = true,
                "tab" => para.push('\t'),
                "br" | "cr" => para.push('\n'),
                "tbl" => {
                    tiefe += 1;
                    if tiefe == 1 {
                        tabelle.clear();
                    }
                }
                "tr" if tiefe == 1 => zeile.clear(),
                "tc" if tiefe == 1 => zelle.clear(),
                _ => {}
            },
            Ok(Event::Text(t)) if in_text => para.push_str(&t),
            Ok(Event::GeneralRef(r)) if in_text => para.push_str(&entity(&r)),
            Ok(Event::End(e)) => match local(e.name().as_ref()) {
                "t" => in_text = false,
                "p" => {
                    let text = para.trim_end().to_string();
                    if tiefe > 0 {
                        if !zelle.is_empty() && !text.is_empty() {
                            zelle.push(' ');
                        }
                        zelle.push_str(&text);
                    } else if !text.is_empty() {
                        let level = style
                            .as_deref()
                            .and_then(|s| {
                                let s = s.to_ascii_lowercase();
                                if s == "title" {
                                    Some(1)
                                } else {
                                    s.strip_prefix("heading")
                                        .or_else(|| s.strip_prefix("berschrift"))
                                        .or_else(|| s.strip_prefix("überschrift"))
                                        .and_then(|n| n.trim().parse::<usize>().ok())
                                }
                            });
                        match level {
                            Some(n) => out.push_str(&format!("{} {text}\n\n", "#".repeat(n.clamp(1, 6)))),
                            None if list => out.push_str(&format!("- {text}\n")),
                            None => out.push_str(&format!("{text}\n\n")),
                        }
                    }
                    para.clear();
                }
                "tc" if tiefe == 1 => zeile.push(zelle.replace('|', "\\|").replace('\n', " ")),
                "tr" if tiefe == 1 => tabelle.push(std::mem::take(&mut zeile)),
                "tbl" => {
                    if tiefe == 1 {
                        out.push_str(&markdown_table(&tabelle));
                        out.push('\n');
                    }
                    tiefe = tiefe.saturating_sub(1);
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    out.trim_end().to_string() + "\n"
}

fn markdown_table(rows: &[Vec<String>]) -> String {
    let breite = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if breite == 0 {
        return String::new();
    }
    let mut out = String::new();
    for (i, r) in rows.iter().enumerate() {
        let mut cells: Vec<String> = r.iter().map(|c| c.trim().to_string()).collect();
        cells.resize(breite, String::new());
        out.push_str(&format!("| {} |\n", cells.join(" | ")));
        if i == 0 {
            out.push_str(&format!("|{}\n", " --- |".repeat(breite)));
        }
    }
    out
}

fn read_pptx(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| format!("{} ist kein gültiges Office-Dokument.", path.display()))?;
    let mut folien: Vec<(usize, String)> = Vec::new();
    for i in 0..zip.len() {
        let Ok(mut entry) = zip.by_index(i) else { continue };
        let name = entry.name().to_string();
        let Some(n) = name
            .strip_prefix("ppt/slides/slide")
            .and_then(|r| r.strip_suffix(".xml"))
            .and_then(|n| n.parse::<usize>().ok())
        else {
            continue;
        };
        let mut xml = String::new();
        if entry.read_to_string(&mut xml).is_ok() {
            folien.push((n, text_runs(&xml, "p", "t")));
        }
    }
    folien.sort_by_key(|(n, _)| *n);
    Ok(folien
        .into_iter()
        .map(|(n, t)| format!("--- Folie {n} ---\n{}\n", t.trim()))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn read_odt(path: &Path) -> Result<String, String> {
    let xml = zip_entry(path, "content.xml")?.ok_or("Das Dokument enthält keinen Text (content.xml fehlt).")?;
    Ok(text_runs(&xml, "p", "span").replace("\n\n\n", "\n\n"))
}

/// Allgemein: Text in Absätze (`para`) sammeln. `run` ist das Element, dessen
/// Text zählt — für ODT zählt aller Text innerhalb eines Absatzes.
fn text_runs(xml: &str, para: &str, _run: &str) -> String {
    let mut reader = Reader::from_str(xml);
    let mut out = String::new();
    let mut aktuell = String::new();
    let mut offen = 0usize;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let n = local(e.name().as_ref()).to_string();
                if n == para || n == "h" {
                    offen += 1;
                    aktuell.clear();
                }
            }
            Ok(Event::Empty(e)) => {
                let n = local(e.name().as_ref()).to_string();
                if (n == "tab" || n == "s") && offen > 0 {
                    aktuell.push(' ');
                } else if n == "line-break" || n == "br" {
                    aktuell.push('\n');
                }
            }
            Ok(Event::Text(t)) if offen > 0 => aktuell.push_str(&t),
            Ok(Event::GeneralRef(r)) if offen > 0 => aktuell.push_str(&entity(&r)),
            Ok(Event::End(e)) => {
                let n = local(e.name().as_ref()).to_string();
                if (n == para || n == "h") && offen > 0 {
                    offen -= 1;
                    if !aktuell.trim().is_empty() {
                        out.push_str(aktuell.trim());
                        out.push('\n');
                    }
                    aktuell.clear();
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

// ── Tabellen ─────────────────────────────────────────────────────────────────

pub fn sheet_names(path: &Path) -> Result<Vec<String>, String> {
    let wb = calamine::open_workbook_auto(path).map_err(|e| format!("{}: {e}", path.display()))?;
    use calamine::Reader as _;
    Ok(wb.sheet_names().to_vec())
}

fn read_sheet(path: &Path, only: Option<&str>) -> Result<String, String> {
    use calamine::Reader as _;
    let mut wb = calamine::open_workbook_auto(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let names = wb.sheet_names().to_vec();
    if let Some(o) = only {
        if !names.iter().any(|n| n == o) {
            return Err(format!("Kein Blatt „{o}“. Vorhanden: {}", names.join(", ")));
        }
    }
    let mut out = String::new();
    for name in names.iter().filter(|n| only.is_none_or(|o| o == n.as_str())) {
        let range = wb.worksheet_range(name).map_err(|e| format!("{name}: {e}"))?;
        // Formeln dazu: eine Datei, die nie in Excel geöffnet war, trägt für sie
        // keinen berechneten Wert — ohne die Formel stünde dort nur „0“.
        let formeln = wb.worksheet_formula(name).ok();
        let (h, w) = range.get_size();
        out.push_str(&format!("## Blatt „{name}“ ({h} Zeilen × {w} Spalten)\n\n"));
        let (r0, c0) = range.start().unwrap_or((0, 0));
        let rows: Vec<Vec<String>> = range
            .rows()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(ri, r)| {
                r.iter()
                    .enumerate()
                    .map(|(ci, c)| {
                        let wert = c.to_string();
                        let formel = formeln
                            .as_ref()
                            .and_then(|f| f.get_value((r0 + ri as u32, c0 + ci as u32)))
                            .filter(|f| !f.is_empty());
                        let text = match formel {
                            Some(f) if wert.is_empty() || wert == "0" => format!("={f}"),
                            Some(f) => format!("{wert} (={f})"),
                            None => wert,
                        };
                        text.replace('|', "\\|").replace('\n', " ")
                    })
                    .collect()
            })
            .collect();
        out.push_str(&markdown_table(&rows));
        if h > MAX_ROWS {
            out.push_str(&format!("\n… {} weitere Zeilen nicht gezeigt\n", h - MAX_ROWS));
        }
        out.push('\n');
    }
    Ok(out)
}

// ── Schreiben ────────────────────────────────────────────────────────────────

/// Ein Block aus einfachem Markdown.
#[derive(Debug, PartialEq)]
pub enum Block {
    Heading(usize, String),
    Para(String),
    Bullet(String),
    Numbered(usize, String),
    Code(String),
    Table(Vec<Vec<String>>),
    Rule,
}

/// Genau das Markdown, das Modelle schreiben: Überschriften, Absätze,
/// Listen, Code, Tabellen, Trennlinien. Mehr braucht ein Bericht nicht.
pub fn parse_markdown(md: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut lines = md.lines().peekable();
    let mut para: Vec<String> = Vec::new();
    let flush = |para: &mut Vec<String>, blocks: &mut Vec<Block>| {
        if !para.is_empty() {
            blocks.push(Block::Para(para.join(" ")));
            para.clear();
        }
    };
    while let Some(line) = lines.next() {
        let t = line.trim_end();
        let s = t.trim_start();
        if s.starts_with("```") {
            flush(&mut para, &mut blocks);
            let mut code = Vec::new();
            for l in lines.by_ref() {
                if l.trim_start().starts_with("```") {
                    break;
                }
                code.push(l.to_string());
            }
            blocks.push(Block::Code(code.join("\n")));
        } else if s.is_empty() {
            flush(&mut para, &mut blocks);
        } else if let Some(rest) = s.strip_prefix('#') {
            flush(&mut para, &mut blocks);
            let level = 1 + rest.chars().take_while(|c| *c == '#').count();
            blocks.push(Block::Heading(level.min(6), rest.trim_start_matches('#').trim().to_string()));
        } else if s == "---" || s == "***" || s == "___" {
            flush(&mut para, &mut blocks);
            blocks.push(Block::Rule);
        } else if let Some(item) = s.strip_prefix("- ").or_else(|| s.strip_prefix("* ")).or_else(|| s.strip_prefix("• ")) {
            flush(&mut para, &mut blocks);
            blocks.push(Block::Bullet(item.trim().to_string()));
        } else if let Some((n, item)) = s.split_once(". ").filter(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit())) {
            flush(&mut para, &mut blocks);
            blocks.push(Block::Numbered(n.parse().unwrap_or(1), item.trim().to_string()));
        } else if s.starts_with('|') {
            flush(&mut para, &mut blocks);
            let mut rows = vec![table_cells(s)];
            while let Some(next) = lines.peek() {
                let n = next.trim();
                if !n.starts_with('|') {
                    break;
                }
                let cells = table_cells(n);
                if !cells.iter().all(|c| c.chars().all(|ch| matches!(ch, '-' | ':' | ' ')) && !c.is_empty()) {
                    rows.push(cells);
                }
                lines.next();
            }
            blocks.push(Block::Table(rows));
        } else {
            para.push(s.to_string());
        }
    }
    flush(&mut para, &mut blocks);
    blocks
}

fn table_cells(line: &str) -> Vec<String> {
    let inner = line.trim().trim_start_matches('|').trim_end_matches('|');
    inner.split('|').map(|c| c.trim().replace("\\|", "|")).collect()
}

/// Ein Stück Text mit Auszeichnung.
#[derive(Debug, PartialEq)]
pub struct Span {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub code: bool,
}

/// `**fett**`, `*kursiv*`, `` `code` `` innerhalb einer Zeile.
pub fn parse_inline(text: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut buf = String::new();
    let (mut bold, mut italic) = (false, false);
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    let push = |buf: &mut String, spans: &mut Vec<Span>, bold: bool, italic: bool, code: bool| {
        if !buf.is_empty() {
            spans.push(Span { text: std::mem::take(buf), bold, italic, code });
        }
    };
    while i < chars.len() {
        let c = chars[i];
        if c == '`' {
            if let Some(end) = chars[i + 1..].iter().position(|x| *x == '`') {
                push(&mut buf, &mut spans, bold, italic, false);
                let code: String = chars[i + 1..i + 1 + end].iter().collect();
                spans.push(Span { text: code, bold, italic, code: true });
                i += end + 2;
                continue;
            }
        }
        if (c == '*' || c == '_') && chars.get(i + 1) == Some(&c) {
            push(&mut buf, &mut spans, bold, italic, false);
            bold = !bold;
            i += 2;
            continue;
        }
        if c == '*' {
            push(&mut buf, &mut spans, bold, italic, false);
            italic = !italic;
            i += 1;
            continue;
        }
        buf.push(c);
        i += 1;
    }
    push(&mut buf, &mut spans, bold, italic, false);
    spans
}

/// Ziel prüfen: im Projekt, Endung passt, nichts wird stillschweigend überschrieben.
pub fn target(root: &Path, path: &str, ext: &[&str], overwrite: bool) -> Result<PathBuf, String> {
    let rel = Path::new(path);
    let wanted = if rel.is_absolute() { rel.to_path_buf() } else { root.join(rel) };
    let e = wanted.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
    if !ext.contains(&e.as_str()) {
        return Err(format!("Der Dateiname muss auf .{} enden.", ext.join(" oder .")));
    }
    let parent = wanted.parent().ok_or("Ungültiger Pfad.")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    let canon_root = root.canonicalize().map_err(|e| format!("{}: {e}", root.display()))?;
    let canon_parent = parent.canonicalize().map_err(|e| format!("{}: {e}", parent.display()))?;
    if !canon_parent.starts_with(&canon_root) {
        return Err("Der Pfad liegt ausserhalb des Projekts.".into());
    }
    let file = canon_parent.join(wanted.file_name().ok_or("Dateiname fehlt.")?);
    if let Ok(meta) = std::fs::symlink_metadata(&file) {
        if meta.file_type().is_symlink() {
            return Err("Das Ziel ist ein Verweis — er wird nicht überschrieben.".into());
        }
        if !overwrite {
            return Err(format!("{} gibt es schon. Mit overwrite: true ersetzen.", path));
        }
    }
    Ok(file)
}

/// Erst in eine Nachbardatei schreiben, dann umbenennen: ein Abbruch hinterlässt
/// nie eine halbe Datei am Ziel.
fn atomar(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = file.with_extension(format!(
        "{}.jichi-tmp",
        file.extension().and_then(|e| e.to_str()).unwrap_or("tmp")
    ));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| format!("{}: {e}", tmp.display()))?;
        f.write_all(bytes).map_err(|e| format!("{}: {e}", tmp.display()))?;
    }
    std::fs::rename(&tmp, file).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{}: {e}", file.display())
    })
}

// Word

pub fn write_docx(file: &Path, title: Option<&str>, markdown: &str) -> Result<(), String> {
    use docx_rs::*;

    let mono = || RunFonts::new().ascii("Courier New").hi_ansi("Courier New").cs("Courier New");
    let grau = || Shading::new().shd_type(ShdType::Clear).color("auto").fill("F1F3F6");
    let run_of = |s: &Span, size: Option<usize>| {
        let mut r = Run::new().add_text(&s.text);
        if s.bold {
            r = r.bold();
        }
        if s.italic {
            r = r.italic();
        }
        if s.code {
            r = r.fonts(mono()).size(19).shading(grau());
        } else if let Some(sz) = size {
            r = r.size(sz);
        }
        r
    };
    let para_of = |text: &str, size: Option<usize>| {
        parse_inline(text).iter().fold(Paragraph::new(), |p, s| p.add_run(run_of(s, size)))
    };

    // Echte Formatvorlagen, keine bloß großen Buchstaben: so erscheinen die
    // Überschriften im Navigationsbereich von Word und lassen sich umgestalten.
    const GROESSE: [usize; 6] = [32, 27, 24, 22, 22, 22];
    const VOR: [u32; 6] = [360, 280, 220, 200, 160, 160];
    let mut doc = Docx::new()
        .default_fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri").cs("Calibri").east_asia("Calibri"))
        .default_size(22)
        .default_line_spacing(LineSpacing::new().after(140).line(276))
        .add_style(
            Style::new("Title", StyleType::Paragraph)
                .name("Title")
                .size(48)
                .bold()
                .color("0B111C")
                .line_spacing(LineSpacing::new().after(240)),
        );
    for (i, sz) in GROESSE.iter().enumerate() {
        doc = doc.add_style(
            Style::new(format!("Heading{}", i + 1), StyleType::Paragraph)
                .name(format!("heading {}", i + 1))
                .size(*sz)
                .bold()
                .color(if i == 0 { "0A4FC4" } else { "1F2A44" })
                .line_spacing(LineSpacing::new().before(VOR[i]).after(100)),
        );
    }
    if let Some(t) = title.filter(|t| !t.trim().is_empty()) {
        doc = doc.add_paragraph(Paragraph::new().style("Title").add_run(Run::new().add_text(t)));
    }
    for block in parse_markdown(markdown) {
        doc = match block {
            Block::Heading(level, text) => {
                let p = parse_inline(&text)
                    .iter()
                    .fold(Paragraph::new().style(&format!("Heading{}", level.clamp(1, 6))), |p, s| p.add_run(run_of(s, None)));
                doc.add_paragraph(p)
            }
            Block::Para(text) => doc.add_paragraph(para_of(&text, None)),
            Block::Bullet(text) => doc.add_paragraph(
                para_of(&format!("•\t{text}"), None)
                    .indent(Some(420), Some(SpecialIndentType::Hanging(280)), None, None)
                    .line_spacing(LineSpacing::new().after(60)),
            ),
            Block::Numbered(n, text) => doc.add_paragraph(
                para_of(&format!("{n}.\t{text}"), None)
                    .indent(Some(420), Some(SpecialIndentType::Hanging(280)), None, None)
                    .line_spacing(LineSpacing::new().after(60)),
            ),
            Block::Code(code) => {
                let n = code.lines().count();
                code.lines().enumerate().fold(doc, |d, (i, l)| {
                    d.add_paragraph(
                        Paragraph::new()
                            .add_run(Run::new().add_text(if l.is_empty() { " " } else { l }).fonts(mono()).size(19).shading(grau()))
                            .indent(Some(200), None, None, None)
                            .line_spacing(LineSpacing::new().after(if i + 1 == n { 160 } else { 0 }).line(240)),
                    )
                })
            }
            Block::Rule => doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text("—".repeat(24)))),
            Block::Table(rows) => {
                let table_rows = rows
                    .iter()
                    .enumerate()
                    .map(|(i, r)| {
                        TableRow::new(
                            r.iter()
                                .map(|c| {
                                    let p = parse_inline(c).iter().fold(Paragraph::new(), |p, s| {
                                        let run = run_of(s, None);
                                        p.add_run(if i == 0 { run.bold() } else { run })
                                    });
                                    let zelle = TableCell::new().add_paragraph(p.line_spacing(LineSpacing::new().after(0)));
                                    if i == 0 {
                                        zelle.shading(Shading::new().shd_type(ShdType::Clear).color("auto").fill("EEF2F7"))
                                    } else {
                                        zelle
                                    }
                                })
                                .collect(),
                        )
                    })
                    .collect();
                let rand = TableCellMargins::new()
                    .margin_top(70, WidthType::Dxa)
                    .margin_bottom(70, WidthType::Dxa)
                    .margin_left(110, WidthType::Dxa)
                    .margin_right(110, WidthType::Dxa);
                doc.add_table(Table::new(table_rows).width(5000, WidthType::Pct).margins(rand))
                    .add_paragraph(Paragraph::new().line_spacing(LineSpacing::new().after(60)))
            }
        };
    }
    let mut buf = std::io::Cursor::new(Vec::new());
    doc.build().pack(&mut buf).map_err(|e| format!("Word-Datei: {e}"))?;
    atomar(file, &buf.into_inner())
}

// Excel

pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<serde_json::Value>>,
}

pub fn write_xlsx(file: &Path, sheets: &[SheetData]) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};
    if sheets.is_empty() {
        return Err("Mindestens ein Blatt angeben.".into());
    }
    let mut wb = Workbook::new();
    let kopf = Format::new().set_bold();
    for sheet in sheets {
        let ws = wb.add_worksheet();
        let name: String = sheet.name.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
        if !name.trim().is_empty() {
            ws.set_name(&name).map_err(|e| format!("Blattname „{}“: {e}", sheet.name))?;
        }
        for (r, row) in sheet.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                let (r, c) = (r as u32, c as u16);
                let res = match cell {
                    serde_json::Value::Null => Ok(()),
                    serde_json::Value::Bool(b) => ws.write_boolean(r, c, *b).map(|_| ()),
                    serde_json::Value::Number(n) => ws.write_number(r, c, n.as_f64().unwrap_or(0.0)).map(|_| ()),
                    serde_json::Value::String(s) if s.starts_with('=') => ws.write_formula(r, c, s.as_str()).map(|_| ()),
                    serde_json::Value::String(s) if r == 0 => ws.write_string_with_format(r, c, s, &kopf).map(|_| ()),
                    serde_json::Value::String(s) => ws.write_string(r, c, s).map(|_| ()),
                    other => ws.write_string(r, c, other.to_string()).map(|_| ()),
                };
                res.map_err(|e| format!("Zelle {}{}: {e}", col_name(c as usize), r + 1))?;
            }
        }
        ws.autofit();
    }
    let bytes = wb.save_to_buffer().map_err(|e| format!("Excel-Datei: {e}"))?;
    atomar(file, &bytes)
}

fn col_name(mut c: usize) -> String {
    let mut s = String::new();
    loop {
        s.insert(0, (b'A' + (c % 26) as u8) as char);
        if c < 26 {
            return s;
        }
        c = c / 26 - 1;
    }
}

// CSV

pub fn write_csv(file: &Path, rows: &[Vec<serde_json::Value>]) -> Result<(), String> {
    let mut out = String::new();
    for row in rows {
        let line: Vec<String> = row
            .iter()
            .map(|v| {
                let s = match v {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Null => String::new(),
                    other => other.to_string(),
                };
                if s.contains([',', '"', '\n', ';']) {
                    format!("\"{}\"", s.replace('"', "\"\""))
                } else {
                    s
                }
            })
            .collect();
        out.push_str(&line.join(","));
        out.push_str("\r\n");
    }
    atomar(file, out.as_bytes())
}

// PDF — klein und ohne fremde Schriften

/// Ein PDF aus Markdown, mit den 14 Standardschriften jedes PDF-Betrachters.
///
/// Bewusst schlicht: A4, Helvetica, Überschriften fett, Code in Courier,
/// automatische Seitenumbrüche. Die Standardschriften können WinAnsi
/// (Westeuropa: ä, ö, ü, ß, é, €); andere Zeichen werden durch „?“ ersetzt und
/// das Ergebnis sagt, wie viele. Für ein gestaltetes Dokument ist Word das
/// bessere Ziel.
pub fn write_pdf(file: &Path, title: Option<&str>, markdown: &str) -> Result<usize, String> {
    let mut pdf = PdfText::new();
    if let Some(t) = title.filter(|t| !t.trim().is_empty()) {
        pdf.text(t, Font::Bold, 20.0, 0.0);
        pdf.gap(8.0);
    }
    for block in parse_markdown(markdown) {
        match block {
            Block::Heading(level, text) => {
                pdf.gap(if level <= 2 { 10.0 } else { 6.0 });
                pdf.text(&strip_inline(&text), Font::Bold, [17.0, 14.5, 12.5, 11.5, 11.0, 11.0][level.saturating_sub(1).min(5)], 0.0);
                pdf.gap(3.0);
            }
            Block::Para(text) => {
                pdf.text(&strip_inline(&text), Font::Regular, 10.5, 0.0);
                pdf.gap(6.0);
            }
            Block::Bullet(text) => pdf.bullet("•", &strip_inline(&text)),
            Block::Numbered(n, text) => pdf.bullet(&format!("{n}."), &strip_inline(&text)),
            Block::Code(code) => {
                for l in code.lines() {
                    pdf.text(if l.is_empty() { " " } else { l }, Font::Mono, 9.0, 8.0);
                }
                pdf.gap(6.0);
            }
            Block::Rule => {
                pdf.gap(4.0);
                pdf.rule();
                pdf.gap(6.0);
            }
            Block::Table(rows) => {
                let rows: Vec<Vec<String>> = rows.iter().map(|r| r.iter().map(|c| strip_inline(c)).collect()).collect();
                pdf.table(&rows);
                pdf.gap(8.0);
            }
        }
    }
    let (bytes, ersetzt) = pdf.finish(title.unwrap_or("Dokument"));
    atomar(file, &bytes)?;
    Ok(ersetzt)
}

fn strip_inline(text: &str) -> String {
    parse_inline(text).into_iter().map(|s| s.text).collect()
}

#[derive(Clone, Copy, PartialEq)]
enum Font {
    Regular,
    Bold,
    Mono,
}

/// Näherungsweise Breiten der Helvetica in 1/1000 em — genug für einen
/// linksbündigen Umbruch, der nicht über den Rand läuft.
fn helvetica_width(c: char, bold: bool) -> f32 {
    let w = match c {
        ' ' | 'i' | 'j' | 'l' | '.' | ',' | ':' | ';' | '!' | '\'' | '|' => 278.0,
        'f' | 't' | 'r' | '(' | ')' | '[' | ']' | '-' | '/' => 333.0,
        'm' => 833.0,
        'w' => 722.0,
        'M' => 833.0,
        'W' => 944.0,
        'A'..='Z' => 690.0,
        '0'..='9' => 556.0,
        _ => 556.0,
    };
    if bold { w * 1.06 } else { w }
}

/// Ein Zeichen in WinAnsi (CP1252), `None` wenn es dort keins gibt.
fn winansi(c: char) -> Option<u8> {
    let u = c as u32;
    if (0x20..0x7f).contains(&u) || (0xa0..=0xff).contains(&u) {
        return Some(u as u8);
    }
    Some(match c {
        '€' => 0x80, '‚' => 0x82, '„' => 0x84, '…' => 0x85, '†' => 0x86, '‡' => 0x87,
        '‰' => 0x89, 'Š' => 0x8a, '‹' => 0x8b, 'Œ' => 0x8c, 'Ž' => 0x8e, '‘' => 0x91,
        '’' => 0x92, '“' => 0x93, '”' => 0x94, '•' => 0x95, '–' => 0x96, '—' => 0x97,
        '™' => 0x99, 'š' => 0x9a, '›' => 0x9b, 'œ' => 0x9c, 'ž' => 0x9e, 'Ÿ' => 0x9f,
        '\t' => b' ',
        _ => return None,
    })
}

struct PdfText {
    pages: Vec<String>,
    page: String,
    y: f32,
    replaced: usize,
}

const PAGE_W: f32 = 595.0;
const PAGE_H: f32 = 842.0;
const MARGIN: f32 = 64.0;

impl PdfText {
    fn new() -> Self {
        PdfText { pages: Vec::new(), page: String::new(), y: PAGE_H - MARGIN, replaced: 0 }
    }

    fn need(&mut self, h: f32) {
        if self.y - h < MARGIN {
            self.pages.push(std::mem::take(&mut self.page));
            self.y = PAGE_H - MARGIN;
        }
    }

    fn gap(&mut self, h: f32) {
        self.y -= h;
    }

    fn encode(&mut self, s: &str) -> String {
        let mut out = String::new();
        for c in s.chars() {
            let b = winansi(c).unwrap_or_else(|| {
                self.replaced += 1;
                b'?'
            });
            match b {
                b'(' | b')' | b'\\' => {
                    out.push('\\');
                    out.push(b as char);
                }
                0x20..=0x7e => out.push(b as char),
                _ => out.push_str(&format!("\\{:03o}", b)),
            }
        }
        out
    }

    fn line(&mut self, s: &str, font: Font, size: f32, x: f32) {
        let lead = size * 1.35;
        self.need(lead);
        self.y -= lead;
        let f = match font {
            Font::Regular => "F1",
            Font::Bold => "F2",
            Font::Mono => "F3",
        };
        let enc = self.encode(s);
        self.page.push_str(&format!("BT /{f} {size} Tf {:.1} {:.1} Td ({enc}) Tj ET\n", MARGIN + x, self.y));
    }

    /// Umbrechen auf die Breite zwischen den Rändern.
    fn text(&mut self, s: &str, font: Font, size: f32, x: f32) {
        let max = PAGE_W - 2.0 * MARGIN - x;
        let width = |w: &str| -> f32 {
            if font == Font::Mono {
                w.chars().count() as f32 * 600.0 * size / 1000.0
            } else {
                w.chars().map(|c| helvetica_width(c, font == Font::Bold)).sum::<f32>() * size / 1000.0
            }
        };
        for para in s.split('\n') {
            let mut line = String::new();
            for word in para.split(' ') {
                let cand = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
                if width(&cand) > max && !line.is_empty() {
                    self.line(&line, font, size, x);
                    line = word.to_string();
                } else {
                    line = cand;
                }
            }
            self.line(&line, font, size, x);
        }
    }

    fn bullet(&mut self, mark: &str, text: &str) {
        let before = self.y;
        self.text(text, Font::Regular, 10.5, 16.0);
        // Die Marke auf die erste Zeile setzen.
        let first = before - 10.5 * 1.35;
        if first > MARGIN {
            let enc = self.encode(mark);
            self.page.push_str(&format!("BT /F1 10.5 Tf {:.1} {:.1} Td ({enc}) Tj ET\n", MARGIN + 2.0, first));
        }
        self.gap(2.0);
    }

    /// Eine Tabelle mit Spalten: Breiten nach Inhalt, Zellen brechen in ihrer
    /// Spalte um, Kopfzeile fett und grau hinterlegt, feine Linien dazwischen.
    fn table(&mut self, rows: &[Vec<String>]) {
        const SIZE: f32 = 9.5;
        const PAD: f32 = 5.0;
        let cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
        if cols == 0 {
            return;
        }
        let avail = PAGE_W - 2.0 * MARGIN;
        let breite = |s: &str, bold: bool| s.chars().map(|c| helvetica_width(c, bold)).sum::<f32>() * SIZE / 1000.0;
        let mut want: Vec<f32> = (0..cols)
            .map(|c| {
                rows.iter()
                    .enumerate()
                    .map(|(i, r)| r.get(c).map(|s| breite(s, i == 0)).unwrap_or(0.0))
                    .fold(24.0, f32::max)
                    + 2.0 * PAD
            })
            .collect();
        let sum: f32 = want.iter().sum();
        if sum > avail {
            // Zu breit: Spalten anteilig schmaler, keine unter 50 pt.
            for w in &mut want {
                *w = (*w * avail / sum).max(50.0);
            }
        }
        let wrap = |s: &str, max: f32, bold: bool| -> Vec<String> {
            let mut out = Vec::new();
            let mut line = String::new();
            for word in s.split_whitespace() {
                let cand = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
                if breite(&cand, bold) > max && !line.is_empty() {
                    out.push(std::mem::replace(&mut line, word.to_string()));
                } else {
                    line = cand;
                }
            }
            out.push(line);
            out
        };
        let lead = SIZE * 1.3;
        let right = MARGIN + want.iter().sum::<f32>();
        for (i, r) in rows.iter().enumerate() {
            let bold = i == 0;
            let cells: Vec<Vec<String>> = (0..cols)
                .map(|c| wrap(r.get(c).map(String::as_str).unwrap_or(""), want[c] - 2.0 * PAD, bold))
                .collect();
            let lines = cells.iter().map(Vec::len).max().unwrap_or(1).max(1);
            let h = lines as f32 * lead + 2.0 * PAD - 2.0;
            self.need(h + 2.0);
            let top = self.y;
            if bold {
                self.page.push_str(&format!("0.93 0.95 0.97 rg {MARGIN} {:.1} {:.1} {:.1} re f 0 g\n", top - h, right - MARGIN, h));
            }
            let mut x = MARGIN;
            for (c, cell) in cells.iter().enumerate() {
                for (k, l) in cell.iter().enumerate() {
                    let enc = self.encode(l);
                    let f = if bold { "F2" } else { "F1" };
                    let baseline = top - PAD - SIZE - k as f32 * lead + 2.0;
                    self.page.push_str(&format!("BT /{f} {SIZE} Tf {:.1} {:.1} Td ({enc}) Tj ET\n", x + PAD, baseline));
                }
                x += want[c];
            }
            self.y = top - h;
            self.page.push_str(&format!("0.82 G 0.5 w {MARGIN} {:.1} m {right:.1} {:.1} l S 0 G\n", self.y, self.y));
        }
    }

    fn rule(&mut self) {
        self.need(2.0);
        self.page.push_str(&format!("0.75 G 0.6 w {MARGIN} {:.1} m {:.1} {:.1} l S 0 G\n", self.y, PAGE_W - MARGIN, self.y));
    }

    fn finish(mut self, title: &str) -> (Vec<u8>, usize) {
        if !self.page.is_empty() || self.pages.is_empty() {
            self.pages.push(std::mem::take(&mut self.page));
        }
        let n = self.pages.len();
        // Objekte: 1 Katalog, 2 Seiten, 3–5 Schriften, 6 Info, dann je Seite Seite + Inhalt.
        let mut objs: Vec<String> = Vec::new();
        objs.push("<< /Type /Catalog /Pages 2 0 R >>".into());
        let kids: Vec<String> = (0..n).map(|i| format!("{} 0 R", 7 + 2 * i)).collect();
        objs.push(format!("<< /Type /Pages /Kids [{}] /Count {n} >>", kids.join(" ")));
        for base in ["Helvetica", "Helvetica-Bold", "Courier"] {
            objs.push(format!("<< /Type /Font /Subtype /Type1 /BaseFont /{base} /Encoding /WinAnsiEncoding >>"));
        }
        let title_enc = self.encode(title);
        objs.push(format!("<< /Title ({title_enc}) /Producer (jichi Desktop) >>"));
        let pages = std::mem::take(&mut self.pages);
        for (i, content) in pages.iter().enumerate() {
            objs.push(format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {} 0 R >>",
                8 + 2 * i
            ));
            objs.push(format!("<< /Length {} >>\nstream\n{content}endstream", content.len()));
        }
        let mut out: Vec<u8> = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n".to_vec();
        let mut offsets = Vec::new();
        for (i, o) in objs.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj\n{o}\nendobj\n", i + 1).as_bytes());
        }
        let xref = out.len();
        out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).as_bytes());
        for off in offsets {
            out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
        }
        out.extend_from_slice(
            format!("trailer\n<< /Size {} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n", objs.len() + 1).as_bytes(),
        );
        (out, self.replaced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join("jichi-desktop-test-dokumente").join(name);
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    const MD: &str = "# Bericht\n\nDas ist **wichtig** und *leise*, mit `code`.\n\n- eins\n- zwei\n\n1. erst\n2. dann\n\n| Name | Wert |\n| --- | --- |\n| ä | 1 |\n\n```\nfn main() {}\n```\n";

    #[test]
    fn markdown_wird_in_bloecke_zerlegt() {
        let b = parse_markdown(MD);
        assert_eq!(b[0], Block::Heading(1, "Bericht".into()));
        assert!(matches!(&b[1], Block::Para(t) if t.contains("**wichtig**")));
        assert_eq!(b[2], Block::Bullet("eins".into()));
        assert_eq!(b[4], Block::Numbered(1, "erst".into()));
        assert_eq!(b[6], Block::Table(vec![vec!["Name".into(), "Wert".into()], vec!["ä".into(), "1".into()]]));
        assert_eq!(b[7], Block::Code("fn main() {}".into()));
        let spans = parse_inline("a **b** *c* `d`");
        assert!(spans.iter().any(|s| s.text == "b" && s.bold));
        assert!(spans.iter().any(|s| s.text == "c" && s.italic));
        assert!(spans.iter().any(|s| s.text == "d" && s.code));
    }

    #[test]
    fn word_hin_und_zurueck() {
        let d = tmp("word");
        let f = d.join("bericht.docx");
        write_docx(&f, Some("Titel"), MD).unwrap();
        let text = read(&f, &Auswahl::default()).unwrap();
        assert!(text.contains("Titel"), "{text}");
        assert!(text.contains("Bericht"));
        assert!(text.contains("wichtig"));
        assert!(text.contains("| Name | Wert |"), "{text}");
        assert!(text.contains("ä"));
    }

    #[test]
    fn excel_hin_und_zurueck() {
        let d = tmp("excel");
        let f = d.join("zahlen.xlsx");
        let rows = vec![
            vec![serde_json::json!("Monat"), serde_json::json!("Umsatz")],
            vec![serde_json::json!("Jan"), serde_json::json!(1200.5)],
            vec![serde_json::json!("Feb"), serde_json::json!(990)],
        ];
        write_xlsx(&f, &[SheetData { name: "Umsatz 2026".into(), rows }]).unwrap();
        assert_eq!(sheet_names(&f).unwrap(), vec!["Umsatz 2026"]);
        let text = read(&f, &Auswahl::default()).unwrap();
        assert!(text.contains("| Monat | Umsatz |"), "{text}");
        assert!(text.contains("1200.5"), "{text}");
        assert!(read(&f, &Auswahl { sheet: Some("fehlt".into()), ..Default::default() }).is_err());
    }

    #[test]
    fn pdf_hin_und_zurueck() {
        let d = tmp("pdf");
        let f = d.join("brief.pdf");
        let ersetzt = write_pdf(&f, Some("Brief"), &format!("{MD}\nGrüße aus Gießen — 5 €. Привет")).unwrap();
        assert_eq!(ersetzt, 6, "sechs kyrillische Zeichen gehen nicht in WinAnsi");
        let text = read(&f, &Auswahl::default()).unwrap();
        assert!(text.contains("[PDF, 1 Seiten]"), "{text}");
        assert!(text.contains("Bericht"), "{text}");
        assert!(text.contains("Grüße aus Gießen"), "{text}");
    }

    #[test]
    fn langes_pdf_bricht_um_und_liest_seitenweise() {
        let d = tmp("pdf-lang");
        let f = d.join("lang.pdf");
        let md: String = (1..=200).map(|i| format!("Absatz {i} mit etwas Text.\n\n")).collect();
        write_pdf(&f, None, &md).unwrap();
        let alles = read(&f, &Auswahl::default()).unwrap();
        assert!(!alles.contains("[PDF, 1 Seiten]"), "{}", &alles[..40]);
        let zwei = read(&f, &Auswahl { pages: Some((2, 2)), ..Default::default() }).unwrap();
        assert!(zwei.contains("--- Seite 2 ---") && !zwei.contains("--- Seite 1 ---") && !zwei.contains("--- Seite 3 ---"));
    }

    #[test]
    fn csv_wird_korrekt_maskiert() {
        let d = tmp("csv");
        let f = d.join("a.csv");
        write_csv(&f, &[vec![serde_json::json!("a,b"), serde_json::json!("sagt \"hi\""), serde_json::json!(3)]]).unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "\"a,b\",\"sagt \"\"hi\"\"\",3\r\n");
    }

    #[test]
    fn ziele_bleiben_im_projekt_und_ueberschreiben_nicht() {
        let d = tmp("ziel");
        let projekt = d.join("projekt");
        std::fs::create_dir_all(&projekt).unwrap();
        assert!(target(&projekt, "out/bericht.docx", &["docx"], false).is_ok());
        assert!(target(&projekt, "../draussen.docx", &["docx"], false).is_err());
        assert!(target(&projekt, "bericht.txt", &["docx"], false).is_err());
        std::fs::write(projekt.join("da.docx"), "x").unwrap();
        assert!(target(&projekt, "da.docx", &["docx"], false).is_err());
        assert!(target(&projekt, "da.docx", &["docx"], true).is_ok());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(d.join("fremd.docx"), projekt.join("link.docx")).unwrap();
            assert!(target(&projekt, "link.docx", &["docx"], true).is_err());
        }
    }

    #[test]
    fn unbekanntes_format_wird_klar_abgelehnt() {
        let d = tmp("fremd");
        let f = d.join("bild.png");
        std::fs::write(&f, [0u8; 4]).unwrap();
        let e = read(&f, &Auswahl::default()).unwrap_err();
        assert!(e.contains("kann ich nicht lesen"), "{e}");
    }
}
