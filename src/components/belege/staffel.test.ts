import { describe, expect, it } from "vitest";
import { hinzufuegen, leistungPosition, leistungWeniger, staffelNachziehen, type EditorPosition, type KatalogLeistung } from "./editor";
import { ausVorlage } from "./vorlagen";
import { leistungPreis, staffelLesen, staffelMinuten } from "@/lib/preise";
import { staffelBereiche, staffelErlaubt, staffelPruefen, staffelText } from "@/components/stamm/leistungHilfen";

// Stefan 20.11.2026: PV-Montage je Modul — 2–10 Module 160 min, 11–18 145 min, ab 19 130 min
const FIRMA = { stundensatz: 60, material_aufschlag: 0 };
const pv = {
  id: "l-pv", kurztext: "Montage der PV-Anlage", einheit: "Stk", minuten: 115, preis: null, langtext: null, kategorie: "Montagearbeiten",
  staffel: [{ ab: 11, minuten: 145 }, { ab: 2, minuten: 160 }, { ab: 19, minuten: 130 }],
  leistung_material: [],
} as unknown as KatalogLeistung;
const ohne = { ...pv, id: "l-ohne", staffel: null } as unknown as KatalogLeistung;
const katalog = [pv, ohne];
const mit = (p: EditorPosition, w: Partial<EditorPosition>) => ({ ...p, ...w });

describe("Staffel der Montagezeit", () => {
  it("liest, sortiert und wählt die Stufe nach der Menge", () => {
    expect(staffelLesen(pv.staffel)).toEqual([{ ab: 2, minuten: 160 }, { ab: 11, minuten: 145 }, { ab: 19, minuten: 130 }]);
    expect(staffelLesen("x")).toEqual([]);
    expect(staffelMinuten(pv, 1)).toBe(115);
    expect(staffelMinuten(pv, 2)).toBe(160);
    expect(staffelMinuten(pv, 10)).toBe(160);
    expect(staffelMinuten(pv, 11)).toBe(145);
    expect(staffelMinuten(pv, 18)).toBe(145);
    expect(staffelMinuten(pv, 19)).toBe(130);
    expect(staffelMinuten(pv, 40)).toBe(130);
    expect(staffelMinuten(pv)).toBe(115);
    expect(staffelMinuten(ohne, 12)).toBe(115);
  });

  it("Preis = Minuten der Stufe × Stundensatz; fester Preis bleibt fest", () => {
    expect(leistungPreis(pv, [], FIRMA, 60, 5)).toBe(160);
    expect(leistungPreis(pv, [], FIRMA, 60, 12)).toBe(145);
    expect(leistungPreis(pv, [], FIRMA, 60, 20)).toBe(130);
    expect(leistungPreis({ ...pv, preis: 99 }, [], FIRMA, 60, 20)).toBe(99);
  });

  it("neue Position rechnet mit der Stufe ihrer Menge", () => {
    const p = leistungPosition(pv, FIRMA, 60, 12);
    expect(p.einzelpreis).toBe("145,00");
    expect(p.minuten).toBe(145);
  });

  it("Menge ändern zieht Preis und Minuten nach — nicht bei Hand-Preis, nicht beim Laden", () => {
    const p = leistungPosition(pv, FIRMA, 60, 5);
    const a = [p];
    const b = staffelNachziehen(a, [mit(p, { menge: "12" })], katalog, FIRMA, 60);
    expect(b[0].einzelpreis).toBe("145,00");
    expect(b[0].minuten).toBe(145);
    const c = staffelNachziehen(b, [mit(b[0], { menge: "20" })], katalog, FIRMA, 60);
    expect(c[0].einzelpreis).toBe("130,00");
    // zurück auf 3 → wieder 160
    expect(staffelNachziehen(c, [mit(c[0], { menge: "3" })], katalog, FIRMA, 60)[0].einzelpreis).toBe("160,00");
    // von Hand gesetzter Preis bleibt
    const hand = [mit(p, { einzelpreis: "150,00" })];
    const handNeu = staffelNachziehen(hand, [mit(hand[0], { menge: "12" })], katalog, FIRMA, 60)[0];
    expect(handNeu.einzelpreis).toBe("150,00");
    expect(handNeu.minuten, "Planzeit folgt trotzdem der Stufe").toBe(145);
    // Menge und Preis im selben Schritt (Positions-Dialog) → Preis wie eingetragen
    expect(staffelNachziehen(a, [mit(p, { menge: "12", einzelpreis: "170,00" })], katalog, FIRMA, 60)[0].einzelpreis).toBe("170,00");
    // ganz neue Liste (Laden) fasst nichts an
    const geladen = [mit(p, { id: "neu", menge: "12" })];
    expect(staffelNachziehen(a, geladen, katalog, FIRMA, 60)).toBe(geladen);
    // ohne Staffel: nichts
    const o = leistungPosition(ohne, FIRMA, 60, 5);
    expect(staffelNachziehen([o], [mit(o, { menge: "12" })], katalog, FIRMA, 60)[0].einzelpreis).toBe("115,00");
  });

  it("noch einmal antippen bleibt eine Zeile, Minus zieht ebenfalls nach", () => {
    let l: EditorPosition[] = [];
    for (let i = 0; i < 11; i++) {
      const neu = hinzufuegen(l, leistungPosition(pv, FIRMA, 60), null, true).liste;
      l = staffelNachziehen(l, neu, katalog, FIRMA, 60);
    }
    expect(l).toHaveLength(1);
    expect(l[0].menge).toBe("11");
    expect(l[0].einzelpreis).toBe("145,00");
    const weniger = staffelNachziehen(l, leistungWeniger(l, null, pv.id), katalog, FIRMA, 60);
    expect(weniger[0].menge).toBe("10");
    expect(weniger[0].einzelpreis).toBe("160,00");
  });

  it("Vorlage rechnet die Stufe der gespeicherten Menge", () => {
    const v = [{ art: "leistung", bezeichnung: "PV", langtext: null, menge: 12, einheit: "Stk", einzelpreis: 145, ek_preis: null, minuten: 145, artikel_id: null, leistung_id: pv.id }];
    const r = ausVorlage(v as never, { artikel: new Map(), leistungen: new Map([[pv.id, pv]]) }, FIRMA, 60, true);
    expect(r.abweichungen).toEqual([]);
    expect(r.positionen[0].einzelpreis).toBe("145,00");
    expect(r.positionen[0].minuten).toBe(145);
  });

  it("nur in „Montagearbeiten“, Bereiche und Prüfung", () => {
    expect(staffelErlaubt(" montagearbeiten ")).toBe(true);
    expect(staffelErlaubt("PV Montagematerial")).toBe(false);
    expect(staffelBereiche(staffelLesen(pv.staffel)).map((b) => b.text)).toEqual(["2–10", "11–18", "ab 19"]);
    expect(staffelText(pv)).toBe("2–10: 160 · 11–18: 145 · ab 19: 130 min");
    expect(staffelPruefen([{ ab: 2, minuten: 160 }, { ab: null, minuten: null }])).toEqual({ stufen: [{ ab: 2, minuten: 160 }] });
    expect("fehler" in staffelPruefen([{ ab: 2, minuten: 160 }, { ab: 2, minuten: 150 }])).toBe(true);
    expect("fehler" in staffelPruefen([{ ab: 5, minuten: null }])).toBe(true);
  });
});
