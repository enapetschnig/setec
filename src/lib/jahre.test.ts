import { describe, expect, it } from "vitest";
import { bezahltImJahr, imJahr, jahreAus, jahrVon, monatsGruppen, monatTitel, nachZahlDatum, zahlDatum } from "./jahre";

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

  it("Bezahlt zählt nach dem Zahltag: Dezember-Rechnung, im Jänner bezahlt, ist Geld des neuen Jahres", () => {
    const rechnungen = [
      { id: "a", datum: "2025-12-15", bezahlt_am: "2026-01-08", brutto: 1200 },
      { id: "b", datum: "2026-03-01", bezahlt_am: "2026-03-20", brutto: 300.5 },
      { id: "c", datum: "2026-12-20", bezahlt_am: "2027-01-05", brutto: 99 },
      { id: "d", datum: "2026-06-01", bezahlt_am: null, brutto: 10 },
    ];
    const bezahlt2026 = rechnungen.filter((r) => bezahltImJahr(r, 2026));
    expect(bezahlt2026.map((r) => r.id)).toEqual(["a", "b", "d"]);
    expect(bezahlt2026.reduce((s, r) => s + r.brutto, 0)).toBe(1510.5);
    expect(rechnungen.filter((r) => bezahltImJahr(r, 2027)).map((r) => r.id)).toEqual(["c"]);
    expect(rechnungen.filter((r) => bezahltImJahr(r, null))).toHaveLength(4);
    expect(zahlDatum({ datum: "2026-06-01", bezahlt_am: null })).toBe("2026-06-01");
    // Monatsbänder nach dem Zahltag: neueste Zahlung zuerst, Jänner-Zahlung der Dezember-Rechnung im Jänner
    const g = monatsGruppen(nachZahlDatum(bezahlt2026), (r) => zahlDatum(r), (r) => r.brutto);
    expect(g.map((x) => [x.schluessel, x.anzahl, x.summe])).toEqual([["2026-06", 1, 10], ["2026-03", 1, 300.5], ["2026-01", 1, 1200]]);
  });

  it("Monatstitel deutsch", () => {
    expect(monatTitel("2026-03")).toBe("März 2026");
    expect(monatTitel("ohne")).toBe("Ohne Datum");
  });
});
