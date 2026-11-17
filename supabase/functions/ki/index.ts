// KI für die Elektriker-App — ein Endpunkt, zwei Aufgaben (Claude, Anthropic):
//
//   { aufgabe: "beleg_lesen", bucket: "lieferscheine" | "eingangsrechnungen", pfad }
//     → Lieferschein- oder Rechnungsfoto/PDF lesen: Kopf, IBAN, Skonto, Positionen.
//       Die Datei lädt die Funktion MIT DEN RECHTEN DES AUFRUFERS — wer sie in
//       der App nicht sehen darf, bekommt sie auch hier nicht.
//
//   { aufgabe: "material_vorschlag", text: "PV-Anlage 9 kWp mit Speicher" }
//     → (1) Claude zerlegt das Vorhaben in Komponenten mit Suchwörtern und Mengen,
//       (2) je Komponente sucht die Datenbank Kandidaten im Artikelstamm
//           (artikel_suchen, RLS wie in der App),
//       (3) Claude wählt je Komponente den passenden Artikel (oder keinen).
//     Nur der Chef (Angebote).
//
//   { aufgabe: "material_vorschlag", modus: "verbraucht", text: "3 Steckdosen, 20 m NYM 3x1,5" }
//     → dasselbe für den Regiebericht: genau das Gesagte (Material, das verbaut
//       wurde), nichts dazugeplant, Mengen wie gesagt. Alle freigeschalteten
//       Mitarbeiter — der Monteur redet es auf der Baustelle rein.
//
// Secret: ANTHROPIC_API_KEY (supabase secrets set …)
import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { belegAusDatei, strukturiert } from "../_shared/beleg.ts";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

// ── Schemas (strukturierte Ausgabe; Beleg-Schema in _shared/beleg.ts) ─────
const KOMPONENTEN = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "komponenten", "hinweise"],
  properties: {
    titel: { type: "string", description: "kurzer Titel für das Angebot" },
    komponenten: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["gruppe", "was", "suche", "menge", "einheit", "begruendung"],
        properties: {
          gruppe: { type: "string", description: "z. B. Module, Wechselrichter, Schutz, Leitungen, Montage" },
          was: { type: "string", description: "Komponente in Worten, z. B. „Hybrid-Wechselrichter 10 kW 3-phasig“" },
          suche: {
            type: "array", items: { type: "string" },
            description: "2–3 Suchtexte für einen deutschen Elektro-Großhandelskatalog, vom genauesten zum allgemeinsten, je 1–3 Wörter (z. B. „Wechselrichter 10“, „Wechselrichter“)",
          },
          menge: { type: "number" },
          einheit: { type: "string" },
          begruendung: { type: "string", description: "ein kurzer Satz, warum diese Menge" },
        },
      },
    },
    hinweise: { type: "array", items: { type: "string" }, description: "Was vor Ort zu klären ist (Dach, Zählerplatz, Netzbetreiber …)" },
  },
};
const AUSWAHL = {
  type: "object",
  additionalProperties: false,
  required: ["wahl"],
  properties: {
    wahl: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "artikel_id", "passt"],
        properties: {
          nr: { type: "integer", description: "Nummer der Komponente" },
          artikel_id: { type: "string", description: "id des besten Kandidaten, leer wenn keiner passt" },
          passt: { type: "string", enum: ["genau", "aehnlich", "keiner"] },
        },
      },
    },
  },
};

