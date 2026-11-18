import { projektFarbe, textAuf, type Konflikt } from "@/lib/plantafel";
import { tageDazu, isoZuDatum } from "@/lib/format";
import type { FahrzeugArt } from "@/lib/types";

/**
 * Kalender — der einzige Ort zum Einteilen (früher Plantafel/Wochenplan).
 * Termin-Arten, ihre Farben, die Geräte-Spalten und was beim Hereinziehen
 * eines Projekts entsteht. Ohne Datenbank, getestet in kalender.test.ts.
 */

export type TerminArt = "montage" | "besichtigung" | "service" | "buero";

export const TERMIN_ARTEN: { wert: TerminArt; text: string; hinweis: string }[] = [
  { wert: "montage", text: "Montage", hinweis: "Projekt in Arbeit" },
  { wert: "besichtigung", text: "Besichtigung", hinweis: "beim Kunden, vor dem Angebot" },
  { wert: "service", text: "Service", hinweis: "Kundendienst, ohne Projekt" },
  { wert: "buero", text: "Büro", hinweis: "eigener Termin, ohne Kunde" },
];

/** Art aus der Datenbank — Unbekanntes gilt als Montage */
export const terminArt = (a: string | null | undefined): TerminArt =>
  TERMIN_ARTEN.some((x) => x.wert === a) ? (a as TerminArt) : "montage";

export const artText = (a: string | null | undefined) => TERMIN_ARTEN.find((x) => x.wert === terminArt(a))!.text;

/** Montage ohne Projekt: orange wie im alten Terminplaner */
export const MONTAGE_ORANGE = "#EA580C";

/**
 * Farbe eines Termins im Kalender: Montage = Farbe des Projekts (ohne Projekt
 * orange), Besichtigung weiß mit Rand, Service blau, Büro grau.
 * `klasse` für Tailwind-Flächen, `stil` für die Projektfarbe, `streifen` für
 * den Farbrand in Listen.
 */
export function terminFarbe(
  art: string | null | undefined,
  projekt?: { id: string; nummer?: string | null } | null,
): { klasse: string; stil: { backgroundColor?: string; color?: string }; streifen: string } {
  switch (terminArt(art)) {
    case "besichtigung":
      return { klasse: "bg-card text-foreground border-2 border-foreground/45", stil: {}, streifen: "#94A3B8" };
    case "service":
      return { klasse: "bg-status-blau text-status-blau-fg border border-status-blau-fg/30", stil: {}, streifen: "#3B82F6" };
    case "buero":
      return { klasse: "bg-status-grau text-status-grau-fg border border-status-grau-fg/30", stil: {}, streifen: "#A3A3A3" };
    default: {
      const f = projekt ? projektFarbe(projekt) : MONTAGE_ORANGE;
      return { klasse: "", stil: { backgroundColor: f, color: textAuf(f) }, streifen: f };
    }
  }
}

/** Reihenfolge der Geräte-Spalten: was man selten hat und leicht doppelt vergibt, zuerst */
export const GERAETE_FOLGE: FahrzeugArt[] = ["steiger", "maschine", "anhaenger", "messgeraet", "bus", "pkw"];

/** Geräte & Fahrzeuge als Spalten: nur aktive, nach Art, dann Name */
export function geraeteSpalten<F extends { id: string; name: string; art: string; aktiv?: boolean | null }>(liste: F[]): F[] {
  const rang = (a: string) => { const i = GERAETE_FOLGE.indexOf(a as FahrzeugArt); return i < 0 ? GERAETE_FOLGE.length : i; };
  return liste.filter((f) => f.aktiv !== false).sort((a, b) => rang(a.art) - rang(b.art) || a.name.localeCompare(b.name, "de"));
}

/** Termine eines Geräts, die an diesem Tag doppelt belegt sind (aus `konflikte`) */
export function geraetDoppelt(liste: Konflikt[], geraetId: string, tag: string): Set<string> {
  return new Set(liste.filter((k) => k.art === "fahrzeug_doppelt" && k.ressource === geraetId && k.tag === tag).flatMap((k) => k.termine));
}

/** „Noch nicht eingeplant“: Projekte In Arbeit ohne Einsatz ab heute */
export function nichtEingeplant<P extends { id: string; status: string }>(projekte: P[], eingeplant: Set<string>): P[] {
  return projekte.filter((p) => p.status === "aktiv" && !eingeplant.has(p.id));
}

