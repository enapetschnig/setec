// MIME-Nachricht für die Gmail-API (users/me/messages/send) — reine Logik,
// ohne Deno-Globals: läuft in der Edge Function, in Node und in vitest.
//
//   multipart/mixed
//   ├─ multipart/alternative  (text/plain + text/html, UTF-8, base64)
//   └─ je Anhang ein Teil (base64, Dateiname nach RFC 2231 und RFC 2047)

export type MailAnhang = { dateiname: string; mime?: string; inhalt: Uint8Array };
export type MailDaten = {
  von: string;
  vonName?: string | null;
  an: string[];
  antwortAn?: string | null;
  betreff: string;
  text: string;
  html?: string | null;
  anhaenge?: MailAnhang[];
  /** fester Wert für Tests; sonst zufällig */
  grenze?: string;
  datum?: Date;
};

const enc = new TextEncoder();

// ── base64 ohne Rückruf je Byte ───────────────────────────────────────────
// Anhänge von Gmail sind bis zu einige MB groß: `Uint8Array.from(atob(…), c => …)`
// ruft je Byte eine Funktion auf und hält die Daten dreimal — das kostete die
// Edge Function CPU-Zeit und Speicher (Prüfung 18.11.2026, H2). Hier eine
// Schleife über eine Nachschlagetabelle, das Ergebnis genau einmal im Speicher.
const ZEICHEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CODES = Uint8Array.from(ZEICHEN, (c) => c.charCodeAt(0));
/** Zeichen → 6-Bit-Wert, 255 = überspringen (Leerraum, „=“, ungültig); base64 und base64url */
const WERT = (() => {
  const t = new Uint8Array(128).fill(255);
  for (let i = 0; i < 64; i++) t[CODES[i]] = i;
  t[45] = 62; // „-“ (base64url)
  t[95] = 63; // „_“ (base64url)
  return t;
})();

/** Bytes → base64 (Standard-Alphabet mit „=“), auf Wunsch in Zeilen zu 76 Zeichen (RFC 2045) */
export function bytesBase64(b: Uint8Array, zeilen = false): string {
  const n = b.length;
  const laenge = Math.ceil(n / 3) * 4;
  const umbrueche = zeilen && laenge > 76 ? Math.ceil(laenge / 76) - 1 : 0;
  const aus = new Uint8Array(laenge + umbrueche * 2);
  const voll = n - (n % 3);
  let o = 0, spalte = 0;
  for (let i = 0; i < voll; i += 3) {
    if (zeilen && spalte === 76) { aus[o++] = 13; aus[o++] = 10; spalte = 0; }
    const x = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    aus[o++] = CODES[x >> 18];
    aus[o++] = CODES[(x >> 12) & 63];
    aus[o++] = CODES[(x >> 6) & 63];
    aus[o++] = CODES[x & 63];
    spalte += 4;
  }
  if (voll < n) {
    if (zeilen && spalte === 76) { aus[o++] = 13; aus[o++] = 10; }
    const zwei = n - voll === 2;
    const x = (b[voll] << 16) | (zwei ? b[voll + 1] << 8 : 0);
    aus[o++] = CODES[x >> 18];
    aus[o++] = CODES[(x >> 12) & 63];
    aus[o++] = zwei ? CODES[(x >> 6) & 63] : 61;
    aus[o++] = 61;
  }
  return new TextDecoder().decode(aus);
}

