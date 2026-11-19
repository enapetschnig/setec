import { describe, expect, it } from "vitest";
import { brauchtGeo, geoAnfrage, geoLauf, photonPunkt, serverNichtGefunden } from "../../supabase/functions/_shared/geo.ts";

// Hintergrund-Verortung (Stefan 18.11.2026: Karte leer — importierte Kontakte waren nie gesucht)
type Zeile = { id: string; art: string; strasse: string | null; plz: string | null; ort: string | null; geo_adresse: string | null; updated_at: string; lat?: number | null; lng?: number | null };

function db(zeilen: Zeile[]) {
  const updates: { id: string; werte: Record<string, unknown> }[] = [];
  return {
    updates,
    from: () => ({
      select: () => ({ order: () => ({ range: async (von: number, bis: number) => ({ data: zeilen.slice(von, bis + 1), error: null }) }) }),
      update: (werte: Record<string, unknown>) => ({ eq: (_: string, id: string) => ({ eq: async () => { updates.push({ id, werte }); return { error: null }; } }) }),
    }),
  };
}
const k = (id: string, x: Partial<Zeile> = {}): Zeile => ({ id, art: "kunde", strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg", geo_adresse: null, updated_at: `2026-11-1${id.length}T00:00:00Z`, ...x });
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const feat = (lng: number, lat: number, p: Record<string, unknown>) => ({ geometry: { coordinates: [lng, lat] }, properties: { countrycode: "AT", ...p } });
const photon = (...f: unknown[]) => json({ features: f });

describe("geoLauf", () => {
  it("sucht alle ohne Lage (auch über 1000), Kunden zuerst; gefunden = Punkt, nicht gefunden = gemerkt", async () => {
    const zeilen = [
      ...Array.from({ length: 1001 }, (_, i) => k(`fertig${i}`, { geo_adresse: "Hauptstraße 1, 8650 Kindberg, Österreich" })),
      k("lief", { art: "lieferant", ort: "Graz", plz: "8010" }),
      k("kunde", { ort: "Mürzzuschlag", plz: "8680" }),
      k("nix", { ort: "Nirgendwo", plz: "9999" }),
      k("ohneOrt", { ort: null, plz: null }),
    ];
    const d = db(zeilen);
    const gefragt: string[] = [];
    const r = await geoLauf(d, {
      bisMs: 10_000, pauseMs: 0,
      holen: (async (url: string) => {
        gefragt.push(decodeURIComponent(url));
        const plz = decodeURIComponent(url).match(/ (\d{4}) /)?.[1];
        return url.includes("Nirgendwo") ? photon(feat(15, 47, { postcode: "1010", city: "Wien" })) : photon(feat(15.4, 47.5, { postcode: plz }));
      }) as typeof fetch,
    });
    expect(r).toEqual({ offen: 3, gesucht: 3, gefunden: 2, abbruch: null });
    expect(d.updates.map((u) => u.id)).toEqual(["kunde", "nix", "lief"]); // Kunden zuerst, zuletzt geänderte zuerst
    expect(d.updates.find((u) => u.id === "kunde")!.werte).toEqual({ lat: 47.5, lng: 15.4, geo_adresse: "Hauptstraße 1, 8680 Mürzzuschlag, Österreich" });
    expect(d.updates.find((u) => u.id === "nix")!.werte).toEqual({ lat: null, lng: null, geo_adresse: "?Hauptstraße 1, 9999 Nirgendwo, Österreich" });
    expect(gefragt.every((u) => u.startsWith("https://photon.komoot.io/api/"))).toBe(true);
  });
  it("Photon fand nichts („?“) → Server sucht nicht wieder, die App (Nominatim) schon", async () => {
    const nix = k("nix", { geo_adresse: "?Hauptstraße 1, 8650 Kindberg, Österreich" });
    expect(serverNichtGefunden(nix)).toBe(true);
    expect(brauchtGeo(nix)).toBe(true);
    const d = db([nix]);
    const r = await geoLauf(d, { bisMs: 10_000, pauseMs: 0, holen: (async () => { throw new Error("nicht fragen"); }) as typeof fetch });
    expect(r).toEqual({ offen: 0, gesucht: 0, gefunden: 0, abbruch: null });
    // Adresse geändert → Vermerk gilt nicht mehr, Server sucht wieder
    expect(serverNichtGefunden({ ...nix, strasse: "Hauptstraße 2" })).toBe(false);
  });
  it("Dienst überlastet → aufhören, nichts als „nicht gefunden“ merken", async () => {
    const d = db([k("a"), k("bb")]);
    const r = await geoLauf(d, { bisMs: 10_000, pauseMs: 0, holen: (async () => json({}, 429)) as typeof fetch });
    expect(r.abbruch).toBe("Photon 429");
    expect(d.updates).toEqual([]);
  });
  it("Photon: nur Treffer im richtigen Ort (Nachbarort mit gleicher Straße verworfen)", () => {
    const k = { strasse: "Hauptstraße 1", plz: "8650", ort: "Kindberg" };
    const a = { features: [feat(15.29, 47.44, { postcode: "8605", city: "Kapfenberg" }), feat(15.45, 47.5, { postcode: "8650", city: "Kindberg" })] };
    expect(photonPunkt(a, k)).toEqual({ lat: 47.5, lng: 15.45 });
    expect(photonPunkt({ features: [feat(15.29, 47.44, { postcode: "8605", city: "Kapfenberg" })] }, k)).toBeNull();
    expect(photonPunkt(a, { strasse: "Hauptstraße 1", ort: "Kindberg" })).toEqual({ lat: 47.5, lng: 15.45 });
    expect(photonPunkt({ features: [] }, k)).toBeNull();
    expect(photonPunkt([], k)).toBeNull();
  });
  it("Land aus der PLZ", () => {
    expect(geoAnfrage({ strasse: "Hauptstr. 3", plz: "80331", ort: "München" })).toBe("Hauptstr. 3, 80331 München, Deutschland");
    expect(geoAnfrage({ plz: " 8650 ", ort: "Kindberg " })).toBe("8650 Kindberg, Österreich");
  });
});
