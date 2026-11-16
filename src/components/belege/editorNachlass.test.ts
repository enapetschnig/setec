import { describe, expect, it } from "vitest";
import {
  leerePosition, nachlassRechnen, nachlassSetzen, nachlassText, positionsNummern, positionZuDb, summen, titelPosition, titelUebersicht, ziehen,
  zwischensummen, type EditorPosition,
} from "./editor";
import { stundenAufBeleg, verbrauchZusammenfassen } from "./verbrauch";

const pos = (bezeichnung: string, menge: number, preis: number, art: EditorPosition["art"] = "leistung") =>
  leerePosition(art, { bezeichnung, menge: String(menge).replace(".", ","), einzelpreis: String(preis).replace(".", ",") });

describe("Nachlass als eigene Zeile", () => {
  const liste = [titelPosition("PV-Generator"), pos("Modul", 20, 150), titelPosition("Speicher"), pos("Speicher 10 kWh", 1, 5000)];

  it("5 % von der Summe davor, am Ende, Netto stimmt", () => {
    const mit = nachlassSetzen(liste, { text: "Nachlass", prozent: 5, betrag: null });
    expect(mit.at(-1)!.art).toBe("nachlass");
    expect(mit.at(-1)!.einzelpreis).toBe("-400,00");
    expect(summen(mit, 20, false).netto).toBe(7600);
    expect(nachlassText(mit.at(-1)!)).toBe("Nachlass 5 %");
  });

  it("folgt neuen Positionen und bleibt am Ende", () => {
    const mit = nachlassSetzen(liste, { text: "Rabatt", prozent: 10, betrag: null });
    const neu = nachlassRechnen([...mit, pos("Wallbox", 1, 1000)]);
    expect(neu.at(-1)!.art).toBe("nachlass");
    expect(neu.at(-1)!.einzelpreis).toBe("-900,00");
    expect(nachlassRechnen(neu)).toBe(neu); // unverändert = dieselbe Liste (keine Endlosschleife)
  });

  it("fester Betrag bleibt fest; null entfernt", () => {
    const mit = nachlassSetzen(liste, { text: "Nachlass", prozent: null, betrag: 250 });
    expect(nachlassRechnen([...mit, pos("X", 1, 100)]).find((p) => p.art === "nachlass")!.einzelpreis).toBe("-250,00");
    expect(nachlassSetzen(mit, null).some((p) => p.art === "nachlass")).toBe(false);
  });

  it("steht vor den Abzügen einer Schlussrechnung", () => {
    const abzug = leerePosition("abzug", { bezeichnung: "1. Teilrechnung", einzelpreis: "-1000,00" });
    const mit = nachlassSetzen([...liste, abzug], { text: "Nachlass", prozent: 5, betrag: null });
    expect(mit.map((p) => p.art).slice(-2)).toEqual(["nachlass", "abzug"]);
    expect(mit.at(-2)!.einzelpreis).toBe("-400,00");
  });

  it("ohne Nummer, nicht in der Zwischensumme, Prozent geht in die Datenbank", () => {
    const mit = nachlassSetzen(liste, { text: "Nachlass", prozent: 5, betrag: null });
    expect(positionsNummern(mit.map((p) => p.art)).at(-1)).toBe("");
    const zs = zwischensummen(mit.map((p) => ({ art: p.art, gesamt: Number(p.menge.replace(",", ".")) * Number(p.einzelpreis.replace(",", ".")) })));
    expect(zs[2]).toBe(5000);
    expect(positionZuDb(mit.at(-1)!, "b", 9)).toMatchObject({ art: "nachlass", prozent: 5, menge: 1, einzelpreis: -400 });
    expect(positionZuDb(liste[1], "b", 1).prozent).toBeNull();
  });
});

