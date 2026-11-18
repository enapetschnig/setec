/**
 * Rollen und Rechte (Stefan, 18.11.2026: „Büro, Lehrling … Rechte selbst
 * festlegen“). Die Grundstufe bleibt `profiles.rolle` (chef = Büro-Zugang,
 * monteur = Baustelle); die Rolle (`rollen`, `profiles.rolle_id`) nimmt
 * daraus einzelne Bereiche weg. Leere `rolle_id` = eingebaute Rolle der
 * Grundstufe (Chef bzw. Monteur). Die Datenbank prüft dasselbe
 * (`hat_recht()`, Migration 20261118120000_rollen_rechte.sql).
 *
 * Neues Recht: hier, in der Liste der Migration (check auf `rollen.rechte`)
 * und in den Regeln ergänzen — eigene Rollen bekommen es erst, wenn der
 * Chef es anhakt.
 */
import type { Tables } from "@/integrations/supabase/types";

export type RollenZeile = Tables<"rollen">;

export type Recht =
  | "rechnungen" | "eingang" | "buchhaltung" | "personal" | "mitarbeiter" | "einstellungen"
  | "projekte_anlegen" | "stunden_andere" | "regie" | "material";

export const RECHTE: { recht: Recht; titel: string; text: string; nurBuero?: boolean }[] = [
  { recht: "rechnungen", titel: "Angebote & Rechnungen", text: "Angebote, Rechnungen, Offene Posten, Mahnen", nurBuero: true },
  { recht: "eingang", titel: "Eingangsrechnungen & Bestellungen", text: "Rechnungen der Lieferanten, Einkaufspreise, Bestellen", nurBuero: true },
  { recht: "buchhaltung", titel: "Buchhaltung", text: "Übergabe an den Steuerberater, Kategorien", nurBuero: true },
  { recht: "personal", titel: "Personal-Dokumente aller", text: "Lohnzettel, Krankenscheine der anderen", nurBuero: true },
  { recht: "mitarbeiter", titel: "Mitarbeiter & Zugänge", text: "Einladen, sperren, Passwort, Sollzeit, Lohnkosten", nurBuero: true },
  { recht: "einstellungen", titel: "Betriebs-Einstellungen", text: "Firmendaten, Bank, Logo, E-Mail-Postfach", nurBuero: true },
  { recht: "projekte_anlegen", titel: "Projekte anlegen", text: "Neues Projekt / neue Baustelle" },
  { recht: "stunden_andere", titel: "Stunden für Kollegen buchen", text: "Für andere schreiben (Team, Partie)" },
  { recht: "regie", titel: "Regieberichte schreiben", text: "Neuer Regiebericht mit Unterschrift" },
  { recht: "material", titel: "Material buchen", text: "Scannen, ausfassen, zurückgeben" },
];

/** Die RollenZeile eines Profils — leer = eingebaute RollenZeile der Grundstufe */
export function rolleVon(p: { rolle: string; rolle_id?: string | null } | null | undefined, rollen: RollenZeile[]): RollenZeile | null {
  if (!p) return null;
  if (p.rolle_id) return rollen.find((r) => r.id === p.rolle_id) ?? null;
  return rollen.find((r) => r.schluessel === (p.rolle === "chef" ? "chef" : "monteur")) ?? null;
}

/**
 * Darf das Profil das? Spiegel von `hat_recht()`. Ohne geladene Rollen
 * (alte Sitzung am Gerät, Funkloch): ohne `rolle_id` volle Rechte der
 * Grundstufe, sonst nur die Baustellen-Rechte — die Datenbank entscheidet ohnehin.
 */
export function darfRecht(p: { rolle: string; rolle_id?: string | null; aktiv: boolean } | null | undefined, rollen: RollenZeile[], recht: Recht): boolean {
  if (!p?.aktiv) return false;
  const buero = !!RECHTE.find((x) => x.recht === recht)?.nurBuero;
  // Büro-Bereiche gibt es nur mit Büro-Zugang (die Tabellen sperrt dort schon ist_chef())
  if (buero && p.rolle !== "chef") return false;
  const r = rolleVon(p, rollen);
  if (r) return r.schluessel === "chef" || r.rechte.includes(recht);
  return !buero || !p.rolle_id;
}

/** Voller Chef: Grundstufe chef mit der eingebauten RollenZeile „Chef“ (oder ohne RollenZeile) */
export function istVollerChef(p: { rolle: string; rolle_id?: string | null; aktiv: boolean } | null | undefined, rollen: RollenZeile[]): boolean {
  if (!p?.aktiv || p.rolle !== "chef") return false;
  if (!p.rolle_id) return true;
  return rolleVon(p, rollen)?.schluessel === "chef";
}

/** Anzeige-Name der RollenZeile eines Profils */
export function rollenName(p: { rolle: string; rolle_id?: string | null }, rollen: RollenZeile[]): string {
  return rolleVon(p, rollen)?.name ?? (p.rolle === "chef" ? "Chef" : "Monteur");
}
