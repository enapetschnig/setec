import { describe, expect, it } from "vitest";
import { artikelPosition, positionZuDb } from "./editor";

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
