import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Markdown } from "./Markdown.tsx";
import { panel } from "./panel/store.ts";

afterEach(cleanup);

describe("Markdown", () => {
  it("führt kein HTML aus dem Modell aus", () => {
    const { container } = render(<Markdown text={'Hallo <script>window.boese=1</script><img src=x onerror="alert(1)"> **fett**'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("fett");
  });

  it("öffnet Verweise in der Seitenleiste statt im Fenster", () => {
    const browser = vi.spyOn(panel, "browser").mockImplementation(() => {});
    render(<Markdown text="Siehe [Doku](https://uni-giessen.de)" />);
    const link = screen.getByText("Doku");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(browser).toHaveBeenCalledWith("https://uni-giessen.de");
  });

  it("macht einen javascript:-Verweis zu totem Text", () => {
    const browser = vi.spyOn(panel, "browser").mockImplementation(() => {});
    render(<Markdown text="[klick](javascript:alert(1))" />);
    const link = screen.getByText("klick");
    expect(link.getAttribute("href")).toBeNull();
    fireEvent.click(link);
    expect(browser).not.toHaveBeenCalled();
  });

  it("macht Pfade klickbar und öffnet sie an der Zeile", () => {
    const datei = vi.spyOn(panel, "datei").mockImplementation(() => {});
    render(<Markdown text="Fehler in `src/main.rs:42` und `kein pfad`" />);
    fireEvent.click(screen.getByText("src/main.rs:42"));
    expect(datei).toHaveBeenCalledWith("src/main.rs", 42);
    expect(screen.getByText("kein pfad").classList.contains("md-pfad")).toBe(false);
  });

  it("bietet HTML-Blöcke als Artefakt an, gewöhnlichen Code nicht", () => {
    const artefakt = vi.spyOn(panel, "artefakt").mockImplementation(() => {});
    render(<Markdown text={"```html\n<title>Uhr</title><h1>x</h1>\n```\n\n```python\nprint(1)\n```"} />);
    const knoepfe = screen.getAllByText("Öffnen");
    expect(knoepfe).toHaveLength(1);
    fireEvent.click(knoepfe[0]);
    expect(artefakt).toHaveBeenCalledWith(expect.objectContaining({ lang: "html", title: "Uhr" }));
  });
});
