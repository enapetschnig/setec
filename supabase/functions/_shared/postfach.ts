// Postfach (Gmail-API) — reine Logik ohne Netz und Deno-Globals, mit vitest
// getestet (src/lib/postfach.test.ts): Fehlertexte, Anhänge finden und
// auswählen, Lieferant zuordnen, doppelte Rechnungen erkennen, erlaubte
// Domains, Kalendertag in Wien.

export const GMAIL_BEREICHE = "https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send";
export const LABEL_VERARBEITET = "App: verarbeitet";

/** Abfrage für den Abruf: Anhang, 14 Tage, nichts Gesendetes */
export const ABRUF_SUCHE = "has:attachment newer_than:14d -in:sent -in:chats -in:spam -in:trash";

export type PostfachGrund = "freigabe_fehlt" | "adresse" | "api_aus" | "dienstkonto" | "domain" | "sonst";

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

// ── Kalendertag in Wien ───────────────────────────────────────────────────
// Edge Functions laufen in UTC: eine Mail um 0:30 Uhr am 1. Jänner wäre sonst
// eine Rechnung vom 31. Dezember des Vorjahres (Prüfung 18.11.2026, L4).
const WIEN = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" });

/** Zeitpunkt → Kalendertag in Wien (JJJJ-MM-TT); ungültig → "" */
export function wienerTag(d: Date | string | number = new Date()): string {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  const teil = Object.fromEntries(WIEN.formatToParts(t).map((p) => [p.type, p.value]));
  return `${teil.year}-${teil.month}-${teil.day}`;
}

// ── Erlaubte Domains ──────────────────────────────────────────────────────
// Das Dienstkonto gehört ePower und gilt für mehrere Kunden: ohne Liste könnte
// ein Benutzer der App jedes Postfach einer anderen Domain lesen, die das
// Dienstkonto freigegeben hat (Prüfung 18.11.2026, M1). Unbekannt = nein.

/** „Max <max@a.at>“ / „max@a.at“ → a.at */
export const domainVon = (adresse: string | null | undefined): string => {
  const a = absenderAdresse(adresse ?? null);
  const i = a.lastIndexOf("@");
  return i > 0 ? a.slice(i + 1) : "";
};

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Secret POSTFACH_DOMAINS („setec-gmbh.at, setec.at“) → Liste; Ungültiges fällt weg */
export function domainsLesen(roh: string | null | undefined): string[] {
  return [...new Set((roh ?? "").split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter((d) => DOMAIN.test(d)))];
}

export const domainErlaubt = (adresse: string | null | undefined, domains: readonly string[]) => {
  const d = domainVon(adresse);
  return !!d && domains.includes(d);
};

export const domainText = (adresse: string) =>
  `Die Domain „${domainVon(adresse) || adresse}“ ist für diese App nicht freigegeben — gelesen und gesendet wird nur über Postfächer ` +
  `eurer eigenen Domain. Gehört sie zu eurer Firma, schaltet ePower sie frei.`;

/**
 * Erlaubte Domains: das Secret POSTFACH_DOMAINS, sonst die Tabelle
 * postfach_domains (nur per SQL). Beides leer → keine (fail closed).
 */
// deno-lint-ignore no-explicit-any
export async function erlaubteDomains(sb: { from: (tabelle: string) => any }, secret: string | null | undefined): Promise<string[]> {
  const aus = domainsLesen(secret);
  if (aus.length) return aus;
  const { data, error } = await sb.from("postfach_domains").select("domain");
  if (error) {
    console.error("postfach_domains", error);
    return [];
  }
  return domainsLesen(((data ?? []) as { domain: string }[]).map((r) => r.domain).join(","));
}

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
/**
 * Größer liest die KI nicht (Prüfung 18.11.2026, H2: ein großer Anhang sprengte
 * Speicher/CPU der Edge Function). PDF bis 10 MB; Bilder nimmt Claude bis 5 MB
 * base64 (≈ 3,7 MB) — darüber gibt es nur einen Hinweis.
 */
export const MAX_PDF = 10 * 1024 * 1024;
export const MAX_BILD = 3.5 * 1024 * 1024;
/** Höchstens so viele Anhänge je Mail — der Rest bekommt einen Hinweis (L2) */
export const ANHAENGE_JE_MAIL = 4;

