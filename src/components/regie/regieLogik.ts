import { stundenAusVonBis, uhrzeit, zahlLesen, zahlUngueltig } from "@/lib/format";

/**
 * Regiebericht — Rechen- und Prüfregeln ohne Datenbank und ohne React.
 * Editor, Kundenansicht und PDF rechnen damit dasselbe, und es lässt sich
 * testen (regie.test.ts).
 */

export type ZeitModus = "stunden" | "vonbis";

/**
 * Eine Zeile „Arbeitszeit der Partie“.
 *  neu         — wird beim Speichern als Stunde gebucht
 *  bericht     — ist schon eine Stunde dieses Berichts (zeiten.regiebericht_id)
 *  uebernehmen — schon vorhandene Buchung am Projekt und Tag; beim Speichern
 *                bekommt sie die regiebericht_id, statt doppelt gebucht zu werden
 */
export type ZeitZeile = {
  key: string;
  id: string | null;
  herkunft: "neu" | "bericht" | "uebernehmen";
  userId: string;
  modus: ZeitModus;
  stunden: string;
  von: string;
  bis: string;
  pause: string;
  /** Spiegel der RLS: eigene, selbst angelegte oder Chef — und nicht verrechnet */
  aenderbar: boolean;
  /** Stand in der Datenbank, um Änderungen zu erkennen (nur bei vorhandenen Zeilen) */
  basis: ZeitBasis | null;
  /** schon in einer Rechnung — dann auch nicht mehr aus dem Bericht zu nehmen */
  verrechnet?: boolean;
};

export type ZeitBasis = { stunden: number; von: string | null; bis: string | null; pause: number; datum: string };

/** Lagerort-ID oder „direkt“ (gekauft/geliefert, ohne Lager) */
export const DIREKT = "direkt";

export type MaterialZeile = {
  key: string;
  id: string | null;
  artikelId: string | null;
  bezeichnung: string;
  einheit: string;
  menge: string;
  quelle: string;
  ekPreis: number | null;
  aenderbar: boolean;
  basis: { menge: number; quelle: string } | null;
  /** wer gebucht hat — für den Hinweis bei gesperrten Zeilen */
  userId: string | null;
  verrechnet?: boolean;
};

export const SCHNELLWAHL_STUNDEN = [1, 2, 4, 8];

// ── Stunden ──────────────────────────────────────────────────────────────

type ZeitWerteQuelle = Pick<ZeitZeile, "modus" | "stunden" | "von" | "bis" | "pause">;

export function zeileStunden(z: ZeitWerteQuelle): number {
  return z.modus === "stunden" ? zahlLesen(z.stunden) : stundenAusVonBis(z.von, z.bis, zahlLesen(z.pause));
}

/** Neue Zeile ohne Eingabe — zählt nicht, wird nicht gespeichert */
export function zeileLeer(z: Pick<ZeitZeile, "herkunft" | "modus" | "stunden" | "von" | "bis">): boolean {
  if (z.herkunft !== "neu") return false;
  return z.modus === "stunden" ? !z.stunden.trim() : !z.von && !z.bis;
}

export function zeileFehler(z: ZeitZeile): string | null {
  if (zeileLeer(z)) return null;
  if (z.modus === "vonbis") {
    if (!z.von || !z.bis) return "Von und Bis eintragen";
    if (z.bis.slice(0, 5) === z.von.slice(0, 5)) return "Von und Bis sind gleich";
    if (zahlUngueltig(z.pause)) return "Die Pause ist keine Zahl";
    if (zahlLesen(z.pause) < 0) return "Die Pause kann nicht negativ sein";
    if (zeileStunden(z) <= 0) return "Die Pause ist länger als die Arbeitszeit";
  }
  if (z.modus === "stunden" && zahlUngueltig(z.stunden)) return "Die Stunden sind keine Zahl";
  const h = zeileStunden(z);
  if (!(h > 0)) return "Stunden eintragen";
  if (h > 24) return "Höchstens 24 Stunden";
  return null;
}

