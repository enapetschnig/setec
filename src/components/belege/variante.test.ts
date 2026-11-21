import { describe, expect, it } from "vitest";
import { belegSummen } from "@/lib/preise";
import { angeboteneStunden } from "@/lib/nachkalkulation";
import { bedarfAusAngebot } from "@/components/bestellung/bestellLogik";
import {
  leerePosition, nachlassSetzen, positionAusDb, positionBetrag, positionGesamt, positionZuDb, summen, summeVorNachlass, titelPosition, titelUebersicht, zwischensummen,
} from "./editor";
import { vorlageAusEditor, vorlageNetto, vorlagePositionenLesen } from "./vorlagen";

// Wunsch Stefan 21.11.2026: Position „optional“/„alternativ“ — Preis sichtbar, zählt nicht in Summe und Kalkulation
const titel = titelPosition("PV");
const fest = leerePosition("leistung", { bezeichnung: "Montage", menge: "2", einzelpreis: "100,00", minuten: 60 });
const option = leerePosition("leistung", { bezeichnung: "Speicher", menge: "1", einzelpreis: "5.000,00", minuten: 120, variante: "optional" });
const alternative = leerePosition("artikel", { bezeichnung: "Anderes Modul", menge: "3", einzelpreis: "50,00", variante: "alternativ" });
const liste = [titel, fest, option, alternative];

describe("Optional/alternativ", () => {
  it("Betrag steht da, zählt aber nicht", () => {
    expect(positionBetrag(option)).toBe(5000);
    expect(positionGesamt(option)).toBe(0);
    expect(summen(liste, 20, false)).toEqual({ netto: 200, ust: 40, brutto: 240 });
    expect(belegSummen([{ art: "leistung", menge: 1, einzelpreis: 10 }, { art: "leistung", menge: 1, einzelpreis: 99, variante: "optional" }], 20, true).netto).toBe(10);
  });
  it("Zwischensumme, Zusammenstellung und Nachlass ohne sie", () => {
    const zeilen = liste.map((p) => ({ art: p.art, bezeichnung: p.bezeichnung, gesamt: positionGesamt(p) }));
    expect(zwischensummen(zeilen)[0]).toBe(200);
    expect(titelUebersicht([...zeilen, { art: "titel", bezeichnung: "B", gesamt: 0 }])[0].summe).toBe(200);
    expect(summeVorNachlass(liste)).toBe(200);
    const mit = nachlassSetzen(liste, { text: "Nachlass", prozent: 10, betrag: null });
    expect(summen(mit, 0, true).netto).toBe(180);
  });
  it("Datenbank hin und zurück; Titel/Text nie markiert", () => {
    expect(positionZuDb(option, "b", 1).variante).toBe("optional");
    expect(positionZuDb(fest, "b", 1).variante).toBeNull();
    expect(positionZuDb({ ...titel, variante: "optional" }, "b", 1).variante).toBeNull();
    const zurueck = positionAusDb({ ...positionZuDb(alternative, "b", 1), gesamt: 0, created_at: "" } as never);
    expect(zurueck.variante).toBe("alternativ");
  });
  it("Nachkalkulation und Bestellbedarf ohne sie", () => {
    expect(angeboteneStunden([
      { art: "leistung", menge: 2, einheit: "Stk", minuten: 60 },
      { art: "leistung", menge: 1, einheit: "Stk", minuten: 120, variante: "optional" },
    ])).toBe(2);
    const bedarf = bedarfAusAngebot([
      { art: "artikel", menge: 2, artikel_id: "a1", leistung_id: null },
      { art: "artikel", menge: 5, artikel_id: "a2", leistung_id: null, variante: "alternativ" },
    ], new Map());
    expect([...bedarf.keys()]).toEqual(["a1"]);
  });
  it("Vorlage behält die Markierung, Netto ohne sie", () => {
    const v = vorlageAusEditor(liste);
    expect(vorlageNetto(v)).toBe(200);
    const gelesen = vorlagePositionenLesen(JSON.parse(JSON.stringify(v)));
    expect(gelesen.map((p) => p.variante ?? null)).toEqual([null, null, "optional", "alternativ"]);
  });
});
