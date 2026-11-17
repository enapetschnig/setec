import { describe, expect, it } from "vitest";
import {
  betreffAusWunsch, eaAdresse, eaAktionen, eaPfad, messwerteBereinigen, messwerteLesen, messwertZeilen, offeneVorschlaege, ortZerlegen,
} from "./erstaufnahme";

describe("Messwerte", () => {
  it("liest jsonb robust", () => {
    expect(messwerteLesen(null)).toEqual([]);
    expect(messwerteLesen({ a: 1 })).toEqual([]);
    expect(messwerteLesen([{ bezeichnung: "Speicher", wert: 10, einheit: "kWh" }, "x", null, [1]]))
      .toEqual([{ bezeichnung: "Speicher", wert: "10", einheit: "kWh" }]);
    expect(messwerteLesen([{ wert: "5" }])).toEqual([{ bezeichnung: "", wert: "5", einheit: "" }]);
  });

  it("bereinigt: trimmt, leere Zeilen weg, Bezeichnung ohne Wert bleibt", () => {
    expect(messwerteBereinigen([
      { bezeichnung: " Dachneigung ", wert: " 30 ", einheit: "°" },
      { bezeichnung: "", wert: "", einheit: "kWh" },
      { bezeichnung: "Zählernummer", wert: "", einheit: "" },
    ])).toEqual([
      { bezeichnung: "Dachneigung", wert: "30", einheit: "°" },
      { bezeichnung: "Zählernummer", wert: "", einheit: "" },
    ]);
  });

  it("Zeilen nur mit Wert, Einheit dahinter", () => {
    expect(messwertZeilen([
      { bezeichnung: "Jahresverbrauch", wert: "4500", einheit: "kWh" },
      { bezeichnung: "Ausrichtung", wert: "Süd", einheit: "" },
      { bezeichnung: "Zählernummer", wert: "", einheit: "" },
      { bezeichnung: "", wert: "3 Phasen", einheit: "" },
    ])).toEqual(["Jahresverbrauch: 4500 kWh", "Ausrichtung: Süd", "3 Phasen"]);
  });

  it("Vorschläge ohne schon Eingetragenes (Groß/klein egal)", () => {
    const rest = offeneVorschlaege([{ bezeichnung: "jahresverbrauch", wert: "", einheit: "" }]);
    expect(rest.some((v) => v.bezeichnung === "Jahresverbrauch")).toBe(false);
    expect(rest.some((v) => v.bezeichnung === "Speicher")).toBe(true);
  });
});

describe("Erstaufnahme", () => {
  it("Adresse in einer Zeile", () => {
    expect(eaAdresse({ strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" })).toBe("Feldweg 3, 8643 Allerheiligen");
    expect(eaAdresse({ strasse: null, plz: null, ort: "Kindberg" })).toBe("Kindberg");
    expect(eaAdresse({ strasse: " ", plz: null, ort: null })).toBe("");
  });

  it("Betreff aus der ersten Zeile des Wunsches", () => {
    expect(betreffAusWunsch("PV 10 kW mit Speicher\nDach Süd")).toBe("PV 10 kW mit Speicher");
    expect(betreffAusWunsch(null)).toBe("");
    expect(betreffAusWunsch("x".repeat(200))).toHaveLength(120);
  });

  it("Aktionen je Status und Rolle", () => {
    expect(eaAktionen("offen", false, false)).toEqual({ angebot: false, gleichProjekt: false, keinAuftrag: false, wiederOffen: false, loeschen: false });
    expect(eaAktionen("offen", true, false)).toEqual({ angebot: true, gleichProjekt: true, keinAuftrag: true, wiederOffen: false, loeschen: true });
    expect(eaAktionen("angebot", true, false).angebot).toBe(true); // weitere Variante
    expect(eaAktionen("auftrag", true, true)).toEqual({ angebot: false, gleichProjekt: false, keinAuftrag: false, wiederOffen: false, loeschen: false });
    expect(eaAktionen("kein_auftrag", true, false)).toEqual({ angebot: false, gleichProjekt: false, keinAuftrag: false, wiederOffen: true, loeschen: true });
  });

  it("Pfad im Speicher beginnt mit ea/<id>/", () => {
    expect(eaPfad("abc", "1234", "jpg")).toBe("ea/abc/1234.jpg");
    expect(eaPfad("abc", "1234", "jpg", true)).toBe("ea/abc/1234-original.jpg");
  });

  it("Ort des Termins zerlegen", () => {
    expect(ortZerlegen("Feldweg 3, 8643 Allerheiligen")).toEqual({ strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" });
    expect(ortZerlegen("Hinterm Stadl")).toEqual({ strasse: "Hinterm Stadl", plz: null, ort: null });
  });
});
