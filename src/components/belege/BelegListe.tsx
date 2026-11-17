import { FileText, Receipt } from "lucide-react";
import { StatusBadge } from "@/components/Bausteine";
import { BelegZeile, MonatsListe } from "@/components/JahrWahl";
import { datum, euro } from "@/lib/format";
import { listenStatus, type BelegListenEintrag } from "./daten";

const typName = (typ: string) => (typ === "rechnung" ? "Rechnung" : "Angebot");

/** Unter dem Betrag: wann fällig / wie lange gültig / wann bezahlt */
function terminText(b: BelegListenEintrag, status: string): string | null {
  if (status === "entwurf") return null;
  if (b.typ === "rechnung") {
    if (status === "bezahlt") return b.bezahlt_am ? `bezahlt ${datum(b.bezahlt_am)}` : null;
    if (status === "offen" || status === "ueberfaellig") return b.faellig_am ? `fällig ${datum(b.faellig_am)}` : null;
    return null;
  }
  return status === "offen" && b.gueltig_bis ? `gültig bis ${datum(b.gueltig_bis)}` : null;
}

/** Zählt in Monats- und Listensummen: keine Entwürfe, kein Storno, keine abgelehnten Angebote */
export const belegZaehlt = (b: Pick<BelegListenEintrag, "typ" | "status">) =>
  b.typ === "angebot" ? b.status === "offen" || b.status === "angenommen" : b.status === "offen" || b.status === "bezahlt";

/**
 * Angebote und Rechnungen — eine weiße Karte, am PC in Spalten
 * (MonatsListe/BelegZeile aus JahrWahl.tsx, gleich wie Eingangsrechnungen).
 * `monate`: nach Monat gruppiert mit Monatssumme (brutto). `mitProjekt =
 * false` in der Projektansicht (dort ist das Projekt klar).
 */
export function BelegListe({
  belege, heute, pc, verrechneteAngebote, mitProjekt = true, monate = false,
}: {
  belege: BelegListenEintrag[];
  heute: string;
  pc: boolean;
  verrechneteAngebote: Set<string>;
  mitProjekt?: boolean;
  monate?: boolean;
}) {
  return (
    <MonatsListe
      eintraege={belege}
      tabelle={pc}
      gruppieren={monate}
      schluessel={(b) => b.id}
      datum={(b) => b.datum}
      betrag={(b) => (belegZaehlt(b) ? Number(b.brutto) : null)}
      kopf={{ name: "Empfänger · Betreff" }}
      zeile={(b) => {
        const status = listenStatus(b, heute, verrechneteAngebote);
        const projekt = mitProjekt && b.projekte ? `${b.projekte.nummer} ${b.projekte.name}` : null;
        return (
          <BelegZeile
            to={`/belege/${b.id}`}
            icon={b.typ === "rechnung" ? Receipt : FileText}
            nummer={b.nummer ?? <span className="text-muted-foreground">{typName(b.typ)} (Entwurf)</span>}
            name={b.empf_name || <span className="text-muted-foreground">Ohne Empfänger</span>}
            unter={[b.betreff, projekt].filter(Boolean).join(" · ") || null}
            datum={b.datum}
            betrag={euro(b.brutto)}
            betragUnter={terminText(b, status)}
            pillen={<StatusBadge status={status} />}
            odoo={!!b.altbestand}
            durchgestrichen={status === "storniert"}
          />
        );
      }}
    />
  );
}
