import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { GMAIL_BEREICHE, type PostfachGrund, wienerTag } from "../../supabase/functions/_shared/postfach.ts";

export { wienerTag };

/**
 * Postfächer des Betriebs (Google Workspace) — Einstellungen → E-Mail.
 * Zugang über ein Dienstkonto mit domänenweiter Delegierung: einmal in der
 * Google Admin-Konsole freigeben, dann geht jede Adresse derselben Domain.
 * Der Schlüssel bleibt in der Edge Function (Secret), nie im Browser.
 */
export type Postfach = Tables<"postfaecher">;

/** Client-ID des Dienstkontos (öffentlich, nur für die Freigabe in der Admin-Konsole) */
export const GOOGLE_CLIENT_ID = "110267341647112633213";
/** Bereiche (OAuth-Scopes) für die Admin-Konsole, mit Komma getrennt */
export const GOOGLE_BEREICHE = GMAIL_BEREICHE;
export const ADMIN_KONSOLE = "https://admin.google.com/ac/owl/domainwidedelegation";

export function usePostfaecher(an = true) {
  return useQuery({
    queryKey: ["postfaecher"],
    enabled: an,
    queryFn: async () => {
      const { data, error } = await supabase.from("postfaecher").select("*").order("created_at");
      if (error) throw error;
      return data as Postfach[];
    },
  });
}

export type TestErgebnis =
  | { ok: true; adresse: string; betreffe: string[] }
  | { ok: false; adresse: string; grund: PostfachGrund; fehler: string };

async function aufruf<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("postfach-abruf", { body });
  if (error) {
    let j: { ok?: boolean; error?: string; fehler?: string } | null = null;
    try { j = await (error as { context?: Response }).context?.json(); } catch { /* Netz */ }
    if (j?.ok === false && j.fehler) return j as T; // z. B. Dienstkonto fehlt: wie ein fehlgeschlagener Test zeigen
    throw new Error(j?.error ?? j?.fehler ?? "Das Postfach ist gerade nicht erreichbar.");
  }
  return data as T;
}

export const postfachTesten = (adresse: string) => aufruf<TestErgebnis>({ aktion: "testen", adresse });

export type AbrufBilanz = {
  ok: true; rechnungen: number; doppelt: number; andere: number; fehler: number; offen: number;
  /** Mails, die die App nicht (ganz) lesen konnte — stehen unter Einstellungen → E-Mail */
  ungelesen?: number; meldungen: string[];
};
export const postfachAbrufen = (postfachId?: string) => aufruf<AbrufBilanz>({ aktion: "abrufen", ...(postfachId ? { postfach_id: postfachId } : {}) });

/** „2 Rechnungen übernommen, 3 Mails ohne Rechnung …“ */
export function bilanzText(b: Omit<AbrufBilanz, "ok">): string {
  const teile: string[] = [];
  teile.push(b.rechnungen === 1 ? "1 Rechnung übernommen" : `${b.rechnungen} Rechnungen übernommen`);
  if (b.doppelt) teile.push(`${b.doppelt} schon vorhanden`);
  if (b.andere) teile.push(`${b.andere} ${b.andere === 1 ? "Mail" : "Mails"} ohne Rechnung`);
  const nochmal = b.fehler - (b.ungelesen ?? 0);
  if (nochmal > 0) teile.push(`${nochmal} nicht lesbar (nächster Abruf versucht es nochmal)`);
  if (b.ungelesen) teile.push(`${b.ungelesen} ${b.ungelesen === 1 ? "Mail" : "Mails"} bitte selbst ansehen (Liste unter „Nicht gelesene Mails“)`);
  if (b.offen) teile.push(`${b.offen} warten noch — kommen beim nächsten Abruf`);
  return teile.join(", ");
}

/** Eine Mail, die die App nicht (ganz) lesen konnte — nur Kopfdaten, kein Inhalt */
export type UngeleseneMail = Pick<Tables<"postfach_mails">, "id" | "postfach" | "message_id" | "von" | "betreff" | "datum" | "ungelesen" | "created_at">;

/** Nicht (ganz) gelesene Mails der letzten `tage` Tage, neueste zuerst (RLS: Chef mit Recht „Eingangsrechnungen“) */
export function useUngeleseneMails(tage = 30, an = true) {
  return useQuery({
    queryKey: ["postfaecher", "ungelesen", tage],
    enabled: an,
    queryFn: async () => {
      const seit = new Date(Date.now() - tage * 86_400_000).toISOString();
      const { data, error } = await supabase.from("postfach_mails")
        .select("id, postfach, message_id, von, betreff, datum, ungelesen, created_at")
        .not("ungelesen", "is", null).gte("created_at", seit)
        .order("created_at", { ascending: false }).order("id").limit(50);
      if (error) throw error;
      return (data ?? []) as UngeleseneMail[];
    },
  });
}

/** Mail in Gmail öffnen (im richtigen Konto) — die App zeigt keinen Inhalt */
export const gmailLink = (postfach: string, messageId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(postfach)}#all/${encodeURIComponent(messageId)}`;

/** „18.11.2026, 14:05“ in Wien */
export const wienerZeit = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" }) : "";

/** Wer ist Absender, wenn im Mail-Dialog nichts gewählt ist? (wie in beleg-mail) */
export function standardAbsender(liste: Pick<Postfach, "adresse" | "senden" | "aktiv" | "standard_absender">[]): string | null {
  const senden = liste.filter((p) => p.aktiv && p.senden).sort((a, b) => a.adresse.localeCompare(b.adresse));
  return (senden.find((p) => p.standard_absender) ?? senden[0])?.adresse ?? null;
}
