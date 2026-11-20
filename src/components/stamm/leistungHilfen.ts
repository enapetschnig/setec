import { leistungMaterialEk, leistungMaterialVk, leistungPreis, runden2, staffelLesen, type LeistungsMaterial, type StaffelStufe } from "@/lib/preise";
import type { Firma, Leistung } from "@/lib/types";

/** Reine Hilfen für den Leistungskatalog — ohne Oberfläche, damit testbar. */

type Ordnung = Pick<Leistung, "id" | "kategorie" | "nummer" | "reihenfolge" | "kurztext">;

const gleicheKategorie = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Nächste Nummer in der Kategorie: „01.09“ → „01.10“. Neue Kategorie in
 * einem Katalog mit „01.01“-Nummern: nächste Hauptnummer („09.01“).
 * Leer, wenn sich nichts ableiten lässt.
 */
export function naechsteNummer(liste: Ordnung[], kategorie: string): string {
  if (!kategorie.trim()) return "";
  const inKategorie = liste.filter((l) => gleicheKategorie(l.kategorie, kategorie) && l.nummer?.trim());
  let best: { vorne: string; n: number; breite: number } | null = null;
  for (const l of inKategorie) {
    const m = l.nummer!.trim().match(/^(.*?)(\d+)$/);
    if (m && (!best || Number(m[2]) > best.n)) best = { vorne: m[1], n: Number(m[2]), breite: m[2].length };
  }
  if (best) return best.vorne + String(best.n + 1).padStart(best.breite, "0");
  if (inKategorie.length) return "";

  let haupt = -1;
  let breite = 2;
  let unterBreite = 2;
  for (const l of liste) {
    const m = l.nummer?.trim().match(/^(\d+)\.(\d+)$/);
    if (m && Number(m[1]) > haupt) {
      haupt = Number(m[1]);
      breite = m[1].length;
      unterBreite = m[2].length;
    }
  }
  return haupt >= 0 ? `${String(haupt + 1).padStart(breite, "0")}.${"1".padStart(unterBreite, "0")}` : "";
}

/**
 * Reihenfolge für eine neue (oder umgezogene) Leistung: ans Ende ihrer
 * Kategorie; eine neue Kategorie bekommt den nächsten Hunderter, damit sie
 * hinten im Katalog steht und Platz zum Einsortieren bleibt.
 */
export function naechsteReihenfolge(liste: Ordnung[], kategorie: string, ohneId?: string): number {
  const andere = liste.filter((l) => l.id !== ohneId);
  const inKategorie = andere.filter((l) => gleicheKategorie(l.kategorie, kategorie));
  if (inKategorie.length) return Math.max(...inKategorie.map((l) => Number(l.reihenfolge) || 0)) + 1;
  const max = andere.reduce((m, l) => Math.max(m, Number(l.reihenfolge) || 0), 0);
  return (Math.floor(max / 100) + 1) * 100 + 1;
}

const nummernVergleich = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "", "de", { numeric: true });

/** Nach Kategorie gruppiert; Kategorien in der Reihenfolge ihrer ersten Leistung. */
export function nachKategorie<T extends Ordnung>(liste: T[]): { kategorie: string; leistungen: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const l of liste) {
    const k = l.kategorie?.trim() || "Allgemein";
    const g = gruppen.get(k);
    if (g) g.push(l);
    else gruppen.set(k, [l]);
  }
  const sortiert = (g: T[]) => [...g].sort((a, b) =>
    (Number(a.reihenfolge) || 0) - (Number(b.reihenfolge) || 0) || nummernVergleich(a.nummer, b.nummer) || a.kurztext.localeCompare(b.kurztext, "de"));
  return [...gruppen.entries()]
    .map(([kategorie, g]) => ({ kategorie, leistungen: sortiert(g) }))
    .sort((a, b) => (Number(a.leistungen[0].reihenfolge) || 0) - (Number(b.leistungen[0].reihenfolge) || 0) || a.kategorie.localeCompare(b.kategorie, "de"));
}

