// Rechnungen aus den Postfächern holen — Kern der Edge Function postfach-abruf,
// ohne Deno-Globals und ohne npm:-Laufzeitimporte: die KI kommt als `lesen`,
// Gmail als `oeffnen` herein. So läuft derselbe Code in der Function und im
// Node-Test gegen die Docker-Testumgebung (tests/postfach-abruf-test.mjs mit
// dem echten ePower-Postfach, tests/roboter/2026-11-18-postfach-haerten.mjs
// mit einem Gmail-Nachbau ohne Netz).
//
// Je Mail: Zeile in postfach_mails VOR der KI anlegen (unique Postfach +
// Message-ID → Knopf und Cron nie doppelt), Anhänge (PDF/Bild) lesen, Rechnung
// AN den Betrieb → Eingangsrechnung „zu prüfen“ samt Datei und Positionen.
// Dieselbe Rechnung schon da (Nummer + Brutto + Datum — egal, unter welchem
// Namen) → „doppelt“. Gmail-Label „App: verarbeitet“; als gelesen nur bei
// Rechnungen und nur, wenn das Postfach es will (postfaecher.als_gelesen).
// Was die App nicht lesen konnte (zu groß, zu viele Anhänge, abgestürzt),
// steht in postfach_mails.ungelesen — Einstellungen → E-Mail zeigt es.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import type { GelesenerBeleg } from "./beleg.ts";
import { Gmail, voruebergehend, type Dienstkonto } from "./gmail.ts";
import { base64Bytes, base64Standard } from "./mime.ts";
import {
  ABRUF_SUCHE, anhaengeFinden, anhaengeWaehlen, anteil, domainErlaubt, domainText, domainVon, doppeltFinden, eigeneRechnung,
  ibanSchluessel, kopfWert, LABEL_VERARBEITET, lieferantFinden, mb, nummerKern, schluessel, uidSchluessel, WEG_TEXT, wienerTag,
  type DoppeltKandidat, type FruehereRechnung, type GmailTeil, type LieferantKontakt, type Wissen,
} from "./postfach.ts";

/** Ein Anhang für die KI — base64 im Standard-Alphabet (so kommt er von Gmail, nur umgeschrieben) */
export type Datei = { base64: string; mime: string; name: string; groesse: number };
export type Leser = (datei: Datei, firma: string | null) => Promise<GelesenerBeleg>;

/** Was der Abruf von Gmail braucht — die Klasse Gmail, im Test ein Nachbau ohne Netz */
export type GmailZugang = {
  api<T = Record<string, unknown>>(pfad: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<T>;
  label(name: string): Promise<string>;
};
export type Oeffner = (adresse: string) => Promise<GmailZugang>;

export const LESEN_MAX = 6;                    // Claude-Aufrufe je Lauf
export const ZEIT_MAX = 110_000;               // ms je Lauf, gerecht auf die Postfächer verteilt
export const BYTES_MAX = 30 * 1024 * 1024;     // Anhänge je Lauf, danach keine neue Mail mehr
export const VERSUCHE_MAX = 3;
const ABGESTUERZT = 10 * 60_000;               // länger „in_arbeit“ = die Function ist dabei abgestürzt

type Postfach = { id: string; adresse: string; als_gelesen?: boolean | null; zuletzt_abgerufen?: string | null };
type MailZeile = { id: string; message_id: string; ergebnis: string; versuche: number; updated_at: string; fehler?: string | null; ungelesen?: string | null };
export type Bilanz = { rechnungen: number; doppelt: number; andere: number; fehler: number; offen: number; ungelesen: number; meldungen: string[] };

const SPALTEN = "id, message_id, ergebnis, versuche, updated_at, fehler, ungelesen";

/** „2026-11-17“ und ein echter Tag — sonst null */
const isoTag = (s: string | null | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) ? s : null;
};
const geld = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const dateiname = (n: string) => n.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, "_").slice(-100) || "beleg";

