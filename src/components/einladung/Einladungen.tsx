import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageCircle, MessageSquareText, Printer, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Karte } from "@/components/Bausteine";
import { einladungsText, handyNummer, mailAdresse, startAdresse, whatsAppAdresse } from "@/lib/einladung";
import { KUNDE } from "@/kunde.config";

/**
 * Neue Mitarbeiter (Einstellungen → Mitarbeiter): der EINE Link /start mit
 * QR-Code. Wer ihn öffnet, installiert die App und registriert sich darin
 * selbst — sofort drin (pages/Start.tsx). Aushang unter /aushang, SMS über
 * die Edge Function einladung-sms (Twilio).
 */

/** Lokal (Entwicklung) die eigene Adresse, sonst immer die offizielle — egal über welche Domain der Chef gerade arbeitet */
export function appLink(): string {
  return startAdresse(import.meta.env.PROD ? KUNDE.appAdresse : window.location.origin);
}

/** QR-Code als Bild-Adresse, lokal erzeugt (kein fremder Dienst) */
export function useQr(link: string | undefined, breite = 480) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    setQr(null);
    if (!link) return;
    let aktiv = true;
    void import("qrcode").then((QR) => QR.toDataURL(link, { margin: 1, width: breite, errorCorrectionLevel: "M" }))
      .then((u) => { if (aktiv) setQr(u); }).catch(() => {});
    return () => { aktiv = false; };
  }, [link, breite]);
  return qr;
}

export function EinladenKarte() {
  const link = appLink();
  const qr = useQr(link);
  const text = einladungsText({ firma: KUNDE.kurzname, link });
  const kannTeilen = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const [nummer, setNummer] = useState("");
  const [sendet, setSendet] = useState(false);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kopiert");
    } catch {
      toast.error("Kopieren geht hier nicht — bitte den Link markieren und kopieren.");
    }
  };

  const perSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendet) return;
    const an = handyNummer(nummer);
    if (!an) return toast.error("Das ist keine Handynummer — z. B. 0664 1234567.");
    setSendet(true);
    const { data, error } = await supabase.functions.invoke("einladung-sms", { body: { nummer: an } });
    setSendet(false);
    if (error) {
      // Die Funktion schickt ihre Meldung im Körper mit
      let meldung = error.message;
      try { meldung = (await (error as { context?: Response }).context?.json())?.error ?? meldung; } catch { /* Netz */ }
      return toast.error("SMS nicht verschickt", { description: meldung });
    }
    toast.success(`SMS an ${data?.an ?? an} verschickt`);
    setNummer("");
  };

  return (
    <Karte titel="Neue Mitarbeiter">
      <p className="text-sm text-muted-foreground">
        Jeder registriert sich selbst über diesen einen Link — der erkennt das Handy, zeigt, wie die App auf den Startbildschirm kommt,
        und führt zum Registrieren. Wer sich registriert, ist sofort drin. Chef-Rechte gibst du danach hier unten, das Team im Kalender unter „Teams“.
      </p>
      <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr] md:items-start" data-pruef="app-link">
        <div className="mx-auto rounded-xl border bg-white p-3">
          {qr ? <img src={qr} alt="QR-Code zur App" className="h-48 w-48" data-pruef="qr" /> : <div className="h-48 w-48 animate-pulse rounded bg-neutral-100" />}
        </div>
        <div className="min-w-0 space-y-3">
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono text-sm" aria-label="Link zur App" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="h-12 gap-2 text-base">
              <Link to="/aushang"><Printer className="h-5 w-5" /> Aushang drucken</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 gap-2 text-base">
              <a href={whatsAppAdresse(text)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-5 w-5" /> Per WhatsApp</a>
            </Button>
            <Button asChild variant="outline" className="h-12 gap-2 text-base">
              <a href={mailAdresse(`${KUNDE.kurzname}-App`, text)}><Mail className="h-5 w-5" /> Per E-Mail</a>
            </Button>
            <Button variant="outline" className="h-12 gap-2 text-base" onClick={() => void kopieren()} data-pruef="kopieren">
              <Copy className="h-5 w-5" /> Link kopieren
            </Button>
            {kannTeilen && (
              <Button variant="outline" className="h-12 gap-2 text-base"
                onClick={() => void navigator.share({ title: `${KUNDE.kurzname}-App`, text }).catch(() => {})}>
                <Share2 className="h-5 w-5" /> Teilen …
              </Button>
            )}
          </div>
          <form onSubmit={perSms} className="space-y-1.5" data-pruef="per-sms">
            <label htmlFor="sms-nummer" className="text-sm font-medium">Per SMS an</label>
            <div className="flex gap-2">
              <Input id="sms-nummer" type="tel" inputMode="tel" autoComplete="off" placeholder="0664 1234567" value={nummer}
                onChange={(e) => setNummer(e.target.value)} className="h-12 text-base md:text-base" />
              <Button type="submit" className="h-12 shrink-0 gap-2" disabled={sendet || !nummer.trim()}>
                {sendet ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquareText className="h-5 w-5" />} Senden
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Die SMS beginnt mit „{KUNDE.firma}:“ und enthält nur den Link zur App.</p>
          </form>
        </div>
      </div>
    </Karte>
  );
}
