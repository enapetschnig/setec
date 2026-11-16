/** Formatierung für Österreich — Beträge, Daten, Stunden. */

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const ZAHL = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 });

export const euro = (n: number | null | undefined) => EURO.format(Number(n) || 0);
export const zahl = (n: number | null | undefined) => ZAHL.format(Number(n) || 0);

/** "2026-10-16" → "16.10.2026" — ohne Zeitzonen-Verschiebung. */
export function datum(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

/** "2026-10-16" → "Fr, 16.10." */
export function datumKurz(iso: string): string {
  const d = isoZuDatum(iso);
  return d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function isoZuDatum(iso: string): Date {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Date(j, m - 1, t, 12);
}

/** Lokales Datum als ISO-Tag — nicht toISOString(), das rechnet in UTC. */
export function isoTag(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

export function tageDazu(iso: string, tage: number): string {
  const d = isoZuDatum(iso);
  d.setDate(d.getDate() + tage);
  return isoTag(d);
}

/** 7.5 → "7,5 h" */
export const stunden = (n: number | null | undefined) => `${zahl(n)} h`;

/** "07:30:00" → "07:30" */
export const uhrzeit = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Bis vor Von heißt: über Mitternacht (Störungsdienst, Nachtschicht) */
export const ueberMitternacht = (von: string, bis: string) => !!von && !!bis && bis.slice(0, 5) < von.slice(0, 5);

/** Stunden aus Von/Bis und Pause — auch über Mitternacht. Eine negative Pause zählt nicht. */
export function stundenAusVonBis(von: string, bis: string, pauseMin: number): number {
  if (!von || !bis) return 0;
  const [vh, vm] = von.split(":").map(Number);
  const [bh, bm] = bis.split(":").map(Number);
  let brutto = bh * 60 + bm - (vh * 60 + vm);
  if (brutto < 0) brutto += 24 * 60;
  const min = brutto - Math.max(0, pauseMin || 0);
  return min > 0 ? Math.round((min / 60) * 100) / 100 : 0;
}

/** Einheiten und Währungen, die vor oder hinter einer Zahl stehen dürfen */
const EINHEIT = "€|eur|euro|%|h|std\\.?|stunden?|min|stk\\.?|stück|lfm|m²|m|kwp?|kwh";
const ZAHL_MIT_EINHEIT = new RegExp(`^(?:${EINHEIT})?([+-]?[\\d.,]+?)(?:,-|,—|\\.-)?(?:${EINHEIT})?$`, "i");

/**
 * Zahl aus einer Zelle oder einem Eingabefeld: »12,50«, »1.250,50«,
 * »1,250.50«, »12.5«, »12,50 €«. »1.250« = 1250 (Tausenderpunkt, wie man es
 * in Österreich schreibt), »0.250« und »1.25« = Dezimalpunkt.
 * null = leer oder keine Zahl, auch bei Fremdzeichen (»9,8x«).
 */
export function dezimalLesen(eingabe: string | number | null | undefined): number | null {
  if (eingabe === null || eingabe === undefined) return null;
  if (typeof eingabe === "number") return Number.isFinite(eingabe) ? eingabe : null;
  // Nur Ziffern, Trenner, Vorzeichen, Leerzeichen und eine Einheit/Währung
  // davor oder dahinter — „9,8x“ oder „1o“ ist ein Tippfehler, keine Zahl
  const roh = String(eingabe).replace(/[\s\u00a0\u202f'’]/g, "");
  const teil = roh.match(ZAHL_MIT_EINHEIT);
  if (!teil) return null;
  let s = teil[1].replace(/^\+/, "");
  if (!s || !/\d/.test(s)) return null;
  const komma = s.includes(",");
  const punkt = s.includes(".");
  if (komma && punkt) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (komma || punkt) {
    const teile = s.split(komma ? "," : ".");
    // Mehrere Trenner sind nur als Tausender lesbar („1.234.567“) — „1,2,3“
    // ist ein Tippfehler, keine 123
    const tausender = /^-?[1-9]\d{0,2}$/.test(teile[0]) && teile.slice(1).every((t) => /^\d{3}$/.test(t));
    if (teile.length > 2 && !tausender) return null;
    // Ein Komma ist immer Dezimal; ein Punkt mit genau drei Ziffern dahinter Tausender
    if (teile.length > 2 || (punkt && tausender)) s = teile.join("");
    else if (komma) s = s.replace(",", ".");
  }
  const m = s.match(/^-?\d*\.?\d*$/);
  if (!m || m[0] === "" || m[0] === "-" || m[0] === ".") return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Feld enthält etwas, das keine Zahl ist („9,8x“) — leer zählt nicht */
export function zahlUngueltig(s: string | null | undefined): boolean {
  return !!s && s.trim() !== "" && dezimalLesen(s) === null;
}

/** Zahl aus einem Eingabefeld wie `dezimalLesen` — leer oder unlesbar = 0 */
export function zahlLesen(s: string | number | null | undefined): number {
  return dezimalLesen(s) ?? 0;
}
