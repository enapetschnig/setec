import { describe, expect, it } from "vitest";
import {
  adresseZeile, einsatzAusProjekt, geraetDoppelt, geraeteSpalten, kundenProjekte, MONTAGE_ORANGE, nichtEingeplant, ortVorschlaege, terminArt, terminFarbe, terminWeiter, titelVorschlag,
} from "./kalender";
import { konflikte, projektFarbe, type PlanTermin } from "./plantafel";

describe("Termin-Art und Farbe", () => {
  it("Unbekanntes und leer gilt als Montage", () => {
    expect(terminArt(null)).toBe("montage");
    expect(terminArt("quatsch")).toBe("montage");
    expect(terminArt("service")).toBe("service");
  });
  it("Montage trägt die Projektfarbe, ohne Projekt orange", () => {
    const p = { id: "p", nummer: "2026-0003" };
    expect(terminFarbe("montage", p).stil.backgroundColor).toBe(projektFarbe(p));
    expect(terminFarbe("montage", null).stil.backgroundColor).toBe(MONTAGE_ORANGE);
  });
  it("Besichtigung weiß mit Rand, Service blau, Büro grau — ohne Projektfarbe", () => {
    expect(terminFarbe("besichtigung").klasse).toMatch(/bg-card.*border-2/);
    expect(terminFarbe("service", { id: "p", nummer: "2026-0001" }).klasse).toMatch(/status-blau/);
    expect(terminFarbe("buero").klasse).toMatch(/status-grau/);
    expect(terminFarbe("service").stil).toEqual({});
  });
});

describe("Geräte-Spalten", () => {
  it("nur aktive, Steiger und Maschinen vor Bussen, dann nach Name", () => {
    const liste = geraeteSpalten([
      { id: "1", name: "Bus 2", art: "bus", aktiv: true },
      { id: "2", name: "Steiger B", art: "steiger", aktiv: true },
      { id: "3", name: "Alt", art: "steiger", aktiv: false },
      { id: "4", name: "Kernbohrgerät", art: "maschine", aktiv: true },
      { id: "5", name: "Steiger A", art: "steiger", aktiv: null },
    ]);
    expect(liste.map((f) => f.id)).toEqual(["5", "2", "4", "1"]);
  });
  it("Doppelbelegung eines Geräts nur am eigenen Tag", () => {
    const t = (id: string, von: string, bis: string): PlanTermin =>
      ({ id, datum: "2026-11-18", bis_datum: null, ganztags: false, von, bis, mitarbeiter: [], fahrzeuge: ["steiger"], team_id: null });
    const k = konflikte([t("a", "07:00", "12:00"), t("b", "11:00", "15:00")], ["2026-11-18", "2026-11-19"], []);
    expect([...geraetDoppelt(k, "steiger", "2026-11-18")].sort()).toEqual(["a", "b"]);
    expect(geraetDoppelt(k, "steiger", "2026-11-19").size).toBe(0);
    expect(geraetDoppelt(k, "bus", "2026-11-18").size).toBe(0);
  });
});

