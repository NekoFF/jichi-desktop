//! jichi-desktop — Prozessverwaltung für den ACP-Agenten.
//!
//! Diese Schicht macht genau eine Sache: sie startet den Agenten als
//! Kindprozess, schiebt Zeilen in dessen stdin und meldet jede Zeile von
//! stdout/stderr als Ereignis an die Oberfläche. Das Protokoll selbst —
//! JSON-RPC 2.0, zeilenweise — wird im Frontend gesprochen, nicht hier. So
//! bleibt die Rust-Seite klein und der Protokollcode an einer Stelle.
//!
//! Drei Dinge, die eine GUI von einer Shell unterscheiden, sind hier gelöst:
//!
//! 1. **PATH.** Eine aus dem Dock gestartete Anwendung erbt kein
//!    Login-Shell-Environment; ihr PATH ist `/usr/bin:/bin:/usr/sbin:/sbin`.
//!    Ein in `/opt/homebrew/bin` oder `~/.local/bin` installiertes Programm ist
//!    dann unsichtbar. Darum wird der PATH des Kindes ergänzt und der Agent
//!    zusätzlich in den üblichen Verzeichnissen gesucht.
//! 2. **Schlüssel aus Dateien.** Der Agent liest seinen API-Schlüssel aus einer
//!    Umgebungsvariablen (`apiKeyEnv` in seiner Konfiguration). Diese Anwendung
//!    speichert nie einen Schlüssel — sie kennt nur den *Pfad* zu einer Datei,
//!    liest sie beim Start und setzt die Variable für das Kind. Der Wert wird
//!    nirgends protokolliert und landet in keiner Einstellungsdatei.
//! 3. **Plattform.** Unter Linux und macOS läuft der Agent nativ; Windows nennt
//!    das Projekt "not supported by design", dort führt der Weg über WSL2. Die
//!    Fallunterscheidung liegt an dieser einen Stelle.

