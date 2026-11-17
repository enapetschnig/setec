import { describe, expect, it } from "vitest";
import { alleZeilen, alsText, csvFeld, inHaeppchen } from "./abfrage";

describe("CSV-Felder für Excel", () => {
  it("Text, der wie eine Formel beginnt, bleibt Text", () => {
    expect(csvFeld("=1+2")).toBe("'=1+2");
    expect(csvFeld("+1")).toBe("'+1");
    expect(csvFeld("- Kabel verlegt")).toBe("'- Kabel verlegt");
    expect(csvFeld("@SUMME(A1)")).toBe("'@SUMME(A1)");
    expect(csvFeld('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
    expect(csvFeld("Steckdose; weiß")).toBe('"Steckdose; weiß"');
    expect(csvFeld("NYM-J 5x2,5")).toBe("NYM-J 5x2,5");
  });

  it("Zahlen mit Dezimalkomma, auch negative; leer bleibt leer", () => {
    expect(csvFeld(-2.5)).toBe("-2,5");
    expect(csvFeld(0)).toBe("0");
    expect(csvFeld(null)).toBe("");
    expect(csvFeld(undefined)).toBe("");
  });

  it("EAN als Text: führende Null bleibt, keine 4,01235E+12", () => {
    expect(csvFeld(alsText("0036000291452"))).toBe('"=""0036000291452"""');
    expect(csvFeld(alsText("4012345678901"))).toBe('"=""4012345678901"""');
    expect(csvFeld(alsText(null))).toBe("");
    expect(csvFeld(alsText(""))).toBe("");
  });
});

describe("alleZeilen: Seiten zu 1000", () => {
  const tabelle = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const holer = (zeilen: { id: number }[], aufrufe: [number, number][]) => (von: number, bis: number) => {
    aufrufe.push([von, bis]);
    return Promise.resolve({ data: zeilen.slice(von, bis + 1), error: null });
  };

  it("2.063 Zeilen → drei Seiten, keine fehlt, keine doppelt", async () => {
    const aufrufe: [number, number][] = [];
    const alle = await alleZeilen(holer(tabelle(2063), aufrufe));
    expect(alle).toHaveLength(2063);
    expect(new Set(alle.map((z) => z.id)).size).toBe(2063);
    expect(aufrufe).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("genau 1000 → noch eine (leere) Seite; leer → ein Aufruf", async () => {
    const a: [number, number][] = [];
    expect(await alleZeilen(holer(tabelle(1000), a))).toHaveLength(1000);
    expect(a).toHaveLength(2);
    const b: [number, number][] = [];
    expect(await alleZeilen(holer([], b))).toEqual([]);
    expect(b).toHaveLength(1);
  });

  it("Fehler wird geworfen statt still weniger zu liefern", async () => {
    await expect(alleZeilen(() => Promise.resolve({ data: null, error: new Error("weg") }))).rejects.toThrow("weg");
  });
});

describe("inHaeppchen: lange ID-Listen", () => {
  it("teilt in 150er, entfernt Doppelte, hängt an", async () => {
    const teile: number[][] = [];
    const ids = [...Array.from({ length: 320 }, (_, i) => i), 5, 6];
    const r = await inHaeppchen(ids, (t) => {
      teile.push(t);
      return Promise.resolve({ data: t.map((id) => ({ id })), error: null });
    });
    expect(teile.map((t) => t.length)).toEqual([150, 150, 20]);
    expect(r).toHaveLength(320);
  });

  it("leere Liste → keine Abfrage", async () => {
    let n = 0;
    expect(await inHaeppchen([], () => { n++; return Promise.resolve({ data: [], error: null }); })).toEqual([]);
    expect(n).toBe(0);
  });
});