async function belegLesen(client: Anthropic, sb: SupabaseClient, bucket: string, pfad: string) {
  if (bucket !== "lieferscheine" && bucket !== "eingangsrechnungen") throw new Error("Unbekannter Speicherort.");
  const { data, error } = await sb.storage.from(bucket).download(pfad);
  if (error || !data) throw new Error("Datei nicht gefunden oder kein Zugriff.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mime = data.type || (pfad.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  return await belegAusDatei(client, bytes, mime, bucket === "lieferscheine" ? "lieferschein" : "rechnung");
}

type Komponente = { gruppe: string; was: string; suche: string[]; menge: number; einheit: string; begruendung: string };
type Kandidat = { id: string; bezeichnung: string; hersteller: string | null; artikelnummer: string | null; einheit: string; listenpreis: number | null; ek_preis: number | null };

async function materialVorschlag(client: Anthropic, sb: SupabaseClient, text: string, verbraucht: boolean) {
  const plan = await strukturiert<{ titel: string; komponenten: Komponente[]; hinweise: string[] }>(client,
    verbraucht
      ? `Ein Elektromonteur in Österreich sagt per Spracheingabe, welches Material er bei einem Einsatz verbaut hat. ` +
        `Zerlege das Gesagte in einzelne Positionen: genau das Genannte, in der genannten Menge und Einheit ` +
        `(„20 Meter“ = 20 m, „ein“ = 1, ohne Menge = 1). Erfinde nichts dazu, plane nichts, fasse nichts zusammen. ` +
        `Die Spracherkennung macht Fehler („NYM 3 mal 1,5“ = NYM-J 3x1,5) — korrigiere offensichtliche. ` +
        `Gruppe immer „Material“, Begründung leer, Hinweise nur, wenn etwas unverständlich war. Höchstens 30 Positionen.`
      : `Du bist erfahrener Elektrotechnik-Meister in Österreich und stellst die Materialliste für ein Angebot zusammen ` +
        `(ÖVE/ÖNORM, übliche Großhandelsware). Nur Material, keine Arbeitsstunden. Realistische Mengen für ein typisches ` +
        `Objekt; wenn eine Angabe fehlt, nimm das Übliche an und schreib es in die Hinweise. Höchstens 20 Komponenten, Kleinteile zusammenfassen.`,
    [{ type: "text", text: verbraucht ? `Gesagt: ${text}` : `Vorhaben: ${text}` }], KOMPONENTEN, "low");
  plan.komponenten = plan.komponenten.slice(0, 30);

  // je Komponente Kandidaten aus dem Artikelstamm (vom genauesten Suchtext abwärts)
  // (ohne Tippfehler-Suche, höchstens vier Komponenten gleichzeitig — schont die Datenbank)
  const suchen = async (k: Komponente) => {
    const gefunden = new Map<string, Kandidat>();
    for (const q of k.suche.slice(0, 3)) {
      if (gefunden.size >= 6) break;
      const { data, error } = await sb.rpc("artikel_suchen", { p_q: q, p_anzahl: 8, p_unscharf: false });
      if (error) throw new Error(`Artikelsuche: ${error.message}`);
      for (const a of (data ?? []) as Kandidat[]) if (gefunden.size < 10) gefunden.set(a.id, a);
    }
    return [...gefunden.values()];
  };
  const kandidaten: Kandidat[][] = new Array(plan.komponenten.length);
  let naechste = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (naechste < plan.komponenten.length) {
      const i = naechste++;
      kandidaten[i] = await suchen(plan.komponenten[i]);
    }
  }));

  const liste = plan.komponenten.map((k, i) =>
    `${i + 1}. ${k.was} (${k.menge} ${k.einheit})\n` +
    (kandidaten[i].length
      ? kandidaten[i].map((a) => `   - id ${a.id}: ${a.bezeichnung}${a.hersteller ? ` · ${a.hersteller}` : ""} · ${a.einheit}${a.listenpreis != null ? ` · Liste ${a.listenpreis} €` : ""}`).join("\n")
      : "   (keine Kandidaten)")).join("\n");
  const auswahl = kandidaten.some((k) => k.length)
    ? await strukturiert<{ wahl: { nr: number; artikel_id: string | null; passt: string }[] }>(client,
      `Wähle je Komponente den Artikel aus der Kandidatenliste, der fachlich passt (Typ, Leistung, Querschnitt, Polzahl). ` +
      `Passt keiner, artikel_id leer. Nimm nur ids aus der Liste.`,
      [{ type: "text", text: liste }], AUSWAHL, "low")
    : { wahl: [] };

  return {
    titel: plan.titel,
    hinweise: plan.hinweise,
    komponenten: plan.komponenten.map((k, i) => {
      const w = auswahl.wahl.find((x) => x.nr === i + 1);
      const artikel = kandidaten[i].find((a) => a.id === w?.artikel_id) ?? null;
      return { ...k, artikel, passt: artikel ? w?.passt ?? "aehnlich" : "keiner", alternativen: kandidaten[i].filter((a) => a.id !== artikel?.id).slice(0, 5) };
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  try {
    const schluessel = Deno.env.get("ANTHROPIC_API_KEY");
    if (!schluessel) return antwort({ fehler: "Die KI ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." }, 503);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: nutzer } = await sb.auth.getUser();
    if (!nutzer?.user) return antwort({ fehler: "Bitte anmelden." }, 401);
    const { data: aktiv } = await sb.rpc("ist_aktiv");
    if (!aktiv) return antwort({ fehler: "Das Konto ist nicht freigeschaltet." }, 403);

    const body = await req.json();
    const client = new Anthropic({ apiKey: schluessel });
    if (body.aufgabe === "beleg_lesen") {
      return antwort({ daten: await belegLesen(client, sb, String(body.bucket ?? ""), String(body.pfad ?? "")) });
    }
    if (body.aufgabe === "material_vorschlag") {
      const verbraucht = body.modus === "verbraucht";
      if (!verbraucht) {
        const { data: chef } = await sb.rpc("ist_chef");
        if (!chef) return antwort({ fehler: "Materialvorschläge gibt es für Angebote — nur für den Chef." }, 403);
      }
      const text = String(body.text ?? "").trim().slice(0, 1000);
      if (text.length < 3) return antwort({ fehler: verbraucht ? "Bitte sagen, welches Material verbaut wurde." : "Bitte kurz beschreiben, was gebaut wird." }, 400);
      return antwort({ daten: await materialVorschlag(client, sb, text, verbraucht) });
    }
    return antwort({ fehler: "Unbekannte Aufgabe." }, 400);
  } catch (e) {
    const meldung = e instanceof Anthropic.APIError
      ? (e.status === 429 ? "Die KI ist gerade ausgelastet — bitte gleich nochmal." : `KI-Fehler (${e.status}): ${e.message.slice(0, 300)}`)
      : (e as Error).message;
    console.error(e);
    return antwort({ fehler: meldung }, 500);
  }
});
