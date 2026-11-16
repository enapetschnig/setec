import { describe, expect, it } from "vitest";
import { empfaengerLesen, mailArt, mailVorgabe, versendbar } from "./mail";

describe("Mail an den Kunden", () => {
  it("Empfänger: bis zu 3 Adressen, jede gültig", () => {
    expect(empfaengerLesen("a@b.at")).toEqual(["a@b.at"]);
    expect(empfaengerLesen(" a@b.at; c@d.de , a@b.at ")).toEqual(["a@b.at", "c@d.de"]);
    expect(empfaengerLesen("")).toBeNull();
    expect(empfaengerLesen("kein-mail")).toBeNull();
    expect(empfaengerLesen("a@b.at, c@d")).toBeNull();
    expect(empfaengerLesen("a@b.at,b@b.at,c@b.at,d@b.at")).toBeNull();
  });

  it("nur fertige Belege, Rechnungen nur mit Nummer", () => {
    expect(versendbar({ typ: "angebot", status: "entwurf", nummer: null })).toBe(false);
    expect(versendbar({ typ: "angebot", status: "offen", nummer: "AN-1" })).toBe(true);
    expect(versendbar({ typ: "angebot", status: "abgelehnt", nummer: "AN-1" })).toBe(false);
    expect(versendbar({ typ: "rechnung", status: "offen", nummer: "RE-1" })).toBe(true);
    expect(versendbar({ typ: "rechnung", status: "storno", nummer: "RE-2" })).toBe(true);
    expect(versendbar({ typ: "rechnung", status: "storniert", nummer: "RE-1" })).toBe(false);
    expect(versendbar({ typ: "rechnung", status: "entwurf", nummer: "RE-1" })).toBe(false);
    expect(mailArt({ typ: "rechnung", status: "storno" })).toBe("Stornorechnung");
  });

  it("Angebot: Link und Datenblätter stehen im Text", () => {
    const v = mailVorgabe({
      art: "Angebot", nummer: "AN-2026-006", betreff: "PV 9 kW", an: "k@x.at", firma: "SETEC GmbH",
      telefon: "03865 1234", link: "https://setec.handwerkapp.at/angebot/abc", giltBis: "30.11.2026", datenblaetter: 2,
    });
    expect(v.an).toBe("k@x.at");
    expect(v.betreff).toBe("Angebot AN-2026-006 – PV 9 kW · SETEC GmbH");
    expect(v.text).toContain("anbei unser Angebot AN-2026-006 „PV 9 kW“ als PDF samt 2 Datenblättern.");
    expect(v.text).toContain("\nhttps://setec.handwerkapp.at/angebot/abc\n");
    expect(v.text).toContain("gilt bis 30.11.2026");
    expect(v.text.endsWith("SETEC GmbH")).toBe(true);
  });

  it("Rechnung: offen mit Fälligkeit, bezahlt ohne Zahlungsaufforderung", () => {
    const offen = mailVorgabe({ art: "Rechnung", nummer: "RE-2026-004", betreff: null, an: null, firma: "SETEC GmbH", datum: "16.11.2026", betrag: "1.200,00 €", faellig: "30.11.2026" });
    expect(offen.an).toBe("");
    expect(offen.betreff).toBe("Rechnung RE-2026-004 · SETEC GmbH");
    expect(offen.text).toContain("bis 30.11.2026");
    const bezahlt = mailVorgabe({ art: "Rechnung", nummer: "RE-1", betreff: null, an: null, firma: "X", bezahlt: true, faellig: "1.1.2027" });
    expect(bezahlt.text).toContain("bereits bezahlt");
    expect(bezahlt.text).not.toContain("überweisen");
  });
});
