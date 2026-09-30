//! jichis eigene Dokumentation: finden, lesen, durchsuchen — und jichi selbst
//! als Nachschlagewerk geben.
//!
//! `make install` liefert `docs/` nicht mit (jichi `docs/STATE.md`), also liegt
//! die Dokumentation im Quellbaum, aus dem jichi gebaut wurde — neben dem
//! Programm. Dort wird zuerst gesucht; sonst an einem Ort, den der Benutzer
//! nennt. Gelesen wird nur Markdown **innerhalb** dieses Ordners.
//!
//! Für die Modelle: ein Eintrag `{"name":"jichi","path":…}` in `docs` der
//! Konfiguration. jichi indiziert ihn dann selbst und gibt dem Modell
//! `search_docs` (braucht ein Modell mit der Rolle `embed`, jichi `docs/DOCS.md`).

use std::path::{Path, PathBuf};

use serde::Serialize;

/// So heisst die Quelle in jichis `docs`-Liste und im Werkzeug `search_docs`.
pub const QUELLE: &str = "jichi";
/// Grösser ist keine Seite der Dokumentation; mehr liest die Ansicht nicht.
const SEITE_MAX: u64 = 2 * 1024 * 1024;
const LISTE_MAX: usize = 3000;

/// Sieht der Ordner aus wie jichis `docs/`? Die Karte allein genügt nicht —
/// jedes Projekt hat eine README.md.
pub fn ist_jichi_doku(dir: &Path) -> bool {
    dir.join("README.md").is_file() && dir.join("VOCABULARY.md").is_file() && dir.join("SETUP_WIZARD.md").is_file()
}

/// Wo die Dokumentation zu diesem Programm liegen kann: im Quellbaum neben dem
/// Programm (so wird jichi gebaut) oder in einem share-Verzeichnis.
pub fn kandidaten(programm: &Path) -> Vec<PathBuf> {
    let echt = programm.canonicalize().unwrap_or_else(|_| programm.to_path_buf());
    let mut v = Vec::new();
    if let Some(dir) = echt.parent() {
        v.push(dir.join("docs"));
        if let Some(prefix) = dir.parent() {
            v.push(prefix.join("share/doc/jichi"));
            v.push(prefix.join("share/jichi/docs"));
        }
    }
    v
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DokuOrt {
    pub root: String,
    /// `programm` (neben jichi gefunden) oder `eingestellt` (vom Benutzer).
    pub quelle: &'static str,
    /// Der Git-Stand der Dokumentation, wenn sie in einem Checkout liegt — zum
    /// Vergleich mit der `build:`-Zeile von `jichi --version`.
    pub commit: Option<String>,
}

pub fn finden(programm: Option<&Path>, eingestellt: Option<&Path>) -> Option<DokuOrt> {
    if let Some(p) = eingestellt.filter(|p| ist_jichi_doku(p)) {
        return Some(ort(p, "eingestellt"));
    }
    programm
        .map(kandidaten)
        .unwrap_or_default()
        .into_iter()
        .find(|d| ist_jichi_doku(d))
        .map(|d| ort(&d, "programm"))
}

fn ort(dir: &Path, quelle: &'static str) -> DokuOrt {
    let root = crate::projekt::fuer_programme(&dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf()));
    let commit = std::process::Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    DokuOrt { root: root.to_string_lossy().into_owned(), quelle, commit }
}

/// Eine Seite lesen — nur `.md`, nur innerhalb der Dokumentation, nicht über
/// einen Link hinaus.
pub fn lesen(root: &Path, rel: &str) -> Result<String, String> {
    let rel = rel.trim().trim_start_matches("./").split('#').next().unwrap_or("");
    if !rel.to_ascii_lowercase().ends_with(".md") {
        return Err(format!("{rel}: nur Markdown-Seiten der Dokumentation."));
    }
    let wurzel = root.canonicalize().map_err(|_| format!("{} ist nicht lesbar.", root.display()))?;
    let datei = wurzel.join(rel).canonicalize().map_err(|_| format!("{rel}: nicht gefunden."))?;
    if !datei.starts_with(&wurzel) {
        return Err(format!("{rel}: liegt ausserhalb der Dokumentation."));
    }
    let meta = std::fs::metadata(&datei).map_err(|e| format!("{rel}: {e}"))?;
    if meta.len() > SEITE_MAX {
        return Err(format!("{rel}: zu gross für die Ansicht."));
    }
    std::fs::read_to_string(&datei).map_err(|e| format!("{rel}: {e}"))
}

