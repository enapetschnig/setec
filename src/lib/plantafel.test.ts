import { describe, expect, it } from "vitest";
import { konflikte, tageZwischen, projektFarbe, textAuf, ueberschneiden, type PlanTermin } from "./plantafel";
import { faelligkeiten } from "./fuhrpark";

const t = (teil: Partial<PlanTermin> & { id: string }): PlanTermin => ({
  datum: "2026-11-10", bis_datum: null, ganztags: false, von: "07:00", bis: "12:00",
  mitarbeiter: [], fahrzeuge: [], team_id: null, ...teil,
});

describe("ueberschneiden", () => {
  it("Vormittag und Nachmittag passen hintereinander", () => {
    expect(ueberschneiden(t({ id: "a" }), t({ id: "b", von: "12:00", bis: "16:00" }), "2026-11-10")).toBe(false);
  });
  it("ganztägig belegt alles", () => {
    expect(ueberschneiden(t({ id: "a", ganztags: true, von: null }), t({ id: "b", von: "14:00", bis: "15:00" }), "2026-11-10")).toBe(true);
  });
  it("mehrtägig: die Uhrzeit gilt an jedem Tag", () => {
    const lang = t({ id: "a", datum: "2026-11-09", bis_datum: "2026-11-12", von: "07:00", bis: "10:00" });
    expect(ueberschneiden(lang, t({ id: "b", von: "13:00", bis: "15:00" }), "2026-11-10")).toBe(false);
    expect(ueberschneiden(lang, t({ id: "b", von: "09:00", bis: "15:00" }), "2026-11-10")).toBe(true);
    // außerhalb der Tage nie
    expect(ueberschneiden(lang, t({ id: "b", datum: "2026-11-13", von: "09:00" }), "2026-11-13")).toBe(false);
  });
});

describe("konflikte", () => {
  it("findet Person doppelt, Bus doppelt und abwesend", () => {
    const liste = [
      t({ id: "a", mitarbeiter: ["max"], fahrzeuge: ["bus1"] }),
      t({ id: "b", von: "10:00", bis: "14:00", mitarbeiter: ["max", "lisa"], fahrzeuge: ["bus1"] }),
      t({ id: "c", von: "13:00", bis: "16:00", mitarbeiter: ["tom"] }),
    ];
    const k = konflikte(liste, ["2026-11-10"], [{ user_id: "tom", von: "2026-11-10", bis: "2026-11-14" }]);
    expect(k.map((x) => `${x.art}:${x.ressource}:${x.termine.sort().join(",")}`).sort()).toEqual([
      "fahrzeug_doppelt:bus1:a,b",
      "person_abwesend:tom:c",
      "person_doppelt:max:a,b",
    ]);
  });
  it("hintereinander ist kein Konflikt", () => {
    const liste = [t({ id: "a", mitarbeiter: ["max"] }), t({ id: "b", von: "12:30", bis: "15:00", mitarbeiter: ["max"] })];
    expect(konflikte(liste, ["2026-11-10"], [])).toEqual([]);
  });
});

describe("tageZwischen", () => {
  it("über den Monatswechsel", () => {
    expect(tageZwischen("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("faelligkeiten", () => {
  const f = { art: "steiger", pickerl_bis: "2026-11-01", service_bis: "2026-11-30", pruefung_bis: "2027-03-01", gemietet: false, aktiv: true };
  it("überfällig und bald, das Früheste zuerst; weit weg bleibt weg", () => {
    expect(faelligkeiten(f, "2026-11-10")).toEqual([
      { was: "Pickerl", datum: "2026-11-01", ueberfaellig: true },
      { was: "Service", datum: "2026-11-30", ueberfaellig: false },
    ]);
  });
  it("gemietet: nichts zu tun", () => {
    expect(faelligkeiten({ ...f, gemietet: true }, "2026-11-10")).toEqual([]);
  });
});

describe("Farben", () => {
  it("aufeinanderfolgende Projekte bekommen verschiedene Farben", () => {
    const f = [1, 2, 3, 4].map((n) => projektFarbe({ id: "x", nummer: `2026-000${n}` }));
    expect(new Set(f).size).toBe(4);
    expect(projektFarbe(null)).toBe("#64748B");
  });
  it("Schrift hell auf dunkel, dunkel auf hell", () => {
    expect(textAuf("#2563EB")).toBe("#ffffff");
    expect(textAuf("#CA8A04")).toBe("#ffffff");
    expect(textAuf("#FDE68A")).toBe("#111827");
  });
});
