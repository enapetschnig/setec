/**
 * Adress-Vorschläge beim Tippen (Kunde, Projekt-Baustelle, Anlage) — damit
 * Straße, Hausnummer, PLZ und Ort so im Kontakt stehen, wie das Navi sie
 * findet. Quelle: Photon (komoot, OpenStreetMap-Adressen), kostenlos, ohne
 * Schlüssel. Nur Österreich; Treffer rund um den Betrieb (Mürztal) zuerst.
 */

export type AdressVorschlag = {
  strasse: string;
  plz: string;
  ort: string;
  /** zusätzliche Zeile in der Liste, z. B. Ortsteil */
  zusatz: string;
  lat: number | null;
  lng: number | null;
};

/** Rund um Kindberg-Mürzhofen — nur Reihenfolge, kein Filter */
const NAEHE = { lat: 47.5, lon: 15.45 };

export const ADRESS_MIN_ZEICHEN = 4;

export function photonUrl(anfrage: string): string {
  const q = encodeURIComponent(anfrage.trim());
  return `https://photon.komoot.io/api/?q=${q}&lang=de&limit=8&lat=${NAEHE.lat}&lon=${NAEHE.lon}&layer=house&layer=street`;
}

const t = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");

/** Hausnummer am Ende der Eingabe („Hauptstraße 10a“ → „10a“) */
export function hausnummerAus(eingabe: string): string {
  const m = eingabe.trim().match(/\s(\d+[a-zA-Z]?(?:\s*[/-]\s*\d+[a-zA-Z]?)*)$/);
  return m ? m[1].replace(/\s+/g, "") : "";
}

const grund = (x: string) => x.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
const woerter = (x: string) => grund(x).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Passt der Vorschlag zu allem, was getippt wurde? Jedes getippte Wort (ohne
 * Hausnummern) muss mit seinen ersten 4 Buchstaben in Straße, PLZ, Ort oder
 * Ortsteil vorkommen — „Hauptstr 10 Kindb“ passt zu Hauptstraße 10, Kindberg,
 * Tippfehler weiter hinten im Wort („Kindbreg“) auch. Photon schlägt sonst
 * dieselbe Straße im Nachbarort vor, wenn es sie im getippten Ort nicht gibt —
 * genau die Verwechslung, die das Navi in den falschen Ort schickt.
 */
export function passtZurEingabe(a: Pick<AdressVorschlag, "strasse" | "plz" | "ort" | "zusatz">, eingabe: string): boolean {
  const ziel = woerter(`${a.strasse} ${a.plz} ${a.ort} ${a.zusatz}`);
  return woerter(eingabe)
    .filter((w) => /[a-z]/.test(w) && w.length >= 3)
    .every((w) => ziel.some((z) => z.startsWith(w.slice(0, 4))));
}

/**
 * Antwort von Photon → Vorschläge. Nur Österreich, nur mit Straße oder
 * Hausnummer und PLZ; doppelte fallen weg. Hat der Treffer keine Hausnummer,
 * bleibt die getippte stehen.
 */
export function photonLesen(antwort: unknown, eingabe = ""): AdressVorschlag[] {
  const features = (antwort as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const getippt = hausnummerAus(eingabe);
  const gesehen = new Set<string>();
  const liste: AdressVorschlag[] = [];
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
    if (t(p.countrycode).toUpperCase() !== "AT") continue;
    const typ = t(p.type);
    // Straße: bei Hausnummern in „street“, bei Straßen-Treffern im Namen
    const strassenName = t(p.street) || (typ === "street" ? t(p.name) : "");
    if (!strassenName) continue;
    const nr = t(p.housenumber) || getippt;
    const plz = t(p.postcode);
    const ort = t(p.city) || t(p.town) || t(p.village) || t(p.locality);
    if (!plz || !ort) continue;
    const strasse = nr ? `${strassenName} ${nr}` : strassenName;
    const teil = t(p.district) || t(p.locality);
    const zusatz = teil && !/^katastralgemeinde/i.test(teil) && teil !== ort ? teil : "";
    if (eingabe && !passtZurEingabe({ strasse, plz, ort, zusatz }, eingabe)) continue;
    const schluessel = `${strasse}|${plz}|${ort}`.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const koord = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
    const [lng, lat] = Array.isArray(koord) ? koord.map(Number) : [NaN, NaN];
    liste.push({
      strasse, plz, ort, zusatz,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    });
  }
  return liste.slice(0, 6);
}

/** Was Photon gefragt wird: die getippte Straße (gern samt Ort, „Hauptstraße 10 Kindberg“) */
export function adressAnfrage(strasse: string): string {
  const s = strasse.trim().replace(/\s+/g, " ");
  return s.length >= ADRESS_MIN_ZEICHEN ? s : "";
}
