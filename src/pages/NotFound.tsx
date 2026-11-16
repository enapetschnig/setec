import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Hinweis } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";

/**
 * Unbekannte Adresse — alter Link, Tippfehler, gelöschter Eintrag. Oder: die
 * Seite ist neu, aber im Speicher liegt noch die alte App-Fassung (PWA im Modus
 * „prompt“). Dann einmal je Adresse nach einer neuen Fassung suchen und mit ihr
 * neu laden — sonst sähe z. B. ein frischer SMS- oder Mail-Link „nicht gefunden“.
 */
export default function NotFound() {
  useEffect(() => {
    const merker = `setec.nachgeladen:${window.location.pathname}`;
    if (!("serviceWorker" in navigator)) return;
    try { if (sessionStorage.getItem(merker)) return; sessionStorage.setItem(merker, "1"); } catch { return; }
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      await reg.update().catch(() => {});
      const neu = reg.waiting ?? reg.installing;
      if (!neu) return;
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      neu.postMessage({ type: "SKIP_WAITING" });
    });
  }, []);

  return (
    <Hinweis
      icon={<SearchX className="h-8 w-8 text-amber-600" />}
      titel="Seite nicht gefunden"
      text="Diese Adresse gibt es in der App nicht — vielleicht ein alter Link oder ein Tippfehler."
    >
      <Button asChild><Link to="/">Zur Startseite</Link></Button>
    </Hinweis>
  );
}