/** PDF- und Bild-Anhänge einer Mail (rekursiv), ohne kleine/eingebettete Bilder — auch zu große (siehe anhaengeWaehlen) */
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
      if (pdf || (bild && groesse >= MIN_BILD && !(inline && groesse < 200 * 1024))) {
        liste.push({ dateiname: name, mime: mime === "image/jpg" ? "image/jpeg" : mime, attachmentId: id, groesse });
      }
    }
    for (const p of t.parts ?? []) gehe(p);
  };
  gehe(teil);
  return liste;
}

/** 12_400_000 → „11,8 MB“ */
export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/**
 * Welche Anhänge liest die KI? Zu große und alles über `max` nicht — aber nie still: mit Grund.
 * PDFs zuerst (Rechnungen sind fast immer PDF; fünf Baustellenfotos sollen sie nicht verdrängen).
 */
export function anhaengeWaehlen(alle: Anhang[], max = ANHAENGE_JE_MAIL): { lesen: Anhang[]; ungelesen: string[] } {
  const lesen: Anhang[] = [], ungelesen: string[] = [], zuViele: string[] = [];
  const pdfZuerst = [...alle].sort((a, b) => Number(a.mime !== "application/pdf") - Number(b.mime !== "application/pdf"));
  for (const a of pdfZuerst) {
    const grenze = a.mime === "application/pdf" ? MAX_PDF : MAX_BILD;
    if (a.groesse > grenze) ungelesen.push(`„${a.dateiname}“ ist zu groß für die KI (${mb(a.groesse)}, höchstens ${mb(grenze)})`);
    else if (lesen.length >= max) zuViele.push(`„${a.dateiname}“`);
    else lesen.push(a);
  }
  if (zuViele.length) {
    ungelesen.push(`${zuViele.length === 1 ? "1 weiterer Anhang" : `${zuViele.length} weitere Anhänge`} nicht gelesen ` +
      `(höchstens ${max} je Mail): ${zuViele.join(", ")}`);
  }
  return { lesen, ungelesen };
}

/** „Max Muster <max@a.at>“ → max@a.at */
export const absenderAdresse = (von: string | null) => (von?.match(/<([^>]+)>/)?.[1] ?? von ?? "").trim().toLowerCase();

// ── Lieferant zuordnen ────────────────────────────────────────────────────
export const schluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const ohneRechtsform = (s: string) =>
  schluessel(s).replace(/[.,]/g, " ").replace(/\b(gmbh|gesmbh|ges m b h|ag|kg|og|e ?u|co|& ?co|und co|ltd|inc|se|mbh)\b/g, " ").replace(/\s+/g, " ").trim();

/** IBAN ohne Leerzeichen, groß — nur wenn sie wie eine IBAN aussieht */
export const ibanSchluessel = (s: string | null | undefined): string | null => {
  const i = (s ?? "").replace(/[\s-]+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i) ? i : null;
};

