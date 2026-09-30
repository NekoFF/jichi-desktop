/**
 * Die zwei Stellen, an denen die Anwendung auf jichi aufbaut statt daneben:
 * seine Dokumentation (Übersicht, Seite, Verweis, Suche) und `jichi init`
 * (erst die Vorschau, dann genau diese Auswahl).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { agent, emptySnapshot, type DokuStatus, type Snapshot } from "../core/index.ts";
import { DokuFenster } from "./panel/Doku.tsx";
import { panel } from "./panel/store.ts";
import { ProjektEinrichten, projektEinrichten } from "./ProjektEinrichten.tsx";

afterEach(cleanup);
// Jeder Test beginnt ohne offene Doku-Reiter.
beforeEach(() => {
  for (const tab of panel.getSnapshot().tabs.filter((x) => x.kind === "doku")) panel.close(tab.id);
});

const bereit: Snapshot = { ...emptySnapshot(), status: "ready", canSend: true, canSwitch: true, hasProject: true, cwd: "/p" };

const stand: DokuStatus = {
  ort: { root: "/src/jichi/docs", quelle: "programm", commit: "ed087f1" },
  seiten: 3,
  quelle: { eingetragen: false, aktuell: false, embedModell: true },
  problem: null,
};
const seiten: Record<string, string> = {
  "README.md": "# Map\n\n## Start here\n\nThe short path.\n\n- [`SETUP_WIZARD.md`](SETUP_WIZARD.md) — Setup wizard\n",
  "SETUP_WIZARD.md": "# Setup wizard\n\nSee [the packs](SCAFFOLDING.md#packs).\n",
  "SCAFFOLDING.md": "# Scaffolding\n\n## Packs\n\nThirty-three of them.\n",
};

function dokuMocks() {
  vi.spyOn(agent, "dokuStatus").mockResolvedValue(stand);
  vi.spyOn(agent, "dokuListe").mockResolvedValue(Object.keys(seiten));
  vi.spyOn(agent, "dokuLesen").mockImplementation(async (s: string) => {
    if (!(s in seiten)) throw new Error(`${s}: nicht gefunden.`);
    return seiten[s];
  });
}

/** Die Ansicht liest ihre Seite aus dem Reiter — wie in der Anwendung. */
function Reiter() {
  const tab = panel.getSnapshot().tabs.find((x) => x.kind === "doku") as Extract<ReturnType<typeof panel.getSnapshot>["tabs"][number], { kind: "doku" }>;
  return <DokuFenster tab={tab} snap={bereit} />;
}

describe("jichi-Dokumentation", () => {
  it("zeigt jichis Karte, öffnet eine Seite und folgt einem Verweis mit Anker", async () => {
    dokuMocks();
    panel.doku();
    const { rerender } = render(<Reiter />);
    expect(await screen.findByText("Start here")).toBeTruthy();
    expect(screen.getByText("ed087f1", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText("Setup wizard"));
    rerender(<Reiter />);
    expect(await screen.findByRole("heading", { name: "Setup wizard" })).toBeTruthy();

    fireEvent.click(screen.getByText("the packs"));
    rerender(<Reiter />);
    expect(await screen.findByRole("heading", { name: "Packs" })).toBeTruthy();
    expect(document.getElementById("packs")).toBeTruthy();

    // Zurück führt auf die vorige Seite.
    fireEvent.click(screen.getByLabelText("Zurück"));
    rerender(<Reiter />);
    expect(await screen.findByRole("heading", { name: "Setup wizard" })).toBeTruthy();
    panel.close(panel.getSnapshot().tabs.find((x) => x.kind === "doku")!.id);
  });

  it("gibt jichi die Doku als Nachschlagewerk", async () => {
    dokuMocks();
    const an = vi.spyOn(agent, "dokuFuerAgent").mockResolvedValue({ ...stand, quelle: { eingetragen: true, aktuell: true, embedModell: true } });
    panel.doku();
    render(<Reiter />);
    const schalter = (await screen.findByText("jichi schlägt hier nach")).closest("label")!.querySelector("input")!;
    fireEvent.click(schalter);
    await waitFor(() => expect(an).toHaveBeenCalledWith(true));
    await waitFor(() => expect((schalter as HTMLInputElement).checked).toBe(true));
    panel.close(panel.getSnapshot().tabs.find((x) => x.kind === "doku")!.id);
  });
});

describe("Projekt einrichten mit jichi init", () => {
  it("richtet erst nach der Vorschau ein, und genau die gewählten Packs", async () => {
    vi.spyOn(agent, "initPacks").mockResolvedValue([
      { name: "default", text: "Language-agnostic agents." },
      { name: "web-ts", text: "TypeScript/web project." },
    ]);
    const vorschau = vi.spyOn(agent, "initVorschau").mockResolvedValue({
      ok: true, meldung: null,
      dateien: [{ art: "neu", pfad: "AGENTS.md" }, { art: "bleibt", pfad: ".jichi/glossary.md" }],
    });
    const anwenden = vi.spyOn(agent, "initAnwenden").mockResolvedValue({ ok: true, meldung: null, dateien: [{ art: "neu", pfad: "AGENTS.md" }] });
    render(<ProjektEinrichten snap={bereit} />);
    act(() => projektEinrichten());

    fireEvent.click(await screen.findByText("web-ts"));
    const einrichten = screen.getByRole("button", { name: "Einrichten" }) as HTMLButtonElement;
    expect(einrichten.disabled).toBe(true); // noch keine Vorschau

    fireEvent.click(screen.getByRole("button", { name: "Vorschau" }));
    await waitFor(() => expect(vorschau).toHaveBeenCalledWith(["default", "web-ts"]));
    expect(await screen.findByText("AGENTS.md")).toBeTruthy();
    await waitFor(() => expect(einrichten.disabled).toBe(false));

    // Wer die Auswahl ändert, muss neu in die Vorschau sehen.
    fireEvent.click(screen.getByText("web-ts"));
    expect(einrichten.disabled).toBe(true);
    fireEvent.click(screen.getByText("web-ts"));

    fireEvent.click(einrichten);
    await waitFor(() => expect(anwenden).toHaveBeenCalledWith(["default", "web-ts"]));
    expect(await screen.findByText("Eingerichtet.")).toBeTruthy();
  });
});
