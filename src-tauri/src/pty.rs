//! Ein echtes Terminal in der Seitenleiste — die eigene Shell, im Projektordner.
//!
//! Über ein Pseudo-Terminal (PTY), damit Programme sich wie in einem richtigen
//! Terminal verhalten: Farben, Fortschrittsbalken, `vim`, `top`, Strg-C.
//! Die Oberfläche (xterm.js) zeichnet, dieses Modul reicht Bytes durch.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

struct Sitzung {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Ptys {
    map: Mutex<HashMap<u32, Arc<Mutex<Sitzung>>>>,
    next: AtomicU32,
}

#[derive(Serialize, Clone)]
struct Ausgabe {
    id: u32,
    data: String,
}

#[derive(Serialize, Clone)]
struct Ende {
    id: u32,
}

/// Welche Shell: die des Benutzers, sonst eine übliche.
fn shell() -> (String, Vec<String>) {
    if cfg!(windows) {
        return ("powershell.exe".into(), vec!["-NoLogo".into()]);
    }
    let sh = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
        if std::path::Path::new("/bin/zsh").exists() { "/bin/zsh".into() } else { "/bin/bash".into() }
    });
    // Als Login-Shell, damit PATH und Aliase aus dem Profil gelten — eine aus
    // dem Dock gestartete Anwendung hat die sonst nicht.
    (sh, vec!["-l".into()])
}

/// UTF-8 in Stücken: ein Zeichen kann über zwei Lesevorgänge verteilt sein.
/// Der unvollständige Rest wartet auf das nächste Stück.
fn utf8_teilen(carry: &mut Vec<u8>, neu: &[u8]) -> String {
    carry.extend_from_slice(neu);
    match std::str::from_utf8(carry) {
        Ok(s) => {
            let out = s.to_string();
            carry.clear();
            out
        }
        Err(e) => {
            let gut = e.valid_up_to();
            // Echter Fehler (nicht nur ein abgeschnittenes Zeichen am Ende): ersetzen.
            if e.error_len().is_some() {
                let out = String::from_utf8_lossy(carry).into_owned();
                carry.clear();
                return out;
            }
            let out = String::from_utf8_lossy(&carry[..gut]).into_owned();
            carry.drain(..gut);
            out
        }
    }
}

impl Ptys {
    pub fn open(&self, app: &AppHandle, cwd: &str, cols: u16, rows: u16, path_env: &str) -> Result<u32, String> {
        let (a, b) = (app.clone(), app.clone());
        self.open_with(
            cwd,
            cols,
            rows,
            path_env,
            Box::new(move |id, data| {
                let _ = a.emit("pty-output", Ausgabe { id, data });
            }),
            Box::new(move |id| {
                let _ = b.emit("pty-exit", Ende { id });
            }),
        )
    }

    /// Wie `open`, mit eigenen Empfängern — so lässt es sich ohne Fenster prüfen.
    pub fn open_with(
        &self,
        cwd: &str,
        cols: u16,
        rows: u16,
        path_env: &str,
        on_output: Box<dyn Fn(u32, String) + Send>,
        on_exit: Box<dyn FnOnce(u32) + Send>,
    ) -> Result<u32, String> {
        let root = crate::projekt::root_of(cwd)?;
        let pair = native_pty_system()
            .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Terminal ließ sich nicht öffnen: {e}"))?;
        let (prog, args) = shell();
        let mut cmd = CommandBuilder::new(&prog);
        for a in &args {
            cmd.arg(a);
        }
        cmd.cwd(&root);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("PATH", path_env);
        // Schlüssel dieser Anwendung gehören nicht in die Shell.
        for (k, _) in std::env::vars_os() {
            let name = k.to_string_lossy().to_ascii_uppercase();
            if name.contains("JICHI_API_KEY") {
                cmd.env_remove(&k);
            }
        }
        let child = pair.slave.spawn_command(cmd).map_err(|e| format!("{prog} ließ sich nicht starten: {e}"))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        self.map
            .lock()
            .map_err(|_| "Zustand gesperrt")?
            .insert(id, Arc::new(Mutex::new(Sitzung { writer, master: pair.master, child })));

        std::thread::spawn(move || {
            let mut buf = [0u8; 16 * 1024];
            let mut carry = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = utf8_teilen(&mut carry, &buf[..n]);
                        if !data.is_empty() {
                            on_output(id, data);
                        }
                    }
                }
            }
            on_exit(id);
        });
        Ok(id)
    }

    fn get(&self, id: u32) -> Result<Arc<Mutex<Sitzung>>, String> {
        self.map.lock().ok().and_then(|m| m.get(&id).cloned()).ok_or_else(|| "Terminal ist geschlossen.".into())
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let s = self.get(id)?;
        let mut s = s.lock().map_err(|_| "Zustand gesperrt")?;
        s.writer.write_all(data.as_bytes()).and_then(|_| s.writer.flush()).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let s = self.get(id)?;
        let s = s.lock().map_err(|_| "Zustand gesperrt")?;
        s.master
            .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn close(&self, id: u32) {
        let s = self.map.lock().ok().and_then(|mut m| m.remove(&id));
        if let Some(s) = s {
            if let Ok(mut s) = s.lock() {
                let _ = s.child.kill();
                let _ = s.child.wait();
            }
        }
    }

    pub fn close_all(&self) {
        let ids: Vec<u32> = self.map.lock().map(|m| m.keys().copied().collect()).unwrap_or_default();
        for id in ids {
            self.close(id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eine_echte_shell_antwortet_und_endet() {
        let d = std::env::temp_dir().join("jichi-desktop-test-pty");
        std::fs::create_dir_all(&d).unwrap();
        let ptys = Ptys::default();
        let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
        let tx2 = tx.clone();
        let id = ptys
            .open_with(
                d.to_str().unwrap(),
                80,
                24,
                &std::env::var("PATH").unwrap_or_default(),
                Box::new(move |_, s| { let _ = tx.send(Some(s)); }),
                Box::new(move |_| { let _ = tx2.send(None); }),
            )
            .unwrap();
        ptys.write(id, "echo jichi-$((6*7)); pwd; exit\n").unwrap();
        let mut alles = String::new();
        let ende = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            match rx.recv_timeout(ende.saturating_duration_since(std::time::Instant::now())) {
                Ok(Some(s)) => alles.push_str(&s),
                Ok(None) => break,
                Err(_) => panic!("keine Antwort der Shell: {alles}"),
            }
        }
        assert!(alles.contains("jichi-42"), "{alles}");
        assert!(alles.contains("jichi-desktop-test-pty"), "startet im Projektordner: {alles}");
        ptys.close(id);
    }

    #[test]
    fn utf8_ueber_stueckgrenzen() {
        let mut carry = Vec::new();
        let ae = "ä".as_bytes(); // zwei Bytes
        assert_eq!(utf8_teilen(&mut carry, &[b'a', ae[0]]), "a");
        assert_eq!(utf8_teilen(&mut carry, &[ae[1], b'b']), "äb");
        assert!(carry.is_empty());
        assert_eq!(utf8_teilen(&mut carry, &[0xff, b'c']), "\u{fffd}c");
    }
}
