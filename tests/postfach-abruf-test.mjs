#!/usr/bin/env node
/**
 * Abruf-Test: echtes Gmail-Postfach (nur ePower: hallo@epowergmbh.at) + Docker-Testumgebung
 * des Roboters — NIE gegen SETECs Datenbank. Derselbe Kern wie die Edge Function
 * (supabase/functions/_shared/abruf.ts); statt Claude liest ein fester Leser
 * (die KI-Logik selbst ist die von `ki` → beleg_lesen).
 *
 *   node ~/Developer/_baukasten/werkzeuge/roboter/testumgebung.mjs start
 *   TEST_URL=http://127.0.0.1:55200 TEST_SERVICE_KEY=… node tests/postfach-abruf-test.mjs ~/kundendaten/google-app-mail.json
 *
 * Schickt zwei ZZTEST-Mails an das Postfach (Rechnung + AGB), ruft ab, prüft Datenbank,
 * Label und gelesen, ruft nochmal ab (nichts doppelt), räumt die Testmails weg (Papierkorb).
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { abrufen } from "../supabase/functions/_shared/abruf.ts";
import { dienstkontoLesen, Gmail } from "../supabase/functions/_shared/gmail.ts";
import { mailBauen } from "../supabase/functions/_shared/mime.ts";

const POSTFACH = "hallo@epowergmbh.at";
const [datei] = process.argv.slice(2);
const url = process.env.TEST_URL, key = process.env.TEST_SERVICE_KEY;
if (!datei || !url || !key) { console.error("Aufruf: TEST_URL=… TEST_SERVICE_KEY=… node tests/postfach-abruf-test.mjs <dienstkonto.json>"); process.exit(1); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) { console.error("Nur gegen die lokale Testumgebung!"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const sa = dienstkontoLesen(fs.readFileSync(datei, "utf8"));
const g = await Gmail.oeffnen(sa, POSTFACH);
let fehler = 0;
const pruef = (ok, text) => { console.log(`${ok ? "✓" : "✗"} ${text}`); if (!ok) fehler++; };

// ── Testmails ──
const kennung = `ZZTEST-ABRUF-${Date.now().toString(36)}`;
const pdf = (text) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const ids = [];
for (const [betreff, name, inhalt] of [
  [`${kennung} Rechnung`, "Rechnung RE-4711.pdf", pdf("RECHNUNG")],
  [`${kennung} AGB`, "AGB Onlinekauf.pdf", pdf("AGB")],
]) {
  ids.push(await g.senden(mailBauen({ von: POSTFACH, vonName: "Sonepar Österreich", an: [POSTFACH], betreff, text: "Testmail für den Abruf — kann weg.", anhaenge: [{ dateiname: name, inhalt }] })));
}
console.log(`Testmails gesendet: ${ids.join(", ")}`);
await new Promise((r) => setTimeout(r, 4000));

// ── Testdaten in der Testumgebung ──
await sb.from("postfaecher").delete().eq("adresse", POSTFACH);
const { data: pf, error: eP } = await sb.from("postfaecher").insert({ adresse: POSTFACH, rechnungen_einlesen: true, senden: false }).select("id").single();
if (eP) throw eP;
const { error: eK } = await sb.from("kunden").insert({ name: "Sonepar", art: "lieferant", namen: ["Sonepar Österreich GmbH"] });
if (eK) console.log("Kontakt nicht angelegt (egal):", eK.message);

// fester Leser statt Claude: „RECHNUNG“ im PDF → Rechnung von Sonepar
const lesen = async (bytes) => {
  const text = new TextDecoder().decode(bytes);
  if (!text.includes("RECHNUNG")) return { art: "unklar", lieferant: null, nummer: null, datum: null, faellig_am: null, netto: null, ust_satz: null, brutto: null, iban: null, skonto_prozent: null, skonto_bis: null, lieferschein_nummern: [], positionen: [], hinweis: null };
  return {
    art: "rechnung", lieferant: "Sonepar Österreich GmbH", nummer: kennung, datum: "2026-11-17", faellig_am: "2026-12-17",
    netto: 125, ust_satz: 20, brutto: 150, iban: "AT611904300234573201", skonto_prozent: 2, skonto_bis: "2026-11-27",
    lieferschein_nummern: ["LS-1"], hinweis: null,
    positionen: [
      { artikelnummer: "123", bezeichnung: "NYM-J 3x1,5", menge: 100, einheit: "m", einzelpreis: 1, gesamt: 100, lieferschein_nr: "LS-1" },
      { artikelnummer: null, bezeichnung: "Fracht", menge: null, einheit: null, einzelpreis: null, gesamt: 25, lieferschein_nr: null },
    ],
  };
};
const suche = `subject:${kennung} has:attachment newer_than:1d`;

const b1 = await abrufen({ sb, sa, lesen, suche });
console.log("1. Abruf:", JSON.stringify(b1));
pruef(b1.rechnungen === 1 && b1.andere === 1 && b1.fehler === 0, "1 Rechnung, 1 Mail ohne Rechnung");
const { data: er } = await sb.from("eingangsrechnungen").select("*, eingang_positionen(*)").eq("nummer", kennung);
pruef(er?.length === 1, "genau eine Eingangsrechnung");
const r = er?.[0];
pruef(r?.lieferant === "Sonepar", `Lieferant zugeordnet: ${r?.lieferant}`);
pruef(r?.freigabe === "offen" && Number(r?.brutto) === 150 && Number(r?.ust) === 25, "zu prüfen, Beträge stimmen");
pruef(r?.eingang_positionen?.length === 2, "2 Positionen");
pruef(!!r?.postfach_mail_id, "postfach_mail_id gesetzt (Pille „aus E-Mail“)");
const { data: dl } = await sb.storage.from("eingangsrechnungen").download(r?.datei_pfad ?? "x");
pruef(!!dl && new TextDecoder().decode(new Uint8Array(await dl.arrayBuffer())).startsWith("%PDF"), "PDF im Bucket eingangsrechnungen");
const { data: pm } = await sb.from("postfach_mails").select("ergebnis, von, betreff").eq("postfach", POSTFACH).ilike("betreff", `${kennung}%`);
pruef(pm?.length === 2 && pm.some((x) => x.ergebnis === "rechnung") && pm.some((x) => x.ergebnis === "keine_rechnung"), "postfach_mails: rechnung + keine_rechnung");

const labelId = await g.label("App: verarbeitet");
for (const [i, id] of ids.entries()) {
  const m = await g.api(`messages/${id}?format=minimal`);
  const l = m.labelIds ?? [];
  pruef(l.includes(labelId), `Mail ${i + 1}: Label „App: verarbeitet“`);
  if (i === 0) pruef(!l.includes("UNREAD"), "Rechnungs-Mail als gelesen markiert");
}

const b2 = await abrufen({ sb, sa, lesen, suche });
pruef(b2.rechnungen + b2.andere + b2.doppelt + b2.fehler === 0, "2. Abruf: nichts doppelt verarbeitet");

// gleiche Rechnung aus einer anderen Mail → doppelt
await sb.from("postfach_mails").delete().eq("postfach", POSTFACH).ilike("betreff", `${kennung} Rechnung`);
const b3 = await abrufen({ sb, sa, lesen, suche });
const { count } = await sb.from("eingangsrechnungen").select("id", { count: "exact", head: true }).eq("nummer", kennung);
pruef(b3.doppelt === 1 && count === 1, "gleiche Rechnung nochmal → „doppelt“, nicht neu angelegt");

// ── aufräumen: Testmails in den Papierkorb (Testumgebung räumt `testumgebung.mjs stop` weg) ──
for (const id of ids) await g.api(`messages/${id}/trash`, { method: "POST" });
console.log(fehler ? `${fehler} Prüfung(en) fehlgeschlagen` : "Alle Prüfungen bestanden.");
process.exit(fehler ? 1 : 0);
