// Postfach-Abruf (Prüfung 18.11.2026): doppelte Rechnungen unabhängig vom
// Lieferanten-Namen (H1), Lieferant robuster zuordnen, erlaubte Domains (M1),
// Kalendertag in Wien (L4), gerechte Aufteilung (L5), vorübergehende Fehler (H2).
import { describe, expect, it } from "vitest";
import { PostfachFehler, voruebergehend } from "../../supabase/functions/_shared/gmail.ts";
import {
  absenderGleich, anteil, domainErlaubt, domainPasst, domainsLesen, domainVon, doppeltFinden, erlaubteDomains, ibanSchluessel, lieferantFinden,
  nummerKern, uidSchluessel, wienerTag, type DoppeltKandidat, type Wissen,
} from "../../supabase/functions/_shared/postfach.ts";

describe("Kalendertag in Wien (L4)", () => {
  it("Mail kurz nach Mitternacht gehört zum neuen Tag", () => {
    expect(wienerTag("2026-12-31T23:30:00Z")).toBe("2027-01-01"); // Winterzeit, UTC+1
    expect(wienerTag("2026-12-31T22:59:00Z")).toBe("2026-12-31");
    expect(wienerTag("2026-07-31T22:30:00Z")).toBe("2026-08-01"); // Sommerzeit, UTC+2
    expect(wienerTag(new Date("2026-11-18T10:00:00Z"))).toBe("2026-11-18");
    expect(wienerTag(Date.parse("2026-03-29T00:30:00Z"))).toBe("2026-03-29");
    expect(wienerTag("kein Datum")).toBe("");
  });
});

describe("Erlaubte Domains (M1)", () => {
  it("Secret lesen: Komma, Leerraum, Groß/klein, Ungültiges fällt weg", () => {
    expect(domainsLesen(" Setec-GmbH.at, setec.at ;@epowergmbh.at,, kein domain ,x")).toEqual(["setec-gmbh.at", "setec.at", "epowergmbh.at"]);
    expect(domainsLesen(undefined)).toEqual([]);
    expect(domainsLesen("")).toEqual([]);
  });
  it("nur genau diese Domains — keine Subdomain, kein Anhängsel", () => {
    const d = ["setec-gmbh.at"];
    expect(domainErlaubt("office@setec-gmbh.at", d)).toBe(true);
    expect(domainErlaubt("S.Sattler@SETEC-GmbH.at", d)).toBe(true);
    expect(domainErlaubt("hallo@epowergmbh.at", d)).toBe(false);
    expect(domainErlaubt("x@mail.setec-gmbh.at", d)).toBe(false);
    expect(domainErlaubt("x@setec-gmbh.at.evil.com", d)).toBe(false);
    expect(domainErlaubt("office@setec-gmbh.at", [])).toBe(false); // ohne Liste: nichts (fail closed)
    expect(domainErlaubt(null, d)).toBe(false);
    expect(domainVon("Max Muster <Max@Muster.AT>")).toBe("muster.at");
  });
  it("Secret zuerst, sonst Tabelle postfach_domains, sonst keine", async () => {
    let gefragt = 0;
    const tabelle = (data: unknown, error: unknown = null) => ({
      from: (t: string) => ({ select: async () => { gefragt++; expect(t).toBe("postfach_domains"); return { data, error }; } }),
    });
    expect(await erlaubteDomains(tabelle([{ domain: "andere.at" }]), "setec-gmbh.at")).toEqual(["setec-gmbh.at"]);
    expect(gefragt).toBe(0);
    expect(await erlaubteDomains(tabelle([{ domain: "setec-gmbh.at" }, { domain: "setec.at" }]), undefined)).toEqual(["setec-gmbh.at", "setec.at"]);
    expect(await erlaubteDomains(tabelle([]), "")).toEqual([]);
    const fehler = console.error;
    console.error = () => {};
    try {
      expect(await erlaubteDomains(tabelle(null, { message: "permission denied" }), null)).toEqual([]);
    } finally {
      console.error = fehler;
    }
  });
});

