//! Chats: eigene Namen, angeheftete, Suche im Inhalt, Export.
//!
//! Die Sitzungen gehören jichi (`~/.jichi.d/sessions/<id>.json`) — er
//! überschreibt die Datei nach jedem Zug. Umbenennen und Anheften legt diese
//! Anwendung darum *daneben* ab, in ihrer eigenen Datei, statt jichis Datei
//! anzufassen: sonst wäre der neue Name beim nächsten Zug wieder weg.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub pinned: bool,
}

pub fn meta_file(app_dir: &Path) -> PathBuf {
    app_dir.join("chats.json")
}

pub fn read_meta(file: &Path) -> BTreeMap<String, Meta> {
    std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn set_meta(file: &Path, id: &str, title: Option<Option<String>>, pinned: Option<bool>) -> Result<BTreeMap<String, Meta>, String> {
    if id.is_empty() {
        return Err("Die Sitzungs-ID fehlt.".into());
    }
    let mut all = read_meta(file);
    let m = all.entry(id.to_string()).or_default();
    if let Some(t) = title {
        m.title = t.map(|s| s.trim().chars().take(120).collect::<String>()).filter(|s| !s.is_empty());
    }
    if let Some(p) = pinned {
        m.pinned = p;
    }
    if *m == Meta::default() {
        all.remove(id);
    }
    let text = serde_json::to_string_pretty(&all).map_err(|e| e.to_string())?;
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, file).map_err(|e| format!("{}: {e}", file.display()))?;
    Ok(all)
}

pub fn forget(file: &Path, id: &str) {
    let mut all = read_meta(file);
    if all.remove(id).is_some() {
        if let Ok(text) = serde_json::to_string_pretty(&all) {
            let _ = std::fs::write(file, text);
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Treffer {
    pub id: String,
    /// Ein Stück Text um die Fundstelle.
    pub snippet: String,
    pub role: String,
}

/// Den Text einer gespeicherten Nachricht holen — `content` ist ein String
/// oder eine Liste von Blöcken.
fn text_of(m: &serde_json::Value) -> String {
    match m.get("content") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(a)) => a
            .iter()
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn snippet(text: &str, at: usize, len: usize) -> String {
    let start = text[..at].char_indices().rev().nth(40).map(|(i, _)| i).unwrap_or(0);
    let end = text[at + len..].char_indices().nth(80).map(|(i, _)| at + len + i).unwrap_or(text.len());
    let mut s = text[start..end].replace(['\n', '\r', '\t'], " ");
    if start > 0 {
        s.insert(0, '…');
    }
    if end < text.len() {
        s.push('…');
    }
    s
}

/// Alle Sitzungen nach einem Begriff durchsuchen — Groß/klein egal, ein Treffer je Sitzung.
pub fn search(dir: &Path, query: &str) -> Vec<Treffer> {
    let q = query.trim().to_lowercase();
    if q.chars().count() < 2 {
        return Vec::new();
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&p) else { continue };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let id = json
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or_else(|| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
            .unwrap_or_default();
        let hist = json.get("history").and_then(|h| h.as_array()).cloned().unwrap_or_default();
        for m in &hist {
            let t = text_of(m);
            let lower = t.to_lowercase();
            // Kleinschreibung kann die Länge in Bytes ändern; dann ohne Ausschnitt.
            if let Some(at) = lower.find(&q) {
                let snip = if lower.len() == t.len() { snippet(&t, at, q.len()) } else { t.chars().take(120).collect() };
                out.push(Treffer {
                    id: id.clone(),
                    snippet: snip,
                    role: m.get("role").and_then(|r| r.as_str()).unwrap_or("").to_string(),
                });
                break;
            }
        }
        if out.len() >= 50 {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn namen_und_anheften_bleiben_neben_jichi() {
        let d = std::env::temp_dir().join("jichi-desktop-test-chats");
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(&d).unwrap();
        let f = meta_file(&d);
        set_meta(&f, "S1", Some(Some("  Mein Projekt  ".into())), None).unwrap();
        set_meta(&f, "S1", None, Some(true)).unwrap();
        let m = read_meta(&f);
        assert_eq!(m["S1"], Meta { title: Some("Mein Projekt".into()), pinned: true });
        // Name zurücksetzen und lösen: der Eintrag verschwindet ganz.
        set_meta(&f, "S1", Some(None), Some(false)).unwrap();
        assert!(read_meta(&f).is_empty());
        assert!(set_meta(&f, "", None, Some(true)).is_err());
    }

    #[test]
    fn suche_findet_im_inhalt() {
        let d = std::env::temp_dir().join("jichi-desktop-test-suche");
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("A.json"), r#"{"sessionId":"A","history":[{"role":"user","content":"Wie baue ich das Makefile?"},{"role":"assistant","content":"Mit make all."}]}"#).unwrap();
        std::fs::write(d.join("B.json"), r#"{"sessionId":"B","history":[{"role":"user","content":[{"type":"text","text":"Größe der Datei"}]}]}"#).unwrap();
        std::fs::write(d.join("kaputt.json"), "{").unwrap();
        let t = search(&d, "makefile");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].id, "A");
        assert!(t[0].snippet.contains("Makefile"), "{:?}", t[0]);
        assert_eq!(search(&d, "GRÖSSE").len(), 0, "ß ≠ ss, aber Großschreibung egal:");
        assert_eq!(search(&d, "größe")[0].id, "B");
        assert!(search(&d, "x").is_empty(), "ein Zeichen sucht nicht");
    }
}
