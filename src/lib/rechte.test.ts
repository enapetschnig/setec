import { describe, expect, it } from "vitest";
import { darfRecht, istVollerChef, rollenName, type RollenZeile } from "./rechte";

const rolle = (id: string, schluessel: string | null, basis: string, rechte: string[], name = id): RollenZeile =>
  ({ id, schluessel, name, basis, rechte, reihenfolge: 0, created_at: "" });
const ROLLEN = [
  rolle("c", "chef", "chef", []),
  rolle("b", "buero", "chef", ["rechnungen", "eingang", "regie"], "Büro"),
  rolle("m", "monteur", "monteur", ["projekte_anlegen", "stunden_andere", "regie", "material"], "Monteur"),
  rolle("l", "lehrling", "monteur", ["regie", "material"], "Lehrling"),
];

describe("Rollen & Rechte", () => {
  it("bestehende Konten ohne Rolle: Chef alles, Monteur wie bisher", () => {
    const chef = { rolle: "chef", rolle_id: null, aktiv: true };
    const monteur = { rolle: "monteur", rolle_id: null, aktiv: true };
    expect(darfRecht(chef, ROLLEN, "buchhaltung")).toBe(true);
    expect(istVollerChef(chef, ROLLEN)).toBe(true);
    expect(darfRecht(monteur, ROLLEN, "projekte_anlegen")).toBe(true);
    expect(darfRecht(monteur, ROLLEN, "rechnungen")).toBe(false);
    expect(rollenName(monteur, ROLLEN)).toBe("Monteur");
  });
  it("Büro ohne Buchhaltung, nie voller Chef", () => {
    const melanie = { rolle: "chef", rolle_id: "b", aktiv: true };
    expect(darfRecht(melanie, ROLLEN, "rechnungen")).toBe(true);
    expect(darfRecht(melanie, ROLLEN, "buchhaltung")).toBe(false);
    expect(istVollerChef(melanie, ROLLEN)).toBe(false);
  });
  it("Lehrling: kein Projekt anlegen, keine Stunden für andere", () => {
    const l = { rolle: "monteur", rolle_id: "l", aktiv: true };
    expect(darfRecht(l, ROLLEN, "regie")).toBe(true);
    expect(darfRecht(l, ROLLEN, "projekte_anlegen")).toBe(false);
    expect(darfRecht(l, ROLLEN, "stunden_andere")).toBe(false);
  });
  it("Baustellen-Rolle bekommt nie Büro-Bereiche, gesperrt nie etwas", () => {
    const x = { rolle: "monteur", rolle_id: "x", aktiv: true };
    const r = [...ROLLEN, rolle("x", null, "monteur", ["rechnungen"])];
    expect(darfRecht(x, r, "rechnungen")).toBe(false);
    expect(darfRecht({ rolle: "chef", rolle_id: null, aktiv: false }, ROLLEN, "regie")).toBe(false);
  });
  it("Rollen noch nicht geladen: Baustelle ja, Büro-Bereiche nur ohne eigene Rolle", () => {
    expect(darfRecht({ rolle: "chef", rolle_id: "b", aktiv: true }, [], "buchhaltung")).toBe(false);
    expect(darfRecht({ rolle: "chef", rolle_id: "b", aktiv: true }, [], "regie")).toBe(true);
    expect(darfRecht({ rolle: "chef", rolle_id: null, aktiv: true }, [], "buchhaltung")).toBe(true);
  });
});