use std::collections::{BTreeMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

// ── Zustand ──────────────────────────────────────────────────────────────────

/// Ein laufendes Kind. Kind und stdin liegen unter einem Schloss, damit es
/// keine Reihenfolge zwischen zwei Schlössern geben kann.
struct Live {
    generation: u64,
    child: Child,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
struct Acp {
    live: Mutex<Option<Live>>,
    next_gen: AtomicU64,
}

/// Jede Ereignisnutzlast trägt die Generation ihres Kindes.
///
/// Ohne sie geht Folgendes schief: beim Neustart hat der Leser-Thread des alten
/// Kindes noch gepufferte Zeilen und liefert sie nach — die Oberfläche würde
/// Antworten des *toten* Agenten der neuen Sitzung zuschreiben. Das Frontend
/// verwirft jede Zeile, deren Generation nicht die aktuelle ist.
#[derive(Serialize, Clone)]
struct LineEvent {
    generation: u64,
    line: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    generation: u64,
    code: Option<i32>,
}

// ── Pfade und Umgebung ───────────────────────────────────────────────────────

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// `~` und `~/…` auflösen. Ein Kindprozess bekommt keine Shell, die das für uns
/// tut, und ein Pfad aus einem Eingabefeld enthält sehr wahrscheinlich eine Tilde.
fn expand_tilde(input: &str) -> PathBuf {
    let trimmed = input.trim();
    if trimmed == "~" {
        return home().unwrap_or_else(|| PathBuf::from(trimmed));
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(h) = home() {
            return h.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

/// Das Trennzeichen im PATH. Unter Windows ist es `;`, überall sonst `:` — mit
/// dem falschen wird der ganze PATH zu einem einzigen unsinnigen Eintrag, und
/// kein Programm ist mehr auffindbar.
const PATH_SEP: char = if cfg!(windows) { ';' } else { ':' };

/// Dateiendungen, unter denen ein Programm ausführbar ist. Unter Windows trägt
/// `jichi` in Wahrheit `jichi.exe`; wer den Namen ohne Endung eintippt, soll
/// trotzdem gefunden werden.
const EXEC_SUFFIXES: &[&str] = if cfg!(windows) {
    &["", ".exe", ".cmd", ".bat"]
} else {
    &[""]
};

/// Verzeichnisse, in denen ein selbst gebautes oder per Paketmanager
/// installiertes Programm liegt, die aber im PATH einer GUI-Anwendung fehlen.
/// Unter Windows gibt es diese Konvention nicht — dort steht alles im PATH.
fn extra_bin_dirs() -> Vec<PathBuf> {
    if cfg!(windows) {
        return Vec::new();
    }
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(h) = home() {
        dirs.push(h.join(".local/bin"));
        dirs.push(h.join("bin"));
        dirs.push(h.join(".cargo/bin"));
    }
    dirs
}

/// Der PATH für das Kind: der eigene, ergänzt um die üblichen Verzeichnisse,
/// ohne Doppelungen und in stabiler Reihenfolge.
fn child_path() -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let push = |p: String, parts: &mut Vec<String>, seen: &mut Vec<String>| {
        if p.is_empty() || seen.contains(&p) {
            return;
        }
        seen.push(p.clone());
        parts.push(p);
    };
    if let Ok(existing) = std::env::var("PATH") {
        for p in existing.split(PATH_SEP) {
            push(p.to_string(), &mut parts, &mut seen);
        }
    }
    for d in extra_bin_dirs() {
        push(d.to_string_lossy().into_owned(), &mut parts, &mut seen);
    }
    parts.join(&PATH_SEP.to_string())
}

fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return p
            .metadata()
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// Einen Programmnamen zu einem Pfad auflösen. Enthält die Eingabe einen
/// Schrägstrich, ist sie schon ein Pfad. Sonst wird der ergänzte PATH abgesucht.
fn which(program: &str) -> Option<PathBuf> {
    if program.contains('/') || program.contains('\\') {
        let base = expand_tilde(program);
        for suffix in EXEC_SUFFIXES {
            let cand = if suffix.is_empty() {
                base.clone()
            } else {
                PathBuf::from(format!("{}{suffix}", base.display()))
            };
            if is_executable(&cand) {
                return Some(cand);
            }
        }
        return None;
    }
    for dir in child_path().split(PATH_SEP) {
        if dir.is_empty() {
            continue;
        }
        for suffix in EXEC_SUFFIXES {
            let cand = Path::new(dir).join(format!("{program}{suffix}"));
            if is_executable(&cand) {
                return Some(cand);
            }
        }
    }
    // Letzter Ausweg. jichi hat für macOS kein Installationspaket — es wird aus
    // den Quellen gebaut und liegt dann im Projektverzeichnis, in keinem
    // bin-Ordner und in keinem PATH. Genau dort wird jetzt nachgesehen.
    scan_home(program)
}


/// Grenzen der Suche im Heimatverzeichnis. Sie ist ein letzter Ausweg und darf
/// den Start nicht spürbar aufhalten, also ist sie in Tiefe *und* Breite
/// begrenzt und bricht lieber ergebnislos ab, als lange zu graben.
const SCAN_MAX_DEPTH: usize = 4;
const SCAN_MAX_DIRS: usize = 5000;

/// Verzeichnisse, in denen kein selbst gebautes Programm liegt, die aber sehr
/// viele Dateien enthalten. Ohne diese Liste dauert die Suche Sekunden statt
/// Millisekunden.
fn skip_dir(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "Library"
                | "Applications"
                | "node_modules"
                | "target"
                | "Music"
                | "Movies"
                | "Pictures"
                | "Photos"
                | "Public"
        )
}

/// Breitensuche nach einer ausführbaren Datei dieses Namens.
///
/// Breite zuerst, weil ein Treffer näher an der Wurzel der wahrscheinlichere
/// ist. Symbolischen Verzeichnisverweisen wird nicht gefolgt — sonst kann die
/// Suche im Kreis laufen.
fn scan_for(root: &Path, program: &str) -> Option<PathBuf> {
    let mut queue = VecDeque::from([(root.to_path_buf(), 0usize)]);
    let mut visited = 0usize;

    while let Some((dir, depth)) = queue.pop_front() {
        visited += 1;
        if visited > SCAN_MAX_DIRS {
            return None;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut deeper = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if depth < SCAN_MAX_DEPTH && !skip_dir(&name) {
                    deeper.push(entry.path());
                }
            } else if name == program {
                let path = entry.path();
                if is_executable(&path) {
                    return Some(path);
                }
            }
        }
        queue.extend(deeper.into_iter().map(|d| (d, depth + 1)));
    }
    None
}

/// Gefundene Pfade merken. Nur Treffer — ein Fehlschlag wird erneut gesucht,
/// damit ein eben erst gebautes Programm ohne Neustart gefunden wird.
fn scan_home(program: &str) -> Option<PathBuf> {
    static CACHE: OnceLock<Mutex<BTreeMap<String, PathBuf>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(BTreeMap::new()));

    if let Some(hit) = cache.lock().ok().and_then(|c| c.get(program).cloned()) {
        if is_executable(&hit) {
            return Some(hit);
        }
    }
    let found = scan_for(&home()?, program)?;
    if let Ok(mut c) = cache.lock() {
        c.insert(program.to_string(), found.clone());
    }
    Some(found)
}

/// Eine Umgebungsvariable für das Kind. Entweder mit direktem Wert oder — und
/// das ist der vorgesehene Weg für Geheimnisse — als Pfad zu einer Datei, deren
/// Inhalt beim Start gelesen wird.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EnvSpec {
    name: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    file: Option<String>,
}

