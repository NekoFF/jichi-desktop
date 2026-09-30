# Anforderungen, Systembedingungen, Arbeitsweisen

Stand: 2026-09-30, jichi 0.12.0 (öffentlich, M741). Geschrieben nach Alex'
Rückmeldung vom 30.09.: Die weitere Entwicklung braucht eine Analyse der
Anforderungen, der Systembedingungen und der Arbeitsweisen, und jede
Entscheidung braucht ihre Begründung. Die Entscheidungen stehen in
[`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md). Was bewusst liegen bleibt, steht dort
unter „Zurückgestellt“.

Drei Wörter werden streng gebraucht, wie in jichis
[`APPROACH.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/APPROACH.md) §5:

- **gemessen**: ausgeführt und mit Ergebnis notiert.
- **angenommen**: begründete Vermutung, nicht erhoben. Muss noch geprüft werden.
- **offen**: weder gemessen noch angenommen.

---

## 1. Wofür es die Anwendung gibt, und wofür nicht

jichi hat eigene Oberflächen: TUI, Headless und ACP für Editoren. jichis
[`WEB_FRONTEND.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/WEB_FRONTEND.md)
sagt: Für eine einzelne lokale Sitzung ist die TUI reicher. Eine grafische
Oberfläche rechtfertigt sich durch Beobachten und viele Läufe, nicht durch
Chat. Diese Anwendung muss deshalb begründen, warum es sie gibt.

- **Für wen (angenommen):** Menschen an der JLU, die kein Terminal benutzen oder
  benutzen wollen, aber jichi mit dem HRZ-Gateway nutzen sollen. Dazu kommen
  alle, die neben dem Gespräch dieselben Dinge sehen wollen, die jichi sieht:
  Dateien, Änderungen, Terminal, Dokumentation.
- **Nicht dafür:** jichi ersetzen oder seine Funktionen nachbauen. Die
  Anwendung ist ein Client von `jichi --acp`. Alles, wofür jichi einen eigenen
  Weg hat (Einrichtung, Scaffolding, Dokumentation), läuft über diesen Weg
  (R4, R5).
- **Offen:** ob sie auch dem zweiten Zweck aus `WEB_FRONTEND.md` dienen soll,
  also mehrere Läufe beobachten. Heute kann sie das nicht.

## 2. Wer sie benutzt (angenommen, nicht erhoben)

Es gab keine Befragung. Die folgenden Gruppen sind Annahmen, keine Ergebnisse.

| Gruppe | Rechner (angenommen) | Braucht vor allem |
|---|---|---|
| Studierende, Praktikantinnen und Praktikanten | eigene Geräte: Windows, macOS, Linux gemischt | einfacher Start, Schlüssel eingeben, Fragen zum eigenen Projekt |
| Beschäftigte der Verwaltung und der Fachbereiche | verwaltete Windows-Rechner | ohne Terminal, ohne Admin-Rechte installierbar |
| HRZ und Forschung | viel Linux, auch BSD | Linux-Unterstützung, dieselben Daten wie jichi selbst |

**Zu erheben:**
- Welche Betriebssysteme sind an der JLU wie verbreitet? Das HRZ fragen.
- Dürfen verwaltete Windows-Rechner WSL2 benutzen? (Das wird für R3 gebraucht.)
- Wie viele Menschen arbeiten ohne Terminal?

## 3. Arbeitsweisen

| | Arbeitsweise | Heute |
|---|---|---|
| W1 | Beim ersten Start den Schlüssel eingeben, danach einfach arbeiten | ja, über `jichi setup` |
| W2 | Einen Projektordner öffnen und fragen, was der Code tut | ja |
| W3 | jichi Änderungen machen lassen und jede Änderung sehen und erlauben | ja (Rückfragen, Diff, Git-Änderungen) |
| W4 | Ein Projekt für jichi einrichten (AGENTS.md, Agenten, Skills) | ja, über `jichi init` |
| W5 | In jichis Dokumentation nachlesen, und jichi dort nachschlagen lassen | ja (Seitenleiste, `search_docs`) |
| W6 | Diktieren statt tippen, Antworten vorlesen | Diktat ja; Vorlesen scheitert am Gateway (HTTP 500) |
| W7 | Einen früheren Chat wieder aufnehmen | ja, siehe Z3 in ENTSCHEIDUNGEN.md |

## 4. Anforderungen

| | Anforderung | Quelle | Stand |
|---|---|---|---|
| R1 | Läuft auf den Rechnern an der JLU, **ausdrücklich auch Linux**, und so breit wie möglich | Alex, 30.09.; Abschnitt 2 | teilweise, siehe §6 |
| R2 | Unterstützt nur Plattformen, auf denen auch jichi läuft. Windows geht nur über WSL | jichi [`PLATFORMS.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/PLATFORMS.md) | erfüllt (`wsl.exe jichi --acp`) |
| R3 | Installierbar ohne Terminal und ohne eigenen Build | Abschnitt 2 | offen (keine signierten Pakete) |
| R4 | Einrichtung baut auf jichi auf (`setup`, Scaffolding) | Alex, 30.09. | erfüllt, dc84550 / 7ae74c3 |
| R5 | Zeigt jichis Dokumentation vollständig und nutzt sie als Nachschlagewerk für jichi | Alex, 30.09. | erfüllt, 12b8686 |
| R6 | Der Schlüssel steht nie im Klartext in einer Konfiguration, in Logs oder im Zustand der Oberfläche | jichi `STATE.md`; HRZ | erfüllt |
| R7 | Nur kostenlose Modelle des Gateways (`jlu/…`) | HRZ-Gateway | erfüllt (Rust prüft) |
| R8 | Jede Änderung von jichi wird sichtbar, und nichts läuft ohne Erlaubnis | jichi: „the permission modal IS the ASK gate“ | erfüllt |
| R9 | Klein genug für ältere Rechner, keine eigene Browser-Engine | angenommen | erfüllt (Tauri, System-WebView) |
| R10 | Deutsch und Englisch | Nutzerwunsch | erfüllt |
| R11 | Benutzt jichis stabile Schnittstellen, keine internen Dateien | jichi [`EMBEDDING.md`](https://github.com/alexanderlarsdallmann/jichi/blob/master/docs/EMBEDDING.md) §4 | **verletzt**, Z3 |

## 5. Systembedingungen

- **jichi** läuft laut seiner Plattformtabelle unter Linux (glibc und musl, viele
  Architekturen), FreeBSD, NetBSD, OpenBSD, illumos, Haiku, FreeDOS, FreeMiNT und
  Android. Unter Windows läuft es in WSL2. Cygwin und MSYS2 gehen nur bedingt:
  Unter MSYS2 gelten jichis Garantien für private Dateien nicht. Ein natives
  Windows-jichi gibt es nicht.
- **`make install` liefert die Dokumentation nicht mit** (jichi `STATE.md`). Die
  Anwendung findet sie im Quellbaum neben dem Programm, oder der Benutzer nennt
  den Ordner.
- **Gateway:** `https://api.hrz.uni-giessen.de/v1`, LiteLLM, OpenAI-kompatibel.
  Ein Schlüssel für Studierende sieht nur die acht `jlu/…`-Modelle (gemessen
  26.09.).
- **Tauri 2** läuft laut seiner Dokumentation unter Linux, macOS, Windows,
  Android und iOS. BSD, Haiku, DOS und FreeMiNT nennt es nicht. Unter Linux
  braucht es WebKitGTK 4.1. Als ältester Stand wird Ubuntu 22.04 oder Debian 12
  empfohlen.
- **Windows:** Smart App Control sperrt unsignierte Programme. Das gilt schon
  für die Build-Skripte von Rust (gemessen 26.09., `os error 4551`).

## 6. Plattformen der Anwendung (gemessen)

Im Gespräch habe ich gesagt, Linux werde nicht unterstützt. **Das war
falsch.** Tauri unterstützt Linux, und die Anwendung ist am 26.09. unter Linux
gebaut und geprüft worden. Nur unter WSLg, noch nicht auf einem echten
Linux-Desktop:

| Plattform | Stand | Was geprüft ist | Was nicht |
|---|---|---|---|
| macOS 26.5, Apple M4 (arm64) | **benutzt**: Chat Ende-zu-Ende, im Alltag der Entwicklung | alle Prüfungen, `.app`/`.dmg` gebaut | Intel-Mac; Signatur (nur ad-hoc) |
| Windows 11 (x64), nativ | **gebaut und geprüft** (26.09.) | Rust 56/56, Kern 128/128, UI 27/27 | das Fenster, Chat Ende-zu-Ende, `.msi` |
| Ubuntu 26.04 in WSL2, Fenster über WSLg | **gebaut, geprüft, Fenster gezeichnet** (26.09.) | Rust 56/56, Kern und UI grün; Schlüssel, Einstellungen, Englisch | Chat Ende-zu-Ende; echter Desktop (GNOME/KDE); `.deb`/`.AppImage` |
| Linux-Desktop (X11/Wayland, glibc) | **nie gelaufen** | – | alles |
| FreeBSD, NetBSD, OpenBSD | **nie gebaut** | – | Tauri nennt BSD nicht. WebKitGTK gibt es in den Ports, möglich also, aber ungemessen |
| Haiku, FreeDOS, FreeMiNT | **nicht möglich** mit Tauri | – | dort bleibt jichis TUI |
| Android | **nie gebaut** | – | Tauri kann Android, die Anwendung ist nicht dafür gebaut |

Unter Linux und unter Windows sind beim Messen am 26.09. sechs Fehler gefunden
und behoben worden. Ein Beispiel: Das Layout „Freistehend“ war dort flach
gezeichnet. Die Liste steht im Git-Verlauf (27e550c bis 6cc20ac).

## 7. Was diese Seite nicht leistet

- Die Gruppen in §2 sind nicht erhoben. Solange niemand gefragt wurde, ist die
  Anforderungsliste eine Arbeitshypothese.
- Die Plattformen in §6 sind je einmal gemessen, auf einem Rechner, an einem
  Tag. Wie jichis Zeilen in `PLATFORMS.md` ist jede Zeile eine datierte
  Tatsache über einen Commit.
- Alex bereitet ein eigenes Dokument vor: Was muss eine Desktopanwendung auf
  Grundlage von jichi beachten? Sobald es erscheint, wird diese Seite daran
  gemessen.
