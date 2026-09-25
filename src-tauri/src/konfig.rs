//! jichis eigene Einstellungen, soweit die Anwendung sie zeigt und ändert:
//! MCP-Server und dauerhafte Erlaubnisse (`permissions.allow/deny`).
//!
//! Geschrieben wird wie überall: nur reines JSON (mit Kommentaren wird nicht
//! angefasst), mit Sicherung, atomar, 0600.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Vom Benutzer ausgeschaltet: steht in `mcpServersDisabled`, nicht in `mcpServers`.
    #[serde(default)]
    pub disabled: bool,
    /// Der eigene Dokumenten-Server dieser Anwendung.
    #[serde(default)]
    pub builtin: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Erlaubnisse {
    pub allow: Vec<String>,
    pub deny: Vec<String>,
    /// `"*"` oder `true`: alles. Wird angezeigt, aber nicht in der Liste bearbeitet.
    pub allow_all: bool,
    pub deny_all: bool,
}

fn liste(v: Option<&serde_json::Value>) -> (Vec<String>, bool) {
    match v {
        Some(serde_json::Value::Bool(true)) => (Vec::new(), true),
        Some(serde_json::Value::String(s)) if s == "*" => (Vec::new(), true),
        Some(serde_json::Value::Array(a)) => {
            let alle = a.iter().any(|x| x.as_str() == Some("*"));
            (a.iter().filter_map(|x| x.as_str()).filter(|s| *s != "*").map(str::to_string).collect(), alle)
        }
        _ => (Vec::new(), false),
    }
}

pub fn erlaubnisse(json: &serde_json::Value) -> Erlaubnisse {
    let p = json.get("permissions");
    let (allow, allow_all) = liste(p.and_then(|p| p.get("allow")));
    let (deny, deny_all) = liste(p.and_then(|p| p.get("deny")));
    Erlaubnisse { allow, deny, allow_all, deny_all }
}

/// Listen ersetzen; ein „alles“ (`*`/`true`) bleibt, wie es war.
pub fn setze_erlaubnisse(json: &mut serde_json::Value, allow: &[String], deny: &[String]) -> Result<(), String> {
    let obj = json.as_object_mut().ok_or("Die Konfiguration ist kein JSON-Objekt.")?;
    let alt = erlaubnisse(&serde_json::Value::Object(obj.clone()));
    let perm = obj.entry("permissions").or_insert_with(|| serde_json::json!({}));
    let perm = perm.as_object_mut().ok_or("„permissions“ ist kein Objekt.")?;
    let saubere = |l: &[String], alle: bool| {
        let mut v: Vec<serde_json::Value> = Vec::new();
        for n in l.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if !v.iter().any(|x| x.as_str() == Some(n)) {
                v.push(serde_json::json!(n));
            }
        }
        if alle {
            v.push(serde_json::json!("*"));
        }
        serde_json::Value::Array(v)
    };
    perm.insert("allow".into(), saubere(allow, alt.allow_all));
    perm.insert("deny".into(), saubere(deny, alt.deny_all));
    Ok(())
}

pub fn server(json: &serde_json::Value, docs_name: &str) -> Vec<McpServer> {
    let mut out = Vec::new();
    for (key, disabled) in [("mcpServers", false), ("mcpServersDisabled", true)] {
        if let Some(a) = json.get(key).and_then(|v| v.as_array()) {
            for e in a {
                let Some(name) = e.get("name").and_then(|n| n.as_str()) else { continue };
                out.push(McpServer {
                    name: name.to_string(),
                    command: e.get("command").and_then(|c| c.as_str()).map(str::to_string),
                    args: e.get("args").and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default(),
                    url: e.get("url").and_then(|u| u.as_str()).map(str::to_string),
                    disabled,
                    builtin: name == docs_name,
                });
            }
        }
    }
    out
}

