// Beleg lesen mit Claude — gemeinsam für `ki` (beleg_lesen, Foto/PDF aus dem
// Speicher) und `postfach-abruf` (Anhang einer Mail).
import type Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { base64Groesse, bytesBase64 } from "./mime.ts";
import { wienerTag } from "./postfach.ts";

export const MODELL = "claude-opus-5-5";

/** Inhaltsblock der Anfrage (Bild, PDF, Text) */
export type Block = Record<string, unknown>;

const POSITION = {
  type: "object",
  additionalProperties: false,
  required: ["artikelnummer", "bezeichnung", "menge", "einheit", "einzelpreis", "gesamt", "lieferschein_nr"],
  properties: {
    artikelnummer: { type: "string", description: "Artikelnummer des Lieferanten, wie gedruckt — leer, wenn unbekannt" },
    bezeichnung: { type: "string" },
    menge: { type: ["number", "null"] },
    einheit: { type: "string", description: "Stk, m, Ring, Pkg … — leer, wenn unbekannt" },
    einzelpreis: { type: ["number", "null"], description: "netto je Einheit nach Rabatt; null auf Lieferscheinen ohne Preis" },
    gesamt: { type: ["number", "null"], description: "Zeilenbetrag netto" },
    lieferschein_nr: { type: "string", description: "Lieferschein, zu dem die Zeile gehört (Rechnungen mit mehreren Lieferscheinen) — leer, wenn unbekannt" },
  },
};
export const BELEG = {
  type: "object",
  additionalProperties: false,
  required: ["art", "lieferant", "lieferant_uid", "nummer", "datum", "faellig_am", "netto", "ust_satz", "brutto", "iban", "skonto_prozent", "skonto_bis", "lieferschein_nummern", "positionen", "hinweis"],
  properties: {
    art: { type: "string", enum: ["lieferschein", "rechnung", "gutschrift", "unklar"] },
    lieferant: { type: "string", description: "leer, wenn unbekannt" },
    lieferant_uid: { type: "string", description: "UID-Nummer (USt-IdNr.) des Ausstellers, z. B. ATU12345678 — NICHT die des Empfängers; leer, wenn unbekannt" },
    nummer: { type: "string", description: "Beleg- bzw. Rechnungsnummer — leer, wenn unbekannt" },
    datum: { type: "string", description: "JJJJ-MM-TT — leer, wenn unbekannt" },
    faellig_am: { type: "string", description: "JJJJ-MM-TT, aus Zahlungsziel berechnet wenn nötig — leer, wenn unbekannt" },
    netto: { type: ["number", "null"] },
    ust_satz: { type: ["number", "null"] },
    brutto: { type: ["number", "null"] },
    iban: { type: "string", description: "IBAN des Lieferanten ohne Leerzeichen — leer, wenn unbekannt" },
    skonto_prozent: { type: ["number", "null"] },
    skonto_bis: { type: "string", description: "JJJJ-MM-TT — leer, wenn unbekannt" },
    lieferschein_nummern: { type: "array", items: { type: "string" } },
    positionen: { type: "array", items: POSITION },
    hinweis: { type: "string", description: "Was unleserlich oder unsicher war, kurz, auf Deutsch — leer, wenn unbekannt" },
  },
};

export type BelegPosition = {
  artikelnummer: string | null; bezeichnung: string; menge: number | null; einheit: string | null;
  einzelpreis: number | null; gesamt: number | null; lieferschein_nr: string | null;
};
export type GelesenerBeleg = {
  art: "lieferschein" | "rechnung" | "gutschrift" | "unklar";
  lieferant: string | null;
  /** UID des Ausstellers (fehlt bei Lesungen vor dem 18.11.2026) */
  lieferant_uid?: string | null;
  nummer: string | null; datum: string | null; faellig_am: string | null;
  netto: number | null; ust_satz: number | null; brutto: number | null; iban: string | null;
  skonto_prozent: number | null; skonto_bis: string | null; lieferschein_nummern: string[];
  positionen: BelegPosition[]; hinweis: string | null;
};

