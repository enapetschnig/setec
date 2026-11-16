import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageCircle, Printer, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Karte } from "@/components/Bausteine";
import { einladungsAdresse, einladungsText, mailAdresse, whatsAppAdresse } from "@/lib/einladung";
import { KUNDE } from "@/kunde.config";

/**
 * Neue Mitarbeiter (Einstellungen → Mitarbeiter): der EINE Firmen-Link mit
 * QR-Code. Wer ihn öffnet, installiert die App und registriert sich darin
 * selbst — sofort freigeschaltet (pages/Einladung.tsx, Migration
 * 20261116110000_firmen_link.sql). Aushang zum Ausdrucken unter /aushang.
 */

/** Der gültige Firmen-Link (entsteht beim ersten Abruf) */
export function useFirmenLink() {
  return useQuery({
    queryKey: ["firmen-link"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("firmen_link", { p_neu: false });
      if (error) throw error;
      // Lokal (Entwicklung) die eigene Adresse, sonst immer die offizielle — egal über welche Domain der Chef gerade arbeitet
      return einladungsAdresse(import.meta.env.PROD ? KUNDE.appAdresse : window.location.origin, data as string);
    },
    staleTime: Infinity,
  });
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
  const qc = useQueryClient();
  const { data: link, isLoading, error } = useFirmenLink();
  const qr = useQr(link);
  const [erneuern, setErneuern] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const text = link ? einladungsText({ firma: KUNDE.kurzname, link }) : "";
  const kannTeilen = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link ?? "");
      toast.success("Link kopiert");
    } catch {
      toast.error("Kopieren geht hier nicht — bitte den Link markieren und kopieren.");
    }
  };
  const neuerLink = async () => {
    setLaeuft(true);
    const { error: e } = await supabase.rpc("firmen_link", { p_neu: true });
    setLaeuft(false);
    setErneuern(false);
    if (e) return toast.error("Kein neuer Link", { description: e.message });
    await qc.invalidateQueries({ queryKey: ["firmen-link"] });
    toast.success("Neuer Link — der alte gilt nicht mehr. Bitte den Aushang neu drucken.");
  };

  return (
    <Karte titel="Neue Mitarbeiter">
      <p className="text-sm text-muted-foreground">
        Jeder registriert sich selbst. Über diesen Link oder QR-Code ist er sofort drin; wer sich ohne Link auf der
        Anmeldeseite registriert, wartet, bis du ihn unten mit einem Tipp freischaltest. Chef-Rechte und Team gibst du danach hier unten.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-destructive">Der Link lässt sich gerade nicht laden: {(error as Error).message}</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr] md:items-start" data-pruef="firmen-link">
          <div className="mx-auto rounded-xl border bg-white p-3">
            {qr ? <img src={qr} alt="QR-Code zur App" className="h-48 w-48" data-pruef="qr" /> : <div className="h-48 w-48 animate-pulse rounded bg-neutral-100" />}
          </div>
          <div className="min-w-0 space-y-3">
            <Input readOnly value={isLoading ? "" : link ?? ""} onFocus={(e) => e.currentTarget.select()}
              className="h-11 font-mono text-sm" aria-label="Firmen-Link" />
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
              <Button variant="outline" className="h-12 gap-2 text-base" onClick={() => void kopieren()} disabled={!link} data-pruef="kopieren">
                <Copy className="h-5 w-5" /> Link kopieren
              </Button>
              {kannTeilen && (
                <Button variant="outline" className="h-12 gap-2 text-base"
                  onClick={() => void navigator.share({ title: `${KUNDE.kurzname}-App`, text }).catch(() => {})}>
                  <Share2 className="h-5 w-5" /> Teilen …
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setErneuern(true)} data-pruef="link-erneuern">
              <RefreshCw className="h-4 w-4" /> Neuen Link erzeugen
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={erneuern} onOpenChange={setErneuern}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Neuen Link erzeugen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der bisherige Link und QR-Code gelten dann nicht mehr — gut, wenn er an jemand Falschen gegangen ist. Wer schon
              registriert ist, merkt nichts. Den Aushang danach neu drucken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void neuerLink(); }} disabled={laeuft}>
              {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Neuer Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Karte>
  );
}
