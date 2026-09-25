import { beforeEach, describe, expect, it } from "vitest";

import { panel } from "./store.ts";

beforeEach(() => {
  for (const t of panel.getSnapshot().tabs) panel.close(t.id);
});

describe("Seitenleiste", () => {
  it("öffnet eine Datei nur einmal und holt sie nach vorn", () => {
    panel.datei("./src/a.ts");
    panel.dateien();
    panel.datei("src/a.ts", 7);
    const s = panel.getSnapshot();
    expect(s.tabs.filter((t) => t.kind === "datei")).toHaveLength(1);
    const d = s.tabs.find((t) => t.kind === "datei");
    expect(s.active).toBe(d?.id);
    expect(d && "line" in d && d.line).toBe(7);
  });

  it("schliesst den vorderen Reiter und zeigt den Nachbarn", () => {
    panel.dateien();
    panel.aenderungen();
    panel.closeActive();
    const s = panel.getSnapshot();
    expect(s.tabs.map((t) => t.kind)).toEqual(["dateien"]);
    expect(s.active).toBe(s.tabs[0].id);
  });

  it("schliesst sich mit dem letzten Reiter", () => {
    panel.dateien();
    panel.closeActive();
    expect(panel.getSnapshot().open).toBe(false);
  });

  it("öffnet einen Link im vorderen Browser, nicht in einem neuen", () => {
    panel.browser("https://a.example");
    panel.browser("https://b.example");
    expect(panel.getSnapshot().tabs.filter((t) => t.kind === "browser")).toHaveLength(1);
  });

  it("hält eine Mindestbreite", () => {
    panel.setWidth(10);
    expect(panel.getSnapshot().width).toBeGreaterThanOrEqual(340);
  });
});
