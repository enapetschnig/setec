/**
 * Der EINE Link in die App: <App-Adresse>/start (pages/Start.tsx). Er erkennt
 * Gerät und Browser, zeigt die Anleitung für den Startbildschirm und führt
 * zum Registrieren oder Anmelden. Der Chef verteilt ihn unter Einstellungen →
 * Mitarbeiter (QR, Aushang, WhatsApp, E-Mail, SMS). Am Anfang darf jeder sich
 * registrieren und ist sofort drin (Migration 20261116120000_ein_link_alle_aktiv.sql).
 */

export function startAdresse(origin: string): string {
  return `${origin.replace(/\/$/, "")}/start`;
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

/** Nur Handynummern (keine Mehrwert- oder Festnetznummern): AT, DE, CH, IT, SI, HR, HU, SK, CZ, PL, RO, BA, RS */
const HANDY = /^\+(43(6\d{8,12})|49(1[5-7]\d{8,10})|41(7\d{8})|39(3\d{8,9})|386([3-7]\d{7})|385(9\d{7,8})|36((20|30|31|50|70)\d{7})|421(9\d{8})|420([67]\d{8})|48([4-8]\d{8})|40(7\d{8})|387(6\d{7,8})|381(6\d{7,8}))$/;

/** 0664 123 45 67 · 0043 664… · +43 (0) 664… · +49… → E.164-Handynummer, sonst null (gleich wie e164 in der Edge Function einladung-sms) */
export function handyNummer(eingabe: string): string | null {
  let n = eingabe.replace(/\(0\)/g, "").replace(/[\s/().-]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("0")) n = "+43" + n.slice(1);
  else if (!n.startsWith("+")) n = "+43" + n;
  return HANDY.test(n) ? n : null;
}
