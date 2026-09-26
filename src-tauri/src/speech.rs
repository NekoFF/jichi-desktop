//! Sprache über das Gateway: diktieren (`/audio/transcriptions`) und vorlesen
//! (`/audio/speech`), beides OpenAI-kompatibel, wie es LiteLLM anbietet.
//!
//! Der Schlüssel bleibt hier, in Rust — die Oberfläche schickt nur die Aufnahme
//! bzw. den Text und bekommt Text bzw. Ton zurück. Wie bei der Modellliste gilt:
//! **nur `jlu/…`**. Ein Modellname von aussen wird geprüft, damit eine Aufnahme
//! nie bei einem Anbieter landet, der Geld kostet oder die Daten ausser Haus trägt.

use crate::gateway::{safe_base, FREE_PREFIX};

/// Obergrenze einer Aufnahme — so viel nimmt auch die OpenAI-Schnittstelle an.
pub const AUDIO_MAX: usize = 25 * 1024 * 1024;
/// Obergrenze eines vorzulesenden Textes (Zeichen), wie bei OpenAI `tts-1`.
pub const TEXT_MAX: usize = 4096;

pub const DEFAULT_TRANSCRIBE: &str = "jlu/whisper-1";
pub const DEFAULT_SPEECH: &str = "jlu/tts-1-hd";

fn free_model(model: &str) -> Result<&str, String> {
    let m = model.trim();
    if m.starts_with(FREE_PREFIX) && m.len() > FREE_PREFIX.len() && !m.contains(char::is_whitespace) {
        Ok(m)
    } else {
        Err(format!("„{m}“ ist kein freies Modell des Gateways (nur {FREE_PREFIX}…)."))
    }
}

/// Der Dateiname sagt dem Server, welches Format kommt — Whisper erkennt es daran.
pub fn file_name_for(mime: &str) -> &'static str {
    let m = mime.to_ascii_lowercase();
    if m.contains("webm") {
        "aufnahme.webm"
    } else if m.contains("ogg") {
        "aufnahme.ogg"
    } else if m.contains("wav") {
        "aufnahme.wav"
    } else if m.contains("mpeg") || m.contains("mp3") {
        "aufnahme.mp3"
    } else {
        // Safari/WKWebView nimmt als audio/mp4 (AAC) auf.
        "aufnahme.m4a"
    }
}

/// Ein multipart/form-data-Körper von Hand — ureq 2 bringt keinen mit, und es
/// sind nur ein paar Felder und eine Datei.
pub fn multipart(boundary: &str, fields: &[(&str, &str)], file: (&str, &str, &[u8])) -> Vec<u8> {
    let mut b = Vec::with_capacity(file.2.len() + 512);
    for (name, value) in fields {
        b.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    let (name, filename, data) = file;
    b.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes(),
    );
    b.extend_from_slice(data);
    b.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    b
}

fn boundary() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("----jichi-desktop-{t:x}")
}

/// Die Meldung nennt den Status und — wenn das Gateway eine schickt — seine
/// Fehlermeldung, nie den Schlüssel.
fn describe(base: &str, e: ureq::Error, what: &str) -> String {
    match e {
        ureq::Error::Status(401 | 403, _) => "Das Gateway lehnt den Schlüssel ab (401/403).".into(),
        ureq::Error::Status(code, r) => {
            let body = r.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|j| j.pointer("/error/message").and_then(|m| m.as_str()).map(str::to_string))
                .map(|m| m.chars().take(200).collect::<String>())
                .unwrap_or_default();
            if msg.is_empty() {
                format!("{what}: das Gateway antwortet mit {code}.")
            } else {
                format!("{what}: das Gateway antwortet mit {code} — {msg}")
            }
        }
        ureq::Error::Transport(t) => format!("{base} ist nicht erreichbar: {}", t.kind()),
    }
}

