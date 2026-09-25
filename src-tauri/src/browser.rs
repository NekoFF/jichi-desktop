//! Ein echter Browser in der Seitenleiste — eine eigene Webansicht im Fenster.
//!
//! Kein `iframe`: die meisten Seiten verbieten, eingebettet zu werden, und ein
//! Dev-Server braucht Cookies und Weiterleitungen wie im richtigen Browser.
//! Die Ansicht liegt genau über dem Platz, den die Oberfläche ihr freihält.
//!
//! **Abgeschottet:** nur `http`/`https` (kein `file:`, kein `tauri:`), keine
//! Befehle dieser Anwendung (IPC gilt nur für die eigene Oberfläche), neue
//! Fenster öffnen im selben Browser. Cookies liegen in einem eigenen Ordner —
//! eine Anmeldung am Dev-Server überlebt den Neustart.

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stand {
    id: String,
    url: Option<String>,
    title: Option<String>,
    loading: Option<bool>,
}

fn label(id: &str) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("ungültige Kennung".into());
    }
    Ok(format!("browser-{id}"))
}

/// Nur Webseiten. Alles andere wäre ein Weg aus dem Browser in die Anwendung
/// oder auf die Platte.
pub fn erlaubt(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https") || url.as_str() == "about:blank"
}

/// Eine Eingabe in der Adresszeile zu einer Adresse machen: `localhost:3000`
/// und `uni-giessen.de` gehen, Leerzeichen suchen nicht (dafür gibt es die
/// Suche nicht), ein Pfad wird abgelehnt.
pub fn adresse(eingabe: &str) -> Result<Url, String> {
    let e = eingabe.trim();
    if e.is_empty() {
        return Url::parse("about:blank").map_err(|e| e.to_string());
    }
    let mit_schema = if e.contains("://") {
        e.to_string()
    } else if e.starts_with("localhost") || e.starts_with("127.0.0.1") || e.starts_with("[::1]") {
        format!("http://{e}")
    } else {
        format!("https://{e}")
    };
    let url = Url::parse(&mit_schema).map_err(|_| format!("„{e}“ ist keine Adresse."))?;
    if !erlaubt(&url) {
        return Err("Nur http- und https-Adressen.".into());
    }
    Ok(url)
}

pub fn open(app: &AppHandle, id: &str, url: &str, x: f64, y: f64, w: f64, h: f64) -> Result<String, String> {
    let label = label(id)?;
    let url = adresse(url)?;
    if let Some(v) = app.get_webview(&label) {
        let _ = v.navigate(url.clone());
        return Ok(url.to_string());
    }
    let window = app.get_window("main").ok_or("Hauptfenster fehlt")?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("browser");
    let (a, b, c, d) = (app.clone(), app.clone(), app.clone(), id.to_string());
    let (id1, id2, id3) = (d.clone(), d.clone(), d.clone());
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url.clone()))
        .data_directory(dir)
        .on_navigation(move |u| {
            let ok = erlaubt(u);
            if ok {
                let _ = a.emit("browser-stand", Stand { id: id1.clone(), url: Some(u.to_string()), title: None, loading: Some(true) });
            }
            ok
        })
        .on_page_load(move |v, p| {
            let fertig = matches!(p.event(), tauri::webview::PageLoadEvent::Finished);
            let _ = b.emit(
                "browser-stand",
                Stand { id: id2.clone(), url: v.url().ok().map(|u| u.to_string()), title: None, loading: Some(!fertig) },
            );
        })
        .on_document_title_changed(move |_, title| {
            let _ = c.emit("browser-stand", Stand { id: id3.clone(), url: None, title: Some(title), loading: None });
        })
        // Ein Link mit target=_blank öffnet hier, nicht in einem neuen Fenster.
        .on_new_window(move |u, _| {
            if erlaubt(&u) {
                if let Some(v) = window_webview(&d) {
                    let _ = v.navigate(u);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        });
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w.max(1.0), h.max(1.0)))
        .map_err(|e| format!("Browser ließ sich nicht öffnen: {e}"))?;
    Ok(url.to_string())
}

// Für on_new_window: die eigene Ansicht wiederfinden, ohne sie festzuhalten.
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

pub fn remember(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn window_webview(id: &str) -> Option<tauri::Webview> {
    APP.get()?.get_webview(&label(id).ok()?)
}

fn view(app: &AppHandle, id: &str) -> Result<tauri::Webview, String> {
    app.get_webview(&label(id)?).ok_or_else(|| "Browser ist geschlossen.".into())
}

pub fn bounds(app: &AppHandle, id: &str, x: f64, y: f64, w: f64, h: f64, visible: bool) -> Result<(), String> {
    let v = view(app, id)?;
    v.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    v.set_size(LogicalSize::new(w.max(1.0), h.max(1.0))).map_err(|e| e.to_string())?;
    if visible { v.show() } else { v.hide() }.map_err(|e| e.to_string())
}

pub fn navigate(app: &AppHandle, id: &str, url: &str) -> Result<String, String> {
    let u = adresse(url)?;
    view(app, id)?.navigate(u.clone()).map_err(|e| e.to_string())?;
    Ok(u.to_string())
}

pub fn go(app: &AppHandle, id: &str, wohin: &str) -> Result<(), String> {
    let v = view(app, id)?;
    match wohin {
        "back" => v.eval("history.back()"),
        "forward" => v.eval("history.forward()"),
        "reload" => v.reload(),
        _ => return Err("unbekannt".into()),
    }
    .map_err(|e| e.to_string())
}

pub fn close(app: &AppHandle, id: &str) {
    if let Ok(v) = view(app, id) {
        let _ = v.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adressen_werden_ergaenzt_und_begrenzt() {
        assert_eq!(adresse("localhost:3000").unwrap().as_str(), "http://localhost:3000/");
        assert_eq!(adresse("uni-giessen.de").unwrap().as_str(), "https://uni-giessen.de/");
        assert_eq!(adresse("https://example.org/a?b=1").unwrap().as_str(), "https://example.org/a?b=1");
        assert!(adresse("file:///etc/passwd").is_err());
        assert!(adresse("javascript:alert(1)").is_err());
        assert!(adresse("tauri://localhost").is_err());
        assert!(label("abc").is_ok() && label("../x").is_err() && label("").is_err());
    }
}
