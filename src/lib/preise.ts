import type { Artikel, Firma, Leistung, Projekt } from "@/lib/types";

/**
 * Die eine Stelle, an der Preise entstehen. Angebot, Rechnung, Regiebericht
 * und Projektmaterial rechnen alle hierüber — sonst stehen im Angebot andere
 * Preise als später in der Rechnung.
 */

/**
 * Auf Cent runden wie Postgres `round(…, 2)` beim Fertigstellen: ab einem
 * halben Cent weg von null — auch negativ, sonst weicht eine Stornorechnung
 * um einen Cent von der Rechnung ab. toPrecision schluckt Gleitkomma-Reste
 * (1,5 × 0,33 = 0,49499999… ist genau 0,495).
 */
export const runden2 = (n: number) => {
  const x = Number(n) || 0;
  return (Math.sign(x) * Math.round(Number((Math.abs(x) * 100).toPrecision(12)))) / 100 || 0;
};

/** Stundensatz: am Projekt hinterlegt (nur über 0 € zählt), sonst der des Betriebs. */
export function stundensatzFuer(projekt: Pick<Projekt, "stundensatz"> | null | undefined, firma: Pick<Firma, "stundensatz"> | null | undefined): number {
  const eigener = Number(projekt?.stundensatz);
  return eigener > 0 ? eigener : Number(firma?.stundensatz ?? 0);
}

/**
 * Was ein Artikel zum Preis braucht. `aufschlag` = eigener Aufschlag des
 * Artikels (leer = der des Betriebs) — jede Abfrage, die Preise zeigt, holt
 * ihn mit, sonst rechnete sie mit dem Aufschlag des Betriebs.
 */
export type PreisArtikel = Pick<Artikel, "vk_preis" | "ek_preis" | "listenpreis"> & { aufschlag?: number | null };

/** Verkaufspreis je Einheit: fester VK, sonst EK + Aufschlag (Artikel, sonst Betrieb), sonst Listenpreis. */
export function artikelVk(
  a: PreisArtikel | null | undefined,
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
): number {
  if (!a) return 0;
  if (a.vk_preis != null) return runden2(Number(a.vk_preis));
  if (a.ek_preis != null) return runden2(Number(a.ek_preis) * (1 + aufschlagFuer(a, firma) / 100));
  if (a.listenpreis != null) return runden2(Number(a.listenpreis));
  return 0;
}

/** Aufschlag in %, der für diesen Artikel gilt: eigener, sonst der des Betriebs. */
export function aufschlagFuer(a: { aufschlag?: number | null } | null | undefined, firma: Pick<Firma, "material_aufschlag"> | null | undefined): number {
  return a?.aufschlag != null ? Number(a.aufschlag) : Number(firma?.material_aufschlag ?? 0);
}

export type VkHerkunft = { art: "fest" | "artikel" | "standard" | "liste" | "keiner"; text: string };

/** Woher der VK kommt — für die Anzeige „VK fest“ / „Aufschlag 35 % (Artikel)“ / „Standard“. */
export function vkHerkunft(a: PreisArtikel, firma: Pick<Firma, "material_aufschlag"> | null | undefined): VkHerkunft {
  const p = (n: number) => String(runden2(n)).replace(".", ",");
  if (a.vk_preis != null) return { art: "fest", text: "VK fest" };
  if (a.ek_preis != null) {
    return a.aufschlag != null
      ? { art: "artikel", text: `Aufschlag ${p(Number(a.aufschlag))} % (Artikel)` }
      : { art: "standard", text: `Standard · ${p(Number(firma?.material_aufschlag ?? 0))} %` };
  }
  if (a.listenpreis != null) return { art: "liste", text: "Listenpreis" };
  return { art: "keiner", text: "ohne Preis" };
}

