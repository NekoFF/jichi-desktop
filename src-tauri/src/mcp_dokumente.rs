//! Ein MCP-Server für Dokumente — derselbe Programmcode wie das Fenster.
//!
//! Aufruf: `jichi-desktop --mcp-dokumente`
//!
//! jichi startet ihn aus seiner Konfiguration (`mcpServers`, Name `dokumente`)
//! und spricht mit ihm zeilenweise JSON-RPC über stdin/stdout. Er bietet
//! Werkzeuge an, die jichi nicht hat: PDF, Word, Excel, PowerPoint und
//! OpenDocument lesen; Word, Excel, PDF und CSV schreiben.
//!
//! **Grenze:** alles relativ zum Startverzeichnis — das ist der Projektordner,
//! in dem jichi läuft. Kein Pfad führt hinaus, und nichts wird ohne
//! `overwrite: true` ersetzt. Lesen läuft ohne Rückfrage (`autoApprove`),
//! Schreiben fragt jichi wie bei jedem anderen Werkzeug.

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::documents::{self, Auswahl, SheetData};

pub const FLAG: &str = "--mcp-dokumente";

fn tools() -> Value {
    let overwrite = json!({ "type": "boolean", "description": "Eine vorhandene Datei ersetzen. Standard: false." });
    json!([
        {
            "name": "read_document",
            "description": "Liest PDF, Word (.docx), Excel (.xlsx/.xls/.ods), PowerPoint (.pptx), OpenDocument (.odt) oder CSV als Text. Tabellen kommen als Markdown, PDFs mit Seitenmarken. Pfade relativ zum Projekt.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Datei im Projekt" },
                    "pages": { "type": "string", "description": "Nur PDF: Seiten, z. B. \"3\" oder \"2-5\"" },
                    "sheet": { "type": "string", "description": "Nur Tabellen: ein Blatt" },
                    "max_chars": { "type": "integer", "description": "Höchstens so viele Zeichen (Standard 200000)" }
                },
                "required": ["path"]
            }
        },
        {
            "name": "list_sheets",
            "description": "Nennt die Blätter einer Excel- oder ODS-Datei.",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
            "name": "create_docx",
            "description": "Erstellt ein Word-Dokument aus Markdown: Überschriften (#), Absätze, **fett**, *kursiv*, `code`, Listen, Tabellen, Codeblöcke.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Ziel im Projekt, endet auf .docx" },
                    "markdown": { "type": "string" },
                    "title": { "type": "string", "description": "Optionaler Titel über dem Text" },
                    "overwrite": overwrite
                },
                "required": ["path", "markdown"]
            }
        },
        {
            "name": "create_xlsx",
            "description": "Erstellt eine Excel-Mappe. Jedes Blatt hat Zeilen aus Zellen (Text, Zahl, Wahrheitswert; Text mit \"=\" am Anfang wird Formel). Die erste Zeile wird fett.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Ziel im Projekt, endet auf .xlsx" },
                    "sheets": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "rows": { "type": "array", "items": { "type": "array" } }
                            },
                            "required": ["rows"]
                        }
                    },
                    "overwrite": overwrite
                },
                "required": ["path", "sheets"]
            }
        },
        {
            "name": "create_pdf",
            "description": "Erstellt ein PDF (A4) aus Markdown: Überschriften, Absätze mit **fett**, *kursiv* und `code`, Listen, Tabellen, Codeblöcke. Unicode-Schrift eingebettet: Deutsch, Russisch, Griechisch, ✓ ✗ ⚠ → ≤ € gehen; nur Chinesisch/Japanisch/Koreanisch und farbige Emoji nicht.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Ziel im Projekt, endet auf .pdf" },
                    "markdown": { "type": "string" },
                    "title": { "type": "string" },
                    "overwrite": overwrite
                },
                "required": ["path", "markdown"]
            }
        },
        {
            "name": "create_csv",
            "description": "Schreibt eine CSV-Datei (Komma, UTF-8) aus Zeilen.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Ziel im Projekt, endet auf .csv" },
                    "rows": { "type": "array", "items": { "type": "array" } },
                    "overwrite": overwrite
                },
                "required": ["path", "rows"]
            }
        }
    ])
}

