// Gmail-API über ein Dienstkonto mit domänenweiter Delegierung (Google
// Workspace). Ohne Deno-Globals (nur fetch + WebCrypto) — läuft in der Edge
// Function und in Node (Echttest). Den Schlüssel liest der Aufrufer
// (Secret GOOGLE_MAIL_DIENSTKONTO, base64 des JSON) und gibt ihn herein.
import { base64Bytes, base64url } from "./mime.ts";
import { fehlerDeuten, type PostfachGrund } from "./postfach.ts";

export type Dienstkonto = { client_email: string; client_id?: string; private_key: string; type?: string };

export class PostfachFehler extends Error {
  grund: PostfachGrund;
  status: number;
  constructor(grund: PostfachGrund, text: string, status = 502) {
    super(text);
    this.grund = grund;
    this.status = status;
  }
}

/**
 * Lohnt ein neuer Versuch später? KI überlastet, Gmail 429/5xx, Netz weg — dann
 * zählt der Versuch beim Abruf nicht und der Lauf hört auf (sonst stünden nach
 * einer Störung alle Mails als „nicht lesbar“ da). PostfachFehler tragen immer
 * 502 — bei ihnen zählt nur der Gmail-Status im Text.
 */
export function voruebergehend(e: unknown): boolean {
  const x = e as { status?: unknown; message?: unknown } | null;
  const text = String(x?.message ?? e ?? "");
  if (/^Gmail \((408|429|5\d\d)\)/.test(text)) return true;
  if (!(e instanceof PostfachFehler) && typeof x?.status === "number") return x.status === 408 || x.status === 429 || x.status >= 500;
  return /overloaded|rate.?limit|ECONNRESET|ETIMEDOUT|fetch failed|network|connection error|timeout|timed out|nicht erreichbar/i.test(text);
}

/** base64 oder rohes JSON → Dienstkonto */
export function dienstkontoLesen(roh: string | undefined | null): Dienstkonto {
  if (!roh) throw new PostfachFehler("dienstkonto", "Der Postfach-Zugang ist nicht eingerichtet (Secret GOOGLE_MAIL_DIENSTKONTO fehlt).", 503);
  let text = roh.trim();
  if (!text.startsWith("{")) text = new TextDecoder().decode(base64Bytes(text));
  const sa = JSON.parse(text) as Dienstkonto;
  if (!sa.client_email || !sa.private_key) throw new PostfachFehler("dienstkonto", "Der Dienstkonto-Schlüssel ist unvollständig.", 503);
  return sa;
}

async function signieren(pem: string, daten: string): Promise<Uint8Array> {
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const schluessel = await crypto.subtle.importKey(
    "pkcs8", new Uint8Array(base64Bytes(b64)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", schluessel, new TextEncoder().encode(daten)));
}

/** Zugangs-Token für ein Postfach (sub = Adresse) */
export async function gmailToken(sa: Dienstkonto, postfach: string): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = base64url(JSON.stringify({
    iss: sa.client_email, sub: postfach, aud: "https://oauth2.googleapis.com/token", iat: jetzt, exp: jetzt + 3600,
    scope: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
  }));
  const sig = base64url(await signieren(sa.private_key, `${kopf}.${inhalt}`));
  let r: Response;
  try {
    r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${kopf}.${inhalt}.${sig}` }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new PostfachFehler("sonst", `Google nicht erreichbar (${(e as Error).message}).`);
  }
  const j = await r.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!j.access_token) {
    const f = fehlerDeuten(j.error, j.error_description, postfach);
    throw new PostfachFehler(f.grund, f.text);
  }
  return j.access_token;
}

/** Ein Postfach: Token einmal holen, dann API-Aufrufe */
export class Gmail {
  private token: string;
  adresse: string;
  private constructor(token: string, adresse: string) {
    this.token = token;
    this.adresse = adresse;
  }
  static async oeffnen(sa: Dienstkonto, adresse: string) {
    return new Gmail(await gmailToken(sa, adresse), adresse);
  }

  async api<T = Record<string, unknown>>(pfad: string, init: RequestInit = {}, basis = "https://gmail.googleapis.com/gmail/v1/users/me/"): Promise<T> {
    const r = await fetch(`${basis}${pfad}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* kein JSON */ }
    if (!r.ok) {
      const err = j.error as { message?: string; status?: string } | undefined;
      const meldung = err?.message ?? text.slice(0, 200);
      const f = fehlerDeuten(err?.status, meldung, this.adresse);
      throw new PostfachFehler(f.grund, f.grund === "sonst" ? `Gmail (${r.status}): ${meldung.slice(0, 300)}` : f.text);
    }
    return j as T;
  }

  /** Fertige MIME-Nachricht senden (Upload als message/rfc822, bis 35 MB) → Gmail-ID */
  async senden(mime: string): Promise<string> {
    const j = await this.api<{ id?: string }>("messages/send?uploadType=media", {
      method: "POST", headers: { "Content-Type": "message/rfc822" }, body: mime,
    }, "https://gmail.googleapis.com/upload/gmail/v1/users/me/");
    return j.id ?? "";
  }

  /** Label-ID zum Namen, legt das Label an, wenn es fehlt */
  async label(name: string): Promise<string> {
    const l = await this.api<{ labels?: { id: string; name: string }[] }>("labels");
    const da = l.labels?.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (da) return da.id;
    const neu = await this.api<{ id: string }>("labels", {
      method: "POST", body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
    });
    return neu.id;
  }
}
