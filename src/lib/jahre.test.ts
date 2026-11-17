import { describe, expect, it } from "vitest";
import { imJahr, jahreAus, jahrVon, monatsGruppen, monatTitel } from "./jahre";

describe("Jahresansicht", () => {
  it("liest das Jahr aus dem ISO-Datum", () => {
    expect(jahrVon("2024-03-01")).toBe(2024);
    expect(jahrVon(null)).toBeNull();
    expect(jahrVon("")).toBeNull();
  });

  it("filtert nach Jahr, ohne Jahr oder ohne Datum bleibt alles", () => {
    expect(imJahr("2026-01-01", 2026)).toBe(true);
    expect(imJahr("2025-12-31", 2026)).toBe(false);
    expect(imJahr("2020-05-05", null)).toBe(true);
    expect(imJahr(null, 2026)).toBe(true);
  });

  it("listet die Jahre aus den Daten plus das laufende, neueste zuerst", () => {
    expect(jahreAus(["2023-01-01", "2020-02-02", "2023-05-05", null], 2026)).toEqual([2026, 2023, 2020]);
  });

  it("gruppiert nach Monat mit Summe, Reihenfolge bleibt", () => {
    const g = monatsGruppen(
      [
        { d: "2026-11-20", b: 100, zaehlt: true },
        { d: "2026-11-02", b: 50.1, zaehlt: true },
        { d: "2026-11-01", b: 999, zaehlt: false },
        { d: "2026-10-31", b: 20, zaehlt: true },
      ],
      (x) => x.d,
      (x) => (x.zaehlt ? x.b : null),
    );
    expect(g.map((x) => x.schluessel)).toEqual(["2026-11", "2026-10"]);
    expect(g[0].summe).toBe(150.1);
    expect(g[0].anzahl).toBe(3);
    expect(g[1].titel).toBe("Oktober 2026");
  });

  it("Monatstitel deutsch", () => {
    expect(monatTitel("2026-03")).toBe("März 2026");
    expect(monatTitel("ohne")).toBe("Ohne Datum");
  });
});
