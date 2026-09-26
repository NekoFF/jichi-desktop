/** Englisch für kern — deutscher Text → englischer Text. */
export const KERN: Record<string, string> = {
  // labels.ts — Zustand des Agenten
  "nicht verbunden": "not connected",
  "startet": "starting",
  "bereit": "ready",
  "arbeitet": "working",
  "bricht ab": "canceling",
  "Fehler": "Error",
  // labels.ts — Rollen
  "Du": "You",
  "Überlegung": "Thinking",
  // labels.ts — Art eines Werkzeugs
  "liest": "reading",
  "ändert": "editing",
  "löscht": "deleting",
  "verschiebt": "moving",
  "sucht": "searching",
  "führt aus": "executing",
  "denkt": "thinking",
  "ruft ab": "fetching",
  "Werkzeug": "tool",
  // labels.ts — Zustand eines Werkzeugs
  "wartet": "pending",
  "läuft": "running",
  "fertig": "done",
  "fehlgeschlagen": "failed",
  // labels.ts — Zeit
  "gerade eben": "just now",
  "vor {n} Min.": "{n} min ago",
  "vor {n} Std.": "{n} h ago",
  "gestern": "yesterday",
  "vor {n} Tagen": "{n} days ago",

  // state.ts — Inhaltsblöcke als Text
  "[Bild {typ}]": "[Image {typ}]",
  "[Audio {typ}]": "[Audio {typ}]",
  "[Ressource {uri}]": "[Resource {uri}]",
  "[Verweis {name}]": "[Link {name}]",
  "unbekannt": "unknown",

  // export.ts
  "Exportiert aus jichi Desktop am {datum}": "Exported from jichi Desktop on {datum}",
  "Angehängt: {dateien}": "Attached: {dateien}",
  "{n} Bild(er)": "{n} image(s)",
  "Hinweis": "Note",

  // speech.ts
  "(Codeblock ausgelassen.)": "(Code block omitted.)",

  // preview.ts
  "Blatt {n}": "Sheet {n}",

  // jsonrpc.ts
  "{methode}: keine Antwort nach {n} Sekunden": "{methode}: no reply after {n} seconds",
  "Fehler ohne Meldung": "Error without a message",

  // transport.ts
  "Chat exportieren": "Export chat",
  "Kopie speichern": "Save copy",
  "Nur http- und https-Verweise werden geöffnet.": "Only http and https links can be opened.",

  // agent.ts
  "Bitte warte, bis die Antwort beendet ist.": "Please wait until the reply has finished.",
  "Es gibt nichts vorzulesen.": "There is nothing to read aloud.",
  "Neuer Chat im Modus „{modus}“.": "New chat in {modus} mode.",
  "Datei anhängen": "Attach file",
  "Bitte den API-Schlüssel eintragen.": "Please enter the API key.",
  "jichi wurde auf diesem Rechner nicht gefunden. Bitte das Programm auswählen.":
    "jichi was not found on this computer. Please select the program.",
  "jichi auswählen": "Select jichi",
  "Der API-Schlüssel ist weiterhin verfügbar.": "The API key is still available.",
  "Projektordner wählen": "Choose project folder",
  "Nicht gespeichert, weil der Name nach einem Geheimnis aussieht: {namen}. ":
    "Not saved because the name looks like a secret: {namen}. ",
  "Statt eines Wertes bitte eine Datei angeben — sie wird erst beim Start gelesen.":
    "Please specify a file instead of a value — it is only read at startup.",
  "die Verbindung wurde getrennt": "the connection was closed",
  "Der Agent ist nicht bereit — bitte Einstellungen prüfen.": "The agent is not ready — please check Settings.",
  "Das aktive Modell kann keine Bilder lesen.": "The active model can't read images.",
  "Chat mit jichi": "Chat with jichi",
  "Der Agent ist noch nicht eingerichtet.": "The agent hasn't been set up yet.",
  "Dieser Chat ist nicht mehr vorhanden.": "This chat no longer exists.",
  "Der aktive Chat konnte nicht geschlossen werden.": "The active chat could not be closed.",
  "der Agent wird neu gestartet": "the agent is restarting",
  "Der Agent spricht Protokollversion {agent}, diese Anwendung {app}.":
    "The agent speaks protocol version {agent}, this app {app}.",
  "Abgebrochen.": "Canceled.",
  "Der Zug endete mit „{grund}“.": "The turn ended with “{grund}”.",
  "jichi ist fertig": "jichi is done",
  "Die Antwort liegt bereit.": "The reply is ready.",
  "der Agent wurde beendet": "the agent was stopped",
  "Der Agent wurde beendet.": "The agent was stopped.",
  "Der Agent wurde mit Code {code} beendet. Die letzten Meldungen stehen in der Diagnose.":
    "The agent exited with code {code}. The latest messages are in the diagnostics.",
  "Werkzeug ausführen": "Run tool",
  "jichi wartet auf deine Erlaubnis": "jichi is waiting for your permission",
  "Kein Projekt geöffnet.": "No project open.",
};
