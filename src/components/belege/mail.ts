/**
 * Angebot/Rechnung per E-Mail — reine Logik (Vorbelegung, Empfänger), testbar.
 * Verschickt wird über die Edge Function `beleg-mail` (Resend, PDF als Anhang);
 * `mailto:` bleibt als Ausweichweg.
 */
import { anhangText } from "./datenblattLogik";

export type MailArt = "Angebot" | "Rechnung" | "Stornorechnung" | "Lieferschein";

export type MailVorgabe = { an: string; betreff: string; text: string };

const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

/** „a@b.at; c@d.at“ → Liste (höchstens 3) — null, wenn eine Adresse nicht passt. Gleiche Regel in der Function. */
export function empfaengerLesen(roh: string): string[] | null {
  const liste = [...new Set(roh.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
  if (!liste.length || liste.length > 3 || !liste.every((a) => MAIL.test(a))) return null;
  return liste;
}

export function mailArt(b: { typ: string; status: string }): MailArt {
  return b.typ === "angebot" ? "Angebot" : b.status === "storno" ? "Stornorechnung" : "Rechnung";
}

/** Darf dieser Beleg verschickt werden? (gleiche Regel in der Function) */
export function versendbar(b: { typ: string; status: string; nummer: string | null }): boolean {
  if (b.typ === "angebot") return b.status === "offen" || b.status === "angenommen";
  return !!b.nummer && (b.status === "offen" || b.status === "bezahlt" || b.status === "storno");
}

export function mailVorgabe(d: {
  art: MailArt;
  nummer: string | null;
  betreff: string | null;
  an: string | null | undefined;
  firma: string | null | undefined;
  telefon?: string | null;
  /** Bestätigungslink (nur Angebot) */
  link?: string | null;
  giltBis?: string | null;
  datum?: string | null;
  betrag?: string | null;
  faellig?: string | null;
  bezahlt?: boolean;
  stornoZu?: string | null;
  datenblaetter?: number;
  /** eigene Anhänge am Angebot (PV-Planung …) */
  anhaenge?: number;
}): MailVorgabe {
  const nr = d.nummer ?? "";
  const titel = d.betreff?.trim() ? ` „${d.betreff.trim()}“` : "";
  const zeilen: string[] = ["Guten Tag,", ""];
  if (d.art === "Angebot") {
    const blaetter = anhangText(d.datenblaetter ?? 0, d.anhaenge ?? 0);
    zeilen.push(`anbei unser Angebot ${nr}${titel} als PDF${blaetter}.`);
    if (d.link) zeilen.push("", "Sie können es auch online ansehen und direkt bestätigen:", d.link);
    if (d.giltBis) zeilen.push("", `Das Angebot gilt bis ${d.giltBis}.`);
  } else if (d.art === "Lieferschein") {
    zeilen.push(`anbei unser Lieferschein ${nr}${d.datum ? ` vom ${d.datum}` : ""} als PDF.`);
  } else if (d.art === "Stornorechnung") {
    zeilen.push(`anbei die Stornorechnung ${nr}${d.stornoZu ? ` zur Rechnung ${d.stornoZu}` : ""} als PDF. Sie hebt die Rechnung in voller Höhe auf.`);
  } else {
    zeilen.push(`anbei unsere Rechnung ${nr}${d.datum ? ` vom ${d.datum}` : ""}${d.betrag ? ` über ${d.betrag}` : ""} als PDF.`);
    if (d.bezahlt) zeilen.push("", "Sie ist bereits bezahlt — vielen Dank.");
    else if (d.faellig) zeilen.push("", `Bitte überweisen Sie den Betrag bis ${d.faellig} auf das in der Rechnung angegebene Konto.`);
  }
  zeilen.push("", d.telefon ? `Bei Fragen erreichen Sie uns unter ${d.telefon}.` : "Bei Fragen antworten Sie einfach auf diese Mail.");
  zeilen.push("", "Mit freundlichen Grüßen", d.firma ?? "");
  return {
    an: (d.an ?? "").trim(),
    betreff: `${d.art} ${nr}${d.betreff?.trim() ? ` – ${d.betreff.trim()}` : ""}${d.firma ? ` · ${d.firma}` : ""}`.replace(/\s{2,}/g, " ").trim(),
    text: zeilen.join("\n").trim(),
  };
}

/** Blob → base64 (ohne „data:“-Vorspann) für den Aufruf der Function */
export async function blobBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
