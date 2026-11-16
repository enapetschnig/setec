import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mitZeichen } from "@/components/Bedienzeichen";
import { useFirmenLink, useQr } from "@/components/einladung/Einladungen";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

/**
 * /aushang (nur Chef): EINE A4-Seite zum Aufhängen oder Verteilen — großer
 * QR-Code auf den Firmen-Link, drei Schritte, Firmendaten. Drucken bzw.
 * „Als PDF speichern“ über den Browser. Auf Papier feste helle Farben.
 */
export default function Aushang() {
  const { laden, session, istChef } = useSitzung();
  const { data: link } = useFirmenLink();
  const qr = useQr(link, 900);

  if (laden) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (!istChef) return <Navigate to="/" replace />;

  const schritt = (nr: number, titel: string, inhalt: React.ReactNode) => (
    <div className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">{nr}</span>
      <div className="pt-1">
        <p className="text-lg font-semibold">{titel}</p>
        <div className="mt-1 text-[0.95rem] leading-snug text-neutral-700">{inhalt}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{"@page { size: A4; margin: 0 } @media print { html, body { background: #fff } }"}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2 px-4 print:hidden">
        <Button asChild variant="outline" className="h-11 gap-2"><Link to="/einstellungen"><ArrowLeft className="h-4 w-4" /> Zurück</Link></Button>
        <Button className="h-11 gap-2" onClick={() => window.print()} disabled={!qr} data-pruef="drucken"><Printer className="h-4 w-4" /> Drucken / als PDF</Button>
      </div>

      <div className="mx-auto flex h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden bg-white text-neutral-900 shadow-sm print:shadow-none"
        data-pruef="aushang">
        <div className="flex items-center justify-between bg-black px-[16mm] py-[9mm]">
          <img src={KUNDE.logoQuerHell} alt={KUNDE.firma} className="h-[20mm] w-auto" />
          <p className="text-right text-sm font-medium uppercase tracking-[0.18em] text-[#C4A983]">Betriebs-App</p>
        </div>

        <div className="flex flex-1 flex-col px-[16mm] pt-[10mm]">
          <h1 className="font-marke text-[26pt] font-bold leading-tight">Die {KUNDE.kurzname}-App für alle Mitarbeiter</h1>
          <p className="mt-2 text-lg text-neutral-600">Stunden, Material, Regieberichte, Fotos — direkt am Handy.</p>

          <div className="mt-[8mm] flex flex-col items-center">
            {qr ? <img src={qr} alt="QR-Code zur App" className="h-[78mm] w-[78mm]" /> : <div className="h-[78mm] w-[78mm] animate-pulse bg-neutral-100" />}
            <p className="mt-3 break-all text-center font-mono text-sm text-neutral-700">{link}</p>
          </div>

          <div className="mt-[9mm] space-y-5">
            {schritt(1, "QR-Code mit der Handy-Kamera scannen", "Oder die Adresse darüber im Browser eintippen.")}
            {schritt(2, "App auf den Startbildschirm legen", (
              <>
                <p><b>iPhone:</b> in Safari {mitZeichen("[punkte] → Teilen [teilen] → Mehr anzeigen [mehr] → „Zum Home-Bildschirm“ [plus] → Hinzufügen")}</p>
                <p className="mt-1"><b>Android:</b> in Chrome auf „App installieren“ tippen.</p>
              </>
            ))}
            {schritt(3, "App öffnen und registrieren", "Vorname, Nachname, Benutzername und Passwort eintragen — fertig, du bist gleich drin.")}
          </div>

          <div className="mt-[8mm] rounded-xl border-2 border-neutral-300 px-5 py-3 text-[0.95rem]">
            <b>Passwort vergessen?</b> Beim Chef melden — er gibt dir ein vorläufiges Passwort.
          </div>
        </div>

        <div className="border-t px-[16mm] py-[6mm] text-sm text-neutral-600">
          {KUNDE.firma} · {KUNDE.anschrift.strasse}, {KUNDE.anschrift.plz} {KUNDE.anschrift.ort} · <span className="whitespace-nowrap">{KUNDE.kontakt.telefon}</span> · <span className="whitespace-nowrap">{KUNDE.kontakt.website}</span>
        </div>
      </div>
    </div>
  );
}
