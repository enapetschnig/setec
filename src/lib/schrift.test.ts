import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { istSchriftgroesse, SCHRIFT_KEY, SCHRIFTGROESSEN } from "./schrift";

describe("Schriftgröße", () => {
  it("vier Stufen, Normal bleibt 16 px", () => {
    expect(SCHRIFTGROESSEN.map((s) => s.name)).toEqual(["Normal", "Groß", "Sehr groß", "Extra groß"]);
    expect(SCHRIFTGROESSEN[0].px).toBe(16);
    expect(istSchriftgroesse("extra_gross")).toBe(true);
    expect(istSchriftgroesse("riesig")).toBe(false);
  });

  it("index.css und index.html kennen dieselben Werte", () => {
    const css = readFileSync("src/index.css", "utf8");
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(`localStorage.getItem('${SCHRIFT_KEY}')`);
    for (const s of SCHRIFTGROESSEN.slice(1)) {
      expect(css).toContain(`:root[data-schrift="${s.wert}"] { font-size: ${s.px}px; }`);
      expect(html).toContain(`'${s.wert}'`);
    }
  });
});