// ── Abruf ─────────────────────────────────────────────────────────────────
type Umfeld = {
  sb: SupabaseClient; lesen: Leser; oeffnen: Oeffner; domains: readonly string[]; firma: string | null; suche: string;
  wissen: Wissen & { eigen: { iban: string | null; uid: string | null; domains: string[] } };
  /** frühere Rechnungen nach ID — Absender von „doppelt“-Mails kommen dazu */
  nachId: Map<string, FruehereRechnung>;
  start: number; gelesen: number; bytes: number;
  /** vorübergehende Störung (KI/Gmail) — Lauf endet */
  abbruch: string | null;
};

/** Alle Zeilen in Seiten zu 1000 (PostgREST schneidet sonst still ab), höchstens `max` */
async function seitenweise<T>(abfrage: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 5000): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; von < max; von += 1000) {
    const { data, error } = await abfrage(von, Math.min(von + 999, max - 1));
    if (error) throw error;
    alle.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return alle;
}

/** Was die Zuordnung wissen muss: Lieferanten-Kontakte, frühere Rechnungen, wer sie schickte, eigene Merkmale */
async function wissenLaden(sb: SupabaseClient, domains: readonly string[], postfaecher: Postfach[]) {
  const { data: f } = await sb.from("firma").select("name, email, iban, uid").limit(1).maybeSingle();
  const kontakte = await seitenweise<{ name: string; namen: string[] | null; email: string | null; uid: string | null; notiz: string | null; kontakt_personen: { email: string | null }[] | null }>(
    (von, bis) => sb.from("kunden").select("name, namen, email, uid, notiz, kontakt_personen(email)").in("art", ["lieferant", "partner"])
      .order("id").range(von, bis));
  const rechnungen = await seitenweise<{ id: string; lieferant: string; iban: string | null; lieferant_uid: string | null; lieferant_gelesen: string | null }>(
    (von, bis) => sb.from("eingangsrechnungen").select("id, lieferant, iban, lieferant_uid, lieferant_gelesen")
      .order("created_at", { ascending: false }).order("id").range(von, bis));
  const links = await seitenweise<{ von: string; eingangsrechnung_id: string }>(
    (von, bis) => sb.from("postfach_mails").select("von, eingangsrechnung_id").not("eingangsrechnung_id", "is", null).not("von", "is", null)
      .order("created_at", { ascending: false }).order("id").range(von, bis));

  const nachId = new Map<string, FruehereRechnung>();
  const frueher: FruehereRechnung[] = rechnungen.map((r) => {
    const x: FruehereRechnung = { id: r.id, lieferant: r.lieferant, iban: r.iban, uid: r.lieferant_uid, gelesen: r.lieferant_gelesen, absender: [] };
    nachId.set(r.id, x);
    return x;
  });
  for (const l of links) nachId.get(l.eingangsrechnung_id)?.absender?.push(l.von);

  const eigeneDomains = [...new Set([...domains, domainVon(f?.email), ...postfaecher.map((p) => domainVon(p.adresse))].filter(Boolean))];
  const wissen = {
    kontakte: kontakte.map((c): LieferantKontakt => ({
      name: c.name, namen: c.namen, email: c.email, uid: c.uid, notiz: c.notiz, personen: (c.kontakt_personen ?? []).map((p) => p.email),
    })),
    rechnungen: frueher,
    eigen: { iban: ibanSchluessel(f?.iban), uid: uidSchluessel(f?.uid), domains: eigeneDomains },
  };
  return { wissen, nachId, firma: (f?.name as string | undefined) ?? null };
}