/// Einen Server ein- oder ausschalten: zwischen `mcpServers` und
/// `mcpServersDisabled` verschieben. jichi liest nur die erste Liste; der
/// Eintrag bleibt vollständig erhalten und lässt sich wieder einschalten.
pub fn schalte_server(json: &mut serde_json::Value, name: &str, an: bool) -> Result<(), String> {
    let obj = json.as_object_mut().ok_or("Die Konfiguration ist kein JSON-Objekt.")?;
    let (von, nach) = if an { ("mcpServersDisabled", "mcpServers") } else { ("mcpServers", "mcpServersDisabled") };
    let mut eintrag = None;
    if let Some(a) = obj.get_mut(von).and_then(|v| v.as_array_mut()) {
        if let Some(i) = a.iter().position(|e| e.get("name").and_then(|n| n.as_str()) == Some(name)) {
            eintrag = Some(a.remove(i));
        }
    }
    let e = eintrag.ok_or_else(|| format!("Kein Server „{name}“."))?;
    let ziel = obj.entry(nach).or_insert_with(|| serde_json::json!([]));
    ziel.as_array_mut().ok_or(format!("„{nach}“ ist keine Liste."))?.push(e);
    if obj.get(von).and_then(|v| v.as_array()).is_some_and(|a| a.is_empty()) && von == "mcpServersDisabled" {
        obj.remove(von);
    }
    Ok(())
}

/// Einen neuen stdio-Server anlegen (oder einen gleichnamigen ersetzen).
pub fn neuer_server(json: &mut serde_json::Value, name: &str, command: &str, args: &[String]) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Der Name darf nur Buchstaben, Ziffern, - und _ enthalten.".into());
    }
    if command.trim().is_empty() {
        return Err("Das Programm fehlt.".into());
    }
    let obj = json.as_object_mut().ok_or("Die Konfiguration ist kein JSON-Objekt.")?;
    for key in ["mcpServers", "mcpServersDisabled"] {
        if let Some(a) = obj.get_mut(key).and_then(|v| v.as_array_mut()) {
            a.retain(|e| e.get("name").and_then(|n| n.as_str()) != Some(name));
        }
    }
    let list = obj.entry("mcpServers").or_insert_with(|| serde_json::json!([]));
    list.as_array_mut()
        .ok_or("„mcpServers“ ist keine Liste (jichi erwartet eine Liste).")?
        .push(serde_json::json!({ "name": name, "type": "stdio", "command": command.trim(), "args": args }));
    Ok(())
}

pub fn entferne_server(json: &mut serde_json::Value, name: &str) -> Result<(), String> {
    let obj = json.as_object_mut().ok_or("Die Konfiguration ist kein JSON-Objekt.")?;
    let mut weg = false;
    for key in ["mcpServers", "mcpServersDisabled"] {
        if let Some(a) = obj.get_mut(key).and_then(|v| v.as_array_mut()) {
            let n = a.len();
            a.retain(|e| e.get("name").and_then(|n| n.as_str()) != Some(name));
            weg |= a.len() != n;
        }
    }
    if weg { Ok(()) } else { Err(format!("Kein Server „{name}“.")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erlaubnisse_lesen_und_setzen() {
        let mut j = serde_json::json!({"permissions": {"allow": ["edit_file", "*"], "deny": "run_terminal_command"}});
        let e = erlaubnisse(&j);
        assert_eq!(e.allow, ["edit_file"]);
        assert!(e.allow_all && e.deny.is_empty() && !e.deny_all);
        setze_erlaubnisse(&mut j, &["write_file".into(), "write_file".into(), " ".into()], &["git_push".into()]).unwrap();
        assert_eq!(j["permissions"]["allow"], serde_json::json!(["write_file", "*"]), "„alles“ bleibt, Doppeltes fällt weg");
        assert_eq!(j["permissions"]["deny"], serde_json::json!(["git_push"]));
    }

    #[test]
    fn server_ein_aus_neu_weg() {
        let mut j = serde_json::json!({"mcpServers": [{"name": "dokumente", "command": "/x"}, {"name": "fs", "command": "npx", "args": ["a"]}]});
        let s = server(&j, "dokumente");
        assert!(s[0].builtin && !s[1].builtin && s[1].args == ["a"]);
        schalte_server(&mut j, "fs", false).unwrap();
        assert_eq!(j["mcpServers"].as_array().unwrap().len(), 1);
        assert!(server(&j, "dokumente").iter().any(|x| x.name == "fs" && x.disabled));
        schalte_server(&mut j, "fs", true).unwrap();
        assert!(j.get("mcpServersDisabled").is_none(), "leere Liste verschwindet");
        neuer_server(&mut j, "db", "python3", &["srv.py".into()]).unwrap();
        assert_eq!(j["mcpServers"][2]["args"][0], "srv.py");
        assert!(neuer_server(&mut j, "böse name", "x", &[]).is_err());
        entferne_server(&mut j, "db").unwrap();
        assert!(entferne_server(&mut j, "db").is_err());
    }
}
