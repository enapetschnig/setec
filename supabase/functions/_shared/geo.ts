// Lage (Koordinaten) von Kontakten aus ihrer Adresse — App: Nominatim, Server: Photon (beide OpenStreetMap).
// Gemeinsam für die App (src/components/kontakte/kontaktLogik.ts → Karte, Kontakt
// speichern) und die Edge Function `geo-suchen` (pg_cron jede Minute: alle
// Kontakte ohne Lage, z. B. nach einem Import). Keine Deno-/npm-Importe, damit
// Vite, Vitest, Node und Deno dieselbe Datei nutzen.
//
// `geo_adresse` merkt sich, für welche Anfrage die Koordinaten gelten — erst eine
// geänderte Adresse wird neu gesucht. Nicht gefunden = lat/lng leer, geo_adresse
// gesetzt (nicht jedes Mal neu fragen).

export type MitAdresse = { strasse?: string | null; plz?: string | null; ort?: string | null };

export const adresseText = (k: MitAdresse) =>
  [k.strasse?.trim(), [k.plz?.trim(), k.ort?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * Was wir Nominatim fragen — und womit wir uns merken, wofür die
 * Koordinaten gelten. Ohne Ort oder PLZ fragen wir nicht (nur eine Straße
 * fände irgendeine in Europa). Fünfstellige PLZ = Deutschland, sonst Österreich.
 */
export function geoAnfrage(k: MitAdresse): string | null {
  if (!k.ort?.trim() && !k.plz?.trim()) return null;
  const land = /^\d{5}$/.test(k.plz?.trim() ?? "") ? "Deutschland" : "Österreich";
  return `${adresseText(k)}, ${land}`;
}

/** Noch nicht gesucht oder Adresse seither geändert */
export const brauchtGeo = (k: MitAdresse & { geo_adresse?: string | null }) => {
  const a = geoAnfrage(k);
  return !!a && k.geo_adresse !== a;
};

export const nominatimUrl = (anfrage: string) =>
  `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=at,de,it,si,hu,sk,cz,ch&accept-language=de&q=${encodeURIComponent(anfrage)}`;

/** Antwort von Nominatim → Punkt oder null (nicht gefunden, Unsinn) */
export function nominatimLesen(antwort: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(antwort) || !antwort.length) return null;
  const t = antwort[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(t.lat), lng = Number(t.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// ── Server: Photon ───────────────────────────────────────────────────────
// Nominatim sperrt die Server-Adressen von Supabase (403, 18.11.2026) — der
// Hintergrundlauf fragt deshalb Photon (komoot, OpenStreetMap, ohne Schlüssel;
// dieselbe Quelle wie die Adress-Vorschläge in src/lib/adresse.ts).

export const photonGeoUrl = (k: MitAdresse) =>
  `https://photon.komoot.io/api/?q=${encodeURIComponent(adresseText(k))}&lang=de&limit=5&lat=47.5&lon=15.45&layer=house&layer=street`;

const grund = (x: string) => x.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Antwort von Photon → Punkt, aber nur, wenn der Treffer im richtigen Ort
 * liegt (PLZ gleich, oder ohne PLZ der Ort gleich) — Photon schlägt sonst
 * dieselbe Straße im Nachbarort vor. Ohne Hausnummer zählt auch die Straße.
 */
export function photonPunkt(antwort: unknown, k: MitAdresse): { lat: number; lng: number } | null {
  const features = (antwort as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  const plz = k.plz?.trim() ?? "";
  const ort = grund(k.ort ?? "");
  for (const f of features as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }[]) {
    const p = f?.properties ?? {};
    const fPlz = String(p.postcode ?? "").trim();
    const orte = [p.city, p.town, p.village, p.locality, p.district, p.name].map((x) => grund(String(x ?? ""))).filter(Boolean);
    const passt = plz ? fPlz === plz : !!ort && orte.some((o) => o === ort || o.startsWith(ort) || ort.startsWith(o));
    if (!passt) continue;
    const [lng, lat] = (f.geometry?.coordinates ?? []).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

/** Wer fragt (Nutzungsregeln); höchstens 1 Anfrage je Sekunde */
export const GEO_KENNUNG = "Handwerker-App (handwerkapp.at)";
export const GEO_PAUSE_MS = 1100;

type Kontakt = { id: string; art: string | null; strasse: string | null; plz: string | null; ort: string | null; geo_adresse: string | null; updated_at: string };
// Schmale Schnittstelle statt SupabaseClient — die Datei bleibt ohne Importe
// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

/**
 * Ein Lauf im Hintergrund: Kontakte ohne (aktuelle) Lage nacheinander suchen,
 * Kunden zuerst, zuletzt geänderte zuerst, bis `bisMs` um ist.
 * Dienst überlastet/gesperrt (429/403/5xx/Netz) → Lauf endet, der nächste
 * versucht es wieder; andere Fehler (400) → als „nicht gefunden“ merken.
 */
export async function geoLauf(sb: Db, opt: { bisMs: number; holen?: typeof fetch; pauseMs?: number }) {
  const holen = opt.holen ?? fetch;
  const pause = opt.pauseMs ?? GEO_PAUSE_MS;
  const ende = Date.now() + opt.bisMs;
  const alle: Kontakt[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await sb.from("kunden").select("id, art, strasse, plz, ort, geo_adresse, updated_at")
      .order("id").range(von, von + 999);
    if (error) throw error;
    alle.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const offen = alle.filter(brauchtGeo).sort((a, b) =>
    Number(b.art === "kunde") - Number(a.art === "kunde") || b.updated_at.localeCompare(a.updated_at));
  let gesucht = 0, gefunden = 0, abbruch: string | null = null;
  for (const k of offen) {
    if (Date.now() + pause > ende) break;
    const anfrage = geoAnfrage(k)!;
    if (gesucht > 0) await new Promise((r) => setTimeout(r, pause));
    let antwort: Response;
    try {
      antwort = await holen(photonGeoUrl(k), { headers: { Accept: "application/json", "User-Agent": GEO_KENNUNG } });
    } catch (e) { abbruch = `Netz: ${(e as Error).message}`; break; }
    if (antwort.status === 429 || antwort.status === 403 || antwort.status >= 500) { abbruch = `Photon ${antwort.status}`; break; }
    let punkt: { lat: number; lng: number } | null = null;
    if (antwort.ok) { try { punkt = photonPunkt(await antwort.json(), k); } catch { punkt = null; } }
    gesucht++;
    if (punkt) gefunden++;
    // Nur schreiben, wenn die Adresse inzwischen nicht geändert wurde
    const { error } = await sb.from("kunden").update({ lat: punkt?.lat ?? null, lng: punkt?.lng ?? null, geo_adresse: anfrage })
      .eq("id", k.id).eq("updated_at", k.updated_at);
    if (error) throw error;
  }
  return { offen: offen.length, gesucht, gefunden, abbruch };
}
