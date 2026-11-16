import { runden2 } from "@/lib/preise";

/**
 * „Was wurde im Projekt wirklich verbraucht?“ — für die Rechnung: Stunden je
 * Mitarbeiter und Material je Artikel, jeweils mit dem Anteil, der schon in
 * dieser Rechnung, in einer anderen oder noch offen ist.
 */

export type VerbrauchZeit = { id: string; stunden: number; user_id: string; name: string; rechnung_id: string | null };
export type VerbrauchMaterial = {
  id: string;
  art: string;
  menge: number;
  einheit: string;
  bezeichnung: string;
  artikel_id: string | null;
  rechnung_id: string | null;
};

type Anteil = { gesamt: number; hier: number; anderswo: number; offen: number };
const leer = (): Anteil => ({ gesamt: 0, hier: 0, anderswo: 0, offen: 0 });

function zaehlen(a: Anteil, menge: number, rechnungId: string | null, belegId: string | null) {
  a.gesamt += menge;
  if (!rechnungId) a.offen += menge;
  else if (rechnungId === belegId) a.hier += menge;
  else a.anderswo += menge;
}

const rund = (a: Anteil): Anteil => ({ gesamt: runden2(a.gesamt), hier: runden2(a.hier), anderswo: runden2(a.anderswo), offen: runden2(a.offen) });

export type Verbrauch = {
  stunden: Anteil;
  personen: (Anteil & { name: string })[];
  material: (Anteil & { bezeichnung: string; einheit: string })[];
};

export function verbrauchZusammenfassen(zeiten: VerbrauchZeit[], material: VerbrauchMaterial[], belegId: string | null): Verbrauch {
  const stunden = leer();
  const personen = new Map<string, Anteil & { name: string }>();
  zeiten.forEach((z) => {
    const h = Number(z.stunden) || 0;
    zaehlen(stunden, h, z.rechnung_id, belegId);
    const p = personen.get(z.user_id) ?? { ...leer(), name: z.name };
    zaehlen(p, h, z.rechnung_id, belegId);
    personen.set(z.user_id, p);
  });
  const mat = new Map<string, Anteil & { bezeichnung: string; einheit: string }>();
  material.forEach((b) => {
    const schluessel = b.artikel_id ?? `${b.bezeichnung.trim().toLowerCase()}|${b.einheit}`;
    const m = mat.get(schluessel) ?? { ...leer(), bezeichnung: b.bezeichnung, einheit: b.einheit };
    zaehlen(m, b.art === "rueckgabe" ? -Number(b.menge) : Number(b.menge), b.rechnung_id, belegId);
    mat.set(schluessel, m);
  });
  return {
    stunden: rund(stunden),
    personen: [...personen.values()].map((p) => ({ ...rund(p), name: p.name })).sort((a, b) => b.gesamt - a.gesamt),
    material: [...mat.values()]
      .map((m) => ({ ...rund(m), bezeichnung: m.bezeichnung, einheit: m.einheit }))
      .filter((m) => m.gesamt !== 0)
      .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de")),
  };
}

/** Stunden, die auf der Rechnung stehen: Arbeitszeit in h plus Montagezeit kalkulierter Positionen */
export function stundenAufBeleg(positionen: { art: string; menge: number; einheit: string; minuten: number | null }[]): number {
  return runden2(positionen.reduce((s, p) => {
    if (p.art === "titel" || p.art === "text" || p.art === "abzug" || p.art === "nachlass") return s;
    if (p.art === "arbeit" && /^(h|std\.?|stunden?)$/i.test(p.einheit.trim())) return s + p.menge;
    return p.minuten ? s + (p.menge * p.minuten) / 60 : s;
  }, 0));
}