/** Werte für die Tabelle zeiten */
export function zeitWerte(z: ZeitWerteQuelle) {
  const vonbis = z.modus === "vonbis";
  return {
    stunden: Math.round(zeileStunden(z) * 100) / 100,
    von: vonbis ? z.von.slice(0, 5) : null,
    bis: vonbis ? z.bis.slice(0, 5) : null,
    pause_minuten: vonbis ? Math.max(0, Math.round(zahlLesen(z.pause))) : 0,
  };
}

export function zeitBasisAusDb(z: { stunden: number; von: string | null; bis: string | null; pause_minuten: number; datum: string }): ZeitBasis {
  return {
    stunden: Number(z.stunden),
    von: z.von ? z.von.slice(0, 5) : null,
    bis: z.bis ? z.bis.slice(0, 5) : null,
    pause: Number(z.pause_minuten) || 0,
    datum: z.datum,
  };
}

/** Hat sich eine vorhandene Zeile geändert (Werte oder Datum des Berichts)? */
export function zeitGeaendert(z: ZeitZeile, datum: string): boolean {
  if (!z.basis) return false;
  const w = zeitWerte(z);
  return w.stunden !== z.basis.stunden || w.von !== z.basis.von || w.bis !== z.basis.bis
    || w.pause_minuten !== z.basis.pause || datum !== z.basis.datum;
}

export function summeStunden(zeilen: ZeitWerteQuelle[]): number {
  return Math.round(zeilen.reduce((s, z) => s + zeileStunden(z), 0) * 100) / 100;
}

/** "07:00–15:30 · 30 Min. Pause" — leer, wenn ohne Uhrzeit gebucht */
export function zeitSpanne(von: string | null | undefined, bis: string | null | undefined, pause?: number | null): string {
  if (!von || !bis) return "";
  return `${uhrzeit(von)}–${uhrzeit(bis)}${pause ? ` · ${pause} Min. Pause` : ""}`;
}

/** Spiegel der RLS auf zeiten: ändern/löschen darf, wem sie gehört, wer sie angelegt hat, oder der Chef */
export function darfZeitAendern(
  z: { user_id: string; erstellt_von: string | null; rechnung_id: string | null },
  ich: string | undefined,
  istChef: boolean,
): boolean {
  if (z.rechnung_id) return false;
  return istChef || (!!ich && (z.user_id === ich || z.erstellt_von === ich));
}

/** Spiegel der RLS auf material_buchungen */
export function darfMaterialAendern(m: { user_id: string | null; rechnung_id: string | null }, ich: string | undefined, istChef: boolean): boolean {
  if (m.rechnung_id) return false;
  return istChef || (!!ich && m.user_id === ich);
}

// ── Der Editor als Ganzes ───────────────────────────────────────────────

export type EntfernteZeit = { id: string; behalten: boolean };

/** Alles, was im Editor steht — gespeichert wird erst auf Knopfdruck */
export type Entwurf = {
  berichtId: string | null;
  nummer: string | null;
  projektId: string;
  /** Service ohne Projekt: der Bericht hängt am Kunden (kundeId) mit eigenem Einsatzort */
  ohneProjekt: boolean;
  kundeId: string;
  adresse: Adresse;
  /** Termin aus dem Kalender, aus dem der Bericht entstand */
  terminId: string | null;
  datum: string;
  arbeiten: string;
  /** Kopf, wie er in der Datenbank steht */
  kopfBasis: KopfBasis | null;
  zeilen: ZeitZeile[];
  material: MaterialZeile[];
  /** Beim Speichern: Stunden löschen oder nur aus dem Bericht nehmen (behalten), Material löschen */
  entfernt: { zeiten: EntfernteZeit[]; material: string[] };
};

/**
 * Vergleichswert, um ungespeicherte Änderungen zu erkennen. Mit
 * gerechneten Werten statt Eingabetext („6.5“ = „6,5“) und ohne Reihenfolge —
 * nach dem Speichern kommen die Zeilen aus der Datenbank anders sortiert zurück.
 */
