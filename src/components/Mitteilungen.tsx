import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BellRing, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Karte } from "@/components/Bausteine";
import { InstallAnleitung } from "@/components/Installieren";
import { useSitzung } from "@/hooks/useSitzung";
import { ungespeichertListe } from "@/lib/ungespeichert";
import { pushAusschalten, pushEinschalten, pushStatus, pushTesten, type PushStatus } from "@/lib/push";

/**
 * Mitteilungen aufs Handy bei Terminänderung (Web-Push):
 * - MitteilungenKarte in „Mein Konto“ mit An/Aus
 * - MitteilungenHinweis dezent auf der Monteur-Startseite, solange aus
 * - PushKlick: Antippen der Mitteilung bei offener App → Startseite
 */

function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const neu = useCallback(() => { void pushStatus().then(setStatus).catch(() => setStatus("nicht_unterstuetzt")); }, []);
  useEffect(neu, [neu]);
  return [status, neu] as const;
}

export function MitteilungenKarte() {
  const [status, neu] = usePushStatus();
  const [laeuft, setLaeuft] = useState(false);
  const [anleitung, setAnleitung] = useState(false);
  // Vom Hinweis auf der Startseite gekommen: Karte ins Bild holen
  useEffect(() => {
    if (status !== null && window.location.hash === "#mitteilungen") {
      document.getElementById("mitteilungen")?.scrollIntoView({ block: "center" });
    }
  }, [status]);
  if (status === null) return null;

  const umschalten = async (an: boolean) => {
    setLaeuft(true);
    try {
      if (an) { await pushEinschalten(); toast.success("Mitteilungen sind an"); }
      else { await pushAusschalten(); toast.success("Mitteilungen sind aus"); }
    } catch (e) {
      toast.error(an ? "Nicht eingeschaltet" : "Nicht ausgeschaltet", { description: (e as Error).message });
    } finally {
      setLaeuft(false);
      neu();
    }
  };
  const testen = async () => {
    setLaeuft(true);
    try {
      const n = await pushTesten();
      if (n) toast.success("Testmitteilung geschickt"); else toast.error("Kein Gerät erreicht — bitte aus- und wieder einschalten.");
    } catch (e) {
      toast.error("Nicht geschickt", { description: (e as Error).message });
    } finally { setLaeuft(false); }
  };

  return (
    <Karte titel="Mitteilungen aufs Handy">
      <div id="mitteilungen" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Wird ein Einsatz von dir verschoben, neu eingeteilt oder gestrichen, kommt sofort eine Mitteilung — auch wenn die App zu ist.
        </p>
        {(status === "aus" || status === "an") && (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-md border px-3">
            <span className="font-medium">{status === "an" ? "An auf diesem Gerät" : "Aus auf diesem Gerät"}</span>
            {laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <Switch checked={status === "an"} onCheckedChange={(v) => void umschalten(v)} aria-label="Mitteilungen aufs Handy" />
            )}
          </label>
        )}
        {status === "an" && (
          <Button variant="outline" className="h-11 gap-2" disabled={laeuft} onClick={() => void testen()}>
            <Send className="h-4 w-4" /> Testmitteilung schicken
          </Button>
        )}
        {status === "ios_nicht_installiert" && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
            <p>Am iPhone gibt es Mitteilungen nur in der <b>installierten App</b>: in Safari unten auf „Teilen“, dann
              „Zum Home-Bildschirm“. Danach die App über das neue Symbol öffnen und hier einschalten.</p>
            {anleitung ? <InstallAnleitung /> : (
              <Button variant="outline" className="h-11" onClick={() => setAnleitung(true)}>So geht&apos;s</Button>
            )}
          </div>
        )}
        {status === "verweigert" && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm">
            Mitteilungen sind für diese App blockiert. In den Einstellungen des Handys (bzw. beim Schloss neben der Adresse)
            „Mitteilungen“ erlauben und die Seite neu laden.
          </p>
        )}
        {status === "nicht_unterstuetzt" && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm">Dieser Browser kann keine Mitteilungen. Am Handy in Chrome (Android) bzw. in der installierten App (iPhone) öffnen.</p>
        )}
      </div>
    </Karte>
  );
}

const HINWEIS_WEG = "elektro.mitteilungen.hinweis.weg";

/** Dezenter Hinweis auf der Monteur-Startseite, solange Mitteilungen aus sind. „×“ blendet ihn 30 Tage aus. */
export function MitteilungenHinweis() {
  const { istChef } = useSitzung();
  const [status] = usePushStatus();
  const [weg, setWeg] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(HINWEIS_WEG) || 0) < 30 * 86_400_000; } catch { return false; }
  });
  if (istChef || weg || (status !== "aus" && status !== "ios_nicht_installiert")) return null;
  const ausblenden = () => {
    try { localStorage.setItem(HINWEIS_WEG, String(Date.now())); } catch { /* egal */ }
    setWeg(true);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-3 pr-1 text-sm" data-pruef="mitteilungen-hinweis">
      <BellRing className="h-4 w-4 shrink-0 text-primary" />
      <Link to="/einstellungen?bereich=konto#mitteilungen" className="min-w-0 flex-1 py-2">
        Bei Terminänderung aufs Handy? <span className="font-medium text-primary">Mitteilungen einschalten</span>
      </Link>
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Hinweis ausblenden" onClick={ausblenden}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Mitteilung angetippt, App war schon offen: zur Startseite — außer es ist etwas ungespeichert. */
export function PushKlick() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const an = (e: MessageEvent) => {
      if (e.data?.typ !== "push-klick") return;
      if (ungespeichertListe().length) return;
      let pfad = "/";
      try { pfad = new URL(String(e.data.url || "/"), window.location.origin).pathname; } catch { /* Startseite */ }
      navigate(pfad);
    };
    navigator.serviceWorker.addEventListener("message", an);
    return () => navigator.serviceWorker.removeEventListener("message", an);
  }, [navigate]);
  return null;
}