fn arg_str<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key).and_then(Value::as_str).ok_or_else(|| format!("„{key}“ fehlt."))
}

/// Eine vorhandene Datei im Projekt.
fn existing(root: &Path, path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let full = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let canon = full.canonicalize().map_err(|_| format!("{path} gibt es nicht."))?;
    let canon_root = root.canonicalize().map_err(|e| format!("{}: {e}", root.display()))?;
    if !canon.starts_with(&canon_root) {
        return Err("Der Pfad liegt ausserhalb des Projekts.".into());
    }
    Ok(canon)
}

fn pages(spec: &str) -> Result<(usize, usize), String> {
    let spec = spec.trim();
    let parse = |s: &str| s.trim().parse::<usize>().map_err(|_| format!("Seiten „{spec}“ verstehe ich nicht (z. B. \"3\" oder \"2-5\")."));
    match spec.split_once('-') {
        Some((a, b)) => Ok((parse(a)?, parse(b)?)),
        None => {
            let n = parse(spec)?;
            Ok((n, n))
        }
    }
}

fn rows_of(v: &Value) -> Result<Vec<Vec<Value>>, String> {
    v.as_array()
        .ok_or("„rows“ muss eine Liste von Zeilen sein.")?
        .iter()
        .map(|r| r.as_array().cloned().ok_or_else(|| "Jede Zeile muss eine Liste sein.".to_string()))
        .collect()
}

/// Ein Werkzeug ausführen. `Ok` ist der Text für das Modell.
pub fn call(root: &Path, name: &str, args: &Value) -> Result<String, String> {
    let overwrite = args.get("overwrite").and_then(Value::as_bool).unwrap_or(false);
    match name {
        "read_document" => {
            let path = arg_str(args, "path")?;
            let file = existing(root, path)?;
            let auswahl = Auswahl {
                pages: args.get("pages").and_then(Value::as_str).map(pages).transpose()?,
                sheet: args.get("sheet").and_then(Value::as_str).map(str::to_string),
                max_chars: args.get("max_chars").and_then(Value::as_u64).map(|n| n as usize),
            };
            documents::read(&file, &auswahl)
        }
        "list_sheets" => {
            let file = existing(root, arg_str(args, "path")?)?;
            Ok(documents::sheet_names(&file)?.join("\n"))
        }
        "create_docx" => {
            let path = arg_str(args, "path")?;
            let file = documents::target(root, path, &["docx"], overwrite)?;
            documents::write_docx(&file, args.get("title").and_then(Value::as_str), arg_str(args, "markdown")?)?;
            Ok(format!("{path} erstellt."))
        }
        "create_pdf" => {
            let path = arg_str(args, "path")?;
            let file = documents::target(root, path, &["pdf"], overwrite)?;
            let ersetzt = documents::write_pdf(&file, args.get("title").and_then(Value::as_str), arg_str(args, "markdown")?)?;
            Ok(if ersetzt > 0 {
                format!("{path} erstellt. {ersetzt} Zeichen hatten in der Schrift keine Form (z. B. Chinesisch) und wurden durch ? ersetzt — dafür create_docx verwenden.")
            } else {
                format!("{path} erstellt.")
            })
        }
        "create_xlsx" => {
            let path = arg_str(args, "path")?;
            let file = documents::target(root, path, &["xlsx"], overwrite)?;
            let sheets = args
                .get("sheets")
                .and_then(Value::as_array)
                .ok_or("„sheets“ fehlt.")?
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    Ok(SheetData {
                        name: s.get("name").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("Blatt {}", i + 1)),
                        rows: rows_of(s.get("rows").unwrap_or(&Value::Null))?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            documents::write_xlsx(&file, &sheets)?;
            Ok(format!("{path} erstellt ({} Blatt/Blätter).", sheets.len()))
        }
        "create_csv" => {
            let path = arg_str(args, "path")?;
            let file = documents::target(root, path, &["csv"], overwrite)?;
            documents::write_csv(&file, &rows_of(args.get("rows").unwrap_or(&Value::Null))?)?;
            Ok(format!("{path} erstellt."))
        }
        other => Err(format!("unbekanntes Werkzeug {other}")),
    }
}

/// Eine JSON-RPC-Nachricht beantworten. `None` für Benachrichtigungen.
pub fn handle(root: &Path, msg: &Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let id = id?; // Benachrichtigungen (notifications/initialized …) brauchen keine Antwort.
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": msg.pointer("/params/protocolVersion").and_then(Value::as_str).unwrap_or("2024-11-05"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "jichi-dokumente", "version": env!("CARGO_PKG_VERSION") }
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => {
            let name = msg.pointer("/params/name").and_then(Value::as_str).unwrap_or("");
            let args = msg.pointer("/params/arguments").cloned().unwrap_or(json!({}));
            // Ein Fehler im Werkzeug ist ein Ergebnis mit isError, kein Protokollfehler:
            // so liest das Modell, was schiefging, und kann es anders versuchen.
            let (text, is_error) = match std::panic::catch_unwind(|| call(root, name, &args)) {
                Ok(Ok(t)) => (t, false),
                Ok(Err(e)) => (e, true),
                Err(_) => ("Das Dokument ließ sich nicht verarbeiten.".to_string(), true),
            };
            Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
        }
        _ => Err(json!({ "code": -32601, "message": format!("{method} wird nicht angeboten") })),
    };
    Some(match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err(e) => json!({ "jsonrpc": "2.0", "id": id, "error": e }),
    })
}