/// Fehlermeldungen nennen nur den Pfad, nie den Inhalt.
fn resolve_env(specs: &[EnvSpec]) -> Result<BTreeMap<String, String>, String> {
    let mut out = BTreeMap::new();
    for spec in specs {
        if spec.name.trim().is_empty() {
            continue;
        }
        let value = match (&spec.value, &spec.file) {
            (_, Some(f)) if !f.trim().is_empty() => {
                let path = expand_tilde(f);
                let raw = std::fs::read_to_string(&path).map_err(|e| {
                    format!("{}: {} ist nicht lesbar ({e})", spec.name, path.display())
                })?;
                let v = raw.trim().to_string();
                if v.is_empty() {
                    return Err(format!("{}: {} ist leer", spec.name, path.display()));
                }
                v
            }
            (Some(v), _) if !v.is_empty() => v.clone(),
            _ => continue,
        };
        out.insert(spec.name.clone(), value);
    }
    Ok(out)
}

// ── Startvorschlag ───────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Launch {
    program: String,
    args: Vec<String>,
    /// Wo das Programm gefunden wurde, oder `null`, wenn es nicht auffindbar ist.
    resolved: Option<String>,
    /// Vorgabe für das Arbeitsverzeichnis. ACP verlangt für `session/new` einen
    /// absoluten Pfad, und das Frontend kann keinen erfinden — also liefert ihn
    /// diese Seite mit.
    cwd: String,
    /// Vorschlag für die Schlüsseldatei, falls eine der üblichen existiert.
    env: Vec<EnvHint>,
    hint: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EnvHint {
    name: String,
    file: String,
}

/// Übliche Orte für die Schlüsseldatei. Vorgeschlagen wird nur, was existiert;
/// gelesen wird hier nichts.
fn key_file_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(h) = home() {
        v.push(h.join(".config/jichi/apikey.txt"));
        v.push(h.join(".config/jlu/apikey.txt"));
        v.push(h.join(".jichi-api-key"));
    }
    v
}

/// Der Vorschlag für diese Plattform. Die Oberfläche darf ihn überschreiben —
/// geraten wird hier nur der Normalfall.
#[tauri::command]
fn default_launch() -> Launch {
    let windows = cfg!(target_os = "windows");

    let (program, args) = if windows {
        ("wsl.exe".to_string(), vec!["jichi".into(), "--acp".into()])
    } else {
        ("jichi".to_string(), vec!["--acp".into()])
    };

    let resolved = which(&program).map(|p| p.to_string_lossy().into_owned());

    let env: Vec<EnvHint> = key_file_candidates()
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| {
            vec![EnvHint {
                name: "JICHI_API_KEY".into(),
                file: p.to_string_lossy().into_owned(),
            }]
        })
        .unwrap_or_default();

    let hint = if windows {
        "Windows: jichi läuft in WSL2 — nativ wird Windows vom Projekt nicht unterstützt.".into()
    } else if resolved.is_some() {
        "jichi wurde im PATH gefunden.".into()
    } else {
        "jichi ist im PATH nicht auffindbar — hier den vollen Pfad zur Datei eintragen.".into()
    };

    Launch {
        program,
        args,
        resolved,
        cwd: home()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|| "/".to_string()),
        env,
        hint,
    }
}

