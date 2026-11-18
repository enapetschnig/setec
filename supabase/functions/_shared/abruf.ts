// Rechnungen aus den Postfächern holen — Kern der Edge Function postfach-abruf,
// ohne Deno-Globals und ohne npm:-Laufzeitimporte: die KI kommt als `lesen`
// herein. So läuft derselbe Code in der Function und im Node-Test gegen die
// Docker-Testumgebung (tests/postfach-abruf-test.mjs).
//
// Je Mail: Zeile in postfach_mails VOR der KI anlegen (unique Postfach +
// Message-ID → Knopf und Cron nie doppelt), Anhänge (PDF/Bild) lesen, Rechnung
// AN den Betrieb → Eingangsrechnung „zu prüfen“ samt Datei und Positionen,
// gleicher Lieferant + Nummer → „doppelt“. Gmail-Label „App: verarbeitet“,
// gelesen nur bei Rechnungen. Höchstens LESEN_MAX Anhänge je Lauf.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import type { GelesenerBeleg } from "./beleg.ts";
import { Gmail, type Dienstkonto } from "./gmail.ts";
import { base64Bytes } from "./mime.ts";
import {
  ABRUF_SUCHE, anhaengeFinden, eigeneRechnung, kopfWert, LABEL_VERARBEITET, lieferantZuordnen,
  nummerSchluessel, schluessel, type GmailTeil, type LieferantKontakt,
} from "./postfach.ts";

export type Leser = (bytes: Uint8Array, mime: string, firma: string | null) => Promise<GelesenerBeleg>;

export const LESEN_MAX = 6;          // Claude-Aufrufe je Lauf
const ZEIT_MAX = 110_000;            // ms, dann keine neue Mail mehr anfangen
const ANHAENGE_JE_MAIL = 4;
const VERSUCHE_MAX = 3;

type Postfach = { id: string; adresse: string };
type MailZeile = { id: string; message_id: string; ergebnis: string; versuche: number; updated_at: string };
export type Bilanz = { rechnungen: number; doppelt: number; andere: number; fehler: number; offen: number; meldungen: string[] };

const isoTag = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const geld = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const dateiname = (n: string) => n.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, "_").slice(-100) || "beleg";

// ── Abruf ─────────────────────────────────────────────────────────────────
type Umfeld = {
  sb: SupabaseClient; lesen: Leser; firma: string | null; suche: string;
  kontakte: LieferantKontakt[]; bisher: string[]; start: number; gelesen: number;
};

/** Mail übernehmen (Zeile anlegen oder einen alten Fehlschlag erneut beanspruchen) — null = jemand anderer ist dran */
async function beanspruchen(sb: SupabaseClient, p: Postfach, messageId: string, alt: MailZeile | undefined): Promise<MailZeile | null> {
  if (!alt) {
    const { data, error } = await sb.from("postfach_mails")
      .insert({ postfach_id: p.id, postfach: p.adresse, message_id: messageId, ergebnis: "in_arbeit", versuche: 1 })
      .select("id, message_id, ergebnis, versuche, updated_at").maybeSingle();
    if (error) { if (error.code === "23505") return null; throw error; }
    return data as MailZeile;
  }
  const { data, error } = await sb.from("postfach_mails")
    .update({ ergebnis: "in_arbeit", versuche: alt.versuche + 1, fehler: null })
    .eq("id", alt.id).eq("ergebnis", alt.ergebnis).eq("updated_at", alt.updated_at)
    .select("id, message_id, ergebnis, versuche, updated_at").maybeSingle();
  if (error) throw error;
  return (data as MailZeile | null) ?? null;
}

