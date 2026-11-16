// Mitteilungen aufs Handy (Web-Push) — Gerät an- und abmelden. Vorbild: lengauer-stockner/src/lib/push.ts.
// Geschickt wird nur am Server (Edge Function termin-push, ausgelöst vom Trigger auf `termine`).
// Empfangen wird im Service Worker: public/push-sw.js (per importScripts in den Workbox-SW).
// Am iPhone geht Push nur in der installierten App vom Home-Bildschirm (iOS 16.4+).
import { supabase } from "@/integrations/supabase/client";
import { imHandyRahmen } from "@/lib/handyansicht";

export type PushStatus = "nicht_unterstuetzt" | "ios_nicht_installiert" | "verweigert" | "aus" | "an";

// push_abos/push_abo_registrieren sind (noch) nicht in den erzeugten Typen
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const istIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
export const istInstalliert = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const unterstuetzt = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function base64ZuBytes(base64: string): Uint8Array {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(b64)].map((c) => c.charCodeAt(0)));
}

async function registrierung(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const r = await navigator.serviceWorker.getRegistration();
  if (r) return r;
  // „ready“ löst nie auf, wenn kein Service Worker läuft (Entwicklung) → Zeitlimit
  return await Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise<null>((ok) => setTimeout(() => ok(null), 4000)),
  ]);
}

export async function pushStatus(): Promise<PushStatus> {
  if (imHandyRahmen()) return "nicht_unterstuetzt";
  if (istIos() && !istInstalliert()) return "ios_nicht_installiert";
  if (!unterstuetzt()) return "nicht_unterstuetzt";
  if (Notification.permission === "denied") return "verweigert";
  const reg = await registrierung();
  if (!reg) return "nicht_unterstuetzt";
  const abo = await reg.pushManager.getSubscription();
  if (!abo) return "aus";
  // Abo im Browser, aber am Server nicht (mehr) — z. B. abgelaufen oder anderes Konto
  const { data } = await db.from("push_abos").select("id").eq("endpoint", abo.endpoint).maybeSingle();
  return data ? "an" : "aus";
}

async function oeffentlicherSchluessel(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("termin-push", { method: "GET" });
  if (error || !data?.publicKey) throw new Error("Mitteilungen sind gerade nicht erreichbar — später noch einmal versuchen.");
  return String(data.publicKey);
}

export async function pushEinschalten(): Promise<void> {
  if (istIos() && !istInstalliert()) throw new Error("Am iPhone geht das nur in der installierten App (Teilen → Zum Home-Bildschirm).");
  if (!unterstuetzt()) throw new Error("Dieses Handy bzw. dieser Browser kann keine Mitteilungen.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Mitteilungen wurden nicht erlaubt.");
  const reg = await registrierung();
  if (!reg) throw new Error("Bitte die App neu laden und noch einmal versuchen.");
  let abo = await reg.pushManager.getSubscription();
  if (!abo) {
    const schluessel = base64ZuBytes(await oeffentlicherSchluessel());
    abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel as BufferSource });
  }
  const j = abo.toJSON();
  const { error } = await db.rpc("push_abo_registrieren", {
    p_endpoint: abo.endpoint, p_p256dh: j.keys?.p256dh ?? "", p_auth: j.keys?.auth ?? "", p_geraet: navigator.userAgent.slice(0, 160),
  });
  if (error) throw new Error(error.message);
}

export async function pushAusschalten(): Promise<void> {
  const reg = await registrierung();
  const abo = reg ? await reg.pushManager.getSubscription() : null;
  if (!abo) return;
  const { error } = await db.from("push_abos").delete().eq("endpoint", abo.endpoint);
  if (error) throw new Error(error.message);
  await abo.unsubscribe();
}

/** Vor dem Abmelden: dieses Gerät bekommt keine Mitteilungen mehr für das Konto. */
export async function pushBeimAbmelden(): Promise<void> {
  if (imHandyRahmen()) return;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const abo = reg ? await reg.pushManager.getSubscription() : null;
    if (!abo) return;
    await db.from("push_abos").delete().eq("endpoint", abo.endpoint);
    await abo.unsubscribe();
  } catch { /* Abmelden darf daran nicht scheitern */ }
}

/** Testmitteilung an die eigenen Geräte */
export async function pushTesten(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("termin-push", { body: { aktion: "test" } });
  if (error) throw new Error(error.message);
  return Number(data?.ok ?? 0);
}