/// Alle Seiten, als Pfade relativ zur Dokumentation (mit `/`), sortiert.
pub fn liste(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stapel = vec![root.to_path_buf()];
    while let Some(dir) = stapel.pop() {
        let Ok(eintraege) = std::fs::read_dir(&dir) else { continue };
        for e in eintraege.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let Ok(typ) = e.file_type() else { continue };
            // Keinen Verweisen folgen: die Ansicht bleibt im Ordner.
            if typ.is_symlink() {
                continue;
            }
            let p = e.path();
            if typ.is_dir() {
                stapel.push(p);
            } else if name.to_ascii_lowercase().ends_with(".md") {
                if let Ok(r) = p.strip_prefix(root) {
                    out.push(r.to_string_lossy().replace('\\', "/"));
                }
            }
            if out.len() >= LISTE_MAX {
                break;
            }
        }
    }
    out.sort();
    out
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Treffer {
    pub datei: String,
    pub zeile: usize,
    pub text: String,
}

/// Volltextsuche für die Ansicht: jedes Wort muss in der Zeile stehen, gross
/// oder klein egal. Pro Seite höchstens drei Treffer, Seiten mit Treffer im
/// Dateinamen zuerst. (Für das Modell sucht jichi selbst, mit Embeddings.)
pub fn suchen(root: &Path, anfrage: &str, max: usize) -> Vec<Treffer> {
    let woerter: Vec<String> = anfrage.split_whitespace().map(str::to_lowercase).filter(|w| !w.is_empty()).collect();
    if woerter.is_empty() {
        return Vec::new();
    }
    let mut seiten = liste(root);
    // Wie viele Wörter der Anfrage schon im Dateinamen stehen: mehr zuerst.
    let im_namen = |s: &String| woerter.iter().filter(|w| s.to_lowercase().contains(w.as_str())).count();
    seiten.sort_by_key(|s| (std::cmp::Reverse(im_namen(s)), s.matches('/').count(), s.clone()));
    let mut out = Vec::new();
    for rel in seiten {
        let Ok(text) = std::fs::read_to_string(root.join(&rel)) else { continue };
        let mut hier = 0;
        for (i, zeile) in text.lines().enumerate() {
            let klein = zeile.to_lowercase();
            if woerter.iter().all(|w| klein.contains(w.as_str())) {
                let t = zeile.trim();
                let kurz: String = t.chars().take(220).collect();
                out.push(Treffer { datei: rel.clone(), zeile: i + 1, text: kurz });
                hier += 1;
                if hier >= 3 {
                    break;
                }
            }
        }
        if out.len() >= max {
            break;
        }
    }
    out.truncate(max);
    out
}

// ── jichi als Nachschlagewerk ────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Quellenstand {
    /// Die Quelle `jichi` steht in der `docs`-Liste der Konfiguration.
    pub eingetragen: bool,
    /// … und zeigt auf diese Dokumentation.
    pub aktuell: bool,
    /// Ein Modell hat die Rolle `embed` — ohne das bietet jichi `search_docs` nicht an.
    pub embed_modell: bool,
}

pub fn quellenstand(config: &serde_json::Value, root: Option<&str>) -> Quellenstand {
    let eintrag = config
        .get("docs")
        .and_then(|d| d.as_array())
        .and_then(|a| a.iter().find(|e| e.get("name").and_then(|n| n.as_str()) == Some(QUELLE)));
    let aktuell = match (eintrag, root) {
        (Some(e), Some(r)) => e.get("path").and_then(|p| p.as_str()) == Some(r),
        _ => false,
    };
    let embed_modell = config.get("models").and_then(|m| m.as_array()).is_some_and(|a| {
        a.iter().any(|m| {
            m.get("roles").and_then(|r| r.as_array()).is_some_and(|r| r.iter().any(|x| x.as_str() == Some("embed")))
        })
    });
    Quellenstand { eingetragen: eintrag.is_some(), aktuell, embed_modell }
}