describe("Zusammenstellung am Ende", () => {
  it("erst ab zwei Titeln, mit Positionen davor", () => {
    expect(titelUebersicht([{ art: "titel", bezeichnung: "A", gesamt: 0 }, { art: "leistung", bezeichnung: "x", gesamt: 5 }])).toEqual([]);
    expect(titelUebersicht([
      { art: "leistung", bezeichnung: "Anfahrt", gesamt: 50 },
      { art: "titel", bezeichnung: "PV-Generator", gesamt: 0 },
      { art: "leistung", bezeichnung: "Modul", gesamt: 3000 },
      { art: "titel", bezeichnung: "Speicher", gesamt: 0 },
      { art: "leistung", bezeichnung: "Speicher", gesamt: 5000 },
      { art: "nachlass", bezeichnung: "Nachlass", gesamt: -400 },
    ])).toEqual([
      { nummer: "", name: "Weitere Positionen", summe: 50 },
      { nummer: "2", name: "PV-Generator", summe: 3000 },
      { nummer: "3", name: "Speicher", summe: 5000 },
    ]);
  });
});

describe("Ziehen und Ablegen", () => {
  const a = titelPosition("A"); const a1 = pos("a1", 1, 1); const a2 = pos("a2", 1, 1);
  const b = titelPosition("B"); const b1 = pos("b1", 1, 1);
  const c = titelPosition("C"); const c1 = pos("c1", 1, 1);
  const liste = [a, a1, a2, b, b1, c, c1];
  const namen = (l: EditorPosition[]) => l.map((p) => p.bezeichnung);

  it("Position wandert in einen anderen Raum", () => {
    expect(namen(ziehen(liste, a1.id, b1.id))).toEqual(["A", "a2", "B", "b1", "a1", "C", "c1"]);
  });
  it("Titel nimmt seinen Raum mit — nach unten hinter die Zielgruppe", () => {
    expect(namen(ziehen(liste, a.id, b1.id))).toEqual(["B", "b1", "A", "a1", "a2", "C", "c1"]);
    expect(namen(ziehen(liste, a.id, c.id))).toEqual(["B", "b1", "C", "c1", "A", "a1", "a2"]);
  });
  it("Titel nach oben vor die Zielgruppe; in die eigene Gruppe: nichts", () => {
    expect(namen(ziehen(liste, c.id, a2.id))).toEqual(["C", "c1", "A", "a1", "a2", "B", "b1"]);
    expect(ziehen(liste, a.id, a2.id)).toBe(liste);
  });
});

describe("Im Projekt verbraucht", () => {
  it("Stunden und Material: hier, andere Rechnung, offen", () => {
    const v = verbrauchZusammenfassen(
      [
        { id: "z1", stunden: 4, user_id: "u1", name: "Max", rechnung_id: "r1" },
        { id: "z2", stunden: 2.5, user_id: "u1", name: "Max", rechnung_id: null },
        { id: "z3", stunden: 3, user_id: "u2", name: "Lisa", rechnung_id: "r9" },
      ],
      [
        { id: "m1", art: "ausfassung", menge: 10, einheit: "Stk", bezeichnung: "Dose", artikel_id: "a1", rechnung_id: null },
        { id: "m2", art: "rueckgabe", menge: 2, einheit: "Stk", bezeichnung: "Dose", artikel_id: "a1", rechnung_id: null },
        { id: "m3", art: "direkt", menge: 50, einheit: "m", bezeichnung: "NYM 3x1,5", artikel_id: null, rechnung_id: "r1" },
      ],
      "r1",
    );
    expect(v.stunden).toEqual({ gesamt: 9.5, hier: 4, anderswo: 3, offen: 2.5 });
    expect(v.personen[0]).toMatchObject({ name: "Max", gesamt: 6.5, offen: 2.5 });
    expect(v.material).toEqual([
      { bezeichnung: "Dose", einheit: "Stk", gesamt: 8, hier: 0, anderswo: 0, offen: 8 },
      { bezeichnung: "NYM 3x1,5", einheit: "m", gesamt: 50, hier: 50, anderswo: 0, offen: 0 },
    ]);
  });
  it("Stunden auf der Rechnung: Arbeitszeit plus Montagezeit", () => {
    expect(stundenAufBeleg([
      { art: "arbeit", menge: 3, einheit: "h", minuten: null },
      { art: "leistung", menge: 6, einheit: "Stk", minuten: 20 },
      { art: "nachlass", menge: 1, einheit: "Psch", minuten: null },
    ])).toBe(5);
  });
});
