import type { EingangAnteil, Eingangsrechnung } from "@/lib/types";
import { tageDazu } from "@/lib/format";

/**
 * Eingangsrechnungen: Rechnen ohne Datenbank — Zuordnung, Rest, Status,
 * Netto/Brutto. Getestet in eingangLogik.test.ts.
 */

export const KATEGORIEN = [
  { wert: "material", text: "Material" },
  { wert: "fremdleistung", text: "Fremdleistung" },
  { wert: "werkzeug", text: "Werkzeug" },
  { wert: "fahrzeug", text: "Fahrzeug" },
  { wert: "buero", text: "Büro" },
  { wert: "sonstiges", text: "Sonstiges" },
] as const;

export const kategorieText = (k: string) => KATEGORIEN.find((x) => x.wert === k)?.text ?? k;

const runden2 = (n: number) => Math.round(n * 100) / 100;

/** Netto aus Brutto und umgekehrt — die USt ergibt sich als Differenz */
export const nettoAusBrutto = (brutto: number, satz: number) => runden2(brutto / (1 + satz / 100));
export const bruttoAusNetto = (netto: number, satz: number) => {
  const n = runden2(netto);
  return runden2(n + runden2(n * satz / 100));
};

export type Zuordnung = "zuzuordnen" | "teilweise" | "zugeordnet";

/** Was noch auf kein Projekt verteilt ist (netto) */
export function rest(netto: number, anteile: Pick<EingangAnteil, "betrag">[]): number {
  return runden2(netto - anteile.reduce((s, a) => s + Number(a.betrag), 0));
}

/**
 * Zugeordnet heißt: ganz auf Projekte verteilt, oder der Rest gehört dem
 * Betrieb (Lager, Werkzeug, Büro). Ein Betrag von 0 € gibt es nichts zu verteilen.
 */
export function zuordnung(r: Pick<Eingangsrechnung, "netto" | "betrieb">, anteile: Pick<EingangAnteil, "betrag">[]): Zuordnung {
  if (r.betrieb || Number(r.netto) === 0) return "zugeordnet";
  const offen = rest(Number(r.netto), anteile);
  if (Math.abs(offen) < 0.005) return "zugeordnet";
  return anteile.length ? "teilweise" : "zuzuordnen";
}

/** Zahlstatus: bezahlt, überfällig (nach dem Fälligkeitstag) oder offen */
export function zahlung(r: Pick<Eingangsrechnung, "bezahlt_am" | "faellig_am"> & { lastschrift?: boolean | null }, heute: string): "bezahlt" | "ueberfaellig" | "offen" {
  if (r.bezahlt_am) return "bezahlt";
  // Lastschrift: der Händler bucht selbst ab — nichts, was wir versäumen können
  if (r.lastschrift) return "offen";
  if (r.faellig_am && r.faellig_am < heute) return "ueberfaellig";
  return "offen";
}

export type AnteilEntwurf = {
  /** null = neu */
  id: string | null;
  schluessel: string;
  projekt_id: string;
  betrag: string;
  text: string;
  /** an eine Ausgangsrechnung gebunden — fest */
  rechnung_id: string | null;
};

/**
 * Passen die Positionen zum Netto? Gibt den Unterschied (Positionen − Netto)
 * zurück, wenn er über einem Cent liegt — sonst null. Ohne Positionen mit
 * Betrag gibt es nichts zu vergleichen.
 */
export function positionenAbweichung(netto: number, betraege: (number | null)[]): number | null {
  const mit = betraege.filter((b): b is number => b != null);
  if (!mit.length) return null;
  const diff = Math.round((mit.reduce((s, b) => s + b, 0) - netto) * 100) / 100;
  return Math.abs(diff) > 0.01 ? diff : null;
}

/**
 * Prüft die Aufteilung vor dem Speichern. Gibt einen Satz für den Benutzer
 * zurück oder null. `lesen` wandelt die Eingabe in eine Zahl (Komma!).
 */
export function aufteilungFehler(netto: number, anteile: AnteilEntwurf[], lesen: (s: string) => number | null): string | null {
  for (const a of anteile) {
    if (!a.projekt_id) return "Bei jedem Anteil ein Projekt wählen — oder den Anteil entfernen.";
    const b = lesen(a.betrag);
    if (b === null || b === 0) return "Bei jedem Anteil einen Betrag eintragen.";
    if (netto > 0 && b < 0) return "Ein Anteil kann nicht negativ sein.";
  }
  const summe = runden2(anteile.reduce((s, a) => s + (lesen(a.betrag) ?? 0), 0));
  if (Math.abs(summe) > Math.abs(netto) + 0.005) {
    return "Die Anteile sind zusammen mehr als der Nettobetrag der Rechnung.";
  }
  return null;
}

