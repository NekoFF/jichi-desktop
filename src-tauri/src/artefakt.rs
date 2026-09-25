//! Artefakte: HTML, SVG, Diagramme und React aus einer Antwort — lebendig.
//!
//! Die Oberfläche legt den Code hier ab; ein `iframe` holt ihn über das eigene
//! Schema `artefakt://` wieder. Jede Antwort trägt eine eigene, strenge
//! Sicherheitsrichtlinie: Skripte ja, Netz nein — ausser den großen CDNs für
//! Bibliotheken —, und kein Weg zurück in die Anwendung (das `iframe` hat kein
//! `allow-same-origin`, also weder Speicher noch Tauri).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::http::{Request, Response};

#[derive(Default)]
pub struct Artefakte {
    map: Mutex<HashMap<String, (String, Vec<u8>)>>,
}

const CDN: &str = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh";

fn csp() -> String {
    format!(
        "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: {CDN}; style-src 'unsafe-inline' {CDN} https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com {CDN}; img-src data: blob: https:; media-src data: blob: https:; connect-src {CDN}; worker-src blob:; form-action 'none'; base-uri 'none'"
    )
}

/// Einheitlicher Rahmen: ruhiger Hintergrund, Systemschrift, keine Ränder.
fn huelle(titel: &str, kopf: &str, koerper: &str) -> String {
    let t = titel.replace('<', "&lt;");
    format!(
        "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title><style>html,body{{margin:0;padding:0}}body{{font-family:-apple-system,system-ui,Segoe UI,sans-serif;padding:16px;color:#181c1e;background:#fff}}@media (prefers-color-scheme:dark){{body{{color:#e3e3e7;background:#121417}}}}</style>{kopf}</head><body>{koerper}</body></html>"
    )
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Aus Sprache und Code ein vollständiges HTML-Dokument machen.
pub fn dokument(lang: &str, titel: &str, code: &str) -> String {
    match lang {
        "html" | "htm" => {
            if code.to_ascii_lowercase().contains("<html") || code.to_ascii_lowercase().contains("<!doctype") {
                code.to_string()
            } else {
                huelle(titel, "", code)
            }
        }
        "svg" => huelle(titel, "<style>body{display:grid;place-items:center;min-height:calc(100vh - 32px)}svg{max-width:100%;height:auto}</style>", code),
        "mermaid" => huelle(
            titel,
            "<script src=\"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js\"></script>",
            &format!(
                "<pre class=\"mermaid\">{}</pre><script>mermaid.initialize({{startOnLoad:true,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'default'}});</script>",
                escape(code)
            ),
        ),
        // React: eine Komponente als Standardexport oder `App`, übersetzt im Browser.
        "jsx" | "tsx" | "react" => huelle(
            titel,
            "<script src=\"https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js\"></script><script src=\"https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js\"></script><script src=\"https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js\"></script><script src=\"https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4\"></script>",
            &format!(
                "<div id=\"root\"></div><script type=\"text/babel\" data-presets=\"react,typescript\" data-type=\"module\">\nconst {{useState,useEffect,useMemo,useRef,useCallback,useReducer,Fragment}} = React;\n{}\nconst __C = typeof App !== 'undefined' ? App : (typeof exports !== 'undefined' && exports.default) || null;\nReactDOM.createRoot(document.getElementById('root')).render(__C ? React.createElement(__C) : React.createElement('pre', null, 'Keine Komponente „App“ gefunden.'));\n</script>",
                code.replace("export default function", "function App_").replace("export default ", "const App = ").replace("function App_", "function App")
                    .lines().filter(|l| !l.trim_start().starts_with("import ")).collect::<Vec<_>>().join("\n")
            ),
        ),
        _ => huelle(titel, "", &format!("<pre>{}</pre>", escape(code))),
    }
}

impl Artefakte {
    pub fn put(&self, id: &str, lang: &str, titel: &str, code: &str) -> Result<(), String> {
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("ungültige Kennung".into());
        }
        let html = dokument(lang, titel, code);
        self.map.lock().map_err(|_| "Zustand gesperrt")?.insert(id.to_string(), ("text/html; charset=utf-8".into(), html.into_bytes()));
        Ok(())
    }

    pub fn antwort(&self, req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        let id = req.uri().path().trim_start_matches('/').split(['/', '?']).next().unwrap_or("").to_string();
        let found = self.map.lock().ok().and_then(|m| m.get(&id).cloned());
        match found {
            Some((mime, body)) => Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Content-Security-Policy", csp())
                .header("X-Content-Type-Options", "nosniff")
                .body(body)
                .unwrap_or_else(|_| Response::new(Vec::new())),
            None => Response::builder().status(404).body(b"nicht gefunden".to_vec()).unwrap_or_else(|_| Response::new(Vec::new())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dokumente_und_antworten() {
        assert!(dokument("html", "t", "<h1>x</h1>").contains("<body><h1>x</h1></body>"));
        let voll = "<!doctype html><html><body>y</body></html>";
        assert_eq!(dokument("html", "t", voll), voll);
        assert!(dokument("mermaid", "t", "graph TD; A-->B<script>").contains("A--&gt;B&lt;script&gt;"), "Mermaid-Text wird maskiert");
        let r = dokument("jsx", "t", "import x from 'y';\nexport default function Zaehler() { return <b>1</b>; }");
        assert!(!r.contains("import x") && r.contains("function App"), "{r}");

        let a = Artefakte::default();
        a.put("abc", "svg", "t", "<svg/>").unwrap();
        assert!(a.put("../x", "html", "t", "").is_err());
        let ok = a.antwort(&Request::builder().uri("artefakt://localhost/abc").body(Vec::new()).unwrap());
        assert_eq!(ok.status(), 200);
        assert!(ok.headers()["Content-Security-Policy"].to_str().unwrap().contains("default-src 'none'"));
        let weg = a.antwort(&Request::builder().uri("artefakt://localhost/fehlt").body(Vec::new()).unwrap());
        assert_eq!(weg.status(), 404);
    }
}
