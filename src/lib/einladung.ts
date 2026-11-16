/**
 * Der Firmen-Link /einladung/<token> — der EINE Weg in die App. Der Chef holt
 * ihn unter Einstellungen → Mitarbeiter (QR, WhatsApp, Aushang); jeder neue
 * Mitarbeiter installiert damit die App und legt darin sein Konto an (Seite
 * pages/Einladung.tsx, Migration 20261116110000_firmen_link.sql).
 *
 * Merker „offene Einladung“: Android und PC teilen den Speicher zwischen
 * Browser und installierter App. Startet die frisch installierte App auf „/“
 * (start_url), führt der Merker sie zurück zur Einladung — sonst stünde der
 * Mitarbeiter vor einer Anmeldung ohne Konto. Am iPhone übernimmt das die
 * Startadresse der Home-App (Manifest auf der Einladungsseite entfernt).
 */

export type EinladungInfo = {
  status: "gueltig" | "eingeloest" | "abgelaufen" | "zurueckgezogen" | "unbekannt";
  art?: "firma";
  firma?: string | null;
};

export function einladungsAdresse(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/einladung/${token}`;
}

/** Der Text, der per WhatsApp oder Mail rausgeht — kurz, mit dem Link am Ende */
export function einladungsText(o: { firma: string; link: string }): string {
  return `Unsere ${o.firma}-App: Link am Handy öffnen, App auf den Startbildschirm legen, darin registrieren — fertig:\n${o.link}`;
}

/** WhatsApp öffnet sich mit dem Text, den Empfänger wählt man dort selbst. Nichts wird von hier gesendet. */
export function whatsAppAdresse(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function mailAdresse(betreff: string, text: string): string {
  return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Token aus einer Adresse /einladung/<token> — nur gültige Zeichen */
export function tokenAusPfad(pfad: string): string | null {
  const m = pfad.match(/^\/einladung\/([A-Za-z0-9_-]{16,64})\/?$/);
  return m ? m[1] : null;
}

const MERKER = "einladung.offen";

export function offeneEinladungMerken(token: string): void {
  try { localStorage.setItem(MERKER, token); } catch { /* egal */ }
}

export function offeneEinladung(): string | null {
  try {
    const t = localStorage.getItem(MERKER);
    return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
  } catch { return null; }
}

export function offeneEinladungVergessen(): void {
  try { localStorage.removeItem(MERKER); } catch { /* egal */ }
}
