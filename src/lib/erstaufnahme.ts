/**
 * Erstaufnahme (Besichtigung vor dem Angebot) — reine Logik, ohne Datenbank.
 * Ablauf: docs/ABLAUF-TERMIN-BIS-RECHNUNG.md Abschnitte 2–4.
 */

export type Messwert = { bezeichnung: string; wert: string; einheit: string };

/**
 * Vorschläge für Messwerte — Stefan hat keine festen genannt, deshalb eine
 * freie Liste: antippen fügt eine Zeile mit Bezeichnung und Einheit ein.
 */
export const MESSWERT_VORSCHLAEGE: { bezeichnung: string; einheit: string }[] = [
  { bezeichnung: "Jahresverbrauch", einheit: "kWh" },
  { bezeichnung: "Gewünschte Leistung", einheit: "kWp" },
  { bezeichnung: "Speicher", einheit: "kWh" },
  { bezeichnung: "Dachneigung", einheit: "°" },
  { bezeichnung: "Dachfläche", einheit: "m²" },
  { bezeichnung: "Ausrichtung", einheit: "" },
  { bezeichnung: "Dachart", einheit: "" },
  { bezeichnung: "Hausanschluss", einheit: "A" },
  { bezeichnung: "Leitungslänge", einheit: "m" },
  { bezeichnung: "Zählernummer", einheit: "" },
];

/** Aus der Datenbank (jsonb) — Fremdes und Kaputtes wird still zu leeren Feldern */
export function messwerteLesen(json: unknown): Messwert[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
    .map((m) => ({
      bezeichnung: typeof m.bezeichnung === "string" ? m.bezeichnung : "",
      wert: typeof m.wert === "string" ? m.wert : typeof m.wert === "number" ? String(m.wert) : "",
      einheit: typeof m.einheit === "string" ? m.einheit : "",
    }));
}

/** Zum Speichern: getrimmt, ganz leere Zeilen weg (eine Bezeichnung ohne Wert bleibt — „noch messen“) */
export function messwerteBereinigen(liste: Messwert[]): Messwert[] {
  return liste
    .map((m) => ({ bezeichnung: m.bezeichnung.trim(), wert: m.wert.trim(), einheit: m.einheit.trim() }))
    .filter((m) => m.bezeichnung || m.wert);
}

/** Vorschläge, die noch nicht in der Liste stehen */
export function offeneVorschlaege(liste: Messwert[]) {
  const da = new Set(liste.map((m) => m.bezeichnung.trim().toLowerCase()));
  return MESSWERT_VORSCHLAEGE.filter((v) => !da.has(v.bezeichnung.toLowerCase()));
}

/** „Jahresverbrauch: 4500 kWh“ — nur Zeilen mit Wert */
export function messwertZeilen(liste: Messwert[]): string[] {
  return messwerteBereinigen(liste)
    .filter((m) => m.wert)
    .map((m) => `${m.bezeichnung ? `${m.bezeichnung}: ` : ""}${m.wert}${m.einheit ? ` ${m.einheit}` : ""}`);
}

/** Adresse in einer Zeile: „Feldweg 3, 8643 Allerheiligen“ */
export function eaAdresse(e: { strasse: string | null; plz: string | null; ort: string | null }): string {
  return [e.strasse?.trim(), [e.plz?.trim(), e.ort?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Erste Zeile des Kundenwunsches als Betreff des Angebots
 * („PV 10 kW mit Speicher“), höchstens 120 Zeichen.
 */
export function betreffAusWunsch(wunsch: string | null | undefined): string {
  const zeile = (wunsch ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  return zeile.length > 120 ? `${zeile.slice(0, 119).trimEnd()}…` : zeile;
}

/** Was darf mit der Erstaufnahme noch passieren? (wie die Datenbank) */
export function eaAktionen(status: string, istChef: boolean, hatProjekt: boolean) {
  const entscheiden = istChef && !hatProjekt && status !== "auftrag";
  return {
    angebot: istChef && status !== "kein_auftrag" && status !== "auftrag",
    gleichProjekt: entscheiden && status !== "kein_auftrag",
    keinAuftrag: entscheiden && status !== "kein_auftrag",
    wiederOffen: istChef && status === "kein_auftrag",
    loeschen: istChef && status !== "auftrag",
  };
}

/** Pfad im Speicher „projekt-dateien“: ea/<erstaufnahme_id>/<zufall>[-original].<endung> */
export function eaPfad(eaId: string, zufall: string, endung: "jpg" | "png", original = false): string {
  return `ea/${eaId}/${zufall}${original ? "-original" : ""}.${endung}`;
}

/** „Feldweg 3, 8643 Allerheiligen“ → Straße, PLZ, Ort (sonst alles in die Straße) */
export function ortZerlegen(text: string): { strasse: string | null; plz: string | null; ort: string | null } {
  const m = text.match(/^(.*?),\s*(\d{4,5})\s+(.+)$/);
  if (m) return { strasse: m[1].trim() || null, plz: m[2], ort: m[3].trim() };
  return { strasse: text.trim() || null, plz: null, ort: null };
}
