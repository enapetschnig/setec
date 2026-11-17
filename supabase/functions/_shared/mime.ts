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

/** Bytes → base64 (in Häppchen, sonst sprengt String.fromCharCode den Stack) */
export function bytesBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64Bytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}

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
      zeilen76(bytesBase64(a.inhalt)),
    );
  }
  teile.push(`--${gMix}--`, "");
  return [...kopf, "", ...teile].join("\r\n");
}