describe("Lieferant zuordnen — nur eindeutige Merkmale", () => {
  const wissen = (teil: Partial<Wissen> = {}): Wissen => ({
    kontakte: [
      { name: "Muster Großhandel", namen: [], email: null, uid: "ATU 1234 5678", notiz: "Bank: AT61 1904 3002 3457 3201" },
      { name: "Elektro Huber", namen: ["Huber E-Technik"], email: "office@huber-elektro.at", uid: null },
      { name: "Sonepar", namen: ["Sonepar Österreich GmbH"], email: null, personen: ["max.aussendienst@sonepar.at"] },
      { name: "Rexel", namen: [], email: null },
    ],
    rechnungen: [],
    eigen: { iban: "AT48 3200 0000 1234 5678", uid: "ATU99999999", domains: ["setec-gmbh.at"] },
    ...teil,
  });

  it("UID am Kontakt schlägt jeden Namen (21 Schreibweisen → ein Lieferant)", () => {
    const z = lieferantFinden({ name: "Muster Elektro-Großhandels GesmbH Zweigniederlassung Graz", uid: "ATU12345678" }, wissen());
    expect(z).toEqual({ name: "Muster Großhandel", weg: "uid" });
  });
  it("UID früherer Rechnung (ohne Kontakt) — die eigene UID zählt nie", () => {
    const w = wissen({ rechnungen: [{ lieferant: "Kabel Maier", uid: "ATU55555555" }] });
    expect(lieferantFinden({ name: "Maier Kabelhandel", uid: "atu 5555 5555" }, w).name).toBe("Kabel Maier");
    expect(lieferantFinden({ name: "Neu GmbH", uid: "ATU99999999" }, w)).toEqual({ name: "Neu GmbH", weg: "gelesen" });
  });
  it("IBAN wie bei früheren Rechnungen oder in der Kontakt-Notiz; eigene IBAN nie; mehrdeutig nie", () => {
    const w = wissen({
      rechnungen: [
        { lieferant: "Leasing AG", iban: "AT02 2011 1000 0000 1234" },
        { lieferant: "Leasing AG", iban: "AT022011100000001234" },
        { lieferant: "Firma A", iban: "AT11 1111 1111 1111 1111" },
        { lieferant: "Firma B", iban: "AT11 1111 1111 1111 1111" },
        { lieferant: "Eigene Bank", iban: "AT48 3200 0000 1234 5678" },
      ],
    });
    expect(lieferantFinden({ name: "Leasing Austria", iban: "AT022011100000001234" }, w)).toEqual({ name: "Leasing AG", weg: "iban" });
    expect(lieferantFinden({ name: "Muster GH", iban: "AT611904300234573201" }, w)).toEqual({ name: "Muster Großhandel", weg: "iban" });
    expect(lieferantFinden({ name: "Wer auch immer", iban: "AT11111111111111111111" }, w).weg).toBe("gelesen");
    expect(lieferantFinden({ name: "Lastschrift-Händler", iban: "AT483200000012345678" }, w).weg).toBe("gelesen");
  });
  it("gleiche KI-Schreibweise wie früher → Name, unter dem die Rechnung heute steht (Korrektur gelernt)", () => {
    const w = wissen({ rechnungen: [{ lieferant: "Muster Großhandel", gelesen: "MUSTER Elektrogroßhandel GmbH & Co KG" }] });
    expect(lieferantFinden({ name: "Muster  Elektrogroßhandel GmbH & Co KG" }, w)).toEqual({ name: "Muster Großhandel", weg: "schreibweise" });
  });
  it("Domain der Ansprechperson; mehrere Kontakte mit derselben Domain → keiner", () => {
    expect(lieferantFinden({ name: "Elektrogroßhandel Graz-Süd", absender: "rechnung@sonepar.at" }, wissen())).toEqual({ name: "Sonepar", weg: "domain" });
    expect(lieferantFinden({ name: "Huber Gruppe", absender: "r@huber-elektro.at" }, wissen())).toEqual({ name: "Elektro Huber", weg: "domain" });
    const zwei = wissen();
    zwei.kontakte.push({ name: "Huber Solar", namen: [], email: "solar@huber-elektro.at" });
    expect(lieferantFinden({ name: "Huber Gruppe", absender: "r@huber-elektro.at" }, zwei)).toEqual({ name: "Huber Gruppe", weg: "gelesen" });
  });
  it("Absender früherer Mails nur, wenn die Domain zum Namen passt (keine Rechnungsplattform)", () => {
    const w = wissen({
      rechnungen: [
        { lieferant: "Muster Großhandel", absender: ["Buchhaltung <rechnung@muster.at>"] },
        { lieferant: "Abo-Dienst XY", absender: ["invoice+statements@stripe.com"] },
      ],
    });
    expect(lieferantFinden({ name: "MGH Filiale Graz", absender: "noreply@muster.at" }, w)).toEqual({ name: "Muster Großhandel", weg: "absender" });
    expect(lieferantFinden({ name: "Ganz Andere GmbH", absender: "invoice+statements@stripe.com" }, w)).toEqual({ name: "Ganz Andere GmbH", weg: "gelesen" });
  });
  it("weitergeleitet (eigene Domain) oder Freemail zählt nie als Lieferanten-Merkmal", () => {
    const w = wissen({ rechnungen: [{ lieferant: "Muster Großhandel", absender: ["s.sattler@setec-gmbh.at"] }] });
    expect(lieferantFinden({ name: "Anderer Händler", absender: "Stefan <s.sattler@setec-gmbh.at>" }, w).name).toBe("Anderer Händler");
    expect(lieferantFinden({ name: null, absender: "x@gmail.com" }, w).name).toBeNull();
  });
  it("bisherige Regeln bleiben (Name am Kontakt, ohne Rechtsform, bisherige Schreibweise)", () => {
    expect(lieferantFinden({ name: "huber e-technik" }, wissen())).toEqual({ name: "Elektro Huber", weg: "name" });
    expect(lieferantFinden({ name: "Rexel Austria GmbH" }, wissen())).toEqual({ name: "Rexel", weg: "rechtsform" });
    expect(lieferantFinden({ name: "HORNBACH" }, wissen({ rechnungen: [{ lieferant: "Hornbach" }] }))).toEqual({ name: "Hornbach", weg: "bisher" });
  });
  it("domainPasst", () => {
    expect(domainPasst("muster.at", "Muster Großhandel")).toBe(true);
    expect(domainPasst("huber-elektro.at", "Elektro Huber")).toBe(true);
    expect(domainPasst("musterelektro.co.at", "Muster Elektro GmbH")).toBe(true);
    expect(domainPasst("rechnung.sonepar.at", "Sonepar Österreich GmbH")).toBe(true);
    expect(domainPasst("stripe.com", "Abo-Dienst XY")).toBe(false);
    expect(domainPasst("e-rechnung.gv.at", "Rechnung Muster")).toBe(false);
    expect(domainPasst("elektro-grosshandel.at", "Elektro Großhandel Huber")).toBe(false); // nur allgemeine Wörter
  });
  it("UID und IBAN nur, wenn sie danach aussehen", () => {
    expect(uidSchluessel("ATU 123 456 78")).toBe("ATU12345678");
    expect(uidSchluessel("DE123456789")).toBe("DE123456789");
    expect(uidSchluessel("unbekannt")).toBeNull();
    expect(ibanSchluessel("at61 1904 3002 3457 3201")).toBe("AT611904300234573201");
    expect(ibanSchluessel("1234")).toBeNull();
  });
});