export function schnappschuss(e: Entwurf): string {
  const sortiert = (liste: unknown[]) => liste.map((x) => JSON.stringify(x)).sort();
  return JSON.stringify({
    p: e.ohneProjekt ? "" : e.projektId,
    k: e.ohneProjekt ? [e.kundeId, adresseSauber(e.adresse)] : null,
    d: e.datum,
    a: e.arbeiten,
    z: sortiert(e.zeilen.filter((z) => !zeileLeer(z)).map((z) => [z.id, z.herkunft, z.userId, zeitWerte(z)])),
    m: sortiert(e.material.map((m) => [m.id, m.artikelId, m.bezeichnung.trim(), m.einheit, materialMenge(m), m.quelle])),
    x: sortiert([...e.entfernt.zeiten.map((x) => ["z", x.id, x.behalten]), ...e.entfernt.material.map((id) => ["m", id])]),
  });
}

export type Adresse = { strasse: string; plz: string; ort: string };
export type KopfBasis = { datum: string; arbeiten: string; projektId: string | null; kundeId: string | null; adresse: Adresse };

export const LEERE_ADRESSE: Adresse = { strasse: "", plz: "", ort: "" };

const adresseSauber = (a: Adresse | null | undefined): Adresse => ({
  strasse: (a?.strasse ?? "").trim(), plz: (a?.plz ?? "").trim(), ort: (a?.ort ?? "").trim(),
});