export async function strukturiert<T>(
  client: Anthropic,
  system: string,
  inhalt: Block[],
  schema: Record<string, unknown>,
  effort: "low" | "medium" | "high",
): Promise<T> {
  const r = await client.beta.messages.create({
    model: MODELL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // bei einer Ablehnung durch die Sicherheitsfilter springt ein anderes Modell ein
    fallbacks: "default",
    system,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: inhalt }],
  } as never);
  if (r.stop_reason === "refusal") throw new Error("Die KI hat die Anfrage abgelehnt.");
  if (r.stop_reason === "max_tokens") throw new Error("Der Beleg ist zu lang für einen Durchgang.");
  const text = (r.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return JSON.parse(text) as T;
}

/** Leere Texte der KI („unbekannt“) als null */
export const leerZuNull = (x: unknown): unknown =>
  x === "" ? null : Array.isArray(x) ? x.map(leerZuNull)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, leerZuNull(v)])) : x;

/**
 * Foto oder PDF lesen.
 *  - wofuer "lieferschein" / "rechnung": wie bisher in der App (der Nutzer sagt, was es ist)
 *  - wofuer "email": Anhang einer Mail — kann alles sein; nur eine Rechnung AN den
 *    Betrieb gilt als „rechnung“, alles andere (AGB, Angebot, eigene Rechnung) „unklar“.
 * `datei`: Bytes (aus dem Speicher) oder schon base64 (Mail-Anhang — so muss die
 * Function ihn für die KI nicht dekodieren und wieder kodieren).
 */
export async function belegAusDatei(
  client: Anthropic, datei: Uint8Array | { base64: string }, mime: string, wofuer: "lieferschein" | "rechnung" | "email", firma?: string | null,
): Promise<GelesenerBeleg> {
  const groesse = datei instanceof Uint8Array ? datei.length : base64Groesse(datei.base64);
  if (groesse > 20 * 1024 * 1024) throw new Error("Die Datei ist zu groß (höchstens 20 MB).");
  const b64 = datei instanceof Uint8Array ? bytesBase64(datei) : datei.base64;
  const block: Block = mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: ["image/png", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg", data: b64 } };
  const heute = wienerTag();
  const aufgabe = wofuer === "lieferschein" ? "Lies diesen Lieferschein."
    : wofuer === "rechnung" ? "Lies diese Rechnung."
    : `Diese Datei hing an einer E-Mail an ${firma || "den Betrieb"}. Ist sie eine Rechnung, die ein Lieferant, Großhändler oder ` +
      `Subunternehmer AN ${firma || "den Betrieb"} gestellt hat (zu bezahlen), dann art „rechnung“ und lies sie vollständig. ` +
      `Eine Rechnung, die ${firma || "der Betrieb"} selbst an einen Kunden gestellt hat, ist KEINE (art „unklar“). ` +
      `Mahnung zu einer Rechnung = „rechnung“ nur, wenn die vollständige Rechnung enthalten ist. ` +
      `Auftragsbestätigung, Angebot, Bestellbestätigung, AGB, Datenblatt, Werbung, Foto: art „unklar“, Felder leer, keine Positionen.`;
  return leerZuNull(await strukturiert(client,
    `Du liest Belege eines österreichischen Elektrobetriebs (Lieferscheine und Rechnungen von Großhändlern und Subunternehmern). ` +
    `Übernimm Zahlen genau wie gedruckt, Dezimalkomma → Punkt. Erfinde nichts: fehlende oder unleserliche Zahlen sind null, fehlende Texte leer. ` +
    `Jede Artikelzeile ist eine Position; Zwischensummen, Fracht-Hinweise ohne Betrag und Überschriften nicht. ` +
    `Fracht, Kupferzuschlag, Verpackung MIT Betrag sind eigene Positionen. Heute ist ${heute}.`,
    [block, { type: "text", text: aufgabe }],
    BELEG, "medium")) as GelesenerBeleg;
}