/** Alle Wörter müssen vorkommen — in Nummer, Kurztext, Langtext, Suchwörtern oder Kategorie. */
export function passtZuSuche(
  l: Pick<Leistung, "nummer" | "kurztext" | "langtext" | "suchwoerter" | "kategorie">,
  suchtext: string,
): boolean {
  const woerter = suchtext.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = [l.nummer, l.kurztext, l.langtext, l.suchwoerter, l.kategorie].filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

export interface Kalkulation {
  materialEk: number;
  materialVk: number;
  /** Montagezeit × Stundensatz (was der Kunde für die Arbeit zahlt) */
  lohn: number;
  stundensatz: number;
  /** Montagezeit × Lohnkosten je Stunde aus den Einstellungen (was die Arbeit den Betrieb kostet) */
  lohnkosten: number;
  /** Lohnkosten je Stunde (`firma.kostensatz`); null = in den Einstellungen nicht eingetragen */
  kostensatz: number | null;
  /** Preis ohne festen Preis (Material-VK + Lohn) */
  berechnet: number;
  /** Was die Leistung kostet — fester Preis, sonst berechnet */
  preis: number;
  /** Preis − Material-EK − Lohnkosten: was dem Betrieb bleibt */
  rohertrag: number;
  rohertragProzent: number | null;
  /** (Preis − Material-EK) je Arbeitsstunde — Vergleich mit dem Stundensatz */
  jeStunde: number | null;
}

/**
 * Kalkulation einer Leistung; Preise kommen aus lib/preise.ts. Der Rohertrag
 * zieht neben dem Material-Einkauf auch die Lohnkosten ab (Stefan 20.11.2026:
 * vorher zeigte eine reine Montage-Leistung 100 % Rohertrag).
 */
export function kalkulieren(
  l: { preis: number | null; minuten: number },
  material: LeistungsMaterial[],
  firma: (Pick<Firma, "material_aufschlag" | "stundensatz"> & { kostensatz?: number | null }) | null | undefined,
): Kalkulation {
  const minuten = Number(l.minuten) || 0;
  const stundensatz = Number(firma?.stundensatz ?? 0);
  const kostensatz = firma?.kostensatz != null && Number(firma.kostensatz) > 0 ? Number(firma.kostensatz) : null;
  const materialEk = leistungMaterialEk(material);
  const preis = leistungPreis({ preis: l.preis, minuten }, material, firma);
  const lohnkosten = runden2((minuten / 60) * (kostensatz ?? 0));
  const rohertrag = runden2(preis - materialEk - lohnkosten);
  return {
    materialEk,
    materialVk: leistungMaterialVk(material, firma),
    lohn: runden2((minuten / 60) * stundensatz),
    stundensatz,
    lohnkosten,
    kostensatz,
    berechnet: leistungPreis({ preis: null, minuten }, material, firma),
    preis,
    rohertrag,
    rohertragProzent: preis > 0 ? (rohertrag / preis) * 100 : null,
    jeStunde: minuten > 0 ? runden2((preis - materialEk) / (minuten / 60)) : null,
  };
}

// ── Staffel der Montagezeit ─────────────────────────────────────────────

/** Die Staffel gibt es nur in der Kategorie „Montagearbeiten“ (Stefan, 20.11.2026). */
export const STAFFEL_KATEGORIE = "Montagearbeiten";
export const staffelErlaubt = (kategorie: string | null | undefined) => gleicheKategorie(kategorie, STAFFEL_KATEGORIE);

const zahlDe = (n: number) => String(n).replace(".", ",");

/** Bereich je Stufe: „2–10“, „11–18“, „ab 19“ — die Stufe reicht bis vor die nächste. */
export function staffelBereiche(stufen: StaffelStufe[]): { stufe: StaffelStufe; text: string }[] {
  return stufen.map((stufe, i) => {
    const naechste = stufen[i + 1];
    if (!naechste) return { stufe, text: `ab ${zahlDe(stufe.ab)}` };
    const bis = Number.isInteger(stufe.ab) && Number.isInteger(naechste.ab) ? naechste.ab - 1 : null;
    if (bis == null) return { stufe, text: `${zahlDe(stufe.ab)} bis unter ${zahlDe(naechste.ab)}` };
    return { stufe, text: bis === stufe.ab ? zahlDe(stufe.ab) : `${zahlDe(stufe.ab)}–${zahlDe(bis)}` };
  });
}

/** Kurz für die Liste: „2–10: 160 · 11–18: 145 · ab 19: 130 min“ */
export function staffelText(l: { staffel?: unknown }): string {
  const b = staffelBereiche(staffelLesen(l.staffel));
  return b.length ? `${b.map((x) => `${x.text}: ${zahlDe(x.stufe.minuten)}`).join(" · ")} min` : "";
}

/**
 * Staffel aus dem Formular prüfen: „ab“ über 0, Minuten ab 0, kein „ab“
 * doppelt. Leere Zeilen fallen weg. Fehler als Text für die Meldung.
 */
export function staffelPruefen(
  zeilen: { ab: number | null; minuten: number | null }[],
): { stufen: StaffelStufe[] } | { fehler: string } {
  const stufen: StaffelStufe[] = [];
  for (const z of zeilen) {
    if (z.ab == null && z.minuten == null) continue;
    if (z.ab == null || !(z.ab > 0)) return { fehler: "Staffel: „ab Menge“ muss größer als 0 sein." };
    if (z.minuten == null || z.minuten < 0 || z.minuten >= 1_000_000) return { fehler: `Staffel ab ${zahlDe(z.ab)}: bitte die Minuten eintragen.` };
    if (stufen.some((s) => s.ab === z.ab)) return { fehler: `Staffel: „ab ${zahlDe(z.ab)}“ steht doppelt.` };
    stufen.push({ ab: z.ab, minuten: z.minuten });
  }
  return { stufen: stufen.sort((a, b) => a.ab - b.ab) };
}