describe("Doppelte Rechnung — egal unter welchem Namen (H1, L3)", () => {
  const odoo: DoppeltKandidat = { id: "odoo", lieferant: "Muster Großhandel", nummer: "RE-2026/0815", datum: "2026-11-10", brutto: "1234.56", absender: null };
  const frage = { nummer: "re 2026 0815", brutto: 1234.56, datumGelesen: "2026-11-10", datum: "2026-11-10", lieferant: "MUSTER Elektro-Großhandels GmbH Filiale Graz" };

  it("Nummern-Kern", () => {
    expect(nummerKern(" RE-2026/0815 ")).toBe("re20260815");
    expect(nummerKern("re 2026 0815")).toBe("re20260815");
    expect(nummerKern(null)).toBe("");
  });
  it("gleiche Nummer + Brutto + Datum, anderer Name → doppelt", () => {
    expect(doppeltFinden(frage, [odoo])?.id).toBe("odoo");
  });
  it("KI las ein anderes Datum → nicht doppelt (außer gleicher Lieferant)", () => {
    expect(doppeltFinden({ ...frage, datumGelesen: "2026-11-11", datum: "2026-11-11" }, [odoo])).toBeNull();
    expect(doppeltFinden({ ...frage, datumGelesen: "2026-11-11", datum: "2026-11-11", lieferant: "Muster Großhandel" }, [odoo])?.id).toBe("odoo");
  });
  it("anderes Brutto → nicht doppelt; gleicher Lieferant + Nummer bleibt doppelt (wie bisher)", () => {
    expect(doppeltFinden({ ...frage, brutto: 1029.0 }, [odoo])).toBeNull();
    expect(doppeltFinden({ ...frage, brutto: 1029.0, lieferant: "muster großhandel" }, [odoo])?.id).toBe("odoo");
  });
  it("ohne Datum auf dem Beleg: Nummer + Brutto genügen, kurze Nummern nur mit gleichem Absender", () => {
    expect(doppeltFinden({ ...frage, datumGelesen: null, datum: "2026-11-18" }, [odoo])?.id).toBe("odoo");
    const kurz: DoppeltKandidat = { ...odoo, id: "kurz", nummer: "12", absender: ["rechnung@muster.at"] };
    const f = { ...frage, nummer: "12", datumGelesen: null, datum: "2026-11-18" };
    expect(doppeltFinden({ ...f, absender: "x@anders.at" }, [kurz])).toBeNull();
    expect(doppeltFinden({ ...f, absender: "Buchhaltung <noreply@muster.at>" }, [kurz])?.id).toBe("kurz");
  });
  it("ohne Nummer: Datum + Brutto + (Lieferant oder Absender), Datum wie beim Anlegen", () => {
    const alt: DoppeltKandidat = { id: "m1", lieferant: "Tankstelle Mürz", nummer: null, datum: "2026-11-18", brutto: 80, absender: ["beleg@tanke.at"] };
    const f = { nummer: null, brutto: 80, datumGelesen: null, datum: "2026-11-18", lieferant: "Tankstelle Mürz GmbH" };
    expect(doppeltFinden({ ...f, absender: "beleg@tanke.at" }, [alt])?.id).toBe("m1");
    expect(doppeltFinden({ ...f, lieferant: "Tankstelle Mürz" }, [alt])?.id).toBe("m1");
    expect(doppeltFinden({ ...f, absender: "x@sonst.at" }, [alt])).toBeNull();
    expect(doppeltFinden({ ...f, absender: "beleg@tanke.at", datum: "2026-11-17" }, [alt])).toBeNull();
    expect(doppeltFinden({ ...f, absender: "beleg@tanke.at", brutto: 0 }, [{ ...alt, brutto: 0 }])).toBeNull();
  });
  it("Absender: eigene Domain (weitergeleitet) zählt nie, Freemail nur mit gleicher Adresse", () => {
    expect(absenderGleich("s.sattler@setec-gmbh.at", ["office@setec-gmbh.at"], ["setec-gmbh.at"])).toBe(false);
    expect(absenderGleich("a@gmail.com", ["b@gmail.com"])).toBe(false);
    expect(absenderGleich("A@gmail.com", ["Max <a@gmail.com>"])).toBe(true);
    expect(absenderGleich("x@muster.at", ["y@muster.at"])).toBe(true);
  });
});

