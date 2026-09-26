/** Englisch für eingabe — deutscher Text → englischer Text. */
export const EINGABE: Record<string, string> = {
  // Tasten
  "Strg": "Ctrl",
  "Umschalt": "Shift",

  // Kopfzeile (main.tsx)
  "Projektordner wählen": "Choose project folder",
  "Projekt öffnen": "Open project",
  "Seitenleiste": "Sidebar",
  "Dateien": "Files",
  "Änderungen": "Changes",
  "Seitenleiste ein/aus": "Toggle sidebar",
  "Erscheinungsbild wechseln": "Toggle appearance",

  // Chat-Menü
  "exportiert": "exported",
  "Chat-Menü": "Chat menu",
  "Mehr": "More",
  "Chat exportieren": "Export chat",
  "Hilfe": "Help",
  "Tastenkürzel": "Keyboard shortcuts",

  // Tastenkürzel
  "Chat": "Chat",
  "Neuer Chat": "New chat",
  "Senden": "Send",
  "Neue Zeile": "New line",
  "Zur vorigen / nächsten Frage springen": "Jump to previous / next question",
  "Menü oder Dialog schließen": "Close menu or dialog",
  "Vorderes Fenster schließen": "Close front pane",
  "Datei bearbeiten": "Edit file",
  "Speichern": "Save",
  "Einrücken": "Indent",
  "Diese Übersicht": "This overview",
  "Schließen": "Close",

  // Marke
  "jichi arbeitet": "jichi is working",

  // Sprungleiste
  "Fragen in diesem Chat": "Questions in this chat",
  "{n} Fragen — Enter öffnet die Liste": "{n} questions — Enter opens the list",
  "{n} Fragen": "{n} questions",

  // Diktieren und Vorlesen
  "Kein Zugriff auf das Mikrofon — in den Systemeinstellungen unter Datenschutz › Mikrofon erlauben.":
    "No access to the microphone — allow it in System Settings under Privacy › Microphone.",
  "Kein Mikrofon gefunden.": "No microphone found.",
  "Aufnahme nicht möglich: {grund}": "Recording not possible: {grund}",
  "Nichts verstanden — bitte noch einmal.": "Nothing recognized — please try again.",
  "Aufnahme beenden und erkennen": "Stop recording and transcribe",
  "Beenden und erkennen · Esc verwirft": "Stop and transcribe · Esc discards",
  "Wird erkannt": "Transcribing",
  "Wird erkannt …": "Transcribing …",
  "Diktieren": "Dictate",
  "Der Ton ließ sich nicht abspielen.": "The audio could not be played.",
  "Vorlesen beenden": "Stop reading aloud",
  "Vorlesen": "Read aloud",

  // Eingabefeld: Bilder und Dateien
  "Nur PNG, JPEG, GIF oder WebP.": "Only PNG, JPEG, GIF or WebP.",
  "Das Bild ist größer als 5 MB.": "The image is larger than 5 MB.",
  "Das Bild ließ sich nicht lesen.": "The image could not be read.",
  "Das aktive Modell kann keine Bilder lesen.": "The active model can't read images.",
  "Höchstens {n} Bilder je Nachricht.": "At most {n} images per message.",
  "Loslassen zum Anhängen — Bilder, PDF, Word, Excel, Text": "Drop to attach — images, PDF, Word, Excel, text",
  "Bild entfernen": "Remove image",
  "{name} entfernen": "Remove {name}",

  // Menü hinter „+“
  "Hinzufügen": "Add",
  "Bilder": "Images",
  "einfügen, ziehen oder wählen": "paste, drag or choose",
  "das Modell liest keine Bilder": "the model can't read images",
  "Datei": "File",
  "PDF, Word, Excel oder Text als Kontext": "PDF, Word, Excel or text as context",
  "Anderes Projekt": "Other project",
  "Ordner wählen": "Choose folder",
  "Dokumente einschalten": "Turn on documents",
  "jichi liest und erstellt PDF, Word, Excel": "jichi reads and creates PDF, Word, Excel",
  "Schnellaufträge": "Quick tasks",
  "erst ein Projekt öffnen": "open a project first",
  "Bericht als Word": "Report as Word",
  "Fasse den Stand dieses Projekts als Bericht zusammen und speichere ihn als bericht.docx.":
    "Summarize the state of this project as a report and save it as report.docx.",
  "Projekt erklären": "Explain project",
  "Erklär mir den Aufbau dieses Projekts und die wichtigsten Teile.":
    "Explain the structure of this project and its most important parts.",
  "Tests ausführen": "Run tests",
  "Führe die Tests aus und fasse zusammen, was fehlschlägt.": "Run the tests and summarize what fails.",
  "Änderungen prüfen": "Review changes",
  "Sieh dir die noch nicht committeten Änderungen an (git diff) und prüfe sie auf Fehler.":
    "Look at the uncommitted changes (git diff) and check them for bugs.",
  "Commit-Nachricht": "Commit message",
  "Schlage eine Commit-Nachricht für die aktuellen Änderungen vor.": "Suggest a commit message for the current changes.",

  // Arbeitsweise
  "fragt vor jeder Änderung": "asks before every change",
  "liest und plant, ändert nichts": "reads and plans, changes nothing",
  "ändert und führt aus, ohne zu fragen": "changes and runs without asking",
  "Arbeitsweise": "Mode",
  "Auto-Modus": "Auto mode",
  "ändert Dateien und führt Befehle aus, ohne zu fragen. Es beginnt ein neuer Chat. Nur für Projekte unter Versionsverwaltung.":
    "changes files and runs commands without asking. A new chat starts. Only for projects under version control.",
  "Abbrechen": "Cancel",
  "Auto einschalten": "Turn on Auto",

  // Modell
  "am Gateway": "on the gateway",
  "Modell wählen": "Choose model",
  "Während einer Antwort nicht wählbar": "Can't be changed during a reply",
  "Modell": "Model",
  "Keine Modelle konfiguriert.": "No models configured.",
  "Weitere am Gateway": "More on the gateway",
  "Gateway wird gefragt …": "Asking the gateway …",
  "Nur freie Modelle (jlu/…)": "Free models only (jlu/…)",
  "Liste neu laden": "Reload list",

  // Senden
  "Frag jichi …": "Ask jichi …",
  "Frag jichi … oder öffne zuerst ein Projekt": "Ask jichi … or open a project first",
  "Antwort abbrechen": "Cancel reply",
  "Enter zum Senden": "Enter to send",
  "Senden (Enter)": "Send (Enter)",
};
