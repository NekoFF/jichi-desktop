//! Was der Schlüssel erreicht: die Modellliste des Gateways.
//!
//! Der Benutzer hat beim ersten Start einen Schlüssel eingegeben — also kann
//! die Anwendung auch zeigen, welche Modelle er damit benutzen darf, statt nur
//! die fünf aus der Vorlage. Gefragt wird `GET {apiBase}/models`; das kostet
//! nichts, es ist eine Liste.
//!
//! **Nur `jlu/…` wird angeboten.** Das Gateway der JLU listet auch Modelle
//! fremder Anbieter (`openai/…`, `anthropic/…`), und die kosten Geld. Dass der
//! Schlüssel sie erreicht, heisst nicht, dass sie benutzt werden dürfen — also
//! erscheinen sie hier gar nicht erst. Siehe `CLAUDE.md` des Agenten.

use serde::Serialize;

/// Der Namensraum der kostenlosen, hauseigenen Modelle.
pub const FREE_PREFIX: &str = "jlu/";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GatewayModel {
    pub id: String,
    /// `chat`, `embed`, `rerank`, `transcribe`, `speech`, `image` — geraten aus
    /// dem Namen, denn `/models` sagt es nicht. Nur für die Anzeige.
    pub kind: &'static str,
}

/// Aus dem Namen raten, wofür ein Modell da ist.
pub fn kind_of(id: &str) -> &'static str {
    let n = id.to_ascii_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| n.contains(w));
    if has(&["embed"]) {
        "embed"
    } else if has(&["rerank"]) {
        "rerank"
    } else if has(&["whisper", "transcri", "asr", "stt", "voxtral-mini"]) {
        "transcribe"
    } else if has(&["tts", "speech", "voice", "kokoro", "piper"]) {
        "speech"
    } else if has(&["image", "flux", "diffusion", "sdxl"]) {
        "image"
    } else {
        "chat"
    }
}

/// Die Antwort von `/models` lesen und auf die freien Modelle beschränken.
pub fn parse_models(body: &str) -> Result<Vec<GatewayModel>, String> {
    let json: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Das Gateway hat keine lesbare Liste geliefert.".to_string())?;
    let mut out: Vec<GatewayModel> = json
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
                .filter(|id| id.starts_with(FREE_PREFIX))
                .map(|id| GatewayModel { id: id.to_string(), kind: kind_of(id) })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.kind.cmp(b.kind).then_with(|| a.id.cmp(&b.id)));
    out.dedup();
    Ok(out)
}

/// Ein Schlüssel geht nie unverschlüsselt über das Netz — ausser an den
/// eigenen Rechner (LM Studio, ein lokaler Server).
pub fn safe_base(base: &str) -> bool {
    let b = base.trim().to_ascii_lowercase();
    b.starts_with("https://")
        || b.starts_with("http://localhost")
        || b.starts_with("http://127.0.0.1")
        || b.starts_with("http://[::1]")
}

pub fn fetch(base: &str, key: &str) -> Result<Vec<GatewayModel>, String> {
    if !safe_base(base) {
        return Err(format!("{base}: der Schlüssel wird nur über https gesendet."));
    }
    let url = format!("{}/models", base.trim_end_matches('/'));
    let response = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .set("Authorization", &format!("Bearer {key}"))
        .call();
    match response {
        Ok(r) => parse_models(&r.into_string().map_err(|e| format!("Antwort unlesbar: {e}"))?),
        // Die Meldung nennt den Status, nie den Schlüssel.
        Err(ureq::Error::Status(401 | 403, _)) => {
            Err("Das Gateway lehnt den Schlüssel ab (401/403).".into())
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("Das Gateway antwortet mit {code}.")),
        Err(ureq::Error::Transport(t)) => Err(format!("{base} ist nicht erreichbar: {}", t.kind())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nur_freie_modelle_werden_angeboten() {
        let body = r#"{"data":[
            {"id":"jlu/qwen3-coder-next"},{"id":"openai/gpt-5"},{"id":"tts-1-hd"},
            {"id":"jlu/qwen3-embedding"},{"id":"anthropic/claude"},{"id":"jlu/whisper-large"},
            {"id":"jlu/qwen3-coder-next"}]}"#;
        let models = parse_models(body).unwrap();
        let ids: Vec<_> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["jlu/qwen3-coder-next", "jlu/qwen3-embedding", "jlu/whisper-large"]);
        assert_eq!(models[0].kind, "chat");
        assert_eq!(models[1].kind, "embed");
        assert_eq!(models[2].kind, "transcribe");
    }

    #[test]
    fn kaputte_antwort_ist_ein_fehler_ohne_inhalt() {
        assert!(parse_models("<html>").is_err());
        assert_eq!(parse_models(r#"{"object":"list"}"#).unwrap(), vec![]);
    }

    #[test]
    fn der_schluessel_geht_nur_verschluesselt_hinaus() {
        assert!(safe_base("https://api.hrz.uni-giessen.de/v1"));
        assert!(safe_base("http://localhost:1234/v1"));
        assert!(!safe_base("http://api.hrz.uni-giessen.de/v1"));
        assert!(!safe_base("ftp://x"));
    }
}
