import { Link } from "react-router-dom";
import { useMemo } from "react";
import { ClipboardList, FileText, Truck } from "lucide-react";
import { Karte, Kennzahl, StatusPille } from "@/components/Bausteine";
import { BelegZeile, JahrWahl, MonatsListe, useJahrWahl } from "@/components/JahrWahl";
import { useOdooZeilen } from "@/hooks/useOdooZeilen";
import { euro, zahl } from "@/lib/format";
import { imJahr, jahreAus } from "@/lib/jahre";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLieferantBelege } from "./kontaktDaten";
import { belegPille, belegSummen, type LieferantBeleg } from "./kontaktLogik";

const ART = {
  rechnung: { text: "Rechnung", icon: FileText, pfad: (b: LieferantBeleg) => `/eingang?filter=alle&offen=${b.id}` },
  lieferschein: { text: "Lieferschein", icon: Truck, pfad: (b: LieferantBeleg) => `/lieferscheine?offen=${b.id}` },
  bestellung: { text: "Bestellung", icon: ClipboardList, pfad: (b: LieferantBeleg) => `/bestellungen/${b.id}` },
} as const;

/**
 * Belege eines Lieferanten: Eingangsrechnungen, Lieferscheine, Bestellungen —
 * gefunden über Name und weitere Schreibweisen, mit Summen und Öffnen.
 */
export function LieferantBelege({ kontakt, istChef }: { kontakt: Kunde; istChef: boolean }) {
  const { data: belege = [], isLoading } = useLieferantBelege(kontakt.id, true);
  const { data: odoo } = useOdooZeilen("eingangsrechnungen", istChef);
  // Jahresansicht wie Eingangsrechnungen: Rechnungen/Bestellungen im gewählten Jahr, „Nicht bezahlt“ über alle Jahre
  const [jahr, setJahr] = useJahrWahl("kontakt-lieferant");
  const jahre = useMemo(() => jahreAus(belege.map((b) => b.datum), new Date().getFullYear()), [belege]);
  const sichtbar = useMemo(() => belege.filter((b) => imJahr(b.datum, jahr)), [belege, jahr]);
  const s = belegSummen(sichtbar);
  const offen = belegSummen(belege);
  const namen = [kontakt.name, ...(kontakt.namen ?? [])];

  return (
    <Karte titel={`Belege${sichtbar.length ? ` · ${zahl(sichtbar.length)}` : ""}`} ohnePolster
      aktion={belege.length > 0 ? <JahrWahl jahre={jahre} jahr={jahr} onWahl={setJahr} className="flex-nowrap justify-end" /> : undefined}>
      {isLoading ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Lädt…</p>
      ) : belege.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">
          Keine Belege unter „{namen.join("“, „")}“. Heißt der Lieferant auf Rechnungen anders, die Schreibweise unter „Bearbeiten“ ergänzen.
        </p>
      ) : (
        <>
          {istChef && (
            <div className={cn("grid grid-cols-2 gap-2 px-4 pb-3 lg:px-5", s.bestellungen > 0 && "sm:grid-cols-3")}>
              <Kennzahl titel={jahr ? `Rechnungen ${jahr}` : "Rechnungen"} wert={euro(s.rechnungenSumme)} unter={`${zahl(s.rechnungen)} Rechnung${s.rechnungen === 1 ? "" : "en"}, brutto`} />
              <Kennzahl titel="Nicht bezahlt" wert={euro(offen.offenSumme)} unter={offen.offen ? `${zahl(offen.offen)} Rechnung${offen.offen === 1 ? "" : "en"} · alle Jahre` : "alles bezahlt"} />
              {s.bestellungen > 0 && <Kennzahl titel="Bestellt" wert={euro(s.bestellungenSumme)} unter={`${zahl(s.bestellungen)} Bestellung${s.bestellungen === 1 ? "" : "en"} netto`} />}
            </div>
          )}
          {sichtbar.length === 0 ? (
            <p className="border-t px-4 py-4 text-sm text-muted-foreground lg:px-5">{jahr} keine Belege — ältere unter „Archiv“.</p>
          ) : <MonatsListe
            eintraege={sichtbar}
            rahmen={false}
            schluessel={(b) => `${b.quelle}-${b.id}`}
            datum={(b) => b.datum}
            // Monatssumme: nur Rechnungen (brutto) — Bestellungen sind netto
            betrag={(b) => (b.quelle === "rechnung" && b.betrag != null ? Number(b.betrag) : null)}
            zeile={(b) => {
              const art = ART[b.quelle as keyof typeof ART] ?? ART.rechnung;
              return (
                <BelegZeile
                  to={art.pfad(b)}
                  icon={art.icon}
                  name={<>{art.text} {b.nummer ?? <span className="font-normal text-muted-foreground">ohne Nummer</span>}</>}
                  unter={b.projekt}
                  datum={b.datum}
                  odoo={b.quelle === "rechnung" && !!odoo?.has(b.id)}
                  betrag={b.betrag != null ? euro(b.betrag) : ""}
                  pillen={<StatusPille eintrag={belegPille(b)} />}
                />
              );
            }}
          />}
        </>
      )}
    </Karte>
  );
}