describe("Lauf aufteilen (L5) und vorübergehende Fehler (H2)", () => {
  it("jedes Postfach seinen Anteil, mindestens eine Lesung", () => {
    expect(anteil({ gelesen: 0, lesenMax: 6, vergangen: 0, zeitMax: 110_000, postfaecher: 2 })).toEqual({ lesenBis: 3, zeit: 55_000 });
    // erstes Postfach las 4 (Mail mit 4 Anhängen) und brauchte 70 s
    expect(anteil({ gelesen: 4, lesenMax: 6, vergangen: 70_000, zeitMax: 110_000, postfaecher: 1 })).toEqual({ lesenBis: 6, zeit: 40_000 });
    expect(anteil({ gelesen: 7, lesenMax: 6, vergangen: 10_000, zeitMax: 110_000, postfaecher: 1 }).lesenBis).toBe(8);
    expect(anteil({ gelesen: 1, lesenMax: 6, vergangen: 120_000, zeitMax: 110_000, postfaecher: 1 }).zeit).toBe(0);
  });
  it("KI überlastet / Gmail 503 / Netz = vorübergehend; kaputter Beleg = zählt", () => {
    expect(voruebergehend(Object.assign(new Error("Overloaded"), { status: 529 }))).toBe(true);
    expect(voruebergehend(Object.assign(new Error("rate_limit_error"), { status: 429 }))).toBe(true);
    expect(voruebergehend(new PostfachFehler("sonst", "Gmail (503): Backend Error"))).toBe(true);
    expect(voruebergehend(new TypeError("fetch failed"))).toBe(true);
    expect(voruebergehend(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(true);
    expect(voruebergehend(Object.assign(new Error("Could not process PDF"), { status: 400 }))).toBe(false);
    expect(voruebergehend(new PostfachFehler("sonst", "Gmail (404): Requested entity was not found."))).toBe(false);
    expect(voruebergehend(new Error("Die KI hat die Anfrage abgelehnt."))).toBe(false);
  });
});