/** UID-Nummer (ATU12345678, DE123456789 …) ohne Leerzeichen, groß — nur wenn sie wie eine aussieht */
export const uidSchluessel = (s: string | null | undefined): string | null => {
  const u = (s ?? "").replace(/[\s.\-/]+/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{8,12}$/.test(u) && (u.match(/\d/g)?.length ?? 0) >= 6 ? u : null;
};

export type LieferantKontakt = {
  name: string; namen?: string[] | null; email?: string | null; uid?: string | null;
  /** Notiz des Kontakts — die Odoo-Übernahme schrieb „Bank: AT…“ hinein */
  notiz?: string | null;
  /** E-Mails der Ansprechpersonen (kontakt_personen) */
  personen?: (string | null)[] | null;
};
/** Eine frühere Eingangsrechnung, wie die Zuordnung sie braucht */
export type FruehereRechnung = {
  id?: string; lieferant: string; iban?: string | null; uid?: string | null;
  /** Name, wie die KI ihn auf der Mail-Rechnung gelesen hat (lieferant_gelesen) */
  gelesen?: string | null;
  /** Absender der Mails, die diese Rechnung brachten oder als „doppelt“ auf sie zeigen */
  absender?: (string | null)[] | null;
};
/** Was dem Betrieb selbst gehört — taugt nie als Merkmal eines Lieferanten */
export type Eigenes = { iban?: string | null; uid?: string | null; domains?: string[] };
export type Wissen = { kontakte: LieferantKontakt[]; rechnungen: FruehereRechnung[]; eigen?: Eigenes };

export type ZuordnungsWeg = "uid" | "name" | "iban" | "schreibweise" | "rechtsform" | "domain" | "absender" | "bisher" | "gelesen";
export const WEG_TEXT: Record<ZuordnungsWeg, string> = {
  uid: "UID-Nummer", name: "Name am Kontakt", iban: "IBAN wie bei früheren Rechnungen", schreibweise: "Schreibweise einer früheren Rechnung",
  rechtsform: "Name ohne Rechtsform", domain: "Absender-Domain am Kontakt", absender: "Absender wie bei früheren Rechnungen",
  bisher: "bisheriger Name", gelesen: "wie gelesen",
};

const FREEMAIL = /^(gmail|googlemail|gmx|web|yahoo|outlook|hotmail|live|icloud|me|aon|a1|chello|kabsi|utanet|t-online)\./i;
const sauber = (n: string) => n.replace(/\s+/g, " ").trim();

/** Kontakt, der genau so heißt (Name oder weitere Schreibweise) */
function kontaktMitName(name: string | null | undefined, kontakte: LieferantKontakt[]): string | null {
  const k = schluessel(name);
  if (!k) return null;
  return kontakte.find((c) => [c.name, ...(c.namen ?? [])].some((n) => schluessel(n) === k))?.name ?? null;
}

/** Alle Namen meinen denselben Lieferanten → dieser Name, sonst null (mehrdeutig = nie raten) */
function einzig(namen: string[]): string | null {
  const m = new Map<string, string>();
  for (const n of namen) {
    const k = schluessel(n);
    if (k && !m.has(k)) m.set(k, sauber(n));
  }
  return m.size === 1 ? [...m.values()][0] : null;
}

const ALLGEMEIN = new Set([
  "mail", "email", "rechnung", "rechnungen", "invoice", "invoices", "billing", "noreply", "reply", "info", "office", "service",
  "services", "shop", "online", "portal", "kunden", "kundenservice", "buchhaltung", "accounting", "faktura", "versand", "news",
  "newsletter", "elektro", "elektrotechnik", "technik", "handel", "handels", "grosshandel", "gmbh", "austria", "oesterreich",
  "group", "gruppe", "international", "solar", "energie", "energy", "bau", "haus", "www", "web", "app", "the", "und", "and",
  "com", "net", "org", "mein", "filiale", "zweigniederlassung",
]);
const woerter = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !ALLGEMEIN.has(w));

/**
 * Gehört die Domain zum Lieferanten? Ein unterscheidendes Wort der Domain steckt
 * im Namen („muster-elektro.at“ ↔ „Muster Elektro GmbH“). Schützt davor, dass
 * Rechnungsplattformen (stripe.com, e-rechnung.gv.at …), über die viele Firmen
 * verschicken, einem einzigen Lieferanten zugeschlagen werden.
 */
export function domainPasst(domain: string, name: string): boolean {
  const dw = domain.toLowerCase().split(".").slice(0, -1).flatMap(woerter);
  const nw = woerter(name);
  const zusammen = nw.join("");
  return dw.some((d) => nw.some((n) => n === d || (n.length >= 4 && d.includes(n)) || (d.length >= 4 && n.includes(d)))
    || (d.length >= 5 && zusammen.includes(d)));
}

/** Gleicher Absender? Domain, bei Freemail die ganze Adresse; eigene Domains (weitergeleitet) zählen nie */
export function absenderGleich(a: string | null | undefined, liste: readonly (string | null)[], eigeneDomains: readonly string[] = []): boolean {
  const d = domainVon(a);
  if (!d || eigeneDomains.includes(d)) return false;
  if (FREEMAIL.test(d)) return liste.some((x) => !!x && absenderAdresse(x) === absenderAdresse(a ?? null));
  return liste.some((x) => domainVon(x) === d);
}

/**
 * Name aus der KI → Name, unter dem der Lieferant in der App schon steht.
 * Nur eindeutige Merkmale — mehrdeutig heißt: nicht zuordnen (nie den
 * falschen Lieferanten). Reihenfolge:
 *  1. UID-Nummer = UID am Kontakt bzw. auf früheren Rechnungen
 *  2. gleiche Schreibweise am Kontakt (Name oder weitere Schreibweisen)
 *  3. IBAN = IBAN früherer Rechnungen bzw. in der Notiz eines Kontakts (nie die eigene)
 *  4. dieselbe von der KI gelesene Schreibweise wie bei früheren Rechnungen →
 *     Name, unter dem diese heute stehen (lernt aus Korrekturen)
 *  5. ohne Rechtsform gleich / beginnt damit („Sonepar Österreich GmbH“ → „Sonepar“)
 *  6. Absender-Domain = Domain der Kontakt-Mail oder einer Ansprechperson;
 *     sonst Domain früherer Mails mit genau einem Lieferanten, wenn die Domain
 *     zum Namen passt (domainPasst). Nie Freemail, nie die eigene Domain.
 *  7. bisherige Eingangsrechnungen, gleiche Schreibweise
 * sonst der Name von der Rechnung.
 */
