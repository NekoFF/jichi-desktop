import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { agent, emptySnapshot, type Snapshot } from "../core/index.ts";
import { Eingabe } from "./Eingabe.tsx";

afterEach(cleanup);

const bereit: Snapshot = { ...emptySnapshot(), status: "ready", canSend: true, canSwitch: true, hasProject: true };

describe("Eingabe", () => {
  it("zeigt ohne Text ein ruhiges ↵, mit Text den Pfeil", () => {
    render(<Eingabe snap={bereit} />);
    expect(screen.queryByLabelText("Senden")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Frag jichi …"), { target: { value: "Hallo" } });
    expect(screen.getByLabelText("Senden")).toBeTruthy();
  });

  it("sendet mit Enter und leert das Feld", () => {
    const send = vi.spyOn(agent, "send").mockResolvedValue();
    render(<Eingabe snap={bereit} />);
    const feld = screen.getByPlaceholderText("Frag jichi …") as HTMLTextAreaElement;
    fireEvent.change(feld, { target: { value: "Erklär das" } });
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(send).toHaveBeenCalledWith("Erklär das", [], []);
    expect(feld.value).toBe("");
  });

  it("macht während einer Antwort aus dem Knopf ein Stopp", () => {
    const cancel = vi.spyOn(agent, "cancel").mockResolvedValue();
    render(<Eingabe snap={{ ...bereit, status: "busy", canSend: false, canCancel: true, canSwitch: false }} />);
    fireEvent.click(screen.getByLabelText("Antwort abbrechen"));
    expect(cancel).toHaveBeenCalled();
  });

  it("zeigt Chat, Plan und Auto und fragt vor Auto nach", () => {
    const setMode = vi.spyOn(agent, "setMode").mockResolvedValue();
    render(<Eingabe snap={bereit} />);
    fireEvent.click(screen.getByRole("radio", { name: /Auto/ }));
    expect(setMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Auto einschalten"));
    expect(setMode).toHaveBeenCalledWith("auto");
  });
});
