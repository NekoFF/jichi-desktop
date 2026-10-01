/** Englisch für verlauf — deutscher Text → englischer Text. */
export const VERLAUF: Record<string, string> = {
  // Verlauf.tsx — Terminal und Werkzeugkarte
  "… ältere Ausgabe gekürzt": "… older output truncated",
  "beendet": "finished",
  "abgebrochen (Signal {signal})": "aborted (signal {signal})",
  "beendet mit Code {code}": "exited with code {code}",
  "… gekürzt": "… truncated",
  "Im Terminal ansehen": "View in terminal",
  "Änderungen ansehen": "View changes",
  // Verlauf.tsx — Aktionen unter der Antwort
  "Antwort kopieren": "Copy reply",
  "Kopieren": "Copy",
  "Noch einmal fragen": "Ask again",
  // Verlauf.tsx — jichi arbeitet
  "jichi startet …": "jichi is starting …",
  "jichi bricht ab …": "jichi is canceling …",
  "jichi arbeitet …": "jichi is working …",
  // Verlauf.tsx — Nachrichten
  "Bild {n}": "Image {n}",
  "Bild": "Image",
  "Bearbeiten und erneut senden": "Edit and resend",
  "Nachricht bearbeiten": "Edit message",
  // Verlauf.tsx — Rückfrage
  "jichi bittet um Erlaubnis": "jichi is asking for permission",
  "Auch nach einem Neustart: trägt {werkzeug} in jichis Erlaubnisse ein (permissions.allow). Rückgängig in den Einstellungen.":
    "Also after a restart: adds {werkzeug} to jichi's permissions (permissions.allow). Undo in Settings.",
  "Immer erlauben": "Always allow",
  "Abbrechen": "Cancel",
  // Verlauf.tsx — leerer Anfang
  "Hallo, {name}.": "Hello, {name}.",
  "Womit fangen wir an?": "Where should we start?",
  "Noch kein Projekt geöffnet.": "No project open yet.",
  "Projekt öffnen": "Open project",
  "Ordner wählen": "Choose folder",
  "Erklär mir dieses Projekt.": "Explain this project to me.",
  "Projekt erklären": "Explain project",
  "Führe die Tests aus.": "Run the tests.",
  "Tests ausführen": "Run tests",

  // Vorschau.tsx
  "Der Befehl enthält unsichtbare Zeichen. Sie sind unten markiert (␍, ␛, ⟨U+…⟩) — lies ihn genau.":
    "The command contains invisible characters. They are marked below (␍, ␛, ⟨U+…⟩) — read it carefully.",
  "läuft im Hintergrund weiter": "keeps running in the background",
  "{path} wird gelesen …": "Reading {path} …",
  "1 Ersetzung passt nicht zum heutigen Inhalt — das Werkzeug wird dort scheitern.":
    "1 replacement doesn't match the current content — the tool will fail there.",
  "{n} Ersetzungen passen nicht zum heutigen Inhalt — das Werkzeug wird dort scheitern.":
    "{n} replacements don't match the current content — the tool will fail there.",
  "neues Dokument": "new document",
  "neue Tabelle": "new spreadsheet",
  "… {n} weitere Zeilen": "… {n} more rows",
  "Die Argumente sind kein gültiges JSON. jichi repariert sie vor der Ausführung — was dann läuft, lässt sich hier nicht sicher zeigen. Im Zweifel ablehnen.":
    "The arguments aren't valid JSON. jichi repairs them before running — what actually runs can't be shown reliably here. If in doubt, deny.",

  // Markdown.tsx
  "HTML-Seite": "HTML page",
  "Grafik": "Graphic",
  "Diagramm": "Diagram",
  "React-Komponente": "React component",
  "Dokument": "Document",
  "Artefakt": "Artifact",
  "Öffnen": "Open",
  "Code kopieren": "Copy code",
  "Kopiert": "Copied",
  "In der Seitenleiste öffnen": "Open in side panel",
  "[Bild: {alt}]": "[Image: {alt}]",
  "[Bild]": "[Image]",

  // Diff.tsx
  "neue Datei": "new file",
  "Änderungen an {path}": "Changes to {path}",
  "keine Änderung": "no changes",
  "… 1 unveränderte Zeile": "… 1 unchanged line",
  "… {n} unveränderte Zeilen": "… {n} unchanged lines",

  // Dateikarte.tsx
  "Tabelle": "Spreadsheet",
  "{path} ist nicht mehr da.": "{path} no longer exists.",
  "{path} in der Seitenleiste ansehen": "View {path} in the side panel",
  "Mit dem Standardprogramm öffnen": "Open with default app",
  "Extern öffnen": "Open externally",
  "Im Ordner zeigen": "Show in folder",
  "gespeichert": "saved",
  "Kopie speichern unter …": "Save a copy as …",
  "Kopie speichern unter": "Save a copy as",
  // jichis Dokumentation
  "Seite öffnen": "Open page",
  // Rückfragen
  "Erlauben": "Allow",
  "Für diese Sitzung erlauben": "Allow for this session",
  "Ablehnen": "Reject",
  "Immer ablehnen": "Always reject",
  "Dauerhaft erlauben": "Allow permanently",
};