/// Die Quelle ein- (auf `root`) oder austragen. Andere `docs`-Einträge bleiben.
pub fn quelle_setzen(config: &mut serde_json::Value, root: Option<&str>) -> Result<(), String> {
    let obj = config.as_object_mut().ok_or("Die Konfiguration ist kein JSON-Objekt.")?;
    let docs = obj.entry("docs").or_insert_with(|| serde_json::json!([]));
    let liste = docs.as_array_mut().ok_or("„docs“ ist keine Liste (jichi erwartet eine Liste, siehe docs/DOCS.md).")?;
    liste.retain(|e| e.get("name").and_then(|n| n.as_str()) != Some(QUELLE));
    if let Some(r) = root {
        liste.push(serde_json::json!({ "name": QUELLE, "path": r }));
    }
    if liste.is_empty() {
        obj.remove("docs");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Jeder Test hat seinen eigenen Ordner — sie laufen parallel, und ein
    /// gemeinsamer würde vom Nachbarn gelöscht, während er gelesen wird.
    fn doku(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("jichi-desktop-test-doku-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("docs/analysis")).unwrap();
        for f in ["README.md", "VOCABULARY.md", "SETUP_WIZARD.md"] {
            std::fs::write(d.join("docs").join(f), format!("# {f}\nDer Setup-Assistent heisst jichi setup.\n")).unwrap();
        }
        std::fs::write(d.join("docs/analysis/2026-x.md"), "# Messung\nnichts\n").unwrap();
        std::fs::write(d.join("geheim.md"), "nicht lesen").unwrap();
        std::fs::write(d.join("jichi"), "#!/bin/sh\n").unwrap();
        d
    }

    #[test]
    fn findet_die_doku_neben_dem_programm_und_nur_echte() {
        let d = doku("finden");
        let ort = finden(Some(&d.join("jichi")), None).expect("neben dem Programm");
        assert_eq!(ort.quelle, "programm");
        assert!(ort.root.ends_with("docs"), "{}", ort.root);
        // Ein beliebiger Ordner mit README ist keine jichi-Doku.
        assert!(!ist_jichi_doku(&d.join("docs/analysis")));
        assert!(finden(None, Some(&d.join("docs/analysis"))).is_none());
        assert_eq!(finden(None, Some(&d.join("docs"))).unwrap().quelle, "eingestellt");
    }

    #[test]
    fn liest_nur_markdown_innerhalb() {
        let d = doku("lesen");
        let root = d.join("docs");
        assert!(lesen(&root, "README.md").unwrap().starts_with("# README"));
        assert!(lesen(&root, "analysis/2026-x.md#abschnitt").is_ok(), "Anker wird ignoriert");
        assert!(lesen(&root, "../geheim.md").is_err(), "nicht hinaus");
        assert!(lesen(&root, "../jichi").is_err(), "nur .md");
        assert!(lesen(&root, "gibt-es-nicht.md").is_err());
    }

    #[test]
    fn liste_und_suche() {
        let d = doku("liste");
        let root = d.join("docs");
        assert_eq!(liste(&root), ["README.md", "SETUP_WIZARD.md", "VOCABULARY.md", "analysis/2026-x.md"]);
        let t = suchen(&root, "SETUP jichi", 10);
        assert_eq!(t[0].datei, "SETUP_WIZARD.md", "Treffer im Dateinamen zuerst");
        assert_eq!(t[0].zeile, 2);
        assert!(suchen(&root, "   ", 10).is_empty());
        assert!(suchen(&root, "kommt nirgends vor", 10).is_empty());
    }

    /// Gegen einen echten jichi-Quellbaum, nur von Hand:
    /// `JICHI_TEST_PROGRAMM=…/jichi/jichi cargo test jichi_doku::tests::echt -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn echt() {
        let prog = PathBuf::from(std::env::var("JICHI_TEST_PROGRAMM").unwrap());
        let ort = finden(Some(&prog), None).expect("docs/ neben dem Programm");
        let root = PathBuf::from(&ort.root);
        let alle = liste(&root);
        println!("ort={} commit={:?} seiten={}", ort.root, ort.commit, alle.len());
        assert!(alle.len() > 100 && alle.contains(&"SETUP_WIZARD.md".to_string()));
        for (i, t) in suchen(&root, "setup wizard", 5).iter().enumerate() {
            println!("treffer {i}: {}:{} {}", t.datei, t.zeile, t.text.chars().take(70).collect::<String>());
        }
        assert!(lesen(&root, "../README.md").is_err());
        let karte = lesen(&root, "README.md").unwrap();
        assert!(karte.contains("## Start here"));
    }

    #[test]
    fn quelle_ein_und_aus_ohne_andere_zu_beruehren() {
        let mut c = serde_json::json!({"models":[{"name":"e","roles":["embed"]}],"docs":[{"name":"react","path":"/r"}]});
        quelle_setzen(&mut c, Some("/x/docs")).unwrap();
        let s = quellenstand(&c, Some("/x/docs"));
        assert!(s.eingetragen && s.aktuell && s.embed_modell);
        assert!(!quellenstand(&c, Some("/y/docs")).aktuell);
        quelle_setzen(&mut c, None).unwrap();
        assert_eq!(c["docs"], serde_json::json!([{"name":"react","path":"/r"}]));
        let mut leer = serde_json::json!({"models":[{"name":"c","roles":["chat"]}]});
        quelle_setzen(&mut leer, Some("/x")).unwrap();
        quelle_setzen(&mut leer, None).unwrap();
        assert!(leer.get("docs").is_none(), "leere Liste verschwindet");
        assert!(!quellenstand(&leer, None).embed_modell);
    }
}
