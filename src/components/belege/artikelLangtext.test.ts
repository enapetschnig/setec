import { describe, expect, it, vi } from "vitest";

// importieren.ts lädt den Supabase-Client — im Test nicht nötig
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { artikelPosition, positionZuDb } from "./editor";
import { materialGruppen, materialPositionen, type ImportMaterial } from "./importieren";

// Stefan 21.11.2026: Artikel im Angebot ohne Langtext, obwohl der Artikel einen hat
describe("Artikel → Position: Langtext kommt mit", () => {
  const a = { id: "a1", bezeichnung: "JA SOLAR JAM54D41-455", einheit: "Stk", vk_preis: null, ek_preis: 67.4, listenpreis: 100, aufschlag: 35 };
  it("übernimmt den Langtext des Artikels", () => {
    const p = artikelPosition({ ...a, langtext: "Glas-Glas Modul\nFULLBLACK\n" }, null);
    expect(p.langtext).toBe("Glas-Glas Modul\nFULLBLACK");
    expect(positionZuDb(p, "b1", 0).langtext).toBe("Glas-Glas Modul\nFULLBLACK");
  });
  it("ohne Langtext bleibt er leer", () => {
    expect(artikelPosition(a, null).langtext).toBe("");
    expect(artikelPosition({ ...a, langtext: null }, null).langtext).toBe("");
  });
});

describe("Projekt-Material → Rechnung: Langtext des Artikels kommt mit", () => {
  const b = (id: string, artikel: ImportMaterial["artikel"], artikel_id: string | null, bez: string): ImportMaterial =>
    ({ id, art: "direkt", menge: 2, ek_preis: 10, bezeichnung: bez, einheit: "Stk", artikel_id, artikel, regiebericht_id: null, datum: "2026-11-21" });
  const gruppen = materialGruppen([
    b("m1", { vk_preis: 20, ek_preis: 10, listenpreis: null, langtext: "Hybrid 15 kW\n" }, "a1", "Wechselrichter"),
    b("m2", null, null, "Kleinmaterial"),
  ], null);
  const opt = { materialPauschale: false } as Parameters<typeof materialPositionen>[1];
  it("einzeln: Artikelzeile mit Langtext, freie ohne", () => {
    expect(materialPositionen(gruppen, opt).map((p) => [p.bezeichnung, p.langtext])).toEqual([["Kleinmaterial", ""], ["Wechselrichter", "Hybrid 15 kW"]]);
  });
});
