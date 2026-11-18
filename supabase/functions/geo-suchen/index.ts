// Kontakte im Hintergrund auf die Karte bringen (Koordinaten aus der Adresse).
// pg_cron ruft jede Minute `geo_suchen_anstossen()` — die stößt diese Function
// nur an, wenn ein Kontakt ohne aktuelle Lage da ist (z. B. nach dem Import von
// 1000 Kontakten, die nie jemand geöffnet hat; Stefan 18.11.2026: „Karte zeigt
// keine Einträge“). Ein Lauf sucht ~45 s lang, 1 Anfrage je Sekunde (Photon — Nominatim sperrt Supabase-Server mit 403).
//
//   POST, Kopf x-geo-secret (= geo_verbindung.secret) → 202, Lauf im Hintergrund
//
// verify_jwt = false (eigene Prüfung über das Geheimnis).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { geoLauf } from "../_shared/geo.ts";

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const gleich = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const geheim = req.headers.get("x-geo-secret") ?? "";
  const { data: v } = await sb.from("geo_verbindung").select("secret").limit(1).maybeSingle();
  if (!geheim || !v?.secret || !gleich(v.secret, geheim)) return antwort({ error: "Nicht berechtigt." }, 401);

  const lauf = geoLauf(sb, { bisMs: 45_000 })
    .then((r) => console.log("geo-suchen", JSON.stringify(r)))
    .catch((e) => console.error("geo-suchen", e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(lauf); return antwort({ ok: true, gestartet: true }, 202); }
  await lauf;
  return antwort({ ok: true });
});
