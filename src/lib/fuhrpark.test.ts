import { describe, expect, it } from "vitest";
import { meinFahrzeug } from "./fuhrpark";

describe("meinFahrzeug (Schaden melden von der Startseite)", () => {
  const fahrzeuge = [
    { id: "bus1", lagerort_id: "lager-max", aktiv: true },
    { id: "bus2", lagerort_id: null, aktiv: true },
    { id: "alt", lagerort_id: "lager-tom", aktiv: false },
  ];
  const lagerorte = [
    { id: "lager-max", user_id: "max" },
    { id: "lager-tom", user_id: "tom" },
    { id: "haupt", user_id: null },
  ];
  const teams = [{ fahrzeug_id: "bus2", leiter_id: "lisa", mitglieder: ["sepp"], aktiv: true }];

  it("sein Bus über den Lagerort im Bus", () => {
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, "max")).toBe("bus1");
  });
  it("sonst der Stamm-Bus seines Teams — als Leitung oder Mitglied", () => {
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, "lisa")).toBe("bus2");
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, "sepp")).toBe("bus2");
  });
  it("stillgelegte Fahrzeuge und inaktive Teams zählen nicht", () => {
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, "tom")).toBeNull();
    expect(meinFahrzeug(fahrzeuge, lagerorte, [{ ...teams[0], aktiv: false }], "sepp")).toBeNull();
  });
  it("ohne Treffer oder ohne Konto: keins — er wählt selbst", () => {
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, "fremd")).toBeNull();
    expect(meinFahrzeug(fahrzeuge, lagerorte, teams, null)).toBeNull();
  });
});