/// Die Schleife: bis stdin endet.
pub fn serve() {
    let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(&root, &msg),
            Err(_) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "kein gültiges JSON" } })),
        };
        if let Some(r) = reply {
            if writeln!(stdout, "{r}").and_then(|_| stdout.flush()).is_err() {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protokoll_und_werkzeuge() {
        let root = std::env::temp_dir().join("jichi-desktop-test-mcp");
        std::fs::remove_dir_all(&root).ok();
        std::fs::create_dir_all(&root).unwrap();

        let init = handle(&root, &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}})).unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        assert!(handle(&root, &json!({"jsonrpc":"2.0","method":"notifications/initialized"})).is_none());
        let list = handle(&root, &json!({"jsonrpc":"2.0","id":2,"method":"tools/list"})).unwrap();
        let names: Vec<_> = list["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap().to_string()).collect();
        assert!(names.contains(&"read_document".to_string()) && names.contains(&"create_xlsx".to_string()));

        let rufe = |id: u64, name: &str, args: Value| {
            handle(&root, &json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":name,"arguments":args}})).unwrap()
        };
        let ok = rufe(3, "create_docx", json!({"path":"doc/bericht.docx","markdown":"# Hallo\n\nWelt"}));
        assert_eq!(ok["result"]["isError"], false, "{ok}");
        let gelesen = rufe(4, "read_document", json!({"path":"doc/bericht.docx"}));
        assert!(gelesen["result"]["content"][0]["text"].as_str().unwrap().contains("# Hallo"), "{gelesen}");
        let nochmal = rufe(5, "create_docx", json!({"path":"doc/bericht.docx","markdown":"x"}));
        assert_eq!(nochmal["result"]["isError"], true, "ohne overwrite kein Ersetzen");
        let raus = rufe(6, "read_document", json!({"path":"../../etc/hosts"}));
        assert_eq!(raus["result"]["isError"], true);
        let xl = rufe(7, "create_xlsx", json!({"path":"t.xlsx","sheets":[{"name":"A","rows":[["x","y"],[1,"=A2*2"]]}]}));
        assert_eq!(xl["result"]["isError"], false, "{xl}");
        let blaetter = rufe(8, "list_sheets", json!({"path":"t.xlsx"}));
        assert_eq!(blaetter["result"]["content"][0]["text"], "A");
        let unbekannt = handle(&root, &json!({"jsonrpc":"2.0","id":9,"method":"resources/list"})).unwrap();
        assert_eq!(unbekannt["error"]["code"], -32601);
        std::fs::remove_dir_all(&root).ok();
    }
}