/// Aufnahme → Text.
pub fn transcribe(base: &str, key: &str, model: &str, audio: &[u8], mime: &str, language: Option<&str>) -> Result<String, String> {
    if !safe_base(base) {
        return Err(format!("{base}: der Schlüssel wird nur über https gesendet."));
    }
    let model = free_model(model)?;
    if audio.is_empty() {
        return Err("Die Aufnahme ist leer.".into());
    }
    if audio.len() > AUDIO_MAX {
        return Err("Die Aufnahme ist länger, als das Gateway annimmt (25 MB).".into());
    }
    let lang = language.map(str::trim).filter(|l| l.len() == 2 && l.chars().all(|c| c.is_ascii_lowercase()));
    let mut fields = vec![("model", model), ("response_format", "json")];
    if let Some(l) = lang {
        fields.push(("language", l));
    }
    let b = boundary();
    let body = multipart(&b, &fields, ("file", file_name_for(mime), audio));
    let url = format!("{}/audio/transcriptions", base.trim_end_matches('/'));
    let r = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", &format!("multipart/form-data; boundary={b}"))
        .send_bytes(&body)
        .map_err(|e| describe(base, e, "Diktieren"))?;
    let text = r.into_string().map_err(|e| format!("Antwort unlesbar: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "Das Gateway hat keinen lesbaren Text geliefert.".to_string())?;
    Ok(json.get("text").and_then(|t| t.as_str()).unwrap_or("").trim().to_string())
}

/// Text → Ton (mp3).
pub fn speak(base: &str, key: &str, model: &str, text: &str, voice: &str) -> Result<Vec<u8>, String> {
    if !safe_base(base) {
        return Err(format!("{base}: der Schlüssel wird nur über https gesendet."));
    }
    let model = free_model(model)?;
    let text = text.trim();
    if text.is_empty() {
        return Err("Es gibt nichts vorzulesen.".into());
    }
    let text: String = text.chars().take(TEXT_MAX).collect();
    let voice = if voice.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') && !voice.is_empty() {
        voice
    } else {
        "alloy"
    };
    let url = format!("{}/audio/speech", base.trim_end_matches('/'));
    let r = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "model": model, "input": text, "voice": voice, "response_format": "mp3" }).to_string())
        .map_err(|e| describe(base, e, "Vorlesen"))?;
    let mut out = Vec::new();
    use std::io::Read;
    r.into_reader()
        .take(AUDIO_MAX as u64 + 1)
        .read_to_end(&mut out)
        .map_err(|e| format!("Ton unlesbar: {e}"))?;
    if out.len() > AUDIO_MAX {
        return Err("Die Sprachausgabe ist zu gross.".into());
    }
    // Ein 200 mit JSON statt Ton ist ein Fehler, der sich als Erfolg ausgibt.
    if out.first() == Some(&b'{') {
        return Err("Vorlesen: das Gateway hat keinen Ton geliefert.".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nur_freie_modelle() {
        assert_eq!(free_model(" jlu/whisper-1 ").unwrap(), "jlu/whisper-1");
        assert!(free_model("openai/whisper-1").is_err());
        assert!(free_model("whisper-1").is_err());
        assert!(free_model("jlu/").is_err());
        assert!(free_model("jlu/x y").is_err());
    }

    #[test]
    fn multipart_ist_wohlgeformt() {
        let body = multipart("B", &[("model", "jlu/whisper-1")], ("file", "a.m4a", b"\x00\x01"));
        let s = String::from_utf8_lossy(&body);
        assert!(s.starts_with("--B\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\njlu/whisper-1\r\n"));
        assert!(s.contains("name=\"file\"; filename=\"a.m4a\"\r\n"));
        assert!(body.ends_with(b"\x00\x01\r\n--B--\r\n"));
    }

    #[test]
    fn dateiname_nach_format() {
        assert_eq!(file_name_for("audio/webm;codecs=opus"), "aufnahme.webm");
        assert_eq!(file_name_for("audio/mp4"), "aufnahme.m4a");
        assert_eq!(file_name_for("audio/wav"), "aufnahme.wav");
    }

    #[test]
    fn ohne_https_geht_kein_schluessel_hinaus() {
        assert!(transcribe("http://evil.example/v1", "k", "jlu/whisper-1", b"x", "audio/wav", None).is_err());
        assert!(speak("http://evil.example/v1", "k", "jlu/tts-1-hd", "hallo", "alloy").is_err());
    }

    /// Gegen das echte Gateway, nur von Hand:
    /// `JICHI_TEST_KEY_FILE=… JICHI_TEST_AUDIO=….wav cargo test speech::tests::live -- --ignored --nocapture`
    /// Der Schlüssel kommt aus der Datei und wird nirgends ausgegeben.
    #[test]
    #[ignore]
    fn live() {
        let key = std::fs::read_to_string(std::env::var("JICHI_TEST_KEY_FILE").unwrap()).unwrap();
        let key = key.trim();
        let base = "https://api.hrz.uni-giessen.de/v1";
        let audio = std::fs::read(std::env::var("JICHI_TEST_AUDIO").unwrap()).unwrap();
        let t0 = std::time::Instant::now();
        let text = transcribe(base, key, DEFAULT_TRANSCRIBE, &audio, "audio/wav", Some("de"));
        println!("transcribe {:?}: {:?}", t0.elapsed(), text);
        assert!(text.unwrap().contains("Hochschulrechenzentrum"));
        let t0 = std::time::Instant::now();
        match speak(base, key, DEFAULT_SPEECH, "Hallo.", "alloy") {
            Ok(b) => println!("speak {:?}: {} Bytes, Kopf {:02x?}", t0.elapsed(), b.len(), &b[..b.len().min(4)]),
            Err(e) => println!("speak {:?}: FEHLER {e}", t0.elapsed()),
        }
    }

    #[test]
    fn leere_eingaben_werden_abgelehnt() {
        assert!(transcribe("https://x/v1", "k", "jlu/whisper-1", b"", "audio/wav", None).is_err());
        assert!(speak("https://x/v1", "k", "jlu/tts-1-hd", "   ", "alloy").is_err());
        assert!(speak("https://x/v1", "k", "openai/tts-1", "hallo", "alloy").is_err());
    }
}
