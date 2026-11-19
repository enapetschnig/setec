import { zahl } from "@/lib/format";
import { BESTELL_STATUS, type BestellStatus } from "@/components/bestellung/bestellLogik";
import { FREIGABE_STATUS, type StatusEintrag, type StatusTon } from "@/lib/types";

/**
 * Reine Logik für Kontakte, PV-Anlagendaten und die Karte — ohne Supabase,
 * getestet in kontaktLogik.test.ts.
 */

// ── Art des Kontakts ─────────────────────────────────────────────────────
export type KontaktArt = "kunde" | "lieferant" | "partner";
export const KONTAKT_ART: Record<KontaktArt, StatusEintrag & { mehrzahl: string; neu: string }> = {
  kunde: { ton: "blau", text: "Kunde", mehrzahl: "Kunden", neu: "Neuer Kunde" },
  lieferant: { ton: "lila", text: "Lieferant", mehrzahl: "Lieferanten", neu: "Neuer Lieferant" },
  partner: { ton: "gelb", text: "Partner", mehrzahl: "Partner", neu: "Neuer Partner" },
};
export const kontaktArt = (art: string | null | undefined): KontaktArt =>
  art === "lieferant" || art === "partner" ? art : "kunde";

/** Wie die Datenbank (`lieferant_schluessel`): klein, ohne doppelte Leerzeichen */
export const lieferantSchluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * „Sonepar Österreich GmbH, SONEPAR“ → weitere Schreibweisen als Liste:
 * Komma, Strichpunkt oder Zeilenumbruch trennen; doppelte und der Name
 * selbst fallen weg.
 */
export function namenLesen(text: string, name = ""): string[] {
  const gesehen = new Set([lieferantSchluessel(name)]);
  const liste: string[] = [];
  for (const teil of text.split(/[,;\n]/)) {
    const n = teil.replace(/\s+/g, " ").trim();
    const s = lieferantSchluessel(n);
    if (!s || gesehen.has(s)) continue;
    gesehen.add(s);
    liste.push(n);
  }
  return liste;
}

/** Gehört ein Lieferanten-Text (Beleg) zu diesem Kontakt? */
export const istLieferant = (k: { name: string; namen?: string[] | null }, text: string | null | undefined) => {
  const s = lieferantSchluessel(text);
  return !!s && [k.name, ...(k.namen ?? [])].some((n) => lieferantSchluessel(n) === s);
};

// ── Adresse und Koordinaten ──────────────────────────────────────────────
// Gemeinsam mit der Edge Function `geo-suchen` (Hintergrund-Verortung per pg_cron)
export { adresseText, brauchtGeo, geoAnfrage, nominatimLesen, nominatimUrl, serverNichtGefunden } from "../../../supabase/functions/_shared/geo.ts";

// ── PV-Anlage ────────────────────────────────────────────────────────────
export type Ueberwachung = "fronius" | "solax" | "huawei" | "sma" | "sonstige";
export const UEBERWACHUNG: Record<Ueberwachung, { text: string; portal: string | null }> = {
  fronius: { text: "Fronius Solar.web", portal: "https://www.solarweb.com" },
  solax: { text: "SolaX Cloud", portal: "https://www.solaxcloud.com" },
  huawei: { text: "Huawei FusionSolar", portal: "https://eu5.fusionsolar.huawei.com" },
  sma: { text: "SMA Sunny Portal", portal: "https://ennexos.sunnyportal.com" },
  sonstige: { text: "Sonstige", portal: null },
};

/**
 * Link aus einer Eingabe: „solarweb.com/…“ bekommt https://, nur http(s)
 * ist erlaubt (kein javascript:, kein file:). Leer oder unbrauchbar = null.
 */
