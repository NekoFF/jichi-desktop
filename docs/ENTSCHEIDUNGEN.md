# Entscheidungen

Nach jichis Regel ([`DECISIONS.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/DECISIONS.md)):
Eine Entscheidung bekommt eine Zeile, wenn man vernünftigerweise anders hätte
wählen können. **Ohne verworfene Alternative war es keine Entscheidung.**

Jede Zeile hat drei Teile:
- **Gewählt**: was entschieden wurde.
- **Verworfen**: die Alternativen, jeweils mit dem Grund, warum sie verloren haben.
- **Weil**: das Kriterium, zurückgeführt auf eine Anforderung `R<n>` aus
  [`ANFORDERUNGEN.md`](ANFORDERUNGEN.md).

Dazu kommt, wann die Entscheidung neu zu prüfen ist. Eine Entscheidung wird nie
gelöscht. Wird sie umgekehrt, bleibt die Zeile stehen und bekommt den Vermerk
**Abgelöst**.

Die Einträge ab E1 sind am 30.09. **nachträglich** aufgeschrieben. Die
Entscheidungen selbst fielen zwischen dem 25. und dem 30.09. Damals ist das
Abwägen nicht notiert worden, das gehört ehrlich hierher.

---

## E1 Tauri 2 als Rahmen

**Gewählt:** Tauri 2. Die Oberfläche ist React/TypeScript in der WebView des
Systems (WKWebView, WebView2, WebKitGTK). Prozess, Dateien und Schlüssel liegen
in Rust. jichi läuft als Kindprozess über ACP.

**Verworfen:**

- **Electron.** Läuft unter Linux, macOS und Windows. Es bringt aber einen
  eigenen Chromium mit (rund 100 MB je Installation). Dessen
  Sicherheitsupdates hängen dann an dieser Anwendung statt am System. BSD
  gibt es nur inoffiziell. Also dieselbe Plattformbreite wie Tauri, aber
  schwerer und mit einer Angriffsfläche mehr. (R9)
- **Qt/QML.** Breiteste Plattformauswahl, auch BSD. Aber die Oberfläche wäre
  neu zu schreiben, in C++/QML ohne die vorhandene Web-Oberfläche. Dazu kommt
  die Lizenzfrage (LGPL oder kommerziell) für eine Verteilung durch die
  Universität. Der Aufwand hat im Praktikumszeitraum nicht in einem
  Verhältnis zum Gewinn gestanden. Der Gewinn wäre BSD gewesen, und das
  verlangte damals niemand.
- **GTK4 nativ.** Unter Linux und BSD erstklassig, unter macOS und Windows
  schwach.
- **Eine Web-Oberfläche als Sidecar,** so wie jichis
  [`WEB_FRONTEND.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/WEB_FRONTEND.md)
  sie beschreibt. Sie reicht am weitesten, nämlich überall hin, wo ein Browser
  läuft, auch BSD und entfernte Rechner. Sie braucht aber einen lokalen
  HTTP-Server mit Token, also eine Schnittstelle mehr, die zu sichern ist.
  Dateiauswahl, Terminal und Benachrichtigungen müssten ausserdem neu gebaut
  werden. **Nicht endgültig verworfen, siehe unten.**
- **Nur jichis TUI.** Das gibt es schon, und sie läuft auf allen Plattformen
  von jichi. Für die Menschen aus §2, die kein Terminal benutzen, ist sie keine
  Antwort.

**Weil:** R1 (Linux, macOS, Windows aus einer Quelle), R9 (klein, System-WebView)
und R8 (Rückfragen, Diff, Terminal brauchen eine echte Anwendung).

**Grenze, ehrlich:** Mit Tauri erreicht die Anwendung nicht alle Plattformen von
jichi. BSD ist ungemessen. Haiku, FreeDOS und FreeMiNT sind mit Tauri nicht
möglich.

**Neu prüfen, wenn** BSD oder weitere Plattformen verlangt werden (R1). Dann
kommt die Sidecar-Oberfläche als *zweiter* Weg dazu, sie ersetzt Tauri nicht.
Das ist vorbereitet: Nur `src/core/transport.ts` kennt Tauri, Kern und
Oberfläche nicht (`CLAUDE.md`, `docs/CONTRACT.md`). Ein Transport über
WebSocket zu einem kleinen Sidecar würde denselben Kern und dieselbe
Oberfläche im Browser tragen. Den Aufwand habe ich nicht gemessen.

## E2 Linux ist Zielplattform

**Gewählt:** Linux wird unterstützt und geprüft, genauso wie macOS und Windows.

**Verworfen:**
- **„Nur macOS und Windows“**, so habe ich es im Gespräch gesagt. Das war keine
  Entscheidung, sondern ein Irrtum über den Rahmen: Tauri unterstützt Linux.
- **Linux nur „best effort“.** Das widerspräche R1 und Alex' ausdrücklichem Wunsch.

**Weil:** R1. Gemessen am 26.09. unter Ubuntu 26.04 in WSL2:
- Build und alle Prüfungen sind grün.
- Das Fenster wird gezeichnet.
- Dabei wurden sechs Fehler gefunden und behoben.

**Neu prüfen:** Das ist keine offene Frage. Offen ist die Messung auf einem
echten Linux-Desktop, siehe Z1.

## E3 Unter Windows: jichi in WSL

**Gewählt:** Die Anwendung ist unter Windows nativ (WebView2), jichi läuft in
WSL2. Gestartet wird `wsl.exe jichi --acp`.

**Verworfen:**
- **Ein natives `jichi.exe`.** Das gibt es nicht und ist nicht geplant (jichi „not
  supported by design“).
- **Cygwin.** jichi ist dort nur teilweise geprüft.
- **MSYS2.** Dort gelten jichis Garantien für private Dateien nicht
  (`PLATFORMS.md`), und R6 hängt daran.

**Weil:** R2 und R6.

**Neu prüfen, wenn** verwaltete Rechner der JLU kein WSL2 erlauben (zu erheben,
ANFORDERUNGEN §2). Dann ist Windows dort nicht erreichbar.

## E4 Auf jichi bauen: Einrichtung, Scaffolding, Dokumentation

**Gewählt:**
- Die erste Konfiguration schreibt `jichi setup --non-interactive …`. Die
  Anwendung ergänzt nur, was setup nicht schreibt: `embed`/`rerank` und den
  eigenen Dokumenten-Server.
- Projekte werden mit `jichi init` eingerichtet, erst `--dry-run`, dann
  wirklich.
- jichis `docs/` wird gezeigt und als `docs`-Quelle für `search_docs`
  eingetragen.

**Verworfen:**
- **Die eigene Vorlage mit fünf Modellen,** so bis zum 30.09. Abgelöst, sie
  verdoppelte jichis Einrichtung.
- **Eigene Projekt-Vorlagen.** Die Packs von jichi sind dokumentiert, eigene
  wären es nicht.
- **Eine eigene Suche über die Dokumentation für das Modell.** jichi hat
  `search_docs` mit Embeddings. Die Volltextsuche der Anwendung dient nur der
  Ansicht.

**Weil:** R4 und R5, also Alex' Punkte vom 30.09.

**Neu prüfen, wenn** Alex' Dokument zur Desktopanwendung erscheint.

## E5 Der Schlüssel in einer geschützten Datei der Anwendung

**Gewählt:** Eine Datei im Anwendungsordner mit Rechten 0600. Beim Start des
Agenten wird der Schlüssel als `JICHI_API_KEY` nur in dessen Umgebung gesetzt.
In `~/.jichi` steht nur der Name (`apiKeyEnv`). Das ist dieselbe Trennung, die
`jichi setup` schreibt.

**Verworfen:**
- **Der macOS-Schlüsselbund.** Es gäbe drei verschiedene Speicher für drei
  Systeme, und unter Linux ist nicht überall ein Secret Service vorhanden.
- **`~/.jichi.env`.** jichi liest diese Datei selbst nicht, nur seine
  Startskripte (`STATE.md`).
- **`apiKey` im Klartext in der Konfiguration.** Widerspricht R6.

**Weil:** R6 und R1.

**Neu prüfen, wenn** die Anwendung verteilt wird. Dann ist der Speicher des
Systems wohl erwartet.

## E6 Nur `jlu/…`-Modelle

**Gewählt:** Die Modellauswahl, das Diktat und das Vorlesen nehmen nur `jlu/…`.
Das prüft Rust, nicht nur die Oberfläche.

**Verworfen:** Alles zeigen, was der Schlüssel erreicht. Das Gateway listet auch
Modelle fremder Anbieter, und die kosten Geld.

**Weil:** R7.

## E7 Sprache über das Gateway

**Gewählt:** Diktat und Vorlesen gehen über `/v1/audio/transcriptions` und
`/v1/audio/speech` des Gateways, mit demselben Schlüssel.

**Verworfen:** Den Sprachdienst auf dem DGX Spark direkt anzusprechen. Das wäre
ein zweiter Endpunkt und ein zweiter Schlüssel, und von zu Hause ist er nicht
erreichbar.

**Weil:** R6 und R7.

**Stand:** Das Diktat ist gemessen: 0,86 s für 5 s Sprache, Wort für Wort
richtig. `jlu/tts-1-hd` antwortet zurzeit mit HTTP 500.

---

## Zurückgestellt

Hier steht, was bewusst nicht getan ist, jeweils mit Grund, und was die
Antwort ändern würde.

| | Was | Warum nicht jetzt | Was es ändern würde |
|---|---|---|---|
| Z1 | Messung auf einem echten Linux-Desktop (GNOME/KDE, X11 und Wayland), dazu `.deb`/`.AppImage` | kein Linux-Rechner zur Hand, nur WSLg | ein Rechner am HRZ, vermutlich eine Stunde |
| Z2 | Chat Ende-zu-Ende unter Windows und Linux | vertagt auf den Termin vor Ort | – |
| Z3 | **Die Chatliste liest `~/.jichi.d/sessions/*.json` direkt.** jichis `EMBEDDING.md` nennt das ausdrücklich keine Schnittstelle | beim Bau nicht gewusst, am 30.09. gefunden | auf `jichi ls`/`export --output json` umstellen (R11); als Nächstes |
| Z4 | Unter Windows liest und schreibt die Anwendung das `~/.jichi` von Windows, jichi in WSL liest sein eigenes. `probe`/`doctor` rufen `wsl.exe` ohne `jichi` | gefunden am 30.09. | Konfiguration über `wsl.exe jichi …` lesen und schreiben |
| Z5 | Code-Signatur für Windows und macOS | braucht ein Zertifikat der Universität | ohne sie startet die Anwendung bei eingeschaltetem Smart App Control nicht (R3) |
| Z6 | BSD | ungemessen, siehe E1 | die Sidecar-Oberfläche, oder ein Versuch mit WebKitGTK aus den Ports |
| Z7 | JSON-Ausgabe für `setup --list`/`init --list` | gibt es in jichi nicht, die Anwendung liest die Textausgabe | eine Frage an Alex |
