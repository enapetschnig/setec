import { describe, expect, it } from "vitest";
import { anzeigeStatus, faelligText, filtern, aufgabeKunde, istMeine, istUeberfaellig, kundeFilter, meineFilter, sortieren, verlaufText, zaehlen, type AufgabeKurz } from "./aufgaben";

const HEUTE = "2026-11-13";
const a = (id: string, x: Partial<AufgabeKurz> = {}): AufgabeKurz => ({
  id, titel: id, status: "offen", faellig_am: null, prioritaet: "normal", zustaendig: [], projekt_id: null, erstellt_von: null,
  created_at: `2026-11-01T0${id.length % 10}:00:00Z`, ...x,
});

describe("Aufgaben", () => {
  it("beim Kontakt: am Kunden oder an seinen Projekten (18.11.2026)", () => {
    expect(kundeFilter("k1", [])).toBe("kunde_id.eq.k1");
    expect(kundeFilter("k1", ["p1", "p2"])).toBe("kunde_id.eq.k1,projekt_id.in.(p1,p2)");
    // „+ Aufgabe“ beim Kontakt, dann Projekt gewählt: kein (fremder) Kunde mitgespeichert
    expect(aufgabeKunde("p9", "k1")).toBeNull();
    expect(aufgabeKunde("", "k1")).toBe("k1");
    expect(aufgabeKunde(null, null)).toBeNull();
  });
  it("meine: zugeteilt — oder ohne Zuständigen und von mir angelegt (Startseite, 18.11.2026)", () => {
    expect(istMeine(a("x", { zustaendig: ["ich"] }), "ich")).toBe(true);
    expect(istMeine(a("x", { zustaendig: [], erstellt_von: "ich" }), "ich")).toBe(true);
    expect(istMeine(a("x", { zustaendig: ["max"], erstellt_von: "ich" }), "ich")).toBe(false);
    expect(istMeine(a("x", { zustaendig: [], erstellt_von: "max" }), "ich")).toBe(false);
    expect(meineFilter("u1")).toBe("zustaendig.cs.{u1},and(zustaendig.eq.{},erstellt_von.eq.u1)");
  });
  it("überfällig: offen und Termin vor heute — erledigt nie", () => {
    expect(istUeberfaellig(a("x", { faellig_am: "2026-11-12" }), HEUTE)).toBe(true);
    expect(istUeberfaellig(a("x", { faellig_am: HEUTE }), HEUTE)).toBe(false);
    expect(istUeberfaellig(a("x", { faellig_am: "2026-11-01", status: "erledigt" }), HEUTE)).toBe(false);
    expect(anzeigeStatus(a("x", { faellig_am: "2026-11-01", status: "in_arbeit" }), HEUTE)).toBe("ueberfaellig");
    expect(anzeigeStatus(a("x", { status: "in_arbeit" }), HEUTE)).toBe("in_arbeit");
  });
  it("sortiert: überfällig, dann nach Termin (ohne zuletzt), Dringendes vorn, erledigt unten", () => {
    const liste = [
      a("erledigt", { status: "erledigt", faellig_am: "2026-11-01" }),
      a("ohne"),
      a("morgen", { faellig_am: "2026-11-14" }),
      a("morgen-dringend", { faellig_am: "2026-11-14", prioritaet: "hoch" }),
      a("ueber", { faellig_am: "2026-11-10" }),
    ];
    expect(sortieren(liste, HEUTE).map((x) => x.id)).toEqual(["ueber", "morgen-dringend", "morgen", "ohne", "erledigt"]);
  });
  it("filtert nach Status, Person (auch „niemand“) und Projekt; zählt", () => {
    const liste = [
      a("1", { zustaendig: ["max"], faellig_am: "2026-11-01" }),
      a("2", { zustaendig: ["max", "lisa"], projekt_id: "p" }),
      a("3", { status: "erledigt", zustaendig: ["lisa"] }),
      a("4", { faellig_am: HEUTE }),
    ];
    expect(filtern(liste, { status: "offen", person: "max" }, HEUTE).map((x) => x.id)).toEqual(["1", "2"]);
    expect(filtern(liste, { status: "ueberfaellig" }, HEUTE).map((x) => x.id)).toEqual(["1"]);
    expect(filtern(liste, { status: "alle", person: "lisa" }, HEUTE).map((x) => x.id)).toEqual(["2", "3"]);
    expect(filtern(liste, { status: "offen", person: "-" }, HEUTE).map((x) => x.id)).toEqual(["4"]);
    expect(filtern(liste, { status: "alle", projekt: "p" }, HEUTE).map((x) => x.id)).toEqual(["2"]);
    expect(zaehlen(liste, HEUTE)).toEqual({ offen: 3, ueberfaellig: 1, heute: 1, erledigt: 1 });
  });
  it("Fälligkeit als Satz", () => {
    expect(faelligText(null, HEUTE)).toBe("ohne Termin");
    expect(faelligText(HEUTE, HEUTE)).toBe("heute fällig");
    expect(faelligText("2026-11-14", HEUTE)).toBe("morgen fällig");
    expect(faelligText("2026-11-12", HEUTE)).toBe("seit gestern fällig");
    expect(faelligText("2026-11-10", HEUTE)).toBe("seit 3 Tagen fällig");
    expect(faelligText("2026-11-17", HEUTE)).toBe("in 4 Tagen fällig");
    expect(faelligText("2026-12-24", HEUTE)).toBe("fällig 24.12.2026");
  });
  it("Verlauf als Satz", () => {
    const st = (s: string) => ({ erledigt: "Erledigt" } as Record<string, string>)[s] ?? s;
    expect(verlaufText({ art: "status", text: "erledigt" }, st)).toBe("Status: Erledigt");
    expect(verlaufText({ art: "angelegt", text: null }, st)).toBe("hat die Aufgabe angelegt");
    expect(verlaufText({ art: "geaendert", text: "Fällig 19.11.2026 → 24.12.2026" }, st)).toBe("Fällig 19.11.2026 → 24.12.2026");
  });
});
