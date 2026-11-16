import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InstallAnleitung } from "@/components/Installieren";
import { KontoAnlegen } from "@/components/einladung/KontoAnlegen";
import { useSitzung } from "@/hooks/useSitzung";
import { offeneEinladungMerken, offeneEinladungVergessen, type EinladungInfo } from "@/lib/einladung";
import { geraetErkennen, istIOS, istMobil, laeuftAlsApp } from "@/lib/installieren";
import { name } from "@/lib/types";
import { KUNDE } from "@/kunde.config";

/**
 * /einladung/<token> — der Firmen-Link (Aushang mit QR, WhatsApp-Gruppe):
 * der EINE Weg, wie ein neuer Mitarbeiter in die App kommt. Ohne Anmeldung
 * erreichbar.
 *
 * Reihenfolge wie bei Schrettl (Christophs Vorgabe): ZUERST die App auf den
 * Startbildschirm, DANN darin das Passwort festlegen.
 *
 *   Handy im Browser → „1. App auf den Startbildschirm“ mit der Anleitung für
 *     genau dieses Gerät, „2. App öffnen“. Klein: „Ohne App im Browser weiter“.
 *   In der installierten App und am PC → gleich das Formular: Vor- und
 *     Nachname, Benutzername (aus dem Vornamen vorgeschlagen), Passwort. Wer
 *     über den Link kommt, ist sofort freigeschaltet (Trigger handle_new_user).
 *
 * Damit die App nach dem Installieren wieder HIER startet:
 *   iPhone: Die Home-App hat eigenen Speicher. Ohne Manifest nimmt Safari die
 *     aktuelle Adresse als Startadresse — deshalb wird es auf dieser Seite
 *     aus dem DOM genommen. Beim späteren Start mit Sitzung geht es sofort
 *     weiter auf die Startseite.
 *   Android/PC: Browser und App teilen den Speicher; der Merker „offene
 *     Einladung“ führt die auf „/“ startende App hierher zurück (Auth.tsx).
 */
export default function Einladung() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { laden: sitzungLaedt, session, profil } = useSitzung();
  const geraet = useMemo(() => geraetErkennen(), []);
  const alsApp = laeuftAlsApp();
  const [imBrowser, setImBrowser] = useState(false);
  // Läuft hier gerade die eigene Anmeldung? Dann geht es mit der Sitzung sofort weiter.
  const [eigene, setEigene] = useState(false);

  const { data: info, isLoading, isError, refetch } = useQuery({
    queryKey: ["einladung", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("einladung_lesen", { p_token: token });
      if (error) throw error;
      return data as unknown as EinladungInfo;
    },
    retry: 2,
    staleTime: Infinity,
  });

  const gueltig = info?.status === "gueltig";

  useEffect(() => {
    if (!info) return;
    if (gueltig) offeneEinladungMerken(token);
    else offeneEinladungVergessen();
  }, [info, gueltig, token]);

  // iPhone/iPad: ohne Manifest wird DIESE Adresse die Startadresse der Home-App
  useEffect(() => {
    if (!istIOS(geraet) || alsApp) return;
    const manifest = document.querySelector('link[rel="manifest"]');
    const eltern = manifest?.parentNode;
    manifest?.remove();
    return () => { if (manifest && eltern) eltern.appendChild(manifest); };
  }, [geraet, alsApp]);

  if (sitzungLaedt || isLoading) return <Rahmen><p className="py-10 text-center text-muted-foreground">Lädt…</p></Rahmen>;

  // Angemeldet: gleich in die App — außer jemand anderer ist an diesem Gerät angemeldet
  if (session) {
    if (eigene || !gueltig) {
      offeneEinladungVergessen();
      return <Navigate to="/" replace />;
    }
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold">Schon angemeldet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An diesem Gerät ist gerade {profil ? name(profil) : "jemand"} angemeldet. Willst du dich als neuer Mitarbeiter registrieren?
        </p>
        <div className="mt-5 space-y-2">
          <Button className="h-12 w-full gap-2" onClick={() => void supabase.auth.signOut({ scope: "local" })}>
            <LogOut className="h-4 w-4" /> Abmelden und neu registrieren
          </Button>
          <Button variant="ghost" className="h-12 w-full" onClick={() => { offeneEinladungVergessen(); navigate("/", { replace: true }); }}>Weiter zur App</Button>
        </div>
      </Rahmen>
    );
  }
  if (isError || !info) {
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold">Keine Verbindung</h1>
        <p className="mt-2 text-sm text-muted-foreground">Die Einladung lässt sich gerade nicht laden. Bitte Netz prüfen und noch einmal versuchen.</p>
        <Button className="mt-5 h-12 w-full" onClick={() => void refetch()}>Noch einmal versuchen</Button>
      </Rahmen>
    );
  }

  if (!gueltig) {
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold" data-pruef={`einladung-${info.status}`}>Dieser Link gilt nicht mehr</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {info.status === "unbekannt"
            ? "Den Link gibt es nicht. Bitte den Chef um den aktuellen Link oder QR-Code."
            : "Der Chef hat einen neuen Link erzeugt. Bitte den aktuellen Aushang scannen oder den Chef um den Link bitten. Schon registriert? Einfach anmelden."}
        </p>
        <Button asChild className="mt-5 h-12 w-full"><Link to="/auth" replace>Zur Anmeldung</Link></Button>
      </Rahmen>
    );
  }

  const gruss = (
    <div className="mb-5">
      <h1 className="text-2xl font-bold leading-tight">Willkommen!</h1>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">Die App für alle bei {info.firma || KUNDE.firma}.</p>
    </div>
  );

  // Handy im Browser: zuerst installieren
  if (istMobil(geraet) && !alsApp && !imBrowser) {
    return (
      <Rahmen>
        {gruss}
        <div className="space-y-4">
          <section className="rounded-xl border p-4" data-pruef="schritt-installieren">
            <h2 className="mb-3 text-lg font-semibold">1. App auf den Startbildschirm legen</h2>
            <InstallAnleitung onFertig={() => toast.success("Fertig — die App liegt auf deinem Startbildschirm. Jetzt dort öffnen.")} />
          </section>
          <section className="rounded-xl border p-4" data-pruef="schritt-oeffnen">
            <h2 className="text-lg font-semibold">2. App öffnen</h2>
            <p className="mt-2 flex items-start gap-3 text-[0.95rem] leading-snug">
              <img src={KUNDE.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
              <span>
                Auf dem Startbildschirm auf das {KUNDE.kurzname}-Zeichen tippen und dich dort mit Namen und Passwort registrieren — fertig.
              </span>
            </p>
          </section>
          <Button variant="ghost" className="h-12 w-full text-muted-foreground" onClick={() => setImBrowser(true)} data-pruef="ohne-app">
            Ohne App im Browser weiter
          </Button>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {gruss}
      <KontoAnlegen token={token} onStart={setEigene} />
    </Rahmen>
  );
}

/** Schwarzer Kopf mit Logo wie die Anmeldeseite, darunter eine Karte */
function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="bg-marke-schwarz px-6 pb-14 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-md">
          <img src={KUNDE.logoQuerHell} alt={KUNDE.firma} className="h-16 w-auto" />
        </div>
      </div>
      <div className="relative -mt-8 flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