/** „Hauptstraße 5, 8605 Kapfenberg“ */
export function adresseText(a: Partial<Adresse> | null | undefined): string {
  if (!a) return "";
  return [a.strasse?.trim(), [a.plz?.trim(), a.ort?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Was am Bericht in der Datenbank steht: mit Projekt nur projekt_id, ohne
 * Projekt Kunde und Einsatzort (Schnappschuss — zieht der Kunde um, bleibt
 * der Bericht, wo gearbeitet wurde).
 */
export function kopfWerte(e: Pick<Entwurf, "ohneProjekt" | "projektId" | "kundeId" | "adresse">) {
  const a = adresseSauber(e.adresse);
  return e.ohneProjekt
    ? { projekt_id: null, kunde_id: e.kundeId || null, strasse: a.strasse || null, plz: a.plz || null, ort: a.ort || null }
    : { projekt_id: e.projektId || null, kunde_id: null, strasse: null, plz: null, ort: null };
}

/** Kopf für den Vergleich mit der Datenbank */
export function kopfBasisAus(e: Pick<Entwurf, "ohneProjekt" | "projektId" | "kundeId" | "adresse" | "datum" | "arbeiten">): KopfBasis {
  const w = kopfWerte(e);
  return {
    datum: e.datum, arbeiten: e.arbeiten, projektId: w.projekt_id, kundeId: w.kunde_id,
    adresse: { strasse: w.strasse ?? "", plz: w.plz ?? "", ort: w.ort ?? "" },
  };
}

/** Muss der Bericht selbst gespeichert werden (Datum, Arbeiten, Kunde, Einsatzort)? */
export function kopfGeaendert(e: Entwurf): boolean {
  if (!e.kopfBasis) return true;
  return JSON.stringify(kopfBasisAus(e)) !== JSON.stringify({
    ...e.kopfBasis, adresse: adresseSauber(e.kopfBasis.adresse),
  });
}

/** Woran der Bericht hängt — fehlt etwas, der Text für den Monteur */
export function zuordnungFehler(e: Pick<Entwurf, "ohneProjekt" | "projektId" | "kundeId">): string | null {
  if (e.ohneProjekt) return e.kundeId ? null : "Bitte zuerst den Kunden wählen.";
  return e.projektId ? null : "Bitte zuerst das Projekt wählen.";
}

/** Ältere Sicherungen im Gerät kennen die Felder für „ohne Projekt“ noch nicht */
export function entwurfErgaenzen(e: Entwurf): Entwurf {
  const kb = e.kopfBasis as (Partial<KopfBasis> & { datum: string; arbeiten: string }) | null;
  return {
    ...e,
    ohneProjekt: !!e.ohneProjekt,
    kundeId: e.kundeId ?? "",
    adresse: adresseSauber(e.adresse),
    terminId: e.terminId ?? null,
    kopfBasis: kb ? {
      datum: kb.datum, arbeiten: kb.arbeiten,
      projektId: kb.projektId === undefined ? (e.ohneProjekt ? null : e.projektId || null) : kb.projektId,
      kundeId: kb.kundeId ?? null,
      adresse: adresseSauber(kb.adresse),
    } : null,
  };
}

/** Steht in einem neuen Bericht schon etwas drin? (Projekt und Datum allein zählen nicht) */
export function hatInhalt(e: Entwurf): boolean {
  return !!e.arbeiten.trim() || e.zeilen.some((z) => !zeileLeer(z)) || e.material.length > 0 || e.entfernt.zeiten.length > 0;
}

// ── Material ─────────────────────────────────────────────────────────────

export function materialMenge(m: Pick<MaterialZeile, "menge">): number {
  return Math.round(zahlLesen(m.menge) * 1000) / 1000;
}

export function materialFehler(m: MaterialZeile): string | null {
  if (!m.artikelId && !m.bezeichnung.trim()) return "Bezeichnung fehlt";
  const n = materialMenge(m);
  if (!(n > 0)) return "Menge muss größer als 0 sein";
  if (n > 99999) return "Menge ist zu groß";
  return null;
}

export function materialGeaendert(m: MaterialZeile): boolean {
  return !!m.basis && (materialMenge(m) !== m.basis.menge || m.quelle !== m.basis.quelle);
}

/** Menge ± Schritt, nie unter 0, ohne Rundungsreste (0,1 + 0,2) */
export function mengeSchritt(menge: string, schritt: number): string {
  const n = Math.max(0, Math.round((zahlLesen(menge) + schritt) * 1000) / 1000);
  return String(n).replace(".", ",");
}

export type MaterialPosten = { artikelId: string | null; bezeichnung: string; einheit: string; menge: number };

/**
 * Gleiche Artikel zusammenzählen — der Kunde will „6 Wago-Klemmen“ lesen,
 * nicht zwei Zeilen, nur weil eine aus dem Bus und eine aus dem Lager kam.
 */
export function materialZusammenfassen(liste: MaterialPosten[]): MaterialPosten[] {
  const nachSchluessel = new Map<string, MaterialPosten>();
  for (const m of liste) {
    const schluessel = m.artikelId ?? `frei:${m.bezeichnung.trim().toLowerCase()}|${m.einheit}`;
    const da = nachSchluessel.get(schluessel);
    if (da) da.menge = Math.round((da.menge + m.menge) * 1000) / 1000;
    else nachSchluessel.set(schluessel, { ...m, bezeichnung: m.bezeichnung.trim() });
  }
  return [...nachSchluessel.values()];
}

// ── Text ─────────────────────────────────────────────────────────────────

/**
 * Diktierten Text anhängen. Die Spracherkennung liefert Sätze klein und ohne
 * Punkt — am Satzanfang wird großgeschrieben.
 */
export function textAnhaengen(alt: string, neu: string): string {
  const t = neu.trim();
  if (!t) return alt;
  const satzAnfang = !alt.trim() || /[.!?:\n]\s*$/.test(alt);
  const teil = satzAnfang ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  if (!alt) return teil;
  return `${alt}${/\s$/.test(alt) ? "" : " "}${teil}`;
}

/** Erste Zeile, gekürzt — für Listen */
export function kurzText(text: string | null | undefined, max = 90): string {
  const erste = (text ?? "").trim().split("\n")[0].trim();
  return erste.length > max ? `${erste.slice(0, max - 1).trimEnd()}…` : erste;
}

const PDF_ERSATZ: Record<string, string> = {
  "→": "->", "←": "<-", "⇒": "=>", "≤": "<=", "≥": ">=", "≈": "~", "‑": "-", "−": "-",
  "\u00A0": " ", "\u202F": " ", "\u2009": " ", "\u2028": "\n", "\u2029": "\n", "\t": " ",
  "✓": "x", "✔": "x", "Ω": "Ohm", "Δ": "d",
};
/** Zeichen, die Helvetica im PDF zusätzlich zu Latin-1 kennt (WinAnsi) */
const WIN_ANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/**
 * Text fürs PDF: Die Standardschrift von jsPDF kennt nur WinAnsi. Emojis aus
 * der Handytastatur oder Pfeile würden als Zeichensalat gedruckt.
 */
export function pdfText(s: string | null | undefined): string {
  if (!s) return "";
  let aus = "";
  for (const ch of s.normalize("NFC").replace(/\r\n?/g, "\n")) {
    const ersatz = PDF_ERSATZ[ch];
    if (ersatz !== undefined) { aus += ersatz; continue; }
    const c = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN_ANSI.includes(ch)) aus += ch;
  }
  return aus;
}

// ── Liste ────────────────────────────────────────────────────────────────

export type RegieFilter = "alle" | "entwurf" | "unterschrieben" | "offen";

export const REGIE_FILTER: { wert: RegieFilter; text: string }[] = [
  { wert: "alle", text: "Alle" },
  { wert: "entwurf", text: "Entwurf" },
  { wert: "unterschrieben", text: "Unterschrieben" },
  { wert: "offen", text: "Nicht verrechnet" },
];

export function filterAusUrl(wert: string | null): RegieFilter {
  return REGIE_FILTER.some((f) => f.wert === wert) ? (wert as RegieFilter) : "alle";
}

/** „Nicht verrechnet“ = unterschrieben, aber noch in keiner Rechnung (Startseite: ?filter=offen) */
export function passtFilter(r: { status: string; rechnung_id: string | null }, f: RegieFilter): boolean {
  if (f === "entwurf") return r.status === "entwurf";
  if (f === "unterschrieben") return r.status === "unterschrieben";
  if (f === "offen") return r.status === "unterschrieben" && !r.rechnung_id;
  return true;
}

/** Alle Wörter müssen irgendwo vorkommen */
export function passtSuche(felder: (string | null | undefined)[], suche: string): boolean {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = felder.filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

// ── Unterschrift ─────────────────────────────────────────────────────────

/**
 * Rahmen um alles, was nicht weiß ist (RGBA-Pixel einer Zeichenfläche).
 * Damit wird die Unterschrift zugeschnitten und füllt im PDF ihr Feld,
 * egal wie groß die Fläche am Handy war.
 */
export function inhaltsRahmen(
  daten: ArrayLike<number>, breite: number, hoehe: number, schwelle = 235,
): { x: number; y: number; breite: number; hoehe: number } | null {
  let x0 = breite, y0 = hoehe, x1 = -1, y1 = -1;
  for (let y = 0; y < hoehe; y++) {
    const zeile = y * breite * 4;
    for (let x = 0; x < breite; x++) {
      const i = zeile + x * 4;
      if (daten[i + 3] > 0 && (daten[i] < schwelle || daten[i + 1] < schwelle || daten[i + 2] < schwelle)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, breite: x1 - x0 + 1, hoehe: y1 - y0 + 1 };
}

/** UUID auch ohne sicheren Kontext (Handy im WLAN über http://192.168…) */
export function neueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Material reinreden (KI) ─────────────────────────────────────────────

/** „ohne Artikel“ in der Auswahl einer KI-Zeile */
export const KI_OHNE = "__ohne__";

export type KiAuswahl = { aktiv: boolean; menge: string; artikelId: string };
type KiArtikel = { id: string; bezeichnung: string; einheit: string; ek_preis: number | null };
type KiKomponenteKurz = { was: string; einheit: string; artikel: KiArtikel | null; alternativen: KiArtikel[] };
export type KiMaterialPosten = { artikel: KiArtikel | null; bezeichnung: string; einheit: string; menge: number };

/**
 * Was aus dem Vorschlag übernommen wird: angehakt, Menge > 0, mit dem
 * gewählten Artikel — sonst als freie Position mit dem Gesagten.
 */
export function kiAuswahlZuMaterial(komponenten: KiKomponenteKurz[], auswahl: KiAuswahl[]): KiMaterialPosten[] {
  return komponenten.flatMap((k, i) => {
    const z = auswahl[i];
    const menge = z ? Math.round(zahlLesen(z.menge) * 1000) / 1000 : 0;
    if (!z?.aktiv || !(menge > 0) || menge > 99999) return [];
    const artikel = z.artikelId === KI_OHNE ? null : [k.artikel, ...k.alternativen].find((a) => a?.id === z.artikelId) ?? null;
    return [{
      artikel,
      bezeichnung: artikel?.bezeichnung ?? k.was.trim(),
      einheit: artikel?.einheit ?? (k.einheit?.trim() || "Stk"),
      menge,
    }];
  });
}

// ── Noch nicht verrechnet (Rechnungen) ──────────────────────────────────

/** Unterschriebener Bericht ohne Rechnung — so, wie ihn die Rechnungen-Seite zeigt */
export type OffenerBericht = {
  id: string;
  nummer: string | null;
  datum: string;
  arbeiten: string;
  projektId: string | null;
  projektNummer: string | null;
  projektName: string | null;
  kundeId: string | null;
  kundeName: string | null;
  stunden: number;
  /** Anzahl Materialzeilen */
  material: number;
};

export type VerrechnenGruppe = {
  schluessel: string;
  art: "projekt" | "kunde";
  /** Projekt- bzw. Kunden-ID */
  id: string;
  titel: string;
  unter: string;
  berichte: OffenerBericht[];
  stunden: number;
  material: number;
};

/**
 * Je Projekt eine Gruppe (die Rechnung kommt über den Projekt-Import mit
 * allem Offenen), ohne Projekt je Kunde (mehrere Service-Berichte wahlweise
 * zusammen auf eine Rechnung). Älteste zuerst — die warten am längsten.
 */
export function verrechnenGruppen(liste: OffenerBericht[]): VerrechnenGruppe[] {
  const m = new Map<string, VerrechnenGruppe>();
  for (const b of liste) {
    const art = b.projektId ? "projekt" : "kunde";
    const id = b.projektId ?? b.kundeId;
    if (!id) continue;
    const schluessel = `${art}:${id}`;
    let g = m.get(schluessel);
    if (!g) {
      g = {
        schluessel, art, id,
        titel: art === "projekt" ? b.projektName ?? "Projekt" : b.kundeName ?? "Kunde",
        unter: art === "projekt" ? [b.projektNummer, b.kundeName].filter(Boolean).join(" · ") : "Service ohne Projekt",
        berichte: [], stunden: 0, material: 0,
      };
      m.set(schluessel, g);
    }
    g.berichte.push(b);
    g.stunden = Math.round((g.stunden + b.stunden) * 100) / 100;
    g.material += b.material;
  }
  const aeltester = (g: VerrechnenGruppe) => g.berichte.reduce((d, b) => (b.datum < d ? b.datum : d), "9999");
  return [...m.values()]
    .map((g) => ({ ...g, berichte: [...g.berichte].sort((a, b) => a.datum.localeCompare(b.datum) || (a.nummer ?? "").localeCompare(b.nummer ?? "")) }))
    .sort((a, b) => aeltester(a).localeCompare(aeltester(b)) || a.titel.localeCompare(b.titel, "de"));
}

/**
 * „Rechnung daraus“: mit Projekt der Projekt-Import (alles Offene zum
 * Anhaken), ohne Projekt eine Rechnung an den Kunden mit genau diesen Berichten.
 */
export function rechnungAusLink(g: Pick<VerrechnenGruppe, "art" | "id">, berichtIds: string[] = []): string {
  if (g.art === "projekt") return `/belege/neu?typ=rechnung&projekt=${g.id}&import=1`;
  return `/belege/neu?typ=rechnung&kunde=${g.id}&regie=${berichtIds.join(",")}`;
}

/** `?regie=a,b` → IDs (nur UUIDs, doppelte weg) */
export function regieIdsAusUrl(wert: string | null): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set((wert ?? "").split(",").map((x) => x.trim()).filter((x) => uuid.test(x)))];
}

/** Ordner der Kundenunterschrift: im Projektordner, ohne Projekt unter regie/<id>/ (Policy unterschriften_bleiben) */
export function unterschriftOrdner(projektId: string | null | undefined, berichtId: string): string {
  return projektId ? `${projektId}/unterschriften` : `regie/${berichtId}/unterschriften`;
}

/** Ordner für Fotos am Bericht: mit Projekt im Projektordner (erscheinen dort auch), sonst regie/<id>/ */
export function fotoOrdner(projektId: string | null | undefined, berichtId: string): string {
  return projektId || `regie/${berichtId}`;
}