/// Prüft ein Programm, bevor eine Sitzung davon abhängt: aufrufen, erste
/// Ausgabezeile zurückgeben. Das macht das Einstellungsfeld überprüfbar, ohne
/// dass der Benutzer einen Fehlschlag mitten im Gespräch erlebt.
#[tauri::command]
fn probe(program: String) -> Result<String, String> {
    let path = which(&program).ok_or_else(|| format!("{program} nicht gefunden"))?;
    let out = Command::new(&path)
        .arg("--version")
        .env("PATH", child_path())
        .output()
        .map_err(|e| format!("{} nicht ausführbar: {e}", path.display()))?;
    let text = if out.stdout.is_empty() {
        String::from_utf8_lossy(&out.stderr)
    } else {
        String::from_utf8_lossy(&out.stdout)
    };
    Ok(text.lines().next().unwrap_or("").trim().to_string())
}

// ── Gespeicherte Sitzungen ───────────────────────────────────────────────────

/// Eine Sitzung aus dem Speicher des Agenten. Die ACP-`sessionId` *ist* die
/// Sitzungs-Id des Agenten, darum generationügt der Dateiname, um sie per
/// `session/load` wieder zu öffnen.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    id: String,
    title: String,
    workspace: Option<String>,
    mode: Option<String>,
    /// Änderungszeit in Sekunden seit Epoche — die Oberfläche sortiert und
    /// formatiert selbst.
    modified: u64,
    turns: usize,
}

#[tauri::command]
fn sessions() -> Result<Vec<StoredSession>, String> {
    match home() {
        Some(h) => Ok(sessions_in(&h.join(".jichi.d/sessions"))),
        None => Ok(Vec::new()),
    }
}

/// Die Logik getrennt vom Ort, damit sie gegen ein Testverzeichnis läuft.
fn sessions_in(dir: &Path) -> Vec<StoredSession> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        // Kein Verzeichnis heisst: noch keine Sitzung. Das ist kein Fehler.
        Err(_) => return Vec::new(),
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue; // halb geschriebene Datei: überspringen, nicht scheitern
        };

        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned());
        let id = json
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or(stem)
            .unwrap_or_default();
        if id.is_empty() {
            continue;
        }

        let turns = json
            .get("history")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        out.push(StoredSession {
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("ohne Titel")
                .to_string(),
            workspace: json
                .get("workspaceDirectory")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            mode: json.get("mode").and_then(|v| v.as_str()).map(str::to_string),
            id,
            modified,
            turns,
        });
    }

    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

// ── Lebenszyklus des Kindes ──────────────────────────────────────────────────

fn stop_inner(acp: &Acp) {
    let taken = acp.live.lock().ok().and_then(|mut g| g.take());
    if let Some(mut live) = taken {
        drop(live.stdin.take()); // Pipe schliessen -> der Agent sieht EOF
        let _ = live.child.kill();
        let _ = live.child.wait(); // ernten, sonst bleibt ein Zombie
    }
}

#[tauri::command]
fn acp_start(
    app: AppHandle,
    state: State<Acp>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<Vec<EnvSpec>>,
) -> Result<u64, String> {
    // Erst alles prüfen, was scheitern kann, dann den alten Prozess beenden:
    // ein Tippfehler im Pfad soll nicht die laufende Sitzung mitnehmen.
    let path = which(&program).ok_or_else(|| {
        format!("{program} nicht gefunden — vollen Pfad in den Einstellungen eintragen")
    })?;
    let extra_env = resolve_env(env.as_deref().unwrap_or(&[]))?;

    let work_dir = match cwd.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => {
            let p = expand_tilde(d);
            if !p.is_dir() {
                return Err(format!("{} ist kein Verzeichnis", p.display()));
            }
            Some(p)
        }
        None => None,
    };

    stop_inner(&state);

    let generation = state.next_gen.fetch_add(1, Ordering::SeqCst) + 1;

    let mut cmd = Command::new(&path);
    cmd.args(&args)
        .env("PATH", child_path())
        .envs(&extra_env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = &work_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("{} konnte nicht gestartet werden: {e}", path.display()))?;

    let stdout = child.stdout.take().ok_or("kein stdout")?;
    let stderr = child.stderr.take().ok_or("kein stderr")?;
    let stdin = child.stdin.take();

    *state.live.lock().map_err(|_| "Zustand gesperrt")? = Some(Live { generation, child, stdin });

    // stdout: jede Zeile ist eine JSON-RPC-Nachricht.
    let out_app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let _ = out_app.emit("acp-line", LineEvent { generation, line });
        }
        // EOF: der Agent ist fertig. Den Rückgabewert nur ernten, wenn wirklich
        // noch unser Kind im Zustand steht — sonst wäre das ein Fremdprozess.
        let code = out_app
            .state::<Acp>()
            .live
            .lock()
            .ok()
            .and_then(|mut g| match g.as_mut() {
                Some(live) if live.generation == generation => live.child.wait().ok().and_then(|s| s.code()),
                _ => None,
            });
        let _ = out_app.emit("acp-exit", ExitEvent { generation, code });
    });

    // stderr: Diagnose des Agenten, nicht Protokoll. Getrennt halten, sonst
    // landet eine Warnung im JSON-Parser und sieht aus wie ein Protokollfehler.
    let err_app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = err_app.emit("acp-stderr", LineEvent { generation, line });
        }
    });

    Ok(generation)
}

