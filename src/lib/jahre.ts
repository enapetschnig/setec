/**
 * Jahresansicht der Belegslisten (Rechnungen, Angebote, Eingangsrechnungen,
 * Kontakt-Belege): standardmäßig nur das laufende Jahr, ältere Jahre als
 * „Archiv“. Eine Suche findet über alle Jahre. Reine Logik — getestet in
 * jahre.test.ts, das Bauteil dazu ist components/JahrWahl.tsx.
 */

/** `null` = alle Jahre */
export type Jahr = number | null;

/** Jahr eines ISO-Datums ("2024-03-01" → 2024), ohne Datum `null` */
export const jahrVon = (iso: string | null | undefined): number | null => {
  const j = Number(String(iso ?? "").slice(0, 4));
  return Number.isFinite(j) && j > 1900 ? j : null;
};

/**
 * Liegt das Datum im gewählten Jahr? Ohne Jahr (alle) oder ohne Datum
 * (z. B. Bestellung ohne Datum) immer ja — nichts verschwindet stillschweigend.
 */
export const imJahr = (iso: string | null | undefined, jahr: Jahr): boolean => {
  if (jahr == null) return true;
  const j = jahrVon(iso);
  return j == null || j === jahr;
};

/** Alle Jahre, die in den Daten vorkommen, plus das laufende — neueste zuerst */
export function jahreAus(daten: (string | null | undefined)[], aktuell: number): number[] {
  const s = new Set<number>([aktuell]);
  daten.forEach((d) => { const j = jahrVon(d); if (j != null) s.add(j); });
  return [...s].sort((a, b) => b - a);
}

export type MonatsGruppe<T> = { schluessel: string; titel: string; eintraege: T[]; summe: number; anzahl: number };

const MONAT = new Intl.DateTimeFormat("de-AT", { month: "long" });

/** "2026-11" → "November 2026" */
export const monatTitel = (schluessel: string): string => {
  const [j, m] = schluessel.split("-").map(Number);
  if (!j || !m) return "Ohne Datum";
  const name = MONAT.format(new Date(j, m - 1, 15));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${j}`;
};

/**
 * Nach Monat gruppieren — die Reihenfolge der Liste bleibt (neueste zuerst
 * kommt also schon sortiert herein). `betrag` liefert `null` für Zeilen, die
 * nicht in die Monatssumme gehören (Entwurf, Storno, abgelehnt).
 */
export function monatsGruppen<T>(
  liste: T[],
  datum: (t: T) => string | null | undefined,
  betrag: (t: T) => number | null,
): MonatsGruppe<T>[] {
  const gruppen: MonatsGruppe<T>[] = [];
  const je = new Map<string, MonatsGruppe<T>>();
  liste.forEach((t) => {
    const d = datum(t);
    const k = d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : "ohne";
    let g = je.get(k);
    if (!g) {
      g = { schluessel: k, titel: monatTitel(k), eintraege: [], summe: 0, anzahl: 0 };
      je.set(k, g);
      gruppen.push(g);
    }
    g.eintraege.push(t);
    g.anzahl++;
    const b = betrag(t);
    if (b != null) g.summe = Math.round((g.summe + Number(b)) * 100) / 100;
  });
  return gruppen;
}