/** Mail übernehmen (Zeile anlegen oder einen alten Fehlschlag erneut beanspruchen) — null = jemand anderer ist dran */
async function beanspruchen(sb: SupabaseClient, p: Postfach, messageId: string, alt: MailZeile | undefined): Promise<MailZeile | null> {
  if (!alt) {
    const { data, error } = await sb.from("postfach_mails")
      .insert({ postfach_id: p.id, postfach: p.adresse, message_id: messageId, ergebnis: "in_arbeit", versuche: 1 })
      .select(SPALTEN).maybeSingle();
    if (error) { if (error.code === "23505") return null; throw error; }
    return data as MailZeile;
  }
  // `fehler` bleibt: dort steht die Spur des letzten Versuchs, bis dieser sie überschreibt
  const { data, error } = await sb.from("postfach_mails")
    .update({ ergebnis: "in_arbeit", versuche: alt.versuche + 1 })
    .eq("id", alt.id).eq("ergebnis", alt.ergebnis).eq("updated_at", alt.updated_at)
    .select(SPALTEN).maybeSingle();
  if (error) throw error;
  return (data as MailZeile | null) ?? null;
}

/**
 * Mails, an denen die Function nach VERSUCHE_MAX Versuchen noch hängt (Absturz:
 * Speicher/CPU — der catch läuft dann nie) oder die so oft scheiterten, endgültig
 * als „nicht lesbar“ vermerken — nie still liegen lassen (Prüfung 18.11.2026, H2).
 */