export function lieferantFinden(
  gelesen: { name: string | null; uid?: string | null; iban?: string | null; absender?: string | null },
  w: Wissen,
): { name: string | null; weg: ZuordnungsWeg } {
  const { kontakte, rechnungen } = w;
  const eigen = w.eigen ?? {};
  const k = schluessel(gelesen.name);
  const kanon = (n: string) => kontaktMitName(n, kontakte) ?? sauber(n);

  const uid = uidSchluessel(gelesen.uid);
  if (uid && uid !== uidSchluessel(eigen.uid)) {
    const n = einzig(kontakte.filter((c) => uidSchluessel(c.uid) === uid).map((c) => c.name))
      ?? einzig(rechnungen.filter((r) => uidSchluessel(r.uid) === uid).map((r) => kanon(r.lieferant)));
    if (n) return { name: n, weg: "uid" };
  }

  const amKontakt = kontaktMitName(gelesen.name, kontakte);
  if (amKontakt) return { name: amKontakt, weg: "name" };

  const iban = ibanSchluessel(gelesen.iban);
  if (iban && iban !== ibanSchluessel(eigen.iban)) {
    const n = einzig([
      ...rechnungen.filter((r) => ibanSchluessel(r.iban) === iban).map((r) => kanon(r.lieferant)),
      ...kontakte.filter((c) => (c.notiz ?? "").replace(/\s+/g, "").toUpperCase().includes(iban)).map((c) => c.name),
    ]);
    if (n) return { name: n, weg: "iban" };
  }

  if (k) {
    const n = einzig(rechnungen.filter((r) => schluessel(r.gelesen) === k).map((r) => kanon(r.lieferant)));
    if (n) return { name: n, weg: "schreibweise" };

    const kurz = ohneRechtsform(gelesen.name ?? "");
    if (kurz.length >= 3) {
      for (const c of kontakte) {
        for (const x of [c.name, ...(c.namen ?? [])]) {
          const nk = ohneRechtsform(x);
          if (nk.length >= 3 && (nk === kurz || kurz.startsWith(`${nk} `) || nk.startsWith(`${kurz} `))) return { name: c.name, weg: "rechtsform" };
        }
      }
    }
  }

  const domain = domainVon(gelesen.absender);
  if (domain && !FREEMAIL.test(domain) && !(eigen.domains ?? []).includes(domain)) {
    const hier = (x: string | null | undefined) => domainVon(x) === domain;
    const n = einzig(kontakte.filter((c) => hier(c.email) || (c.personen ?? []).some(hier)).map((c) => c.name));
    if (n) return { name: n, weg: "domain" };
    const frueher = einzig(rechnungen.filter((r) => (r.absender ?? []).some(hier)).map((r) => kanon(r.lieferant)));
    if (frueher && domainPasst(domain, frueher)) return { name: frueher, weg: "absender" };
  }

  if (k) {
    const b = rechnungen.find((r) => schluessel(r.lieferant) === k);
    if (b) return { name: kanon(b.lieferant), weg: "bisher" };
    return { name: sauber(gelesen.name ?? ""), weg: "gelesen" };
  }
  return { name: null, weg: "gelesen" };
}

/** Kurzform wie bisher: nur Name, Kontakte, bisherige Namen und Absender */
export function lieferantZuordnen(kiName: string | null, kontakte: LieferantKontakt[], bisher: string[], absender?: string | null): string | null {
  return lieferantFinden({ name: kiName, absender }, { kontakte, rechnungen: bisher.map((lieferant) => ({ lieferant })) }).name;
}

/** Ist das unsere eigene Rechnung (z. B. Kunde antwortet mit unserem PDF)? */
export function eigeneRechnung(lieferant: string | null, firmenName: string | null | undefined): boolean {
  const a = ohneRechtsform(lieferant ?? ""), f = ohneRechtsform(firmenName ?? "");
  return !!a && !!f && f.length >= 3 && (a === f || a.startsWith(`${f} `) || f.startsWith(`${a} `));
}

