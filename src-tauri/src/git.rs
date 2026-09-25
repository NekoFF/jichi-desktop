//! Was sich im Projekt geändert hat — laut git, nicht laut Gedächtnis.
//!
//! Die Ansicht „Änderungen“ zeigt den Unterschied zwischen dem letzten Commit
//! und der Arbeitskopie: was jichi (oder man selbst) geändert, angelegt oder
//! gelöscht hat, und ob das schon committet ist.

use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aenderung {
    pub path: String,
    /// M geändert, A neu, D gelöscht, R umbenannt, ? noch nicht in git
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stand {
    pub repo: bool,
    pub branch: Option<String>,
    pub files: Vec<Aenderung>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vergleich {
    pub before: Option<String>,
    pub after: Option<String>,
    pub binary: bool,
}

fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "core.quotepath=false"])
        .args(args)
        // Kein Schloss auf den Index, nur weil jemand hinsieht.
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("git ließ sich nicht starten: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(out.stdout)
}

pub fn stand(cwd: &str) -> Result<Stand, String> {
    let root = crate::projekt::root_of(cwd)?;
    if git(&root, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(Stand { repo: false, branch: None, files: Vec::new() });
    }
    let branch = git(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|b| String::from_utf8_lossy(&b).trim().to_string())
        .filter(|b| !b.is_empty() && b != "HEAD");
    let top = String::from_utf8_lossy(&git(&root, &["rev-parse", "--show-toplevel"])?).trim().to_string();
    let top = Path::new(&top).canonicalize().map_err(|e| e.to_string())?;
    // Pfade relativ zum Projektordner, auch wenn das Repository darüber beginnt.
    let rel = |p: &str| -> Option<String> {
        let abs = top.join(p);
        abs.strip_prefix(&root).ok().map(|r| r.to_string_lossy().replace('\\', "/"))
    };

    let status = git(&root, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."])?;
    let mut files: Vec<Aenderung> = Vec::new();
    let mut it = status.split(|b| *b == 0).filter(|s| !s.is_empty());
    while let Some(entry) = it.next() {
        if entry.len() < 4 {
            continue;
        }
        let code = &entry[..2];
        let path = String::from_utf8_lossy(&entry[3..]).into_owned();
        let s = match (code[0], code[1]) {
            (b'?', b'?') => "?",
            (b'R', _) | (_, b'R') => {
                it.next(); // der alte Name
                "R"
            }
            (b'A', _) => "A",
            (b'D', _) | (_, b'D') => "D",
            _ => "M",
        };
        if let Some(p) = rel(&path) {
            files.push(Aenderung { path: p, status: s.into(), additions: 0, deletions: 0 });
        }
    }

    // Zeilen je Datei. Gegen HEAD, wenn es einen gibt; neue Dateien zählen ganz.
    let hat_head = git(&root, &["rev-parse", "--verify", "HEAD"]).is_ok();
    if hat_head {
        if let Ok(num) = git(&root, &["diff", "--numstat", "-z", "HEAD", "--", "."]) {
            let text = String::from_utf8_lossy(&num).into_owned();
            let mut teile = text.split('\0');
            while let Some(zeile) = teile.next() {
                let mut f = zeile.splitn(3, '\t');
                let (Some(a), Some(d), Some(p)) = (f.next(), f.next(), f.next()) else { continue };
                // Umbenennung: der Pfad steht in den nächsten beiden Feldern.
                let p = if p.is_empty() { teile.next(); teile.next().unwrap_or("").to_string() } else { p.to_string() };
                if let Some(file) = rel(&p).and_then(|rp| files.iter_mut().find(|f| f.path == rp)) {
                    file.additions = a.parse().unwrap_or(0);
                    file.deletions = d.parse().unwrap_or(0);
                }
            }
        }
    }
    for f in files.iter_mut().filter(|f| f.status == "?" || (!hat_head && f.status == "A")) {
        if let Ok(t) = std::fs::read(root.join(&f.path)) {
            if !t.contains(&0) {
                f.additions = String::from_utf8_lossy(&t).lines().count() as u64;
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Stand { repo: true, branch, files })
}

pub fn vergleich(cwd: &str, path: &str) -> Result<Vergleich, String> {
    let root = crate::projekt::root_of(cwd)?;
    let file = crate::projekt::inside(&root, path)?;
    let rel = file.strip_prefix(&root).map_err(|_| "ausserhalb")?.to_string_lossy().replace('\\', "/");
    let spec = format!("HEAD:./{rel}");
    let before = git(&root, &["show", &spec]).ok();
    let after = std::fs::read(&file).ok();
    let binary = before.as_ref().is_some_and(|b| b.contains(&0)) || after.as_ref().is_some_and(|a| a.contains(&0));
    let text = |b: Vec<u8>| String::from_utf8_lossy(&b).into_owned();
    Ok(Vergleich {
        binary,
        before: if binary { None } else { before.map(text) },
        after: if binary { None } else { after.map(text) },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(d: &Path, args: &[&str]) {
        let ok = Command::new("git").arg("-C").arg(d).args(args).output().unwrap();
        assert!(ok.status.success(), "{args:?}: {}", String::from_utf8_lossy(&ok.stderr));
    }

    #[test]
    fn aenderungen_gegen_head() {
        let d = std::env::temp_dir().join("jichi-desktop-test-git");
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(&d).unwrap();
        run(&d, &["init", "-q", "-b", "main"]);
        run(&d, &["config", "user.email", "t@t"]);
        run(&d, &["config", "user.name", "t"]);
        std::fs::write(d.join("a.txt"), "eins\nzwei\n").unwrap();
        std::fs::write(d.join("weg.txt"), "x\n").unwrap();
        run(&d, &["add", "."]);
        run(&d, &["commit", "-qm", "start"]);
        std::fs::write(d.join("a.txt"), "eins\nzwei\ndrei\n").unwrap();
        std::fs::remove_file(d.join("weg.txt")).unwrap();
        std::fs::write(d.join("neu.md"), "# neu\nzeile\n").unwrap();

        let cwd = d.to_str().unwrap();
        let s = stand(cwd).unwrap();
        assert!(s.repo);
        assert_eq!(s.branch.as_deref(), Some("main"));
        let kurz: Vec<_> = s.files.iter().map(|f| (f.path.as_str(), f.status.as_str(), f.additions, f.deletions)).collect();
        assert_eq!(kurz, [("a.txt", "M", 1, 0), ("neu.md", "?", 2, 0), ("weg.txt", "D", 0, 1)]);

        let v = vergleich(cwd, "a.txt").unwrap();
        assert_eq!(v.before.as_deref(), Some("eins\nzwei\n"));
        assert_eq!(v.after.as_deref(), Some("eins\nzwei\ndrei\n"));
        let n = vergleich(cwd, "neu.md").unwrap();
        assert!(n.before.is_none() && n.after.is_some());
        let w = vergleich(cwd, "weg.txt").unwrap();
        assert!(w.before.is_some() && w.after.is_none());
        assert!(vergleich(cwd, "../x").is_err());
    }

    #[test]
    fn ohne_repository_kein_fehler() {
        let d = std::env::temp_dir().join("jichi-desktop-test-kein-git");
        std::fs::remove_dir_all(&d).ok();
        std::fs::create_dir_all(&d).unwrap();
        // GIT_CEILING_DIRECTORIES, damit kein Repository darüber gefunden wird.
        std::env::set_var("GIT_CEILING_DIRECTORIES", std::env::temp_dir());
        assert!(!stand(d.to_str().unwrap()).unwrap().repo);
    }
}