async function aufgeben(sb: SupabaseClient, p: Postfach): Promise<number> {
  const grenze = new Date(Date.now() - ABGESTUERZT).toISOString();
  const [{ data: haengt, error: e1 }, { data: kaputt, error: e2 }] = await Promise.all([
    sb.from("postfach_mails").select("id, ergebnis, fehler, versuche").eq("postfach", p.adresse).eq("ergebnis", "in_arbeit")
      .gte("versuche", VERSUCHE_MAX).lt("updated_at", grenze).limit(100),
    sb.from("postfach_mails").select("id, ergebnis, fehler, versuche").eq("postfach", p.adresse).eq("ergebnis", "fehler")
      .gte("versuche", VERSUCHE_MAX).is("ungelesen", null).limit(100),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const liste = [...(haengt ?? []), ...(kaputt ?? [])] as { id: string; ergebnis: string; fehler: string | null; versuche: number }[];
  for (const z of liste) {
    const text = (z.ergebnis === "in_arbeit"
      ? `Nach ${z.versuche} Versuchen abgebrochen${z.fehler ? ` (zuletzt ${z.fehler})` : ""} — die Mail ist vermutlich zu groß für den Abruf. Bitte in Gmail selbst ansehen.`
      : `Nach ${z.versuche} Versuchen nicht lesbar: ${z.fehler ?? "unbekannter Fehler"}`).slice(0, 1000);
    await sb.from("postfach_mails").update({ ergebnis: "fehler", fehler: text, ungelesen: text }).eq("id", z.id).eq("ergebnis", z.ergebnis);
  }
  return liste.length;
}

async function rechnungAnlegen(u: Umfeld, b: GelesenerBeleg, datei: { base64: string; mime: string; name: string },
  mail: { zeileId: string; von: string | null; betreff: string | null; datum: string | null }): Promise<{ id: string; doppelt: boolean }> {
  const eigen = u.wissen.eigen;
  const gelesenName = (b.lieferant ?? "").replace(/\s+/g, " ").trim();
  const zu = lieferantFinden({ name: b.lieferant, uid: b.lieferant_uid, iban: b.iban, absender: mail.von }, u.wissen);
  const lieferant = (zu.name || gelesenName).slice(0, 300);

  // Werte wie beim Anlegen — dieselben für die Suche nach „doppelt“ (Prüfung 18.11.2026, L3)
  const datumGelesen = isoTag(b.datum);
  const datum = datumGelesen ?? (mail.datum ? wienerTag(mail.datum) : wienerTag());
  const faellig = isoTag(b.faellig_am);
  const satz = b.ust_satz != null && b.ust_satz >= 0 && b.ust_satz <= 30 ? b.ust_satz : 20;
  let netto = geld(b.netto), brutto = geld(b.brutto);
  if (netto == null && brutto != null) netto = geld(brutto / (1 + satz / 100));
  if (brutto == null && netto != null) brutto = geld(netto * (1 + satz / 100));

  // dieselbe Rechnung schon da? Nummer + Brutto (+ Datum), egal unter welchem Namen (H1)
  const { data: kandidaten, error: eK } = await u.sb.rpc("eingang_doppelt_kandidaten", {
    p_kern: nummerKern(b.nummer) || null, p_brutto: brutto, p_datum: datum,
  });
  if (eK) throw eK;
  const da = doppeltFinden({ nummer: b.nummer, brutto, datumGelesen, datum, lieferant, absender: mail.von, eigeneDomains: eigen.domains },
    (kandidaten ?? []) as DoppeltKandidat[]);
  if (da) {
    // diese Mail zeigt jetzt auf die Rechnung — ihr Absender hilft später beim Zuordnen
    if (mail.von) u.nachId.get(da.id)?.absender?.push(mail.von);
    return { id: da.id, doppelt: true };
  }

  // vom selben Händler: Lastschrift und IBAN wie zuletzt
  const { data: letzte } = await u.sb.from("eingangsrechnungen").select("lieferant, iban, lastschrift, lastschrift_tag")
    .ilike("lieferant", lieferant.replace(/[%_\\]/g, "\\$&")).order("datum", { ascending: false }).limit(1).maybeSingle();

  const iban = ibanSchluessel(b.iban);
  const ibanFremd = iban && iban !== eigen.iban ? iban : null;
  const uid = uidSchluessel(b.lieferant_uid);
  const skonto = b.skonto_prozent != null && b.skonto_prozent > 0 && b.skonto_prozent < 100 ? b.skonto_prozent : null;

  const id = crypto.randomUUID();
  const pfad = `${id}/${crypto.randomUUID().slice(0, 8)}-${dateiname(datei.name)}`;
  // erst jetzt Bytes — nur für Rechnungen, die wirklich abgelegt werden
  const { error: eU } = await u.sb.storage.from("eingangsrechnungen").upload(pfad, base64Bytes(datei.base64), { contentType: datei.mime });
  if (eU) throw new Error(`Datei nicht abgelegt: ${eU.message}`);

  const notiz = [
    `Aus E-Mail${mail.von ? ` von ${mail.von}` : ""}${mail.betreff ? `: „${mail.betreff}“` : ""}`,
    zu.weg !== "gelesen" && schluessel(lieferant) !== schluessel(gelesenName)
      ? `Lieferant zugeordnet über ${WEG_TEXT[zu.weg]} (auf der Rechnung: „${gelesenName}“)` : null,
    b.hinweis ? `KI: ${b.hinweis}` : null,
  ].filter(Boolean).join("\n").slice(0, 1000);
  const { error: eI } = await u.sb.from("eingangsrechnungen").insert({
    id, lieferant, nummer: b.nummer, datum, faellig_am: faellig && faellig >= datum ? faellig : null,
    netto: netto ?? 0, ust_satz: satz, ust: geld((brutto ?? 0) - (netto ?? 0)) ?? 0, brutto: brutto ?? 0,
    iban: ibanFremd ?? letzte?.iban ?? null,
    skonto_prozent: skonto, skonto_bis: skonto ? isoTag(b.skonto_bis) : null,
    lieferschein_nummern: (b.lieferschein_nummern ?? []).filter(Boolean).slice(0, 50),
    lastschrift: letzte?.lastschrift ?? false, lastschrift_tag: letzte?.lastschrift ? letzte.lastschrift_tag : null,
    notiz, datei_pfad: pfad, datei_name: datei.name.slice(0, 200), datei_mime: datei.mime, postfach_mail_id: mail.zeileId,
    lieferant_gelesen: gelesenName.slice(0, 300) || null, lieferant_uid: uid && uid !== eigen.uid ? uid : null,
  });
  if (eI) {
    await u.sb.storage.from("eingangsrechnungen").remove([pfad]);
    throw eI;
  }
  // alle Felder in jeder Zeile — sonst setzt PostgREST fehlende auf NULL
  const zeilen = (b.positionen ?? []).filter((p) => p.bezeichnung?.trim()).slice(0, 500).map((p, i) => ({
    eingangsrechnung_id: id, pos: i + 1, artikelnummer: p.artikelnummer, bezeichnung: p.bezeichnung.trim().slice(0, 500),
    menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis,
    gesamt: geld(p.gesamt ?? (p.menge != null && p.einzelpreis != null ? p.menge * p.einzelpreis : 0)) ?? 0,
    lieferschein_nr: p.lieferschein_nr, projekt_id: null,
  }));
  if (zeilen.length) {
    const { error: eP } = await u.sb.from("eingang_positionen").insert(zeilen);
    if (eP) console.error("Positionen", eP); // Kopf und Datei sind da — Positionen lassen sich in der App nachlesen
  }
  // für die nächsten Rechnungen dieses Laufs
  const neu: FruehereRechnung = { id, lieferant, iban: ibanFremd, uid, gelesen: gelesenName, absender: mail.von ? [mail.von] : [] };
  u.wissen.rechnungen.unshift(neu);
  u.nachId.set(id, neu);
  return { id, doppelt: false };
}

type MailFazit = { art: "rechnung" | "doppelt" | "andere" | "ungelesen"; ungelesen: boolean };

async function mailVerarbeiten(u: Umfeld, g: GmailZugang, labelId: string | null, p: Postfach, zeile: MailZeile): Promise<MailFazit> {
  const m = await g.api<{ payload?: GmailTeil; internalDate?: string }>(`messages/${zeile.message_id}?format=full`);
  const von = kopfWert(m.payload, "From");
  const betreff = kopfWert(m.payload, "Subject");
  const datum = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null;
  await u.sb.from("postfach_mails").update({ von: von?.slice(0, 300), betreff: betreff?.slice(0, 300), datum }).eq("id", zeile.id);

  const gefunden = anhaengeFinden(m.payload);
  const { lesen, ungelesen } = anhaengeWaehlen(gefunden);
  const neu: string[] = [], doppelt: string[] = [], hinweise: string[] = [];
  for (const a of lesen) {
    // Spur, falls die Function an diesem Anhang abstürzt — steht dann beim Aufgeben in der Meldung
    await u.sb.from("postfach_mails").update({ fehler: `bei „${a.dateiname}“, ${mb(a.groesse)}`.slice(0, 1000) }).eq("id", zeile.id);
    let base64: string;
    {
      const roh = await g.api<{ data?: string }>(`messages/${zeile.message_id}/attachments/${a.attachmentId}`);
      if (!roh.data) { hinweise.push(`${a.dateiname}: leer`); continue; }
      base64 = base64Standard(roh.data);
    }
    u.gelesen++;
    u.bytes += a.groesse;
    const b = await u.lesen({ base64, mime: a.mime, name: a.dateiname, groesse: a.groesse }, u.firma);
    if (b.art !== "rechnung" || !b.lieferant?.trim()) { hinweise.push(`${a.dateiname}: ${b.art === "rechnung" ? "Lieferant unleserlich" : b.art}`); continue; }
    if (eigeneRechnung(b.lieferant, u.firma)) { hinweise.push(`${a.dateiname}: eigene Rechnung`); continue; }
    const r = await rechnungAnlegen(u, b, { base64, mime: a.mime, name: a.dateiname }, { zeileId: zeile.id, von, betreff, datum });
    (r.doppelt ? doppelt : neu).push(r.id);
  }
  // nichts gelesen, aber etwas übersprungen (z. B. nur ein zu großer Anhang) → nicht lesbar, endgültig
  const nichts = lesen.length === 0 && ungelesen.length > 0;
  const offenText = ungelesen.length ? ungelesen.join("; ").slice(0, 1000) : null;
  const ergebnis = nichts ? "fehler" : neu.length ? "rechnung" : doppelt.length ? "doppelt" : gefunden.length ? "keine_rechnung" : "ohne_anhang";
  await u.sb.from("postfach_mails").update({
    ergebnis, eingangsrechnung_id: neu[0] ?? doppelt[0] ?? null,
    fehler: nichts ? offenText : hinweise.length ? hinweise.join("; ").slice(0, 1000) : null,
    ungelesen: offenText,
  }).eq("id", zeile.id);
  if (labelId) {
    try {
      await g.api(`messages/${zeile.message_id}/modify`, {
        method: "POST",
        body: JSON.stringify({ addLabelIds: [labelId], ...(neu.length && p.als_gelesen !== false ? { removeLabelIds: ["UNREAD"] } : {}) }),
      });
    } catch (e) { console.error("Label", e); }
  }
  return { art: nichts ? "ungelesen" : neu.length ? "rechnung" : doppelt.length ? "doppelt" : "andere", ungelesen: !!offenText };
}

async function postfachAbrufen(u: Umfeld, p: Postfach, bilanz: Bilanz, lesenBis: number, zeitBis: number) {
  // Nur Postfächer der freigegebenen Domains — das Dienstkonto gilt auch für andere Kunden (M1)
  if (!domainErlaubt(p.adresse, u.domains)) {
    const text = domainText(p.adresse);
    await u.sb.from("postfaecher").update({ letzter_fehler: text }).eq("id", p.id);
    bilanz.meldungen.push(`${p.adresse}: ${text}`);
    return;
  }
  let g: GmailZugang;
  try {
    g = await u.oeffnen(p.adresse);
  } catch (e) {
    await u.sb.from("postfaecher").update({ letzter_fehler: (e as Error).message.slice(0, 500) }).eq("id", p.id);
    bilanz.meldungen.push(`${p.adresse}: ${(e as Error).message}`);
    return;
  }
  bilanz.ungelesen += await aufgeben(u.sb, p);

  // Mail-IDs der letzten 14 Tage (höchstens 300)
  const ids: string[] = [];
  let seite: string | undefined;
  do {
    const l = await g.api<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `messages?maxResults=100&q=${encodeURIComponent(u.suche)}${seite ? `&pageToken=${seite}` : ""}`);
    ids.push(...(l.messages ?? []).map((m) => m.id));
    seite = l.nextPageToken;
  } while (seite && ids.length < 300);

  const bekannt = new Map<string, MailZeile>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await u.sb.from("postfach_mails").select(SPALTEN).eq("postfach", p.adresse).in("message_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const z of (data ?? []) as MailZeile[]) bekannt.set(z.message_id, z);
  }
  const neu: string[] = [], wieder: string[] = [];
  for (const id of ids) {
    const z = bekannt.get(id);
    if (!z) neu.push(id);
    else if (z.versuche < VERSUCHE_MAX && !z.ungelesen
      && (z.ergebnis === "fehler" || (z.ergebnis === "in_arbeit" && Date.parse(z.updated_at) < Date.now() - ABGESTUERZT))) wieder.push(id);
  }
  // älteste zuerst; neue Mails vor Wiederholungen — eine Mail, an der die Function
  // abstürzt, hält die anderen nicht mehr auf
  const offen = [...neu.reverse(), ...wieder.reverse()];

  let labelId: string | null = null;
  try { labelId = await g.label(LABEL_VERARBEITET); } catch (e) { console.error("Label anlegen", e); }

  let i = 0;
  for (; i < offen.length; i++) {
    if (u.gelesen >= lesenBis || u.bytes >= BYTES_MAX || Date.now() >= zeitBis) break;
    const zeile = await beanspruchen(u.sb, p, offen[i], bekannt.get(offen[i]));
    if (!zeile) continue;
    try {
      const r = await mailVerarbeiten(u, g, labelId, p, zeile);
      if (r.art === "rechnung") bilanz.rechnungen++;
      else if (r.art === "doppelt") bilanz.doppelt++;
      else if (r.art === "ungelesen") bilanz.fehler++;
      else bilanz.andere++;
      if (r.ungelesen) bilanz.ungelesen++;
    } catch (e) {
      console.error("Mail", offen[i], e);
      const text = String((e as Error)?.message ?? e).slice(0, 900);
      if (voruebergehend(e)) {
        // zählt nicht als Versuch; der nächste Lauf versucht es wieder
        await u.sb.from("postfach_mails").update({ ergebnis: "fehler", fehler: text, versuche: Math.max(0, zeile.versuche - 1) }).eq("id", zeile.id);
        u.abbruch = `Abruf unterbrochen (${text.slice(0, 200)}) — der nächste Abruf versucht es wieder.`;
        break;
      }
      bilanz.fehler++;
      const endgueltig = zeile.versuche >= VERSUCHE_MAX;
      if (endgueltig) bilanz.ungelesen++;
      await u.sb.from("postfach_mails").update({
        ergebnis: "fehler", fehler: text, ungelesen: endgueltig ? `Nach ${zeile.versuche} Versuchen nicht lesbar: ${text}`.slice(0, 1000) : null,
      }).eq("id", zeile.id);
    }
  }
  bilanz.offen += offen.length - i;
  await u.sb.from("postfaecher").update({ zuletzt_abgerufen: new Date().toISOString(), letzter_fehler: null }).eq("id", p.id);
}

/**
 * Alle Postfächer mit „Rechnungen einlesen“ (oder nur `nurId`) abrufen.
 * `domains`: erlaubte Domains (erlaubteDomains) — Postfächer anderer Domains
 * werden übersprungen; ohne Liste keines (fail closed).
 * Reihenfolge fest: wer am längsten nicht dran war, zuerst (dann nach Adresse);
 * Lesungen und Zeit je Postfach gerecht geteilt (anteil).
 */
export async function abrufen(o: {
  sb: SupabaseClient; lesen: Leser; domains: readonly string[]; sa?: Dienstkonto; oeffnen?: Oeffner; nurId?: string | null; suche?: string;
}): Promise<Bilanz> {
  const { sb, nurId } = o;
  const oeffnen: Oeffner = o.oeffnen ?? ((adresse) => {
    if (!o.sa) throw new Error("Der Postfach-Zugang ist nicht eingerichtet.");
    return Gmail.oeffnen(o.sa, adresse);
  });
  let q = sb.from("postfaecher").select("*").eq("aktiv", true).eq("rechnungen_einlesen", true)
    .order("zuletzt_abgerufen", { ascending: true, nullsFirst: true }).order("adresse");
  if (nurId) q = q.eq("id", nurId);
  const { data: liste, error } = await q;
  if (error) throw error;
  const bilanz: Bilanz = { rechnungen: 0, doppelt: 0, andere: 0, fehler: 0, offen: 0, ungelesen: 0, meldungen: [] };
  if (!liste?.length) return bilanz;
  const postfaecher = liste as Postfach[];

  const { wissen, nachId, firma } = await wissenLaden(sb, o.domains ?? [], postfaecher);
  const u: Umfeld = {
    sb, lesen: o.lesen, oeffnen, domains: o.domains ?? [], firma, suche: o.suche ?? ABRUF_SUCHE,
    wissen, nachId, start: Date.now(), gelesen: 0, bytes: 0, abbruch: null,
  };
  for (const [k, p] of postfaecher.entries()) {
    if (u.abbruch) break;
    const a = anteil({ gelesen: u.gelesen, lesenMax: LESEN_MAX, vergangen: Date.now() - u.start, zeitMax: ZEIT_MAX, postfaecher: postfaecher.length - k });
    // keine Zeit mehr: zuletzt_abgerufen bleibt alt → dieses Postfach kommt nächstes Mal zuerst
    if (a.zeit <= 0) continue;
    try {
      await postfachAbrufen(u, p, bilanz, a.lesenBis, Date.now() + a.zeit);
    } catch (e) {
      console.error("Postfach", p.adresse, e);
      bilanz.meldungen.push(`${p.adresse}: ${(e as Error).message}`);
      await sb.from("postfaecher").update({ letzter_fehler: String((e as Error).message).slice(0, 500) }).eq("id", p.id);
    }
  }
  if (u.abbruch) bilanz.meldungen.push(u.abbruch);
  return bilanz;
}
