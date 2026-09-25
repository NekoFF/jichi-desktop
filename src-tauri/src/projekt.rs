//! Der Projektordner für die Seitenleiste: Baum, Lesen, Schreiben, Vorschau.
//!
//! Jede Funktion bekommt den Projektordner und einen Pfad darin und prüft
//! selbst, dass sie ihn nicht verlässt — die Oberfläche nennt nur Pfade.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Ordner, die im Baum stehen, aber nie von selbst aufgeklappt werden: gross
/// und selten das, was man sucht.
const SCHWER: &[&str] = &["node_modules", "target", "dist", "build", ".venv", "venv", "__pycache__", ".next"];
/// Ganz ausgeblendet.
const VERSTECKT: &[&str] = &[".git", ".DS_Store"];
/// Höchstens so viele Einträge je Ordner — ein Ordner mit 50 000 Dateien
/// soll die Anzeige nicht einfrieren.
const MAX_EINTRAEGE: usize = 2_000;
/// Grösste Textdatei, die gelesen wird.
const MAX_TEXT: u64 = 4 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eintrag {
    pub name: String,
    /// Relativ zum Projekt, mit `/`.
    pub path: String,
    pub dir: bool,
    pub size: u64,
    /// Gross und selten gesucht (node_modules …): nicht von selbst aufklappen.
    pub heavy: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Liste {
    pub entries: Vec<Eintrag>,
    pub truncated: bool,
}

pub fn root_of(cwd: &str) -> Result<PathBuf, String> {
    crate::expand_tilde(cwd).canonicalize().map_err(|_| format!("{cwd} ist nicht lesbar"))
}

/// Ein Pfad im Projekt — vorhanden oder nicht; der Ordner darüber muss im Projekt liegen.
pub fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    let full = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let check = match full.canonicalize() {
        Ok(c) => c,
        Err(_) => {
            let parent = full.parent().ok_or("Ungültiger Pfad.")?;
            let parent = parent.canonicalize().map_err(|_| format!("{rel}: Ordner fehlt"))?;
            parent.join(full.file_name().ok_or("Ungültiger Pfad.")?)
        }
    };
    if !check.starts_with(root) {
        return Err("Der Pfad liegt ausserhalb des Projekts.".into());
    }
    Ok(check)
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).to_string_lossy().replace('\\', "/")
}

pub fn list_dir(cwd: &str, rel: &str) -> Result<Liste, String> {
    let root = root_of(cwd)?;
    let dir = if rel.is_empty() { root.clone() } else { inside(&root, rel)? };
    let rd = std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let mut entries: Vec<Eintrag> = Vec::new();
    let mut truncated = false;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if VERSTECKT.contains(&name.as_str()) {
            continue;
        }
        if entries.len() >= MAX_EINTRAEGE {
            truncated = true;
            break;
        }
        let Ok(ft) = e.file_type() else { continue };
        // Verweise werden gezeigt, aber nur, wenn ihr Ziel im Projekt liegt.
        let path = e.path();
        let (dir_like, size) = if ft.is_symlink() {
            match path.canonicalize() {
                Ok(t) if t.starts_with(&root) => (t.is_dir(), t.metadata().map(|m| m.len()).unwrap_or(0)),
                _ => continue,
            }
        } else {
            (ft.is_dir(), e.metadata().map(|m| m.len()).unwrap_or(0))
        };
        entries.push(Eintrag {
            heavy: dir_like && SCHWER.contains(&name.as_str()),
            path: rel_of(&root, &path),
            name,
            dir: dir_like,
            size: if dir_like { 0 } else { size },
        });
    }
    entries.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(Liste { entries, truncated })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Text {
    pub path: String,
    pub text: String,
    pub size: u64,
    /// Änderungszeit in Millisekunden — für die Konfliktprüfung beim Speichern.
    pub modified: u128,
    /// Enthält Nullbytes: keine Textdatei.
    pub binary: bool,
}

fn modified_ms(p: &Path) -> u128 {
    p.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub fn read_text(cwd: &str, rel: &str) -> Result<Text, String> {
    let root = root_of(cwd)?;
    let file = inside(&root, rel)?;
    let meta = file.metadata().map_err(|_| format!("{rel} gibt es nicht (mehr)."))?;
    if !meta.is_file() {
        return Err(format!("{rel} ist keine Datei."));
    }
    if meta.len() > MAX_TEXT {
        return Err(format!("{rel} ist größer als 4 MB — zu groß für die Anzeige."));
    }
    let bytes = std::fs::read(&file).map_err(|e| format!("{rel}: {e}"))?;
    let binary = bytes.iter().take(8192).any(|b| *b == 0);
    Ok(Text {
        path: rel_of(&root, &file),
        text: if binary { String::new() } else { String::from_utf8_lossy(&bytes).into_owned() },
        size: meta.len(),
        modified: modified_ms(&file),
        binary,
    })
}

/// Speichern — aber nur, wenn die Datei seit dem Lesen niemand geändert hat
/// (der Agent zum Beispiel). Sonst ginge seine Änderung kommentarlos verloren.
pub fn write_text(cwd: &str, rel: &str, text: &str, expected_modified: Option<u128>) -> Result<u128, String> {
    let root = root_of(cwd)?;
    let file = inside(&root, rel)?;
    if let Ok(meta) = std::fs::symlink_metadata(&file) {
        if meta.file_type().is_symlink() {
            return Err("Die Datei ist ein Verweis — sie wird nicht überschrieben.".into());
        }
    }
    if let Some(expected) = expected_modified {
        let now = modified_ms(&file);
        if now != 0 && now != expected {
            return Err("Die Datei wurde inzwischen geändert (vielleicht von jichi). Neu laden, dann erneut speichern.".into());
        }
    }
    let tmp = file.with_extension(format!(
        "{}.jichi-tmp",
        file.extension().and_then(|e| e.to_str()).unwrap_or("tmp")
    ));
    std::fs::write(&tmp, text).map_err(|e| format!("{rel}: {e}"))?;
    // Rechte der alten Datei behalten (ein Skript bleibt ausführbar).
    if let Ok(meta) = file.metadata() {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, &file).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{rel}: {e}")
    })?;
    Ok(modified_ms(&file))
}

