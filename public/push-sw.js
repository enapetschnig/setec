// Mitteilungen aufs Handy im Service Worker (Vorbild lengauer-stockner).
// Workbox lädt diese Datei per importScripts (vite.config.ts → workbox.importScripts);
// der Update-Hinweis (registerType „prompt“) bleibt davon unberührt.
// Nachricht vom Server (Edge Function termin-push): { title, body, url, tag }.
// Antippen holt ein offenes App-Fenster nach vorne bzw. öffnet die Startseite.
self.addEventListener("push", (event) => {
  let daten = { title: "SETEC", body: "", url: "/", tag: "" };
  try {
    if (event.data) daten = { ...daten, ...event.data.json() };
  } catch {
    if (event.data) daten.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(daten.title, {
      body: daten.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: daten.tag || undefined,
      renotify: !!daten.tag,
      data: { url: daten.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
      // Offenes Fenster: nach vorne holen und die App selbst zur Startseite wechseln
      // lassen (PushKlick in App.tsx) — so geht nichts Ungespeichertes verloren
      for (const f of fenster) {
        if ("focus" in f) {
          f.postMessage({ typ: "push-klick", url: ziel });
          return f.focus().catch(() => undefined);
        }
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