/** Montage: nur Projekte dieses Kunden „In Arbeit“ (das schon gewählte bleibt stehen) */
export function kundenProjekte<P extends { id: string; status: string; kunde_id: string | null }>(projekte: P[], kundeId: string, behalten = ""): P[] {
  if (!kundeId) return projekte.filter((p) => p.id === behalten);
  return projekte.filter((p) => p.id === behalten || (p.kunde_id === kundeId && p.status === "aktiv"));
}

type MitAdresse = { strasse?: string | null; plz?: string | null; ort?: string | null };

/** „Hauptstraße 1, 8643 Kindberg“ — leer, wenn nichts da ist */
export const adresseZeile = (x: MitAdresse | null | undefined) =>
  x ? [x.strasse?.trim(), [x.plz?.trim(), x.ort?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

/**
 * Orte für Besichtigung und Service: die Adresse des Kunden und die seiner
 * Projekte, ohne Doppelte und ohne Leere.
 */
export function ortVorschlaege(
  kunde: MitAdresse | null | undefined,
  projekte: (MitAdresse & { nummer?: string | null; name?: string | null })[],
): { text: string; wo: string }[] {
  const liste: { text: string; wo: string }[] = [];
  const dazu = (text: string, wo: string) => { if (text && !liste.some((x) => x.text.toLowerCase() === text.toLowerCase())) liste.push({ text, wo }); };
  dazu(adresseZeile(kunde), "Kunde");
  for (const p of projekte) dazu(adresseZeile(p), [p.nummer, p.name].filter(Boolean).join(" "));
  return liste;
}

/** Titel, wenn noch keiner getippt wurde */
export function titelVorschlag(art: TerminArt, kunde?: string | null, projekt?: string | null): string {
  if (art === "montage") return projekt?.trim() || (kunde ? `Montage ${kunde}` : "");
  if (art === "besichtigung") return kunde ? `Besichtigung ${kunde}` : "Besichtigung";
  if (art === "service") return kunde ? `Service ${kunde}` : "Service";
  return "";
}

/**
 * Projekt aus „Noch nicht eingeplant“ auf eine Spalte gezogen: Montage an
 * diesem Tag bis Freitag (am Wochenende nur der Tag), 7:00–15:30, mit der
 * Person bzw. dem Gerät der Spalte.
 */
export function einsatzAusProjekt(
  p: { id: string; name: string; kunde_id: string | null } & MitAdresse,
  tag: string,
  ziel: { art: "person" | "geraet"; id: string },
) {
  const wt = (isoZuDatum(tag).getDay() + 6) % 7;
  const bis = wt < 4 ? tageDazu(tag, 4 - wt) : tag;
  return {
    titel: p.name,
    art: "montage" as const,
    projekt_id: p.id,
    kunde_id: p.kunde_id,
    ort: adresseZeile(p) || null,
    datum: tag,
    bis_datum: bis > tag ? bis : null,
    ganztags: false,
    von: "07:00",
    bis: "15:30",
    mitarbeiter: ziel.art === "person" ? [ziel.id] : [],
    fahrzeuge: ziel.art === "geraet" ? [ziel.id] : [],
  };
}

/**
 * Was am Termin als Nächstes zu tun ist (Knopf im Kalender und am Handy):
 * Besichtigung → Erstaufnahme (die zugehörige oder eine neue mit Kunde/Ort),
 * Service → Regiebericht (mit Projekt: dieses, sonst Kunde + Termin ohne Projekt).
 * Nur für den Chef und wer eingeteilt ist (`darf`); den Regiebericht nur mit
 * dem Recht „Regieberichte schreiben“ (`darfRegie`, Route /regie/neu).
 */
export function terminWeiter(
  t: { id: string; art: string | null; kunde_id: string | null; projekt_id: string | null },
  darf: boolean,
  darfRegie = true,
): { art: "erstaufnahme" | "regie"; text: string; pfad: string } | null {
  if (!darf) return null;
  const art = terminArt(t.art);
  if (art === "besichtigung") return { art: "erstaufnahme", text: "Erstaufnahme", pfad: `/erstaufnahmen/neu?termin=${t.id}` };
  if (art === "service" && darfRegie) {
    if (t.projekt_id) return { art: "regie", text: "Regiebericht", pfad: `/regie/neu?projekt=${t.projekt_id}&termin=${t.id}` };
    if (t.kunde_id) return { art: "regie", text: "Regiebericht", pfad: `/regie/neu?kunde=${t.kunde_id}&termin=${t.id}` };
  }
  return null;
}
