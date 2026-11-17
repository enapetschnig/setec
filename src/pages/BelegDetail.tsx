import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";
import { BelegEditor } from "@/components/belege/BelegEditor";
import { AltrechnungAnsicht } from "@/components/buchhaltung/AltrechnungAnsicht";
import { useBeleg } from "@/components/belege/daten";
import { artikelPosition, empfaengerAusKunde, kopfNeu, leerePosition, neueId, zahlText, type BelegTyp, type EditorPosition } from "@/components/belege/editor";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { klsRechnungSetzen, useKundenLieferschein } from "@/components/kundenlieferschein/klsDaten";
import { useKunden, useProjekt } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";
import { lohnarten as lohnartenFuer } from "@/lib/kalkulation";
import { stundensatzFuer } from "@/lib/preise";
import { importPositionen, regieImportLaden } from "@/components/belege/importieren";
import { regieIdsAusUrl } from "@/components/regie/regieLogik";

/**
 * /belege/neu?typ=angebot|rechnung[&projekt=<id>|&kunde=<id>][&sprache=1][&import=1][&ki=1]
 *   [&regie=<id>,<id>] — Rechnung aus Regieberichten ohne Projekt (Rechnungen → „Noch nicht verrechnet“)
 *   [&vorlage=<id>[&preise=vorlage]] — Angebot aus einer Vorlage (sonst Preise von heute)
 * /belege/:id
 *
 * Neu: Startwerte aus Firma (Texte), Projekt und dessen Kunde. Gespeichert
 * wird erst mit dem ersten „Speichern“ — dann wechselt die Adresse auf die ID.
 */
export default function BelegDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (id) return <VorhandenerBeleg id={id} />;
  return <NeuerBeleg key={params.toString()} params={params} />;
}

function Laedt({ titel }: { titel: string }) {
  return (
    <Seite titel={titel}>
      <p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p>
    </Seite>
  );
}

function VorhandenerBeleg({ id }: { id: string }) {
  const { data, isLoading, error } = useBeleg(id);
  if (isLoading) return <Laedt titel="Beleg" />;
  if (error) {
    return (
      <Seite titel="Beleg">
        <Leer icon={AlertTriangle} text={`Der Beleg konnte nicht geladen werden: ${(error as Error).message}`} />
      </Seite>
    );
  }
  if (!data) {
    return (
      <Seite titel="Beleg" zurueckPfad="/rechnungen">
        <Leer icon={FileText} text="Diesen Beleg gibt es nicht (mehr).">
          <Button asChild className="h-11"><Link to="/rechnungen">Zu den Rechnungen</Link></Button>
        </Leer>
      </Seite>
    );
  }
  // Altrechnung aus dem bisherigen Programm: keine Positionen, kein Editor
  if (data.beleg.altbestand) return <AltrechnungAnsicht beleg={data.beleg} />;
  return <BelegEditor id={id} daten={data} />;
}