export function linkSauber(eingabe: string | null | undefined): string | null {
  const t = (eingabe ?? "").trim();
  if (!t) return null;
  const mit = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(mit);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type PvDaten = {
  art?: string | null;
  pv_kwp?: number | null; module_anzahl?: number | null; module_typ?: string | null; wechselrichter?: string | null;
  speicher_kwh?: number | null; speicher_typ?: string | null;
  einspeisung_prozent?: number | null; einspeisung_kw?: number | null;
  wallbox?: string | null; ueberschuss?: boolean | null; ueberschuss_wie?: string | null;
};

export const hatPv = (a: PvDaten) => a.art === "pv" || Number(a.pv_kwp) > 0;
export const hatSpeicher = (a: PvDaten) => Number(a.speicher_kwh) > 0 || !!a.speicher_typ?.trim();
export const hatWallbox = (a: PvDaten) => !!a.wallbox?.trim() || a.art === "ladestation";

/** „70 %“, „4 kW“, „70 % · max. 4 kW“ — leer = keine Angabe */
export function einspeisungText(a: PvDaten): string | null {
  const t = [
    a.einspeisung_prozent != null ? `${zahl(Number(a.einspeisung_prozent))} %` : null,
    a.einspeisung_kw != null ? `${a.einspeisung_prozent != null ? "max. " : ""}${zahl(Number(a.einspeisung_kw))} kW` : null,
  ].filter(Boolean);
  return t.length ? t.join(" · ") : null;
}

/** Die Eckdaten als kurze Stücke für eine Zeile: „9,8 kWp“, „Speicher 10 kWh“, „Wallbox“ … */
export function pvKurz(a: PvDaten, { ohneEinspeisung = false } = {}): string[] {
  const e = ohneEinspeisung ? null : einspeisungText(a);
  return [
    Number(a.pv_kwp) > 0 ? `${zahl(Number(a.pv_kwp))} kWp` : null,
    Number(a.speicher_kwh) > 0 ? `Speicher ${zahl(Number(a.speicher_kwh))} kWh` : a.speicher_typ?.trim() ? "Speicher" : null,
    a.wallbox?.trim() ? "Wallbox" : null,
    e ? `Einspeisung ${e}` : null,
    a.ueberschuss ? "Überschussregelung" : null,
  ].filter((x): x is string => !!x);
}

/**
 * Ist die Einspeisung begrenzt? Prozent unter 100 oder ein kW-Wert unter der
 * Modulleistung — 0 kW (Nulleinspeisung) zählt mit. Ein kW-Wert ab der
 * Modulleistung begrenzt nichts (wie 100 %); ohne kWp zählt jeder kW-Wert.
 * (Der Odoo-Import trägt die zugesagte Einspeisung in kW ein, auch wenn sie
 * über der Anlagenleistung liegt.)
 */
export function einspeisungBegrenzt(a: PvDaten): boolean {
  if (a.einspeisung_prozent != null && Number(a.einspeisung_prozent) < 100) return true;
  if (a.einspeisung_kw == null) return false;
  const kwp = Number(a.pv_kwp) || 0;
  return kwp <= 0 || Number(a.einspeisung_kw) < kwp;
}

/** Merkmale eines Kontakts über alle seine Anlagen — für Filter und Karte */
export function merkmale(anlagen: PvDaten[]) {
  return {
    pv: anlagen.some(hatPv),
    speicher: anlagen.some(hatSpeicher),
    wallbox: anlagen.some(hatWallbox),
    kwp: anlagen.reduce((s, a) => s + (Number(a.pv_kwp) || 0), 0),
  };
}

// ── Karte ────────────────────────────────────────────────────────────────
export type KartenFilter = "pv" | "speicher" | "wallbox" | "begrenzt" | "laufend";
const KARTEN_FILTER: KartenFilter[] = ["pv", "speicher", "wallbox", "begrenzt", "laufend"];

/** Mindestleistung als Schnellwahl — bei SETEC liegt die Mitte bei gut 10 kWp, ab 5 wären fast alle */
export const KWP_STUFEN = [10, 15, 20, 30];

/** Was auf der Karte gewählt ist: Merkmale und „ab … kWp“ */
export type KartenAuswahl = { filter: Set<KartenFilter>; kwp: number | null };

/** Aus der Adresse `?filter=pv,begrenzt&kwp=15` — Unbekanntes fällt weg */
export function kartenAuswahlLesen(p: URLSearchParams): KartenAuswahl {
  const filter = new Set((p.get("filter") ?? "").split(",").filter((f): f is KartenFilter => KARTEN_FILTER.includes(f as KartenFilter)));
  const kwp = Number(p.get("kwp"));
  return { filter, kwp: Number.isFinite(kwp) && kwp > 0 ? kwp : null };
}

/** Zurück in die Adresse; leer = Parameter weg, alle anderen (ansicht, art, k) bleiben */
export function kartenAuswahlSchreiben(p: URLSearchParams, a: KartenAuswahl): URLSearchParams {
  const neu = new URLSearchParams(p);
  const filter = KARTEN_FILTER.filter((f) => a.filter.has(f));
  if (filter.length) neu.set("filter", filter.join(","));
  else neu.delete("filter");
  if (a.kwp) neu.set("kwp", String(a.kwp));
  else neu.delete("kwp");
  return neu;
}

/**
 * Passt ein Kontakt zur Auswahl? PV, Speicher, Wallbox und „Projekt läuft“
 * über alle seine Anlagen; Leistung und Einspeisebegrenzung an DERSELBEN
 * Anlage („eine 15-kWp-Anlage mit Einspeisebegrenzung“). Wallboxen sind oft
 * eine eigene Anlage — darum nicht alles je Anlage.
 */
export function kontaktPasst(anlagen: PvDaten[], laeuft: boolean, a: KartenAuswahl): boolean {
  const m = merkmale(anlagen);
  if (a.filter.has("pv") && !m.pv) return false;
  if (a.filter.has("speicher") && !m.speicher) return false;
  if (a.filter.has("wallbox") && !m.wallbox) return false;
  if (a.filter.has("laufend") && !laeuft) return false;
  const begrenzt = a.filter.has("begrenzt");
  if (!a.kwp && !begrenzt) return true;
  return anlagen.some((x) => (!a.kwp || Number(x.pv_kwp) >= a.kwp) && (!begrenzt || einspeisungBegrenzt(x)));
}

/**
 * Eine Anlage im Kärtchen am Punkt: Eckdaten (kWp, Speicher, Wallbox …) und
 * die Einspeisung eigens — begrenzt mit „begrenzt auf“, sonst der Wert.
 */
export function anlageKurz(a: PvDaten): { eckdaten: string[]; einspeisung: string | null; begrenzt: boolean } {
  const e = einspeisungText(a);
  const begrenzt = einspeisungBegrenzt(a);
  return {
    eckdaten: pvKurz(a, { ohneEinspeisung: true }),
    einspeisung: e ? (begrenzt ? `Einspeisung begrenzt auf ${e}` : `Einspeisung ${e}`) : null,
    begrenzt,
  };
}

/**
 * Farbe des Punktes: Lieferant/Partner nach Art; Kunde mit laufendem
 * Projekt blau, mit PV grün, sonst grau.
 */
export function punktTon(art: KontaktArt, m: { pv: boolean }, laufend: boolean): StatusTon {
  if (art !== "kunde") return KONTAKT_ART[art].ton;
  if (laufend) return "blau";
  if (m.pv) return "gruen";
  return "grau";
}

export const PUNKT_LEGENDE: { ton: StatusTon; text: string }[] = [
  { ton: "blau", text: "Projekt läuft" },
  { ton: "gruen", text: "Kunde mit PV" },
  { ton: "grau", text: "Kunde" },
  { ton: "lila", text: "Lieferant" },
  { ton: "gelb", text: "Partner" },
];

// ── Belege eines Lieferanten ─────────────────────────────────────────────
export type LieferantBeleg = {
  quelle: string; id: string; nummer: string | null; datum: string; betrag: number | null; status: string;
  projekt_id: string | null; projekt: string | null;
};

/**
 * Summen über die Belege: Rechnungen gesamt und noch nicht bezahlt, Bestellungen.
 * Abgelehnte Rechnungen zählen in keine Summe und keine Zahl (stehen aber in der Liste) —
 * `abgelehnt` sagt, wie viele, für den Hinweis.
 */
export function belegSummen(belege: LieferantBeleg[]) {
  const alleR = belege.filter((b) => b.quelle === "rechnung");
  const r = alleR.filter((b) => b.status !== "abgelehnt");
  const offen = r.filter((b) => b.status !== "bezahlt");
  const be = belege.filter((b) => b.quelle === "bestellung" && b.status !== "storniert");
  const summe = (l: LieferantBeleg[]) => Math.round(l.reduce((s, b) => s + (Number(b.betrag) || 0), 0) * 100) / 100;
  return {
    rechnungen: r.length, rechnungenSumme: summe(r), abgelehnt: alleR.length - r.length,
    offen: offen.length, offenSumme: summe(offen),
    bestellungen: be.length, bestellungenSumme: summe(be),
    lieferscheine: belege.filter((b) => b.quelle === "lieferschein").length,
  };
}

/** Status je Belegart als Pille */
export function belegPille(b: Pick<LieferantBeleg, "quelle" | "status">): StatusEintrag {
  if (b.quelle === "rechnung") {
    // kontakt_belege: bezahlt / offen / freigegeben / abgelehnt — wie der Ablauf der Eingangsrechnung
    const ablauf = b.status === "bezahlt" ? "ueberwiesen" : b.status === "offen" ? "pruefen" : b.status;
    return FREIGABE_STATUS[ablauf] ?? FREIGABE_STATUS.pruefen;
  }
  if (b.quelle === "lieferschein") {
    return b.status === "zugeordnet" ? { ton: "gruen", text: "Rechnung zugeordnet" } : { ton: "gelb", text: "Ohne Rechnung" };
  }
  return BESTELL_STATUS[b.status as BestellStatus] ?? { ton: "grau", text: b.status };
}