/// Tabellen für die Vorschau: je Blatt die Zeilen als Text.
#[derive(Serialize)]
pub struct Blatt {
    pub name: String,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
}

pub fn read_sheets(cwd: &str, rel: &str) -> Result<Vec<Blatt>, String> {
    use calamine::Reader as _;
    let root = root_of(cwd)?;
    let file = inside(&root, rel)?;
    if file.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("csv") || e.eq_ignore_ascii_case("tsv")) {
        let text = std::fs::read_to_string(&file).map_err(|e| format!("{rel}: {e}"))?;
        let sep = if rel.to_ascii_lowercase().ends_with(".tsv") { '\t' } else { detect_sep(&text) };
        let rows: Vec<Vec<String>> = text.lines().take(5_000).map(|l| split_csv(l, sep)).collect();
        return Ok(vec![Blatt { name: "CSV".into(), truncated: text.lines().count() > 5_000, rows }]);
    }
    let mut wb = calamine::open_workbook_auto(&file).map_err(|e| format!("{rel}: {e}"))?;
    let names = wb.sheet_names().to_vec();
    let mut out = Vec::new();
    for name in names {
        let range = wb.worksheet_range(&name).map_err(|e| format!("{name}: {e}"))?;
        let (h, _) = range.get_size();
        let rows = range.rows().take(5_000).map(|r| r.iter().map(|c| c.to_string()).collect()).collect();
        out.push(Blatt { name, rows, truncated: h > 5_000 });
    }
    Ok(out)
}

fn detect_sep(text: &str) -> char {
    let first = text.lines().next().unwrap_or("");
    if first.matches(';').count() > first.matches(',').count() { ';' } else { ',' }
}

/// Eine CSV-Zeile mit Anführungszeichen.
fn split_csv(line: &str, sep: char) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            c if c == sep && !quoted => out.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
    }
    out.push(cur);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projekt(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join("jichi-desktop-test-projekt").join(name);
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(d.join("src")).unwrap();
        std::fs::create_dir_all(d.join("node_modules/x")).unwrap();
        std::fs::create_dir_all(d.join(".git")).unwrap();
        std::fs::write(d.join("src/main.rs"), "fn main() {}\n").unwrap();
        std::fs::write(d.join("README.md"), "# Hallo\n").unwrap();
        std::fs::write(d.join("bild.png"), [0x89, b'P', 0, 0]).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn baum_ordnet_und_blendet_aus() {
        let d = projekt("baum");
        let l = list_dir(d.to_str().unwrap(), "").unwrap();
        let names: Vec<_> = l.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["node_modules", "src", "bild.png", "README.md"], "Ordner zuerst, .git fehlt");
        assert!(l.entries[0].heavy && !l.entries[1].heavy);
        let src = list_dir(d.to_str().unwrap(), "src").unwrap();
        assert_eq!(src.entries[0].path, "src/main.rs");
        assert!(list_dir(d.to_str().unwrap(), "..").is_err());
    }

    #[test]
    fn lesen_erkennt_binaer_und_schreiben_prueft_konflikte() {
        let d = projekt("lesen");
        let cwd = d.to_str().unwrap();
        let t = read_text(cwd, "README.md").unwrap();
        assert_eq!(t.text, "# Hallo\n");
        assert!(!t.binary);
        assert!(read_text(cwd, "bild.png").unwrap().binary);
        assert!(read_text(cwd, "../x").is_err());

        let neu = write_text(cwd, "README.md", "# Neu\n", Some(t.modified)).unwrap();
        assert_eq!(std::fs::read_to_string(d.join("README.md")).unwrap(), "# Neu\n");
        // Jemand anderes schreibt dazwischen …
        std::thread::sleep(std::time::Duration::from_millis(15));
        std::fs::write(d.join("README.md"), "# Von jichi\n").unwrap();
        let e = write_text(cwd, "README.md", "# Meins\n", Some(neu)).unwrap_err();
        assert!(e.contains("inzwischen geändert"), "{e}");
        assert_eq!(std::fs::read_to_string(d.join("README.md")).unwrap(), "# Von jichi\n", "nichts überschrieben");
        assert!(write_text(cwd, "../draussen.txt", "x", None).is_err());
    }

    #[test]
    fn csv_mit_anfuehrungszeichen() {
        assert_eq!(split_csv(r#"a,"b, c","sagt ""hi""""#, ','), ["a", "b, c", "sagt \"hi\""]);
        assert_eq!(detect_sep("a;b;c\n1;2;3"), ';');
    }
}