// ── Doppelte Rechnungen ───────────────────────────────────────────────────
/** Rechnungsnummer zum Vergleichen: ohne Leerzeichen, klein */
export const nummerSchluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * Kern der Rechnungsnummer: nur Buchstaben und Ziffern, klein („RE-2026/0815“ =
 * „re 2026 0815“ = „re20260815“). Gleich gebaut wie in der Datenbank
 * (eingang_doppelt_kandidaten: regexp_replace(lower(nummer), '[^a-z0-9]', '', 'g')).
 */
export const nummerKern = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type DoppeltKandidat = {
  id: string; lieferant: string; nummer: string | null; datum: string; brutto: number | string | null;
  absender?: (string | null)[] | null;
};
export type DoppeltFrage = {
  nummer: string | null;
  /** Brutto wie beim Anlegen (notfalls aus Netto gerechnet) */
  brutto: number | null;
  /** Rechnungsdatum, wie die KI es gelesen hat (null = keines auf dem Beleg) */
  datumGelesen: string | null;
  /** Datum wie beim Anlegen (gelesen, sonst Tag der Mail in Wien) — L3: dasselbe für Suche und Anlegen */
  datum: string;
  /** Lieferant nach der Zuordnung */
  lieferant: string;
  absender?: string | null;
  eigeneDomains?: readonly string[];
};

const cent = (x: number | string | null | undefined) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 100));

/**
 * Ist diese Rechnung schon da — egal unter welchem Lieferanten-Namen?
 * (Prüfung 18.11.2026, H1: die KI liest denselben Lieferanten unter vielen Namen.)
 *  - mit Nummer: gleicher Nummern-Kern und
 *      · gleicher Lieferant (wie bisher), oder
 *      · gleiches Brutto und — wenn die KI ein Datum las — gleiches Datum;
 *        kurze Nummern (unter 4 Zeichen) ohne Datum nur bei gleichem Absender
 *  - ohne Nummer: gleiches Datum + gleiches Brutto (≠ 0) + (gleicher Lieferant oder gleicher Absender)
 */
export function doppeltFinden(f: DoppeltFrage, kandidaten: readonly DoppeltKandidat[]): DoppeltKandidat | null {
  const kern = nummerKern(f.nummer);
  const brutto = cent(f.brutto);
  const lief = schluessel(f.lieferant);
  const absender = (r: DoppeltKandidat) => absenderGleich(f.absender, r.absender ?? [], f.eigeneDomains ?? []);
  for (const r of kandidaten) {
    const gleicherLieferant = !!lief && schluessel(r.lieferant) === lief;
    const gleichesBrutto = brutto != null && cent(r.brutto) === brutto;
    if (kern) {
      if (nummerKern(r.nummer) !== kern) continue;
      if (gleicherLieferant) return r;
      if (!gleichesBrutto) continue;
      if (f.datumGelesen) {
        if (r.datum === f.datumGelesen) return r;
        continue;
      }
      if (kern.length >= 4 || absender(r)) return r;
    } else if (gleichesBrutto && brutto !== 0 && r.datum === f.datum && (gleicherLieferant || absender(r))) {
      return r;
    }
  }
  return null;
}

export type AbrufErgebnis = "rechnung" | "doppelt" | "keine_rechnung" | "ohne_anhang" | "fehler";

// ── Lauf aufteilen ────────────────────────────────────────────────────────
/**
 * Anteil eines Postfachs am Lauf (Prüfung 18.11.2026, L5): Lesungen und Zeit
 * gleich verteilt auf die Postfächer, die noch kommen; was eines nicht braucht,
 * bekommen die nächsten. Jedes darf mindestens eine Lesung — sonst ginge ein
 * Postfach nach einer Mail mit vielen Anhängen ganz leer aus.
 */
export function anteil(o: { gelesen: number; lesenMax: number; vergangen: number; zeitMax: number; postfaecher: number }): { lesenBis: number; zeit: number } {
  const n = Math.max(1, o.postfaecher);
  return {
    lesenBis: o.gelesen + Math.max(1, Math.ceil((o.lesenMax - o.gelesen) / n)),
    zeit: Math.max(0, (o.zeitMax - o.vergangen) / n),
  };
}
