import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ClipboardSignature, Receipt, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useProjekte, useProjektZahlen } from "@/hooks/useDaten";
import { datumKurz, stunden } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  kurzText, rechnungAusLink, verrechnenGruppen, type OffenerBericht, type VerrechnenGruppe,
} from "@/components/regie/regieLogik";

type Zeile = {
  id: string; nummer: string | null; datum: string; arbeiten: string; projekt_id: string | null; kunde_id: string | null;
  projekte: { id: string; nummer: string; name: string; kunden: { name: string } | null } | null;
  kunden: { id: string; name: string } | null;
  zeiten: { stunden: number }[];
  material_buchungen: { id: string }[];
};

/** Unterschriebene Regieberichte ohne Rechnung — mit und ohne Projekt */
export function useOffeneRegieberichte(aktiv = true) {
  return useQuery({
    queryKey: ["regieberichte", "nicht-verrechnet"],
    enabled: aktiv,
    queryFn: async (): Promise<OffenerBericht[]> => {
      const { data, error } = await supabase.from("regieberichte")
        .select("id, nummer, datum, arbeiten, projekt_id, kunde_id, projekte(id, nummer, name, kunden(name)), kunden(id, name), zeiten(stunden), material_buchungen(id)")
        .eq("status", "unterschrieben").is("rechnung_id", null).order("datum");
      if (error) throw error;
      return ((data ?? []) as unknown as Zeile[]).map((r) => ({
        id: r.id,
        nummer: r.nummer,
        datum: r.datum,
        arbeiten: r.arbeiten,
        projektId: r.projekt_id,
        projektNummer: r.projekte?.nummer ?? null,
        projektName: r.projekte?.name ?? null,
        kundeId: r.kunde_id,
        kundeName: r.projekte?.kunden?.name ?? r.kunden?.name ?? null,
        stunden: Math.round(r.zeiten.reduce((s, z) => s + Number(z.stunden), 0) * 100) / 100,
        material: r.material_buchungen.length,
      }));
    },
  });
}

/** Erledigte Einsätze, deren Projekt noch offene Stunden hat (wie auf der Startseite) */
function useErledigteEinsaetze() {
  return useQuery({
    queryKey: ["termine", "erledigt"],
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("id, projekt_id").eq("status", "erledigt").not("projekt_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const materialText = (n: number) => (n ? `${n} Material${n === 1 ? "" : "zeilen"}` : "");

/**
 * Rechnungen, ganz oben: was unterschrieben, aber noch nicht verrechnet ist.
 * Mit Projekt geht „Rechnung daraus“ über den Projekt-Import (alles Offene
 * zum Anhaken), ohne Projekt direkt an den Kunden — mehrere Berichte
 * desselben Kunden wahlweise zusammen. Leer → nichts zu sehen.
 */
export function NochNichtVerrechnet() {
  const { data: berichte = [] } = useOffeneRegieberichte();
  const { data: erledigt = [] } = useErledigteEinsaetze();
  const { data: zahlen = {} } = useProjektZahlen();
  const { data: projekte = [] } = useProjekte();
  const gruppen = useMemo(() => verrechnenGruppen(berichte), [berichte]);

  // Erledigte Einsätze mit offenen Stunden — außer das Projekt steht schon oben (Regiebericht)
  const einsaetze = useMemo(() => {
    const schon = new Set(gruppen.filter((g) => g.art === "projekt").map((g) => g.id));
    return [...new Set(erledigt.map((t) => t.projekt_id as string))]
      .filter((id) => !schon.has(id) && Number(zahlen[id]?.stunden_offen ?? 0) > 0)
      .map((id) => ({ p: projekte.find((x) => x.id === id), offen: Number(zahlen[id]?.stunden_offen ?? 0), id }))
      .filter((x) => !!x.p);
  }, [erledigt, zahlen, projekte, gruppen]);

  if (!gruppen.length && !einsaetze.length) return null;
  const anzahl = berichte.length;

  return (
    <section className="space-y-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3 lg:p-4" aria-label="Noch nicht verrechnet">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <Receipt className="h-4 w-4 text-primary" /> Noch nicht verrechnet
        </h2>
        <p className="text-xs text-muted-foreground">
          {[anzahl && `${anzahl} ${anzahl === 1 ? "Regiebericht" : "Regieberichte"} unterschrieben`, einsaetze.length && `${einsaetze.length} erledigte${einsaetze.length === 1 ? "r" : ""} Einsatz${einsaetze.length === 1 ? "" : "e"}`]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <ul className="space-y-2">
        {gruppen.map((g) => <GruppeZeile key={g.schluessel} g={g} />)}
        {einsaetze.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card p-3">
            <CalendarCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Link to={`/projekte/${e.id}`} className="block truncate font-medium hover:underline">{e.p!.name}</Link>
              <p className="truncate text-xs text-muted-foreground">
                {[e.p!.nummer, e.p!.kunden?.name, "Einsatz erledigt", `${stunden(e.offen)} offen`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button asChild variant="outline" className="h-11 shrink-0">
              <Link to={rechnungAusLink({ art: "projekt", id: e.id })}><Receipt className="h-4 w-4" /> Rechnung daraus</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GruppeZeile({ g }: { g: VerrechnenGruppe }) {
  const navigate = useNavigate();
  // Ohne Projekt: mehrere Berichte desselben Kunden — Standard alle zusammen
  const [gewaehlt, setGewaehlt] = useState<string[]>(() => g.berichte.map((b) => b.id));
  const mehrere = g.art === "kunde" && g.berichte.length > 1;
  const ids = mehrere ? g.berichte.filter((b) => gewaehlt.includes(b.id)).map((b) => b.id) : g.berichte.map((b) => b.id);
  const Icon = g.art === "projekt" ? ClipboardSignature : Wrench;

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{g.titel}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[g.unter, `${g.berichte.length} ${g.berichte.length === 1 ? "Bericht" : "Berichte"}`, stunden(g.stunden), materialText(g.material)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button className="h-11 shrink-0" disabled={!ids.length} onClick={() => navigate(rechnungAusLink(g, ids))}>
          <Receipt className="h-4 w-4" /> {mehrere && ids.length > 1 ? `${ids.length} zusammen verrechnen` : "Rechnung daraus"}
        </Button>
      </div>
      <ul className="mt-2 space-y-1 border-t pt-2">
        {g.berichte.map((b) => {
          const an = gewaehlt.includes(b.id);
          const inhalt = (
            <>
              <span className="font-mono text-xs text-muted-foreground">{b.nummer ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{datumKurz(b.datum)}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{kurzText(b.arbeiten, 80) || "–"}</span>
              <span className="zahl shrink-0 text-sm font-semibold">{stunden(b.stunden)}</span>
            </>
          );
          return (
            <li key={b.id} className="flex items-center gap-2">
              {mehrere && (
                <button type="button" aria-pressed={an} aria-label={`${b.nummer ?? "Bericht"} mitverrechnen`}
                  onClick={() => setGewaehlt((x) => (an ? x.filter((y) => y !== b.id) : [...x, b.id]))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded border text-[0.7rem]",
                    an ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{an ? "✓" : ""}</span>
                </button>
              )}
              <Link to={`/regie/${b.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 hover:bg-muted/50">
                {inhalt}
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