// ── Ablauf: prüfen → freigeben → überweisen ──────────────────────────────

export type Ablauf = "pruefen" | "freigegeben" | "lastschrift" | "ueberwiesen" | "abgelehnt";

/**
 * Freigegeben heißt „Zu überweisen“ — außer der Händler hat ein SEPA-Mandat
 * (`lastschrift`): dann bucht er selbst ab, die Rechnung wartet unter „Lastschrift“.
 */
export function ablauf(r: Pick<Eingangsrechnung, "freigabe" | "bezahlt_am"> & { lastschrift?: boolean | null }): Ablauf {
  if (r.bezahlt_am) return "ueberwiesen";
  if (r.freigabe === "abgelehnt") return "abgelehnt";
  if (r.freigabe === "freigegeben") return r.lastschrift ? "lastschrift" : "freigegeben";
  return "pruefen";
}

/** Wie eine bezahlte Rechnung bezahlt wurde */
export type Zahlweg = "ueberweisung" | "lastschrift" | "bar";
export const ZAHLWEGE: { wert: Zahlweg; text: string; pille: string }[] = [
  { wert: "ueberweisung", text: "Überwiesen", pille: "Überwiesen" },
  { wert: "lastschrift", text: "Lastschrift", pille: "Abgebucht" },
  { wert: "bar", text: "Bar bezahlt", pille: "Bar bezahlt" },
];
export function zahlweg(r: { lastschrift?: boolean | null; bar_bezahlt?: boolean | null }): Zahlweg {
  if (r.bar_bezahlt) return "bar";
  return r.lastschrift ? "lastschrift" : "ueberweisung";
}
/** Pille einer bezahlten Rechnung: Überwiesen / Abgebucht / Bar bezahlt */
export const bezahltText = (r: { lastschrift?: boolean | null; bar_bezahlt?: boolean | null }) =>
  ZAHLWEGE.find((z) => z.wert === zahlweg(r))!.pille;

/**
 * Voraussichtlicher Abbuchungstag einer Lastschrift: der erste Tag X ab dem
 * Rechnungsdatum (Monatsende, wenn der Monat kürzer ist). Ohne Tag: null.
 */
export function abbuchungAm(r: Pick<Eingangsrechnung, "datum"> & { lastschrift_tag?: number | null }): string | null {
  const tag = Number(r.lastschrift_tag ?? 0);
  if (!tag || !r.datum) return null;
  const [j, m, t] = r.datum.split("-").map(Number);
  const imMonat = (jahr: number, monat: number) => {
    const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
    return { jahr, monat, tag: Math.min(tag, letzter) };
  };
  let z = imMonat(j, m);
  if (z.tag < t) z = m === 12 ? imMonat(j + 1, 1) : imMonat(j, m + 1);
  return `${z.jahr}-${String(z.monat).padStart(2, "0")}-${String(z.tag).padStart(2, "0")}`;
}

/**
 * Was der Händler per Lastschrift abbucht: brutto abzüglich Skonto (er bucht
 * laut Mandat immer unter Abzug des Skontos ab — das Skonto-Datum zählt hier nicht).
 */
export function lastschriftBetrag(r: Pick<Eingangsrechnung, "brutto" | "skonto_prozent" | "datum"> & { lastschrift_tag?: number | null }) {
  const am = abbuchungAm(r);
  const brutto = Number(r.brutto);
  const p = Number(r.skonto_prozent ?? 0);
  if (p > 0) {
    const betrag = runden2(brutto * (1 - p / 100));
    return { betrag, skonto: runden2(brutto - betrag), am };
  }
  return { betrag: runden2(brutto), skonto: 0, am };
}

/**
 * Was zu überweisen ist: brutto, mit Skonto solange die Frist läuft
 * (bis einschließlich Skontotag).
 */
export function zuZahlen(r: Pick<Eingangsrechnung, "brutto" | "skonto_prozent" | "skonto_bis">, heute: string) {
  const brutto = Number(r.brutto);
  const p = Number(r.skonto_prozent ?? 0);
  if (p > 0 && r.skonto_bis && r.skonto_bis >= heute) {
    const betrag = runden2(brutto * (1 - p / 100));
    return { betrag, skonto: runden2(brutto - betrag), bis: r.skonto_bis };
  }
  return { betrag: runden2(brutto), skonto: 0, bis: null as string | null };
}

/**
 * Skonto läuft in den nächsten `tage` Tagen ab (auch noch ungeprüfte): nicht
 * bezahlt, nicht abgelehnt, keine Lastschrift (der Händler zieht Skonto beim
 * Abbuchen selbst ab). Eine Regel für die Startseite und den Filter
 * `/eingang?filter=skonto` — Zahl und Liste gleich.
 */
