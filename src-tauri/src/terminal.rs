//! Terminals für den Agenten — ACP `terminal/*`.
//!
//! Meldet diese Anwendung die Terminal-Fähigkeit an, führt jichi seine
//! Befehle (`run_terminal_command`, `run_tests`) nicht mehr selbst aus, sondern
//! bittet hierum: `terminal/create` → `wait_for_exit` → `output` → `release`.
//! Der Gewinn ist die Anzeige: jede Zeile, die der Befehl schreibt, geht sofort
//! als Ereignis an die Oberfläche und steht live in der Werkzeugkarte — statt
//! erst am Ende als ein Block.
//!
//! Die Erlaubnis hat jichi vorher eingeholt, wie bei seiner eigenen
//! Ausführung. Hier wird nichts erlaubt, nur ausgeführt, und zwar mit denselben
//! Vorsichtsmassnahmen wie beim Agenten selbst: eigene Prozessgruppe, damit ein
//! Abbruch auch die Kinder erreicht, und **keine Schlüssel in der Umgebung** —
//! ein Befehl, den ein Modell geschrieben hat, bekommt den API-Schlüssel nicht.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Obergrenze, falls der Agent keine nennt. jichi schickt `outputByteLimit`.
const DEFAULT_LIMIT: usize = 1024 * 1024;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExitStatus {
    /// Bei einem Signal `128 + Nummer` — so, wie eine Shell es meldet und wie
    /// jichi es erwartet.
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub output: String,
    pub truncated: bool,
    pub exit_status: Option<ExitStatus>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    terminal_id: String,
    chunk: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    terminal_id: String,
    exit_status: ExitStatus,
}

/// Gesammelte Ausgabe. Wird das Limit überschritten, fällt der **Anfang** weg:
/// am Ende steht, woran ein Testlauf gescheitert ist.
struct Buffer {
    data: Vec<u8>,
    limit: usize,
    truncated: bool,
}

impl Buffer {
    fn push(&mut self, bytes: &[u8]) {
        self.data.extend_from_slice(bytes);
        if self.data.len() > self.limit {
            let mut cut = self.data.len() - self.limit;
            // Nicht mitten in einem UTF-8-Zeichen schneiden.
            while cut < self.data.len() && (self.data[cut] & 0b1100_0000) == 0b1000_0000 {
                cut += 1;
            }
            self.data.drain(..cut);
            self.truncated = true;
        }
    }
}

struct Term {
    pid: u32,
    buffer: Mutex<Buffer>,
    exit: Mutex<Option<ExitStatus>>,
    exited: Condvar,
}

#[derive(Default)]
pub struct Terminals {
    map: Mutex<HashMap<String, Arc<Term>>>,
    next: AtomicU64,
}

/// Namen, deren Wert ein Befehl des Modells nie sehen soll.
fn is_secret_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    ["KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "CREDENTIAL"]
        .iter()
        .any(|w| upper.contains(w))
}

#[cfg(unix)]
fn exit_of(status: std::process::ExitStatus) -> ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    match (status.code(), status.signal()) {
        (Some(code), _) => ExitStatus { exit_code: Some(code), signal: None },
        (None, Some(sig)) => ExitStatus { exit_code: Some(128 + sig), signal: Some(sig) },
        _ => ExitStatus { exit_code: None, signal: None },
    }
}

#[cfg(not(unix))]
fn exit_of(status: std::process::ExitStatus) -> ExitStatus {
    ExitStatus { exit_code: status.code(), signal: None }
}