/** base64 oder base64url (mit/ohne „=“, Leerraum egal) → Bytes */
export function base64Bytes(s: string): Uint8Array {
  const n = s.length;
  let ende = n;
  while (ende > 0 && s.charCodeAt(ende - 1) === 61) ende--;
  const aus = new Uint8Array(Math.floor((ende * 3) / 4));
  let o = 0, puffer = 0, bits = 0;
  for (let i = 0; i < ende; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? WERT[c] : 255;
    if (v === 255) continue;
    puffer = ((puffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      aus[o++] = (puffer >> bits) & 0xff;
    }
  }
  return o === aus.length ? aus : aus.slice(0, o);
}

/** base64url (Gmail) → Standard-base64 mit „=“ (Claude) — ohne über Bytes zu gehen */
export function base64Standard(s: string): string {
  let t = s.indexOf("-") >= 0 || s.indexOf("_") >= 0 ? s.replace(/-/g, "+").replace(/_/g, "/") : s;
  if (/\s/.test(t)) t = t.replace(/\s+/g, "");
  return t.length % 4 ? t + "=".repeat(4 - (t.length % 4)) : t;
}

/** Wie viele Bytes stecken in diesem base64-Text? (ohne zu dekodieren) */
export const base64Groesse = (s: string) => {
  let ende = s.length;
  while (ende > 0 && s.charCodeAt(ende - 1) === 61) ende--;
  return Math.floor((ende * 3) / 4);
};

export const base64url = (b: Uint8Array | string) =>
  bytesBase64(typeof b === "string" ? enc.encode(b) : b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** base64 in Zeilen zu 76 Zeichen (RFC 2045) */
export const zeilen76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");

const nurAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/**
 * Kopfzeilen-Text nach RFC 2047: reines ASCII bleibt, sonst =?UTF-8?B?…?=,
 * in Wörtern zu höchstens 45 Bytes (≤ 75 Zeichen je kodiertem Wort), ohne
 * ein UTF-8-Zeichen zu zerschneiden. Mehrere Wörter mit „\r\n “ gefaltet.
 */
export function kopfKodieren(text: string): string {
  const t = text.replace(/[\r\n]+/g, " ");
  if (nurAscii(t)) return t;
  const woerter: string[] = [];
  let teil = "";
  for (const zeichen of t) {
    if (enc.encode(teil + zeichen).length > 45) { woerter.push(teil); teil = ""; }
    teil += zeichen;
  }
  if (teil) woerter.push(teil);
  return woerter.map((w) => `=?UTF-8?B?${bytesBase64(enc.encode(w))}?=`).join("\r\n ");
}

/** „Firma GmbH <a@b.at>“ — Name kodiert, wenn nötig, sonst in Anführungszeichen */
export function adresseKopf(adresse: string, name?: string | null): string {
  const n = (name ?? "").replace(/[<>"\r\n\\]/g, "").trim();
  if (!n) return adresse;
  return `${nurAscii(n) ? `"${n}"` : kopfKodieren(n)} <${adresse}>`;
}

/** Dateiname im Anhang: filename* (RFC 2231) und filename (RFC 2047) für alte Programme */
function dateinameKopf(name: string): string {
  const sauber = name.replace(/[\r\n"\\]/g, "").trim() || "Anhang";
  if (nurAscii(sauber)) return `filename="${sauber}"`;
  const prozent = [...enc.encode(sauber)].map((b) =>
    /[A-Za-z0-9._-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
  return `filename="${kopfKodieren(sauber).replace(/\r\n /g, " ")}";\r\n filename*=UTF-8''${prozent}`;
}

const mimeAusName = (n: string) =>
  /\.pdf$/i.test(n) ? "application/pdf" : /\.png$/i.test(n) ? "image/png" : /\.jpe?g$/i.test(n) ? "image/jpeg" : "application/octet-stream";

const zufall = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Die ganze Nachricht als Text (CRLF) — für den Upload als message/rfc822 */
export function mailBauen(d: MailDaten): string {
  const g = d.grenze ?? zufall();
  const gMix = `mix-${g}`, gAlt = `alt-${g}`;
  const kopf = [
    `From: ${adresseKopf(d.von, d.vonName)}`,
    `To: ${d.an.join(", ")}`,
    ...(d.antwortAn && d.antwortAn.toLowerCase() !== d.von.toLowerCase() ? [`Reply-To: ${d.antwortAn}`] : []),
    `Subject: ${kopfKodieren(d.betreff)}`,
    `Date: ${(d.datum ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${gMix}"`,
  ];
  const teile = [
    `--${gMix}`,
    `Content-Type: multipart/alternative; boundary="${gAlt}"`,
    "",
    `--${gAlt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    zeilen76(bytesBase64(enc.encode(d.text))),
    ...(d.html ? [
      `--${gAlt}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      zeilen76(bytesBase64(enc.encode(d.html))),
    ] : []),
    `--${gAlt}--`,
  ];
  for (const a of d.anhaenge ?? []) {
    const mime = a.mime || mimeAusName(a.dateiname);
    teile.push(
      `--${gMix}`,
      `Content-Type: ${mime}`,
      `Content-Disposition: attachment; ${dateinameKopf(a.dateiname)}`,
      "Content-Transfer-Encoding: base64",
      "",
      bytesBase64(a.inhalt, true),
    );
  }
  teile.push(`--${gMix}--`, "");
  return [...kopf, "", ...teile].join("\r\n");
}