/** Verkaufswert einer Materialbuchung je Einheit: Artikelpreis, bei freiem Text EK + Aufschlag. */
export function buchungVk(
  m: { ek_preis: number | null; artikel: PreisArtikel | null },
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
): number {
  if (m.artikel) return artikelVk(m.artikel, firma);
  return runden2(Number(m.ek_preis ?? 0) * (1 + Number(firma?.material_aufschlag ?? 0) / 100));
}

export type LeistungsMaterial = { menge: number; artikel: PreisArtikel | null };

/** Eine Stufe der Staffel: ab dieser Menge gilt diese Montagezeit je Einheit. */
export type StaffelStufe = { ab: number; minuten: number };

/** Staffel aus der Datenbank lesen — nur gültige Stufen, nach „ab“ sortiert, je „ab“ eine. */
export function staffelLesen(j: unknown): StaffelStufe[] {
  if (!Array.isArray(j)) return [];
  const stufen = new Map<number, number>();
  for (const x of j) {
    if (!x || typeof x !== "object") continue;
    const ab = Number((x as Record<string, unknown>).ab);
    const minuten = Number((x as Record<string, unknown>).minuten);
    if (Number.isFinite(ab) && ab > 0 && Number.isFinite(minuten) && minuten >= 0) stufen.set(ab, minuten);
  }
  return [...stufen.entries()].sort((a, b) => a[0] - b[0]).map(([ab, minuten]) => ({ ab, minuten }));
}

/**
 * Montagezeit je Einheit für diese Menge: die Stufe mit dem größten „ab“,
 * das die Menge erreicht. Ohne Staffel, ohne Menge oder unter der ersten
 * Stufe gilt die Grundzeit `minuten`. Die ganze Menge rechnet mit der Zeit
 * ihrer Stufe (12 Module → alle 12 mit der Zeit „ab 11“).
 */
export function staffelMinuten(l: { minuten: number | null; staffel?: unknown }, menge?: number | null): number {
  let min = Number(l.minuten) || 0;
  if (menge == null) return min;
  for (const s of staffelLesen(l.staffel)) if (menge >= s.ab) min = s.minuten;
  return min;
}

export const hatStaffel = (l: { staffel?: unknown } | null | undefined) => staffelLesen(l?.staffel).length > 0;

/**
 * Was eine Leistung kostet: fester Preis oder Material-VK + Montagezeit ×
 * Stundensatz. Mit `menge` gilt die Montagezeit aus der Staffel.
 */
export function leistungPreis(
  l: Pick<Leistung, "preis" | "minuten"> & { staffel?: unknown },
  material: LeistungsMaterial[],
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined,
  stundensatz = Number(firma?.stundensatz ?? 0),
  menge?: number | null,
): number {
  if (l.preis != null) return runden2(Number(l.preis));
  return runden2(leistungMaterialVk(material, firma) + (staffelMinuten(l, menge) / 60) * stundensatz);
}

export function leistungMaterialVk(material: LeistungsMaterial[], firma: Pick<Firma, "material_aufschlag"> | null | undefined): number {
  return runden2(material.reduce((s, m) => s + artikelVk(m.artikel, firma) * Number(m.menge), 0));
}

export function leistungMaterialEk(material: LeistungsMaterial[]): number {
  return runden2(material.reduce((s, m) => s + Number(m.artikel?.ek_preis ?? 0) * Number(m.menge), 0));
}

/** Netto, USt und Brutto eines Belegs (Titel- und Textzeilen zählen nicht). */
export function belegSummen(
  positionen: { art: string; menge: number; einzelpreis: number }[],
  ustSatz: number,
  ohneUst: boolean,
) {
  const netto = runden2(
    positionen
      .filter((p) => p.art !== "titel" && p.art !== "text")
      .reduce((s, p) => s + runden2(Number(p.menge) * Number(p.einzelpreis)), 0),
  );
  const ust = ohneUst ? 0 : runden2((netto * Number(ustSatz)) / 100);
  return { netto, ust, brutto: runden2(netto + ust) };
}
