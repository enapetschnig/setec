import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallAnleitung } from "@/components/Installieren";
import { Rahmen } from "@/components/einladung/Rahmen";
import { useSitzung } from "@/hooks/useSitzung";
import { geraetErkennen, istMobil, laeuftAlsApp } from "@/lib/installieren";
import { KUNDE } from "@/kunde.config";

/**
 * /start — der EINE Link in die App (QR auf dem Aushang, WhatsApp, E-Mail,
 * SMS) und zugleich die Startadresse der installierten App (Manifest
 * start_url). Ohne Anmeldung erreichbar.
 *
 * Reihenfolge (Christophs Vorgabe): ZUERST die App auf den Startbildschirm,
 * DANN darin registrieren — die iPhone-Home-App hat eigenen Speicher, wer
 * sich darin registriert, bleibt dort angemeldet.
 *
 *   Handy im Browser → „1. App auf den Startbildschirm“ mit der Anleitung für
 *     genau dieses Gerät und diesen Browser, „2. App öffnen und registrieren“.
 *     Klein darunter: „Ohne Installation im Browser weiter“, „Anmelden“.
 *   In der installierten App und am PC → groß „Registrieren“, darunter „Anmelden“.
 *   Mit Sitzung → gleich in die App.
 */
export default function Start() {
  const { laden, session } = useSitzung();
  const geraet = useMemo(() => geraetErkennen(), []);
  const [imBrowser, setImBrowser] = useState(false);

  if (laden) return <Rahmen><p className="py-10 text-center text-muted-foreground">Lädt…</p></Rahmen>;
  if (session) return <Navigate to="/" replace />;

  const gruss = (
    <div className="mb-5">
      <h1 className="text-2xl font-bold leading-tight">Willkommen!</h1>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">Die App für alle bei {KUNDE.firma} — Stunden, Material, Regieberichte, Fotos.</p>
    </div>
  );

  if (istMobil(geraet) && !laeuftAlsApp() && !imBrowser) {
    return (
      <Rahmen>
        {gruss}
        <div className="space-y-4">
          <section className="rounded-xl border p-4" data-pruef="schritt-installieren">
            <h2 className="mb-3 text-lg font-semibold">1. App auf den Startbildschirm legen</h2>
            <InstallAnleitung onFertig={() => toast.success("Fertig — die App liegt auf deinem Startbildschirm. Jetzt dort öffnen.")} />
          </section>
          <section className="rounded-xl border p-4" data-pruef="schritt-oeffnen">
            <h2 className="text-lg font-semibold">2. App öffnen und registrieren</h2>
            <p className="mt-2 flex items-start gap-3 text-[0.95rem] leading-snug">
              <img src={KUNDE.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
              <span>Auf dem Startbildschirm auf das {KUNDE.kurzname}-Zeichen tippen, „Registrieren“ — Name, E-Mail und Passwort eintragen. Fertig.</span>
            </p>
          </section>
          <div className="space-y-1 pt-1">
            <Button variant="ghost" className="h-12 w-full text-muted-foreground" onClick={() => setImBrowser(true)} data-pruef="ohne-app">
              Ohne Installation im Browser weiter
            </Button>
            <Button asChild variant="ghost" className="h-12 w-full text-muted-foreground">
              <Link to="/auth">Ich habe schon ein Konto — Anmelden</Link>
            </Button>
          </div>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {gruss}
      <div className="space-y-3">
        <Button asChild className="h-14 w-full gap-2 text-base" data-pruef="registrieren">
          <Link to="/auth?modus=registrieren"><UserPlus className="h-5 w-5" /> Registrieren</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">Neu hier? Name, E-Mail und Passwort — in einer Minute drin.</p>
        <Button asChild variant="outline" className="h-12 w-full gap-2 text-base" data-pruef="anmelden">
          <Link to="/auth"><LogIn className="h-5 w-5" /> Ich habe schon ein Konto — Anmelden</Link>
        </Button>
      </div>
    </Rahmen>
  );
}
