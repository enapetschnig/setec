#!/usr/bin/env node
/**
 * Echttest Gmail-Postfach OHNE Datenbank: derselbe Code wie in den Edge
 * Functions (supabase/functions/_shared/gmail.ts, mime.ts, postfach.ts).
 *
 *   node tests/postfach-echttest.mjs <dienstkonto.json> <postfach@firma.at> [testmail-an]
 *
 * 1. Token holen, 3 neueste Betreffzeilen zeigen
 * 2. Abruf-Probe: Mails mit Anhang (14 Tage) und ihre PDF/Bild-Anhänge zeigen — nichts ändern
 * 3. optional: Testmail „ZZTEST …“ mit Umlauten und PDF-Anhang senden
 * Der Schlüssel wird nie ausgegeben. Node ≥ 22.6 (TypeScript wird direkt geladen).
 */
import fs from "node:fs";
import { dienstkontoLesen, Gmail } from "../supabase/functions/_shared/gmail.ts";
import { mailBauen } from "../supabase/functions/_shared/mime.ts";
import { ABRUF_SUCHE, anhaengeFinden, kopfWert } from "../supabase/functions/_shared/postfach.ts";

const [datei, postfach, an] = process.argv.slice(2);
if (!datei || !postfach) { console.error("Aufruf: node tests/postfach-echttest.mjs <dienstkonto.json> <postfach> [testmail-an]"); process.exit(1); }
const sa = dienstkontoLesen(Buffer.from(fs.readFileSync(datei, "utf8")).toString("base64"));

const g = await Gmail.oeffnen(sa, postfach);
console.log(`✓ Token für ${postfach}`);
const l = await g.api(`messages?maxResults=3&q=${encodeURIComponent("in:inbox")}`);
for (const m of l.messages ?? []) {
  const d = await g.api(`messages/${m.id}?format=metadata&metadataHeaders=Subject`);
  console.log(`   · ${(kopfWert(d.payload, "Subject") ?? "").slice(0, 70)}`);
}

const a = await g.api(`messages?maxResults=10&q=${encodeURIComponent(ABRUF_SUCHE)}`);
console.log(`✓ Abruf-Probe: ${a.messages?.length ?? 0} Mails mit Anhang (höchstens 10 gezeigt)`);
for (const m of a.messages ?? []) {
  const d = await g.api(`messages/${m.id}?format=full`);
  const anh = anhaengeFinden(d.payload);
  console.log(`   · ${(kopfWert(d.payload, "Subject") ?? "").slice(0, 50)} → ${anh.map((x) => `${x.dateiname} (${x.mime}, ${Math.round(x.groesse / 1024)} KB)`).join(", ") || "kein Beleg-Anhang"}`);
}
const labelId = await g.label("App: verarbeitet");
console.log(`✓ Label „App: verarbeitet“ vorhanden (${labelId})`);

if (an) {
  // kleines, gültiges PDF mit Umlaut-Dateinamen
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 70 Td (ZZTEST Anhang) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const mime = mailBauen({
    von: postfach, vonName: "ePower Prüfung – Größe", an: [an],
    betreff: "ZZTEST Postfach-Verbindung – Grüße aus der App (Ä Ö Ü ß €)",
    text: "Diese Testmail kommt über die neue Senden-Logik der SETEC-App (Gmail-API).\nUmlaute: äöüß €\n\nSie kann gelöscht werden.",
    html: "<p>Diese Testmail kommt über die neue Senden-Logik der SETEC-App (Gmail-API).<br>Umlaute: äöüß €</p>",
    anhaenge: [{ dateiname: "ZZTEST Rechnung Müller.pdf", inhalt: new Uint8Array(pdf) }],
  });
  const id = await g.senden(mime);
  console.log(`✓ Testmail an ${an} gesendet (Gmail-ID ${id})`);
  const zur = await g.api(`messages/${id}?format=full`);
  console.log(`   Betreff wie gespeichert: ${kopfWert(zur.payload, "Subject")}`);
  console.log(`   Anhang: ${anhaengeFinden(zur.payload).map((x) => x.dateiname).join(", ") || "– (PDF unter 30 KB zählt trotzdem)"}`);
  console.log(`   Labels: ${(zur.labelIds ?? []).join(", ")}`);
}
console.log("Fertig.");