export function skontoLaeuftAb(
  r: Pick<Eingangsrechnung, "bezahlt_am" | "freigabe" | "skonto_bis" | "skonto_prozent"> & { lastschrift?: boolean | null },
  heute: string,
  tage = 3,
): boolean {
  return !r.bezahlt_am && !r.lastschrift && r.freigabe !== "abgelehnt" && Number(r.skonto_prozent ?? 0) > 0
    && !!r.skonto_bis && r.skonto_bis >= heute && r.skonto_bis <= tageDazu(heute, tage);
}

// ── Positionen ───────────────────────────────────────────────────────────

export type PositionEntwurf = {
  schluessel: string;
  artikelnummer: string;
  bezeichnung: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
  gesamt: string;
  lieferschein_nr: string;
  projekt_id: string;
};

/**
 * Projekt-Anteile aus den Positionen: je Projekt die Summe der Zeilen (netto).
 * Zeilen ohne Projekt bleiben übrig (Lager/Betrieb). Gerechnet in Cent.
 */
export function anteileAusPositionen(positionen: { gesamt: number; projekt_id: string | null }[]): { projekt_id: string; betrag: number }[] {
  const je = new Map<string, number>();
  positionen.forEach((p) => {
    if (!p.projekt_id) return;
    je.set(p.projekt_id, (je.get(p.projekt_id) ?? 0) + Math.round(p.gesamt * 100));
  });
  return [...je.entries()].map(([projekt_id, cent]) => ({ projekt_id, betrag: cent / 100 })).filter((a) => a.betrag !== 0);
}

// ── Abgleich Lieferschein ↔ Rechnung ─────────────────────────────────────

type Zeile = { artikelnummer?: string | null; bezeichnung: string; menge: number | null };
export type AbgleichZeile = {
  bezeichnung: string;
  artikelnummer: string | null;
  verrechnet: number | null;
  geliefert: number | null;
  status: "passt" | "menge" | "nicht_geliefert" | "nicht_verrechnet";
};

const nummer = (s: string | null | undefined) => (s ?? "").replace(/[\s.\-/]/g, "").replace(/^0+/, "").toLowerCase();
const woerter = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N},]+/gu, " ").split(" ").filter((w) => w.length > 1));
/** Anteil gemeinsamer Wörter (0–1), bezogen auf den kürzeren Text */
export function textAehnlich(a: string, b: string): number {
  const wa = woerter(a);
  const wb = woerter(b);
  if (!wa.size || !wb.size) return 0;
  let gleich = 0;
  wa.forEach((w) => { if (wb.has(w)) gleich += 1; });
  return gleich / Math.min(wa.size, wb.size);
}

/**
 * Rechnungszeilen gegen die gelieferten Zeilen (ein oder mehrere Lieferscheine):
 * zuerst über die Artikelnummer, sonst über den Text (≥ 60 % gleiche Wörter).
 * Mengen gleicher Artikel werden zusammengezählt. Zeilen ohne Gegenstück
 * auf der Rechnung: „nicht geliefert“; auf dem Lieferschein: „nicht verrechnet“.
 */
export function abgleich(rechnung: Zeile[], geliefert: Zeile[]): AbgleichZeile[] {
  const frei = geliefert.map((g, i) => ({ ...g, i }));
  const benutzt = new Set<number>();
  const ergebnis: AbgleichZeile[] = rechnung.map((r) => {
    const nr = nummer(r.artikelnummer);
    let treffer = nr ? frei.filter((g) => !benutzt.has(g.i) && nummer(g.artikelnummer) === nr) : [];
    if (!treffer.length) {
      const beste = frei.filter((g) => !benutzt.has(g.i))
        .map((g) => ({ g, w: textAehnlich(r.bezeichnung, g.bezeichnung) }))
        .filter((x) => x.w >= 0.6)
        .sort((a, b) => b.w - a.w)[0];
      treffer = beste ? [beste.g] : [];
    }
    treffer.forEach((g) => benutzt.add(g.i));
    const menge = treffer.length ? treffer.reduce((s, g) => s + Number(g.menge ?? 0), 0) : null;
    const status: AbgleichZeile["status"] = !treffer.length ? "nicht_geliefert"
      : r.menge != null && menge != null && Math.abs(Number(r.menge) - menge) > 0.0005 ? "menge" : "passt";
    return { bezeichnung: r.bezeichnung, artikelnummer: r.artikelnummer ?? null, verrechnet: r.menge, geliefert: menge, status };
  });
  frei.filter((g) => !benutzt.has(g.i)).forEach((g) => ergebnis.push({
    bezeichnung: g.bezeichnung, artikelnummer: g.artikelnummer ?? null, verrechnet: null, geliefert: g.menge, status: "nicht_verrechnet",
  }));
  return ergebnis;
}
