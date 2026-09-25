import { describe, expect, it } from "vitest";

import { diffRows } from "./Diff.tsx";

describe("diffRows", () => {
  it("zählt und klappt unveränderte Strecken zusammen", () => {
    const alt = Array.from({ length: 20 }, (_, i) => `z${i}`).join("\n") + "\n";
    const neu = alt.replace("z10\n", "Z10\nneu\n");
    const { rows, added, removed } = diffRows(alt, neu);
    expect([added, removed]).toEqual([2, 1]);
    expect(rows.filter((r) => r.art === "luecke").length).toBe(2);
    expect(rows.some((r) => r.art === "weg" && r.text === "z10")).toBe(true);
  });

  it("zeigt eine neue Datei ganz als hinzugefügt", () => {
    const { rows, added, removed } = diffRows("", "a\nb\n");
    expect([added, removed]).toEqual([2, 0]);
    expect(rows.every((r) => r.art === "neu")).toBe(true);
  });
});
