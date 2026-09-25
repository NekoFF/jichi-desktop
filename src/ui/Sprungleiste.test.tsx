import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { balken, Sprungleiste, type SprungZug } from "./Sprungleiste.tsx";

afterEach(cleanup);

const zuege: SprungZug[] = [
  { id: "a", text: "Erste Frage", umfang: 100, werkzeuge: 0 },
  { id: "b", text: "Zweite Frage", umfang: 5000, werkzeuge: 3 },
  { id: "c", text: "Dritte Frage", umfang: 20, werkzeuge: 1 },
];

describe("Sprungleiste", () => {
  it("macht kurze Züge kurz und lange lang", () => {
    expect(balken(2, 0)).toBe(4);
    expect(balken(300, 0)).toBeGreaterThan(balken(20, 0));
    expect(balken(3000, 2)).toBeGreaterThan(balken(300, 0));
    expect(balken(10_000_000, 50)).toBe(26);
  });

  it("erscheint erst ab zwei Fragen", () => {
    const { container } = render(<Sprungleiste zuege={zuege.slice(0, 1)} aktiv="a" springen={() => {}} />);
    expect(container.querySelector(".sprungleiste")).toBeNull();
  });

  it("zeigt eine Zeile je Frage, die aktive blau", () => {
    const { container } = render(<Sprungleiste zuege={zuege} aktiv="b" springen={() => {}} />);
    const reihen = container.querySelectorAll(".sprung-reihe");
    expect(reihen).toHaveLength(3);
    expect(reihen[1].classList.contains("aktiv")).toBe(true);
  });

  it("zeigt beim Überfahren die Frage und springt beim Klick", async () => {
    const springen = vi.fn();
    const { container } = render(<Sprungleiste zuege={zuege} aktiv="c" springen={springen} />);
    const leiste = container.querySelector(".sprung-pixel")!;
    fireEvent.mouseEnter(leiste, { clientY: 0 });
    fireEvent.mouseMove(leiste, { clientY: 0 });
    // Die Welle folgt der Maus im nächsten Bild (requestAnimationFrame).
    expect(await screen.findByText("Erste Frage")).toBeTruthy();
    fireEvent.click(leiste);
    expect(springen).toHaveBeenCalledWith("a");
    fireEvent.mouseLeave(leiste);
    expect(screen.queryByText("Erste Frage")).toBeNull();
  });

  it("öffnet mit der Tastatur die ganze Liste", () => {
    const { container } = render(<Sprungleiste zuege={zuege} aktiv="c" springen={() => {}} />);
    fireEvent.keyDown(container.querySelector(".sprung-pixel")!, { key: "Enter" });
    expect(screen.getByText("3 Fragen")).toBeTruthy();
  });
});