/// Eine Zeile an den Agenten. Der Zeilenumbruch gehört zum Rahmen des
/// Protokolls und wird hier angehängt, nicht vom Aufrufer.
#[tauri::command]
fn acp_send(state: State<Acp>, line: String) -> Result<(), String> {
    let mut guard = state.live.lock().map_err(|_| "Zustand gesperrt")?;
    let live = guard.as_mut().ok_or("der Agent läuft nicht")?;
    let pipe = live.stdin.as_mut().ok_or("stdin ist geschlossen")?;
    pipe.write_all(line.as_bytes())
        .and_then(|_| pipe.write_all(b"\n"))
        .and_then(|_| pipe.flush())
        .map_err(|e| format!("Schreiben fehlgeschlagen: {e}"))
}

#[tauri::command]
fn acp_stop(state: State<Acp>) {
    stop_inner(&state);
}

#[tauri::command]
fn acp_running(state: State<Acp>) -> bool {
    state
        .live
        .lock()
        .map(|mut g| match g.as_mut() {
            Some(live) => matches!(live.child.try_wait(), Ok(None)),
            None => false,
        })
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Acp::default())
        .invoke_handler(tauri::generate_handler![
            default_launch,
            probe,
            sessions,
            acp_start,
            acp_send,
            acp_stop,
            acp_running
        ])
        // Ohne das überlebt der Agent das Fenster und bleibt als Waise im
        // Prozessbaum stehen — beim Entwickeln nach zehn Neustarts zehn Agenten.
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                stop_inner(window.app_handle().state::<Acp>().inner());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── Prüfungen ────────────────────────────────────────────────────────────────
//
// Nur die Entscheidungen, die ohne Fenster und ohne Kindprozess zu treffen sind.
// Das ist genau die Hälfte, in der die Fehler sitzen: Pfade, Umgebung, und das
// Lesen fremder Dateien, die auch halb geschrieben sein können.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_wird_aufgeloest() {
        let h = home().expect("HOME ist gesetzt");
        assert_eq!(expand_tilde("~"), h);
        assert_eq!(expand_tilde("~/Schreibtisch"), h.join("Schreibtisch"));
        // Nur am Anfang, und nur mit Trenner danach.
        assert_eq!(expand_tilde("/tmp/~"), PathBuf::from("/tmp/~"));
        assert_eq!(expand_tilde("~unbekannt/x"), PathBuf::from("~unbekannt/x"));
        // Leerraum aus einem Eingabefeld gehört nicht in einen Pfad.
        assert_eq!(expand_tilde("  /tmp  "), PathBuf::from("/tmp"));
    }

    #[test]
    fn pfad_des_kindes_ist_doppelungsfrei() {
        let path = child_path();
        let parts: Vec<&str> = path.split(PATH_SEP).collect();
        let mut sorted = parts.clone();
        sorted.sort_unstable();
        let before = sorted.len();
        sorted.dedup();
        assert_eq!(before, sorted.len(), "doppelte Einträge in {path}");
        if !cfg!(windows) {
            assert!(parts.contains(&"/usr/bin"), "/usr/bin fehlt in {path}");
        }
        // Mit dem falschen Trennzeichen bliebe der ganze PATH ein einziger Eintrag.
        assert!(parts.len() > 1, "PATH wurde nicht zerlegt: {path}");
    }

    #[test]
    fn which_findet_im_pfad_und_als_pfad() {
        assert_eq!(which("sh"), Some(PathBuf::from("/bin/sh")));
        assert_eq!(which("/bin/sh"), Some(PathBuf::from("/bin/sh")));
        assert_eq!(which("gibt-es-ganz-sicher-nicht-42"), None);
        // Ein Verzeichnis ist nicht ausführbar, auch wenn es das Bit gesetzt hat.
        assert_eq!(which("/tmp"), None);
    }

    #[test]
    fn umgebung_aus_datei_wird_getrimmt() {
        let dir = std::env::temp_dir().join("jichi-desktop-test-env");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("key.txt");
        std::fs::write(&file, "  sk-geheim\n\n").unwrap();

        let env = resolve_env(&[EnvSpec {
            name: "JICHI_API_KEY".into(),
            value: None,
            file: Some(file.to_string_lossy().into_owned()),
        }])
        .unwrap();
        assert_eq!(env.get("JICHI_API_KEY").map(String::as_str), Some("sk-geheim"));

        // Eine Datei gewinnt gegen einen mitgeschickten Wert: sie ist die frischere Quelle.
        let env = resolve_env(&[EnvSpec {
            name: "JICHI_API_KEY".into(),
            value: Some("veraltet".into()),
            file: Some(file.to_string_lossy().into_owned()),
        }])
        .unwrap();
        assert_eq!(env.get("JICHI_API_KEY").map(String::as_str), Some("sk-geheim"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fehlende_oder_leere_schluesseldatei_nennt_den_pfad_nicht_den_inhalt() {
        let err = resolve_env(&[EnvSpec {
            name: "JICHI_API_KEY".into(),
            value: None,
            file: Some("/gibt/es/nicht.txt".into()),
        }])
        .unwrap_err();
        assert!(err.contains("/gibt/es/nicht.txt"), "{err}");

        let dir = std::env::temp_dir().join("jichi-desktop-test-leer");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("leer.txt");
        std::fs::write(&file, "   \n").unwrap();
        let err = resolve_env(&[EnvSpec {
            name: "JICHI_API_KEY".into(),
            value: None,
            file: Some(file.to_string_lossy().into_owned()),
        }])
        .unwrap_err();
        assert!(err.contains("leer"), "{err}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn leere_namen_und_werte_werden_uebergangen() {
        let env = resolve_env(&[
            EnvSpec { name: "  ".into(), value: Some("x".into()), file: None },
            EnvSpec { name: "OHNE_WERT".into(), value: None, file: None },
            EnvSpec { name: "MIT_WERT".into(), value: Some("ja".into()), file: None },
        ])
        .unwrap();
        assert_eq!(env.len(), 1);
        assert_eq!(env.get("MIT_WERT").map(String::as_str), Some("ja"));
    }

    #[test]
    fn sitzungen_werden_gelesen_und_kaputte_uebersprungen() {
        let dir = std::env::temp_dir().join("jichi-desktop-test-sessions");
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(
            dir.join("aaa.json"),
            r#"{"sessionId":"aaa","title":"erstes","workspaceDirectory":"/tmp","mode":"chat","history":[{"role":"user"},{"role":"assistant"}]}"#,
        )
        .unwrap();
        // Halb geschrieben — der Agent speichert, während wir lesen.
        std::fs::write(dir.join("bbb.json"), "{\"sessionId\":\"bbb\",").unwrap();
        // Kein JSON, gehört nicht hierher.
        std::fs::write(dir.join("notiz.txt"), "egal").unwrap();
        // Ohne Titel: die Anzeige braucht trotzdem ein Wort.
        std::fs::write(dir.join("ccc.json"), r#"{"sessionId":"ccc","history":[]}"#).unwrap();

        let found = sessions_in(&dir);
        let ids: Vec<&str> = found.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids.len(), 2, "gefunden: {ids:?}");
        assert!(ids.contains(&"aaa") && ids.contains(&"ccc"), "{ids:?}");

        let aaa = found.iter().find(|s| s.id == "aaa").unwrap();
        assert_eq!(aaa.title, "erstes");
        assert_eq!(aaa.turns, 2);
        assert_eq!(aaa.workspace.as_deref(), Some("/tmp"));
        assert_eq!(found.iter().find(|s| s.id == "ccc").unwrap().title, "ohne Titel");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn heimatsuche_findet_das_gebaute_programm() {
        let root = std::env::temp_dir().join("jichi-desktop-test-scan");
        std::fs::remove_dir_all(&root).ok();

        let gesucht = root.join("projekte/jichi");
        std::fs::create_dir_all(&gesucht).unwrap();
        let ziel = gesucht.join("faux");
        std::fs::write(&ziel, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&ziel, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        // Gleichnamige Dateien an Orten, die übersprungen werden müssen.
        for tarnung in ["node_modules", ".versteckt", "Library"] {
            let dir = root.join(tarnung);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("faux"), "egal").unwrap();
        }
        // Und eine nicht ausführbare Datei desselben Namens.
        std::fs::write(root.join("faux"), "kein Programm").unwrap();

        assert_eq!(scan_for(&root, "faux"), Some(ziel));
        assert_eq!(scan_for(&root, "gibt-es-nicht"), None);

        // Zu tief: jenseits der Grenze wird nicht mehr gesucht.
        let tief = root.join("a/b/c/d/e/f");
        std::fs::create_dir_all(&tief).unwrap();
        std::fs::write(tief.join("tief"), "x").unwrap();
        assert_eq!(scan_for(&root, "tief"), None);

        std::fs::remove_dir_all(&root).ok();
    }

    /// Der ganze Weg gegen den echten Agenten: finden, Schlüssel aus der Datei
    /// setzen, starten, ACP sprechen.
    ///
    /// Übersprungen, solange nicht ausdrücklich verlangt — er braucht ein
    /// gebautes jichi und eine Schlüsseldatei, und beides gehört nicht zu den
    /// Voraussetzungen dieses Projekts:
    ///
    ///     cargo test -- --ignored --nocapture
    #[test]
    #[ignore = "braucht ein gebautes jichi und eine Schlüsseldatei"]
    fn echter_agent_antwortet() {
        let Some(path) = which("jichi") else {
            panic!("jichi wurde nicht gefunden — genau das prüft dieser Test");
        };
        println!("gefunden: {}", path.display());

        let env = resolve_env(&[EnvSpec {
            name: "JICHI_API_KEY".into(),
            value: None,
            file: Some("~/.config/jlu/apikey.txt".into()),
        }])
        .expect("Schlüsseldatei lesbar");
        assert_eq!(env.len(), 1);

        let mut child = Command::new(&path)
            .arg("--acp")
            .env("PATH", child_path())
            .envs(&env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("jichi startet");

        {
            let stdin = child.stdin.as_mut().unwrap();
            writeln!(
                stdin,
                r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":1,"clientCapabilities":{{}}}}}}"#
            )
            .unwrap();
            writeln!(
                stdin,
                r#"{{"jsonrpc":"2.0","id":2,"method":"session/new","params":{{"cwd":"/tmp","mcpServers":[]}}}}"#
            )
            .unwrap();
        }
        // stdin schliessen -> der Agent sieht EOF und beendet sich.
        drop(child.stdin.take());

        let out = child.wait_with_output().expect("jichi endet");
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        println!("stdout:\n{stdout}");
        println!("stderr:\n{stderr}");

        let zeilen: Vec<&str> = stdout.lines().filter(|l| !l.trim().is_empty()).collect();
        assert_eq!(zeilen.len(), 2, "zwei Antworten erwartet");
        assert!(zeilen[0].contains(r#""protocolVersion":1"#), "{}", zeilen[0]);
        assert!(zeilen[1].contains(r#""sessionId""#), "{}", zeilen[1]);

        // Der eigentliche Punkt: ohne den Schlüssel aus der Datei stünde hier
        // "no API key found". Steht er da, wäre jeder Zug später gescheitert.
        assert!(
            !stderr.contains("no API key found"),
            "der Schlüssel kam nicht an: {stderr}"
        );
    }

    #[test]
    fn startvorschlag_ist_vollstaendig() {
        let launch = default_launch();
        assert!(!launch.program.is_empty());
        assert!(launch.args.contains(&"--acp".to_string()));
        // Ein absoluter Pfad ist Pflicht: ACP verlangt ihn für session/new.
        assert!(launch.cwd.starts_with('/') || launch.cwd.contains(':'), "{}", launch.cwd);
    }
}