describe("Projekte und Orte", () => {
  const projekte = [
    { id: "a", status: "aktiv", kunde_id: "k1", nummer: "2026-0001", name: "PV Dach", strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" },
    { id: "b", status: "angebot", kunde_id: "k1", nummer: "2026-0002", name: "Speicher", strasse: null, plz: null, ort: null },
    { id: "c", status: "aktiv", kunde_id: "k2", nummer: "2026-0003", name: "Zählerkasten", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" },
  ];
  it("noch nicht eingeplant: in Arbeit und ohne Einsatz ab heute", () => {
    expect(nichtEingeplant(projekte, new Set(["c"])).map((p) => p.id)).toEqual(["a"]);
  });
  it("Montage: nur Projekte des Kunden in Arbeit, das gewählte bleibt", () => {
    expect(kundenProjekte(projekte, "k1").map((p) => p.id)).toEqual(["a"]);
    expect(kundenProjekte(projekte, "k1", "b").map((p) => p.id)).toEqual(["a", "b"]);
    expect(kundenProjekte(projekte, "").map((p) => p.id)).toEqual([]);
  });
  it("Orte: Kunde zuerst, Projekte dahinter, ohne Doppelte und Leere", () => {
    const kunde = { strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" };
    expect(ortVorschlaege(kunde, projekte)).toEqual([
      { text: "Hauptstraße 1, 8650 Kindberg", wo: "Kunde" },
      { text: "Feldweg 3, 8643 Allerheiligen", wo: "2026-0001 PV Dach" },
    ]);
    expect(adresseZeile({ ort: "Kindberg" })).toBe("Kindberg");
    expect(adresseZeile(null)).toBe("");
  });
  it("Titel-Vorschlag je Art", () => {
    expect(titelVorschlag("montage", "Huber", "PV Dach")).toBe("PV Dach");
    expect(titelVorschlag("besichtigung", "Huber")).toBe("Besichtigung Huber");
    expect(titelVorschlag("service", null)).toBe("Service");
    expect(titelVorschlag("buero", "Huber")).toBe("");
  });
});

describe("Projekt in den Kalender gezogen", () => {
  const p = { id: "p1", name: "PV Dach", kunde_id: "k1", strasse: "Feldweg 3", plz: "8643", ort: "Allerheiligen" };
  it("Mittwoch auf eine Person: Montage bis Freitag, 7–15:30, mit Kunde", () => {
    expect(einsatzAusProjekt(p, "2026-11-18", { art: "person", id: "max" })).toEqual({
      titel: "PV Dach", art: "montage", projekt_id: "p1", kunde_id: "k1", ort: "Feldweg 3, 8643 Allerheiligen",
      datum: "2026-11-18", bis_datum: "2026-11-20", ganztags: false, von: "07:00", bis: "15:30", mitarbeiter: ["max"], fahrzeuge: [],
    });
  });
  it("Freitag und Samstag: nur der Tag; auf ein Gerät: nur das Gerät", () => {
    expect(einsatzAusProjekt(p, "2026-11-20", { art: "person", id: "max" }).bis_datum).toBeNull();
    const sa = einsatzAusProjekt(p, "2026-11-21", { art: "geraet", id: "steiger" });
    expect(sa).toMatchObject({ bis_datum: null, mitarbeiter: [], fahrzeuge: ["steiger"] });
  });
});

describe("terminWeiter", () => {
  const t = { id: "t1", kunde_id: "k1" as string | null, projekt_id: null as string | null };
  it("Besichtigung → Erstaufnahme zum Termin", () => {
    expect(terminWeiter({ ...t, art: "besichtigung" }, true)).toEqual({ art: "erstaufnahme", text: "Erstaufnahme", pfad: "/erstaufnahmen/neu?termin=t1" });
  });
  it("Service → Regiebericht mit Kunde und Termin, mit Projekt dieses", () => {
    expect(terminWeiter({ ...t, art: "service" }, true)?.pfad).toBe("/regie/neu?kunde=k1&termin=t1");
    expect(terminWeiter({ ...t, art: "service", projekt_id: "p1" }, true)?.pfad).toBe("/regie/neu?projekt=p1&termin=t1");
    expect(terminWeiter({ ...t, art: "service", kunde_id: null }, true)).toBeNull();
  });
  it("Montage/Büro nichts; wer nicht darf, nichts", () => {
    expect(terminWeiter({ ...t, art: "montage" }, true)).toBeNull();
    expect(terminWeiter({ ...t, art: "buero" }, true)).toBeNull();
    expect(terminWeiter({ ...t, art: "besichtigung" }, false)).toBeNull();
    expect(terminWeiter({ ...t, art: "service", projekt_id: "p1" }, true, false)).toBeNull();
    expect(terminWeiter({ ...t, art: "besichtigung" }, true, false)?.art).toBe("erstaufnahme");
  });
});
