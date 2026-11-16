import type { EditorPosition, KatalogLeistung } from "./editor";

/**
 * Datenblätter der Artikel im Angebot — reine Logik (ohne Supabase, testbar).
 * Abgelegt werden sie am Artikel: Tabelle `artikel_dateien`, Speicher
 * `dateien`, Pfad `artikel/<artikel_id>/…`.
 */

export const DATEIEN_BUCKET = "projekt-dateien"; // Paket F legt Artikel-Dateien unter artikel/<id>/… ab

/**
 * Sichtbarkeit je Datenblatt am Artikel (Spalte `artikel_dateien.sichtbar`,
 * Migration 20261116170000): intern = nie nach außen, angebot = geht mit dem
 * Angebot mit (Standard), auftrag = erst wenn das Angebot angenommen ist.
 * Dieselbe Regel steht in der Datenbank (`angebot_datenblaetter`,
 * `datenblatt_oeffentlich`) und in der Edge Function `beleg-mail`.
 */
export type Sichtbarkeit = "intern" | "angebot" | "auftrag";

export const SICHTBARKEITEN: { wert: Sichtbarkeit; text: string; kurz: string }[] = [
  { wert: "intern", text: "Nur intern", kurz: "intern" },
  { wert: "angebot", text: "Mit dem Angebot", kurz: "mit Angebot" },
  { wert: "auftrag", text: "Erst nach Auftrag", kurz: "nach Auftrag" },
];

export const sichtbarkeitLesen = (w: unknown): Sichtbarkeit => (w === "intern" || w === "auftrag" ? w : "angebot");

/** Darf das Datenblatt zu einem Angebot in diesem Status zum Kunden? */
export function fuerKunden(sichtbar: Sichtbarkeit | undefined, angebotStatus: string | null | undefined): boolean {
  const s = sichtbar ?? "angebot";
  if (s === "intern") return false;
  if (s === "auftrag") return angebotStatus === "angenommen";
  return true;
}

export type Datenblatt = { id?: string; artikel_id?: string; name: string; pfad: string; artikel?: string | null; sichtbar?: Sichtbarkeit };

/** Artikel des Angebots: Artikel-Positionen und das Material der Leistungen */
export function artikelIdsVon(positionen: Pick<EditorPosition, "artikel_id" | "leistung_id">[], katalog: Pick<KatalogLeistung, "id" | "leistung_material">[]): string[] {
  const ids = new Set<string>();
  const leistungen = new Map(katalog.map((l) => [l.id, l]));
  positionen.forEach((p) => {
    if (p.artikel_id) ids.add(p.artikel_id);
    if (p.leistung_id) {
      (leistungen.get(p.leistung_id)?.leistung_material ?? []).forEach((m) => {
        const id = (m.artikel as { id?: string } | null)?.id;
        if (id) ids.add(id);
      });
    }
  });
  return [...ids].sort();
}

/** Je Pfad einmal, sortiert nach Artikel und Name */
export function datenblaetterOrdnen(liste: Datenblatt[]): Datenblatt[] {
  const gesehen = new Set<string>();
  return liste
    .filter((d) => d.pfad && !gesehen.has(d.pfad) && !!gesehen.add(d.pfad))
    .sort((a, b) => (a.artikel ?? "").localeCompare(b.artikel ?? "", "de") || a.name.localeCompare(b.name, "de"));
}

/** Dateiname im Paket: Name behalten, aber eindeutig und ohne Pfadzeichen */
export function paketNamen(liste: Datenblatt[]): string[] {
  const vergeben = new Set<string>();
  return liste.map((d) => {
    const roh = (d.name || d.pfad.split("/").pop() || "Datenblatt.pdf").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Datenblatt.pdf";
    let name = roh;
    const punkt = roh.lastIndexOf(".");
    const [stamm, endung] = punkt > 0 ? [roh.slice(0, punkt), roh.slice(punkt)] : [roh, ""];
    let n = 2;
    while (vergeben.has(name.toLowerCase())) name = `${stamm} (${n++})${endung}`;
    vergeben.add(name.toLowerCase());
    return name;
  });
}