async function rechnungAnlegen(u: Umfeld, b: GelesenerBeleg, datei: { bytes: Uint8Array; mime: string; name: string },
  mail: { zeileId: string; von: string | null; betreff: string | null; datum: string | null }): Promise<{ id: string; doppelt: boolean }> {
  const lieferant = lieferantZuordnen(b.lieferant, u.kontakte, u.bisher, mail.von) ?? b.lieferant!;
  const s = schluessel(lieferant);

  // gleiche Rechnung schon da? (Lieferant + Nummer, ohne Nummer: Lieferant + Datum + Brutto)
  let q = u.sb.from("eingangsrechnungen").select("id, lieferant, nummer, datum, brutto");
  if (b.nummer) q = q.ilike("nummer", `%${b.nummer.replace(/\s+/g, "%").replace(/[_\\]/g, "\\$&")}%`);
  else q = q.eq("datum", isoTag(b.datum) ?? "1900-01-01");
  const { data: kandidaten, error: eK } = await q.limit(50);
  if (eK) throw eK;
  const da = (kandidaten ?? []).find((r) => schluessel(r.lieferant) === s && (b.nummer
    ? nummerSchluessel(r.nummer) === nummerSchluessel(b.nummer)
    : geld(Number(r.brutto)) === geld(b.brutto)));
  if (da) return { id: da.id, doppelt: true };

  // vom selben Händler: Lastschrift und IBAN wie zuletzt
  const { data: letzte } = await u.sb.from("eingangsrechnungen").select("lieferant, iban, lastschrift, lastschrift_tag")
    .ilike("lieferant", lieferant.replace(/[%_\\]/g, "\\$&")).order("datum", { ascending: false }).limit(1).maybeSingle();

  const datum = isoTag(b.datum) ?? (mail.datum ? mail.datum.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const faellig = isoTag(b.faellig_am);
  const satz = b.ust_satz != null && b.ust_satz >= 0 && b.ust_satz <= 30 ? b.ust_satz : 20;
  let netto = geld(b.netto), brutto = geld(b.brutto);
  if (netto == null && brutto != null) netto = geld(brutto / (1 + satz / 100));
  if (brutto == null && netto != null) brutto = geld(netto * (1 + satz / 100));
  const iban = (b.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const skonto = b.skonto_prozent != null && b.skonto_prozent > 0 && b.skonto_prozent < 100 ? b.skonto_prozent : null;

  const id = crypto.randomUUID();
  const pfad = `${id}/${crypto.randomUUID().slice(0, 8)}-${dateiname(datei.name)}`;
  const { error: eU } = await u.sb.storage.from("eingangsrechnungen").upload(pfad, datei.bytes, { contentType: datei.mime });
  if (eU) throw new Error(`Datei nicht abgelegt: ${eU.message}`);

  const notiz = [
    `Aus E-Mail${mail.von ? ` von ${mail.von}` : ""}${mail.betreff ? `: „${mail.betreff}“` : ""}`,
    b.hinweis ? `KI: ${b.hinweis}` : null,
  ].filter(Boolean).join("\n").slice(0, 1000);
  const { error: eI } = await u.sb.from("eingangsrechnungen").insert({
    id, lieferant, nummer: b.nummer, datum, faellig_am: faellig && faellig >= datum ? faellig : null,
    netto: netto ?? 0, ust_satz: satz, ust: geld((brutto ?? 0) - (netto ?? 0)) ?? 0, brutto: brutto ?? 0,
    iban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : letzte?.iban ?? null,
    skonto_prozent: skonto, skonto_bis: skonto ? isoTag(b.skonto_bis) : null,
    lieferschein_nummern: (b.lieferschein_nummern ?? []).filter(Boolean).slice(0, 50),
    lastschrift: letzte?.lastschrift ?? false, lastschrift_tag: letzte?.lastschrift ? letzte.lastschrift_tag : null,
    notiz, datei_pfad: pfad, datei_name: datei.name.slice(0, 200), datei_mime: datei.mime, postfach_mail_id: mail.zeileId,
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
  u.bisher.push(lieferant);
  return { id, doppelt: false };
}

async function mailVerarbeiten(u: Umfeld, g: Gmail, labelId: string | null, zeile: MailZeile): Promise<"rechnung" | "doppelt" | "andere"> {
  const m = await g.api<{ payload?: GmailTeil; internalDate?: string }>(`messages/${zeile.message_id}?format=full`);
  const von = kopfWert(m.payload, "From");
  const betreff = kopfWert(m.payload, "Subject");
  const datum = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null;
  await u.sb.from("postfach_mails").update({ von: von?.slice(0, 300), betreff: betreff?.slice(0, 300), datum }).eq("id", zeile.id);

  const anhaenge = anhaengeFinden(m.payload).slice(0, ANHAENGE_JE_MAIL);
  const neu: string[] = [], doppelt: string[] = [], hinweise: string[] = [];
  for (const a of anhaenge) {
    const roh = await g.api<{ data?: string }>(`messages/${zeile.message_id}/attachments/${a.attachmentId}`);
    if (!roh.data) continue;
    const bytes = base64Bytes(roh.data);
    u.gelesen++;
    const b = await u.lesen(bytes, a.mime, u.firma);
    if (b.art !== "rechnung" || !b.lieferant?.trim()) { hinweise.push(`${a.dateiname}: ${b.art === "rechnung" ? "Lieferant unleserlich" : b.art}`); continue; }
    if (eigeneRechnung(b.lieferant, u.firma)) { hinweise.push(`${a.dateiname}: eigene Rechnung`); continue; }
    const r = await rechnungAnlegen(u, b, { bytes, mime: a.mime, name: a.dateiname }, { zeileId: zeile.id, von, betreff, datum });
    (r.doppelt ? doppelt : neu).push(r.id);
  }
  const ergebnis = neu.length ? "rechnung" : doppelt.length ? "doppelt" : anhaenge.length ? "keine_rechnung" : "ohne_anhang";
  await u.sb.from("postfach_mails").update({
    ergebnis, eingangsrechnung_id: neu[0] ?? doppelt[0] ?? null,
    fehler: hinweise.length ? hinweise.join("; ").slice(0, 1000) : null,
  }).eq("id", zeile.id);
  if (labelId) {
    try {
      await g.api(`messages/${zeile.message_id}/modify`, {
        method: "POST",
        body: JSON.stringify({ addLabelIds: [labelId], ...(neu.length ? { removeLabelIds: ["UNREAD"] } : {}) }),
      });
    } catch (e) { console.error("Label", e); }
  }
  return neu.length ? "rechnung" : doppelt.length ? "doppelt" : "andere";
}

async function postfachAbrufen(u: Umfeld, sa: Dienstkonto, p: Postfach, bilanz: Bilanz, grenze = LESEN_MAX) {
  let g: Gmail;
  try {
    g = await Gmail.oeffnen(sa, p.adresse);
  } catch (e) {
    await u.sb.from("postfaecher").update({ letzter_fehler: (e as Error).message }).eq("id", p.id);
    bilanz.meldungen.push(`${p.adresse}: ${(e as Error).message}`);
    return;
  }
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
    const { data, error } = await u.sb.from("postfach_mails").select("id, message_id, ergebnis, versuche, updated_at")
      .eq("postfach", p.adresse).in("message_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const z of (data ?? []) as MailZeile[]) bekannt.set(z.message_id, z);
  }
  const alt = Date.now() - 10 * 60_000;
  const offen = ids.filter((id) => {
    const z = bekannt.get(id);
    if (!z) return true;
    if (z.versuche >= VERSUCHE_MAX) return false;
    return z.ergebnis === "fehler" || (z.ergebnis === "in_arbeit" && Date.parse(z.updated_at) < alt);
  }).reverse(); // älteste zuerst

  let labelId: string | null = null;
  try { labelId = await g.label(LABEL_VERARBEITET); } catch (e) { console.error("Label anlegen", e); }

  let i = 0;
  for (; i < offen.length; i++) {
    if (u.gelesen >= grenze || Date.now() - u.start > ZEIT_MAX) break;
    const zeile = await beanspruchen(u.sb, p, offen[i], bekannt.get(offen[i]));
    if (!zeile) continue;
    try {
      const r = await mailVerarbeiten(u, g, labelId, zeile);
      if (r === "rechnung") bilanz.rechnungen++; else if (r === "doppelt") bilanz.doppelt++; else bilanz.andere++;
    } catch (e) {
      console.error("Mail", offen[i], e);
      bilanz.fehler++;
      await u.sb.from("postfach_mails").update({ ergebnis: "fehler", fehler: String((e as Error).message ?? e).slice(0, 1000) }).eq("id", zeile.id);
    }
  }
  bilanz.offen += offen.length - i;
  await u.sb.from("postfaecher").update({ zuletzt_abgerufen: new Date().toISOString(), letzter_fehler: null }).eq("id", p.id);
}

export async function abrufen(o: { sb: SupabaseClient; sa: Dienstkonto; lesen: Leser; nurId?: string | null; suche?: string }): Promise<Bilanz> {
  const { sb, sa, nurId } = o;
  let q = sb.from("postfaecher").select("id, adresse").eq("aktiv", true).eq("rechnungen_einlesen", true);
  if (nurId) q = q.eq("id", nurId);
  const { data: liste, error } = await q;
  if (error) throw error;
  const bilanz: Bilanz = { rechnungen: 0, doppelt: 0, andere: 0, fehler: 0, offen: 0, meldungen: [] };
  if (!liste?.length) return bilanz;

  const { data: f } = await sb.from("firma").select("name").limit(1).maybeSingle();
  const { data: kontakte } = await sb.from("kunden").select("name, namen, email").in("art", ["lieferant", "partner"]).limit(5000);
  const { data: bisher } = await sb.from("eingangsrechnungen").select("lieferant").order("created_at", { ascending: false }).limit(1000);
  const u: Umfeld = {
    sb, lesen: o.lesen, firma: f?.name ?? null, suche: o.suche ?? ABRUF_SUCHE,
    kontakte: (kontakte ?? []) as LieferantKontakt[], bisher: [...new Set((bisher ?? []).map((r) => r.lieferant as string))],
    start: Date.now(), gelesen: 0,
  };
  // Jedes Postfach bekommt seinen Anteil an den Lesungen — sonst verbraucht das erste mit
  // Rückstand alles und das zweite kommt nie dran (18.11.2026: office@ vor s.sattler@).
  // Was eines nicht braucht, bekommen die nächsten.
  const postfaecher = liste as Postfach[];
  for (const [k, p] of postfaecher.entries()) {
    const grenze = u.gelesen + Math.ceil((LESEN_MAX - u.gelesen) / (postfaecher.length - k));
    try { await postfachAbrufen(u, sa, p, bilanz, grenze); } catch (e) {
      console.error("Postfach", p.adresse, e);
      bilanz.meldungen.push(`${p.adresse}: ${(e as Error).message}`);
      await sb.from("postfaecher").update({ letzter_fehler: (e as Error).message.slice(0, 500) }).eq("id", p.id);
    }
  }
  return bilanz;
}