fn pump(app: AppHandle, id: String, term: Arc<Term>, mut pipe: impl Read) {
    let mut chunk = [0u8; 8192];
    loop {
        match pipe.read(&mut chunk) {
            Ok(0) => return,
            Ok(n) => {
                if let Ok(mut b) = term.buffer.lock() {
                    b.push(&chunk[..n]);
                }
                let _ = app.emit(
                    "term-output",
                    OutputEvent {
                        terminal_id: id.clone(),
                        chunk: String::from_utf8_lossy(&chunk[..n]).into_owned(),
                    },
                );
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return,
        }
    }
}

impl Terminals {
    pub fn create(
        &self,
        app: &AppHandle,
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        limit: Option<usize>,
        path_env: &str,
    ) -> Result<String, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, _) in std::env::vars_os() {
            if is_secret_name(&name.to_string_lossy()) {
                cmd.env_remove(&name);
            }
        }
        cmd.env("PATH", path_env);
        if let Some(dir) = cwd.map(str::trim).filter(|d| !d.is_empty()) {
            if !Path::new(dir).is_dir() {
                return Err(format!("{dir} ist kein Verzeichnis"));
            }
            cmd.current_dir(dir);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| format!("{command} ließ sich nicht starten: {e}"))?;
        let id = format!("t{}", self.next.fetch_add(1, Ordering::SeqCst) + 1);
        let term = Arc::new(Term {
            pid: child.id(),
            buffer: Mutex::new(Buffer {
                data: Vec::new(),
                limit: limit.filter(|l| *l > 0).unwrap_or(DEFAULT_LIMIT),
                truncated: false,
            }),
            exit: Mutex::new(None),
            exited: Condvar::new(),
        });

        let readers: Vec<_> = [
            child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>),
            child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>),
        ]
        .into_iter()
        .flatten()
        .map(|pipe| {
            let (app, id, term) = (app.clone(), id.clone(), term.clone());
            std::thread::spawn(move || pump(app, id, term, pipe))
        })
        .collect();

        // Der Wächter besitzt das Kind. Erst wenn beide Rohre leer gelesen sind,
        // gilt der Befehl als beendet — sonst fehlte der Ausgabe ihr Ende.
        {
            let (app, id, term) = (app.clone(), id.clone(), term.clone());
            std::thread::spawn(move || {
                let status = child
                    .wait()
                    .map(exit_of)
                    .unwrap_or(ExitStatus { exit_code: None, signal: None });
                for r in readers {
                    let _ = r.join();
                }
                if let Ok(mut e) = term.exit.lock() {
                    *e = Some(status);
                }
                term.exited.notify_all();
                let _ = app.emit("term-exit", ExitEvent { terminal_id: id, exit_status: status });
            });
        }

        self.map.lock().map_err(|_| "Zustand gesperrt")?.insert(id.clone(), term);
        Ok(id)
    }

    fn get(&self, id: &str) -> Result<Arc<Term>, String> {
        self.map
            .lock()
            .ok()
            .and_then(|m| m.get(id).cloned())
            .ok_or_else(|| format!("unbekanntes Terminal {id}"))
    }

    pub fn output(&self, id: &str) -> Result<Output, String> {
        let term = self.get(id)?;
        let (output, truncated) = {
            let b = term.buffer.lock().map_err(|_| "Zustand gesperrt")?;
            (String::from_utf8_lossy(&b.data).into_owned(), b.truncated)
        };
        let exit_status = *term.exit.lock().map_err(|_| "Zustand gesperrt")?;
        Ok(Output { output, truncated, exit_status })
    }

    /// Blockiert, bis der Befehl beendet ist. Nur neben dem Hauptfaden rufen.
    pub fn wait(&self, id: &str) -> Result<ExitStatus, String> {
        let term = self.get(id)?;
        let mut exit = term.exit.lock().map_err(|_| "Zustand gesperrt")?;
        while exit.is_none() {
            exit = term.exited.wait(exit).map_err(|_| "Zustand gesperrt")?;
        }
        Ok(exit.expect("gesetzt"))
    }

    pub fn kill(&self, id: &str) -> Result<(), String> {
        let term = self.get(id)?;
        stop(&term);
        Ok(())
    }

    /// Freigeben: läuft der Befehl noch, wird er beendet.
    pub fn release(&self, id: &str) -> Result<(), String> {
        let term = self.map.lock().map_err(|_| "Zustand gesperrt")?.remove(id);
        if let Some(term) = term {
            if term.exit.lock().map(|e| e.is_none()).unwrap_or(false) {
                stop(&term);
            }
        }
        Ok(())
    }

    /// Beim Schliessen des Fensters: nichts darf weiterlaufen.
    pub fn kill_all(&self) {
        let all: Vec<_> = self.map.lock().map(|mut m| m.drain().map(|(_, t)| t).collect()).unwrap_or_default();
        for term in all {
            if term.exit.lock().map(|e| e.is_none()).unwrap_or(false) {
                stop(&term);
            }
        }
    }
}

/// TERM an die Gruppe, nach einer halben Sekunde KILL. Im Hintergrund, damit
/// niemand auf das Aufräumen warten muss.
fn stop(term: &Arc<Term>) {
    #[cfg(unix)]
    {
        crate::signal_group(term.pid, "TERM");
        let term = term.clone();
        std::thread::spawn(move || {
            let exit = term.exit.lock();
            if let Ok(exit) = exit {
                let (exit, _) = term
                    .exited
                    .wait_timeout_while(exit, std::time::Duration::from_millis(500), |e| e.is_none())
                    .unwrap_or_else(|p| p.into_inner());
                if exit.is_none() {
                    crate::signal_group(term.pid, "KILL");
                }
            }
        });
    }
    #[cfg(not(unix))]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &term.pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puffer_behaelt_das_ende() {
        let mut b = Buffer { data: Vec::new(), limit: 8, truncated: false };
        b.push(b"0123456789abc");
        assert_eq!(b.data, b"56789abc");
        assert!(b.truncated);
    }

    #[test]
    fn puffer_schneidet_nicht_in_ein_zeichen() {
        let mut b = Buffer { data: Vec::new(), limit: 3, truncated: false };
        b.push("aä€".as_bytes()); // 1 + 2 + 3 Bytes
        assert!(std::str::from_utf8(&b.data).is_ok(), "{:?}", b.data);
        assert_eq!(std::str::from_utf8(&b.data).unwrap(), "€");
    }

    #[test]
    fn schluessel_bleiben_draussen() {
        for name in ["JICHI_API_KEY", "GITHUB_TOKEN", "aws_secret_access_key", "DB_PASSWORD"] {
            assert!(is_secret_name(name), "{name}");
        }
        for name in ["PATH", "HOME", "LANG", "TERM"] {
            assert!(!is_secret_name(name), "{name}");
        }
    }
}
