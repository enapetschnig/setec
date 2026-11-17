import type { Termin } from "@/lib/types";

/**
 * Kalender (früher Plantafel): wer und was ist wo eingeteilt, wo hakt es,
 * Farben der Projekte. Ohne Datenbank, getestet in plantafel.test.ts.
 */

export type PlanTermin = Pick<Termin, "id" | "datum" | "bis_datum" | "ganztags" | "von" | "bis" | "mitarbeiter" | "fahrzeuge" | "team_id">;

export const amTag = (t: Pick<Termin, "datum" | "bis_datum">, tag: string) => t.datum <= tag && (t.bis_datum ?? t.datum) >= tag;

const minuten = (hhmm: string | null | undefined, sonst: number) => {
  if (!hhmm) return sonst;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Belegen zwei Einsätze am selben Tag dieselbe Zeit? Ganztägig belegt den ganzen Tag. */
export function ueberschneiden(a: PlanTermin, b: PlanTermin, tag: string): boolean {
  if (!amTag(a, tag) || !amTag(b, tag)) return false;
  // mehrtägig mit Uhrzeit („Mo–Mi 7–15:30“): die Zeit gilt an jedem Tag
  const spanne = (t: PlanTermin): [number, number] => {
    if (t.ganztags || !t.von) return [0, 24 * 60];
    const start = minuten(t.von, 0);
    const ende = minuten(t.bis, 24 * 60);
    return [start, ende > start ? ende : 24 * 60];
  };
  const [a1, a2] = spanne(a);
  const [b1, b2] = spanne(b);
  return a1 < b2 && b1 < a2;
}

export type Konflikt = {
  art: "person_doppelt" | "person_abwesend" | "fahrzeug_doppelt";
  tag: string;
  /** Person oder Fahrzeug */
  ressource: string;
  termine: string[];
};

/**
 * Alle Konflikte in den gezeigten Tagen: eine Person oder ein Fahrzeug in
 * zwei Einsätzen zur selben Zeit, oder eine Person ist eingeteilt, aber
 * abwesend (Urlaub, krank, Berufsschule).
 */
export function konflikte(
  termine: PlanTermin[],
  tage: string[],
  abwesend: { user_id: string; von: string; bis: string }[],
): Konflikt[] {
  const liste: Konflikt[] = [];
  for (const tag of tage) {
    const heute = termine.filter((t) => amTag(t, tag));
    const doppelt = (feld: "mitarbeiter" | "fahrzeuge", art: Konflikt["art"]) => {
      const ids = new Set(heute.flatMap((t) => t[feld]));
      for (const id of ids) {
        const mit = heute.filter((t) => t[feld].includes(id));
        const betroffen = new Set<string>();
        for (let i = 0; i < mit.length; i++) {
          for (let j = i + 1; j < mit.length; j++) {
            if (ueberschneiden(mit[i], mit[j], tag)) { betroffen.add(mit[i].id); betroffen.add(mit[j].id); }
          }
        }
        if (betroffen.size) liste.push({ art, tag, ressource: id, termine: [...betroffen] });
      }
    };
    doppelt("mitarbeiter", "person_doppelt");
    doppelt("fahrzeuge", "fahrzeug_doppelt");
    for (const a of abwesend.filter((x) => x.von <= tag && x.bis >= tag)) {
      const mit = heute.filter((t) => t.mitarbeiter.includes(a.user_id));
      if (mit.length) liste.push({ art: "person_abwesend", tag, ressource: a.user_id, termine: mit.map((t) => t.id) });
    }
  }
  return liste;
}

/** Tage zwischen zwei Daten (b − a) */
export function tageZwischen(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Kräftige, gut unterscheidbare Farben je Projekt (Balken der Plantafel) */
export const PROJEKT_FARBEN = ["#2563EB", "#16A34A", "#D97706", "#9333EA", "#DC2626", "#0891B2", "#65A30D", "#DB2777", "#4F46E5", "#CA8A04", "#0D9488", "#EA580C"];

/**
 * Farbe eines Projekts: aus der laufenden Nummer („2026-0007“ → 7), so
 * bekommen aufeinanderfolgende Projekte verschiedene Farben; ohne Nummer aus der ID.
 */
export function projektFarbe(p: { id: string; nummer?: string | null } | null | undefined): string {
  if (!p) return "#64748B";
  const n = Number(p.nummer?.match(/(\d+)\s*$/)?.[1]);
  if (Number.isFinite(n) && n > 0) return PROJEKT_FARBEN[(n - 1) % PROJEKT_FARBEN.length];
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROJEKT_FARBEN[h % PROJEKT_FARBEN.length];
}

/** Weiße oder schwarze Schrift auf einer Farbe */
export function textAuf(hex: string): "#ffffff" | "#111827" {
  const m = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#111827" : "#ffffff";
}