function NeuerBeleg({ params }: { params: URLSearchParams }) {
  const { firma, laden } = useSitzung();
  const typ: BelegTyp = params.get("typ") === "rechnung" ? "rechnung" : "angebot";
  const projektId = params.get("projekt") || undefined;
  const { data: projekt, isLoading: projektLaedt } = useProjekt(projektId);
  const { data: kunden, isLoading: kundenLaedt } = useKunden();
  const [id] = useState(neueId);
  // Rechnung aus einem Kunden-Lieferschein: Zeilen mit Verkaufspreis, Retour mit Minus
  const lsId = typ === "rechnung" ? params.get("lieferschein") : null;
  const { data: ls, isLoading: lsLaedt } = useKundenLieferschein(lsId);
  const artikelIds = [...new Set((ls?.kunden_lieferschein_positionen ?? []).map((p) => p.artikel_id).filter(Boolean) as string[])];
  const { data: lsArtikel, isLoading: artikelLaedt } = useQuery({
    queryKey: ["artikel", "fuer-lieferschein", lsId, artikelIds.join(",")],
    enabled: !!ls,
    queryFn: async () => {
      if (!artikelIds.length) return [];
      const { data, error } = await supabase.from("artikel").select("id, bezeichnung, einheit, vk_preis, ek_preis, listenpreis, aufschlag").in("id", artikelIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Rechnung aus Regieberichten ohne Projekt: genau diese Berichte, je einer ein Titel
  const regieIds = typ === "rechnung" ? regieIdsAusUrl(params.get("regie")) : [];
  const { data: regie, isLoading: regieLaedt, error: regieFehler } = useQuery({
    queryKey: ["belege", "import", "regie", regieIds.join(",")],
    enabled: regieIds.length > 0,
    staleTime: 0,
    queryFn: () => regieImportLaden({ ids: regieIds }, null, { zeiten: [], material: [], regie: [] }),
  });

  if (laden || (projektId && projektLaedt) || kundenLaedt || (lsId && (lsLaedt || artikelLaedt)) || (regieIds.length > 0 && regieLaedt)) {
    return <Laedt titel={typ === "angebot" ? "Neues Angebot" : "Neue Rechnung"} />;
  }
  if (regieFehler) {
    return (
      <Seite titel="Neue Rechnung">
        <Leer icon={AlertTriangle} text={`Regieberichte konnten nicht geladen werden: ${(regieFehler as Error).message}`} />
      </Seite>
    );
  }

  const kopf = kopfNeu(typ, firma, isoTag());
  if (projekt) {
    kopf.projekt_id = projekt.id;
    kopf.betreff = projekt.name;
    const kunde = kunden?.find((k) => k.id === projekt.kunde_id) ?? null;
    if (kunde) Object.assign(kopf, empfaengerAusKunde(kunde));
  } else if (params.get("kunde")) {
    const kunde = kunden?.find((k) => k.id === params.get("kunde")) ?? null;
    if (kunde) Object.assign(kopf, empfaengerAusKunde(kunde));
  }
  let startPositionen: EditorPosition[] | undefined;
  if (ls) {
    if (!ls.kunde_id) Object.assign(kopf, { empf_name: ls.empf_name, empf_strasse: ls.empf_strasse ?? "", empf_plz: ls.empf_plz ?? "", empf_ort: ls.empf_ort ?? "", empf_email: ls.empf_email ?? "" });
    kopf.betreff = `Lieferschein ${ls.nummer ?? ""}`.trim();
    if (!kopf.leistung_von) kopf.leistung_von = ls.datum;
    startPositionen = [...ls.kunden_lieferschein_positionen].sort((a, b) => a.pos - b.pos).map((p) => {
      const a = lsArtikel?.find((x) => x.id === p.artikel_id);
      const menge = zahlText(p.retour ? -Number(p.menge) : Number(p.menge));
      const bezeichnung = p.retour ? `Retour: ${p.bezeichnung}` : p.bezeichnung;
      return a
        ? { ...artikelPosition(a, firma), bezeichnung, menge }
        : leerePosition("material", { bezeichnung, einheit: p.einheit, menge });
    });
  }

  if (regie?.regie.length) {
    const satz = stundensatzFuer(null, firma);
    const aus = importPositionen(
      regie,
      { angebote: [], regie: regie.regie.map((x) => x.id), zeiten: [], material: [] },
      { stundenJeMitarbeiter: true, materialPauschale: false, stundensatz: satz, lohnarten: lohnartenFuer(firma, satz) },
      firma,
      false,
    );
    startPositionen = [...(startPositionen ?? []), ...aus.positionen];
    kopf.leistung_von = kopf.leistung_von || aus.von || "";
    kopf.leistung_bis = kopf.leistung_bis || aus.bis || "";
    kopf.betreff = regie.regie.length === 1
      ? `Regiebericht ${regie.regie[0].nummer ?? ""}`.trim()
      : `Regieberichte ${regie.regie.map((x) => x.nummer).filter(Boolean).join(", ")}`;
  }

  return (
    <BelegEditor
      id={id}
      daten={null}
      startKopf={kopf}
      autoSprache={params.get("sprache") === "1"}
      autoKi={params.get("ki") === "1"}
      autoImport={typ === "rechnung" && !!projekt && params.get("import") === "1"}
      startVorlage={typ === "angebot" && params.get("vorlage") ? { id: params.get("vorlage")!, nachziehen: params.get("preise") !== "vorlage" } : undefined}
      startPositionen={startPositionen}
      nachNeuAnlegen={ls ? (rid) => klsRechnungSetzen(ls.id, rid) : undefined}
    />
  );
}
