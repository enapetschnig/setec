// Postfach (Gmail-API) — reine Logik ohne Netz und Deno-Globals, mit vitest
// getestet (src/lib/postfach.test.ts): Fehlertexte, Anhänge finden,
// Lieferant zuordnen, eigene Rechnungen erkennen.

export const GMAIL_BEREICHE = "https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send";
export const LABEL_VERARBEITET = "App: verarbeitet";

/** Abfrage für den Abruf: Anhang, 14 Tage, nichts Gesendetes */
export const ABRUF_SUCHE = "has:attachment newer_than:14d -in:sent -in:chats -in:spam -in:trash";

export type PostfachGrund = "freigabe_fehlt" | "adresse" | "api_aus" | "dienstkonto" | "sonst";

/** Google-Fehler beim Token oder der API → Grund + verständlicher Text */
export function fehlerDeuten(error: string | undefined, beschreibung?: string | null, adresse?: string): { grund: PostfachGrund; text: string } {
  const e = (error ?? "").toLowerCase();
  const b = beschreibung ?? "";
  if (e === "unauthorized_client" || /not authorized to retrieve access tokens|client is unauthorized/i.test(b)) {
    return { grund: "freigabe_fehlt", text: "Freigabe in der Google Admin-Konsole fehlt (oder ist noch nicht wirksam — bis zu 24 Stunden)." };
  }
  if (e === "invalid_grant") {
    return {
      grund: "adresse",
      text: `Adresse prüfen: ${adresse ? `„${adresse}“ ` : ""}muss ein echtes Postfach der Google-Workspace-Domain sein (kein Verteiler, kein Alias einer anderen Domain).`,
    };
  }
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(`${e} ${b}`)) {
    return { grund: "api_aus", text: "Die Gmail API ist im Google-Cloud-Projekt des Dienstkontos nicht eingeschaltet." };
  }
  if (e === "invalid_client" || /invalid_signature|Invalid JWT Signature/i.test(b)) {
    return { grund: "dienstkonto", text: "Der Schlüssel des Dienstkontos gilt nicht mehr (gelöscht oder ersetzt)." };
  }
  return { grund: "sonst", text: `Google meldet: ${[error, beschreibung].filter(Boolean).join(" – ").slice(0, 300) || "unbekannter Fehler"}` };
}

const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
export const adresseSauber = (s: unknown): string | null => {
  const a = typeof s === "string" ? s.trim().toLowerCase() : "";
  return MAIL.test(a) ? a : null;
};

// ── Mails lesen ───────────────────────────────────────────────────────────
export type GmailTeil = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailTeil[];
};
export type Anhang = { dateiname: string; mime: string; attachmentId: string; groesse: number };

export const kopfWert = (t: GmailTeil | undefined, name: string) =>
  t?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

const BILD = /^image\/(jpe?g|png|webp|gif|heic)$/i;
/** Bilder darunter sind Logos und Unterschriften, keine Belege */
export const MIN_BILD = 30 * 1024;
export const MAX_ANHANG = 20 * 1024 * 1024;

/** PDF- und Bild-Anhänge einer Mail (rekursiv), ohne kleine/eingebettete Bilder */
export function anhaengeFinden(teil: GmailTeil | undefined): Anhang[] {
  const liste: Anhang[] = [];
  const gehe = (t: GmailTeil | undefined) => {
    if (!t) return;
    const name = (t.filename ?? "").trim();
    const id = t.body?.attachmentId;
    const groesse = t.body?.size ?? 0;
    if (name && id) {
      let mime = (t.mimeType ?? "").toLowerCase();
      if (mime === "application/octet-stream" || !mime) {
        mime = /\.pdf$/i.test(name) ? "application/pdf" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.png$/i.test(name) ? "image/png" : mime;
      }
      const inline = /^inline/i.test(kopfWert(t, "Content-Disposition") ?? "") || !!kopfWert(t, "Content-ID");
      const pdf = mime === "application/pdf";
      const bild = BILD.test(mime) && !/heic/i.test(mime);
      if (groesse <= MAX_ANHANG && (pdf || (bild && groesse >= MIN_BILD && !(inline && groesse < 200 * 1024)))) {
        liste.push({ dateiname: name, mime: mime === "image/jpg" ? "image/jpeg" : mime, attachmentId: id, groesse });
      }
    }
    for (const p of t.parts ?? []) gehe(p);
  };
  gehe(teil);
  return liste;
}

/** „Max Muster <max@a.at>“ → max@a.at */
export const absenderAdresse = (von: string | null) => (von?.match(/<([^>]+)>/)?.[1] ?? von ?? "").trim().toLowerCase();

// ── Lieferant zuordnen ────────────────────────────────────────────────────
export const schluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const ohneRechtsform = (s: string) =>
  schluessel(s).replace(/[.,]/g, " ").replace(/\b(gmbh|gesmbh|ges m b h|ag|kg|og|e ?u|co|& ?co|und co|ltd|inc|se|mbh)\b/g, " ").replace(/\s+/g, " ").trim();

export type LieferantKontakt = { name: string; namen?: string[] | null; email?: string | null };
const FREEMAIL = /^(gmail|googlemail|gmx|web|yahoo|outlook|hotmail|live|icloud|me|aon|a1|chello|kabsi|utanet|t-online)\./i;

/**
 * Name aus der KI → Name, unter dem der Lieferant in der App schon steht:
 * 1. gleiche Schreibweise (Name oder weitere Schreibweisen am Kontakt)
 * 2. ohne Rechtsform gleich / beginnt damit („Sonepar Österreich GmbH“ → „Sonepar“)
 * 3. Absender-Domain = Domain der Kontakt-Mail
 * 4. bisherige Eingangsrechnungen, gleiche Schreibweise
 * sonst der Name von der Rechnung.
 */
export function lieferantZuordnen(kiName: string | null, kontakte: LieferantKontakt[], bisher: string[], absender?: string | null): string | null {
  const k = schluessel(kiName);
  if (k) {
    for (const c of kontakte) if ([c.name, ...(c.namen ?? [])].some((n) => schluessel(n) === k)) return c.name;
    const kurz = ohneRechtsform(kiName ?? "");
    if (kurz.length >= 3) {
      for (const c of kontakte) {
        for (const n of [c.name, ...(c.namen ?? [])]) {
          const nk = ohneRechtsform(n);
          if (nk.length >= 3 && (nk === kurz || kurz.startsWith(`${nk} `) || nk.startsWith(`${kurz} `))) return c.name;
        }
      }
    }
  }
  const domain = absenderAdresse(absender ?? null).split("@")[1];
  if (domain && !FREEMAIL.test(domain)) {
    const c = kontakte.find((x) => (x.email ?? "").toLowerCase().trim().endsWith(`@${domain}`));
    if (c) return c.name;
  }
  if (k) {
    const b = bisher.find((n) => schluessel(n) === k);
    if (b) return b;
    return (kiName ?? "").replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Ist das unsere eigene Rechnung (z. B. Kunde antwortet mit unserem PDF)? */
export function eigeneRechnung(lieferant: string | null, firmenName: string | null | undefined): boolean {
  const a = ohneRechtsform(lieferant ?? ""), f = ohneRechtsform(firmenName ?? "");
  return !!a && !!f && f.length >= 3 && (a === f || a.startsWith(`${f} `) || f.startsWith(`${a} `));
}

/** Rechnungsnummer zum Vergleichen: ohne Leerzeichen, klein */
export const nummerSchluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

export type AbrufErgebnis = "rechnung" | "doppelt" | "keine_rechnung" | "ohne_anhang" | "fehler";
