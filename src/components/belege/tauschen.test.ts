import { describe, expect, it } from "vitest";
import { artikelPosition, leerePosition, leistungPosition, positionTauschen, tauschbar, type KatalogLeistung } from "./editor";

// Stefan 24.11.2026: Artikel im Angebot in der Zeile gegen einen anderen tauschen (Ziegeldach → Trapezblech)
describe("Position tauschen", () => {
  const alt = { ...artikelPosition({ id: "a1", bezeichnung: "WÜRTH Montagematerial Ziegeldach", langtext: "Dachhaken", einheit: "Stk", vk_preis: 75.33, ek_preis: 46.76, listenpreis: null }, null), menge: "24", variante: "optional" as const };
  const neu = artikelPosition({ id: "a2", bezeichnung: "Montagematerial Trapezblech", langtext: "Kurzschiene", einheit: "Set", vk_preis: 50, ek_preis: 30, listenpreis: null }, null);
  it("Platz, Menge und optional bleiben, alles andere kommt vom neuen Artikel", () => {
    const t = positionTauschen(alt, neu);
    expect(t).toMatchObject({ id: alt.id, menge: "24", variante: "optional", artikel_id: "a2", bezeichnung: "Montagematerial Trapezblech", langtext: "Kurzschiene", einheit: "Set", einzelpreis: "50,00", ek_preis: 30, leistung_id: null });
  });
  it("Artikel → Leistung: Verweis auf den Artikel fällt weg, Preis nach der Menge", () => {
    const l = { id: "l1", kurztext: "Montage", langtext: null, einheit: "Stk", preis: 10, minuten: null, staffel: null, leistung_material: [] } as unknown as KatalogLeistung;
    const t = positionTauschen(alt, leistungPosition(l, null, 60, 24));
    expect(t).toMatchObject({ id: alt.id, menge: "24", art: "leistung", leistung_id: "l1", artikel_id: null, langtext: "" });
  });
  it("nicht bei Titel, Text, Arbeitszeit und Zeilen aus dem Projekt", () => {
    expect(tauschbar(leerePosition("artikel"))).toBe(true);
    expect(tauschbar(leerePosition("leistung"))).toBe(true);
    expect(tauschbar(leerePosition("titel"))).toBe(false);
    expect(tauschbar(leerePosition("text"))).toBe(false);
    expect(tauschbar(leerePosition("arbeit"))).toBe(false);
    expect(tauschbar(leerePosition("artikel", { quelle: { material: ["m1"] } as never }))).toBe(false);
  });
});
