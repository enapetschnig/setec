import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Check, FileDown, Loader2, Mail, PackagePlus, PenLine, Plus, Printer, Receipt, RotateCcw, Save, Trash2, Undo2,
} from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { useLagerbestand } from "@/components/material/materialDaten";
import { KundenUnterschrift } from "@/components/regie/KundenUnterschrift";
import { BelegMailDialog } from "@/components/belege/BelegMailDialog";
import { mailVorgabe } from "@/components/belege/mail";
import {
  klsAbschliessen, klsLoeschen, klsSpeichern, klsUnterschreiben, useKundenLieferschein, type KlsKopf, type KlsVoll, type KlsZeile,
} from "@/components/kundenlieferschein/klsDaten";
import { KLS_STATUS, klsStatus } from "@/components/kundenlieferschein/klsLogik";
import { klsPdfAnsehen, klsPdfDateiname, klsPdfErstellen, klsPdfTeilen } from "@/lib/klsPdf";
import { istMobilGeraet } from "@/lib/pdfBasis";
import { useKunden, useLagerorte, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, isoTag, zahl } from "@/lib/format";
import { fehlerText } from "@/components/stamm/stammDaten";
import { zahlFeld } from "@/components/stamm/Felder";
import type { Artikel, Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

type Zeile = { key: string; artikel_id: string | null; artikelnummer: string | null; bezeichnung: string; menge: string; einheit: string; retour: boolean };
type Kopf = { kunde_id: string | null; empf_name: string; empf_strasse: string; empf_plz: string; empf_ort: string; empf_email: string; datum: string; lagerort_id: string; notiz: string };

const leererKopf = (heute: string): Kopf => ({ kunde_id: null, empf_name: "", empf_strasse: "", empf_plz: "", empf_ort: "", empf_email: "", datum: heute, lagerort_id: "", notiz: "" });
const ausKunde = (k: Kunde): Partial<Kopf> => ({
  kunde_id: k.id, empf_name: k.name, empf_strasse: k.strasse ?? "", empf_plz: k.plz ?? "", empf_ort: k.ort ?? "", empf_email: k.email ?? "",
});
const zeileAus = (p: { artikel_id: string | null; artikelnummer: string | null; bezeichnung: string; menge: number; einheit: string; retour: boolean }): Zeile => ({
  key: crypto.randomUUID(), artikel_id: p.artikel_id, artikelnummer: p.artikelnummer, bezeichnung: p.bezeichnung,
  menge: zahlFeld(Number(p.menge)), einheit: p.einheit, retour: p.retour,
});

/** /kunden-lieferscheine/neu (?kunde=, ?retour=<Lieferschein>) und /kunden-lieferscheine/:id */
export default function KundenLieferscheinSeite() {
  const { id: pfadId } = useParams();
  const neu = !pfadId || pfadId === "neu";
  const { data, isLoading, error } = useKundenLieferschein(neu ? null : pfadId!);
  const [params] = useSearchParams();
  const retourVon = useKundenLieferschein(neu ? params.get("retour") : null);
  const { data: kunden, isLoading: kundenLaden } = useKunden();
  const { data: lager, isLoading: lagerLaden } = useLagerorte();

  if (neu) {
    if (kundenLaden || lagerLaden || retourVon.isLoading) return <Seite titel="Neuer Lieferschein"><Laedt /></Seite>;
    return <Editor key="neu" start={null} kunden={kunden ?? []} vorlageKunde={params.get("kunde")} retourVon={retourVon.data ?? null} lager={lager ?? []} />;
  }
  if (isLoading || kundenLaden || lagerLaden) return <Seite titel="Lieferschein"><Laedt /></Seite>;
  if (error || !data) return <Seite titel="Lieferschein"><Leer icon={PackagePlus} text={error ? (error as Error).message : "Diesen Lieferschein gibt es nicht (mehr)."} /></Seite>;
  if (data.status === "fertig") return <Ansicht l={data} />;
  return <Editor key={data.id} start={data} kunden={kunden ?? []} lager={lager ?? []} />;
}

const Laedt = () => <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

// ── Entwurf bearbeiten ──────────────────────────────────────────────────

function Editor({ start, kunden, vorlageKunde, retourVon, lager }: {
  start: KlsVoll | null;
  kunden: Kunde[];
  vorlageKunde?: string | null;
  retourVon?: KlsVoll | null;
  lager: { id: string; name: string; art: string }[];
}) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const heute = isoTag();
  const [id] = useState(() => start?.id ?? crypto.randomUUID());
  const [gespeichert, setGespeichert] = useState(!!start);
  const [kopf, setKopf] = useState<Kopf>(() => {
    if (start) {
      return {
        kunde_id: start.kunde_id, empf_name: start.empf_name, empf_strasse: start.empf_strasse ?? "", empf_plz: start.empf_plz ?? "", empf_ort: start.empf_ort ?? "",
        empf_email: start.empf_email ?? "", datum: start.datum, lagerort_id: start.lagerort_id ?? "", notiz: start.notiz ?? "",
      };
    }
    const k = leererKopf(heute);
    const quelle = retourVon ?? null;
    const kunde = kunden.find((x) => x.id === (quelle?.kunde_id ?? vorlageKunde));
    if (kunde) Object.assign(k, ausKunde(kunde));
    else if (quelle) Object.assign(k, { empf_name: quelle.empf_name, empf_strasse: quelle.empf_strasse ?? "", empf_plz: quelle.empf_plz ?? "", empf_ort: quelle.empf_ort ?? "", empf_email: quelle.empf_email ?? "" });
    if (quelle?.nummer) k.notiz = `Retour zu Lieferschein ${quelle.nummer}`;
    k.lagerort_id = quelle?.lagerort_id ?? (lager.find((x) => x.art === "lager") ?? lager[0])?.id ?? "";
    return k;
  });
  const [zeilen, setZeilen] = useState<Zeile[]>(() => {
    if (start) return [...start.kunden_lieferschein_positionen].sort((a, b) => a.pos - b.pos).map(zeileAus);
    // Retour: die Ausgabe-Zeilen des alten Lieferscheins als Retour vorschlagen
    if (retourVon) return retourVon.kunden_lieferschein_positionen.filter((p) => !p.retour).sort((a, b) => a.pos - b.pos).map((p) => zeileAus({ ...p, retour: true }));
    return [];
  });
  const [basis, setBasis] = useState(() => JSON.stringify([kopf, zeilen]));
  const geaendert = JSON.stringify([kopf, zeilen]) !== basis;
  const [suche, setSuche] = useState<null | { retour: boolean }>(null);
  const [laeuft, setLaeuft] = useState<null | "speichern" | "abschliessen" | "loeschen">(null);
  const [frage, setFrage] = useState<null | "abschliessen" | "loeschen">(null);
  const { data: bestand = [] } = useLagerbestand();
  const setz = (teil: Partial<Kopf>) => setKopf((k) => ({ ...k, ...teil }));

  // Kunde: Vorschläge aus den Kontakten (Kunden und Partner)
  const kundenVorschlaege = useMemo(() => {
    const q = kopf.empf_name.trim().toLowerCase();
    if (!q || kopf.kunde_id) return [];
    return kunden.filter((k) => k.art !== "lieferant" && k.name.toLowerCase().includes(q)).slice(0, 5);
  }, [kopf.empf_name, kopf.kunde_id, kunden]);

  const imLager = (artikelId: string | null) => {
    if (!artikelId || !kopf.lagerort_id) return null;
    return bestand.find((b) => b.artikel_id === artikelId && b.lagerort_id === kopf.lagerort_id)?.bestand ?? 0;
  };

  const artikelDazu = (a: Artikel) => {
    const retour = suche?.retour ?? false;
    setZeilen((z) => {
      const da = z.find((x) => x.artikel_id === a.id && x.retour === retour);
      if (da) return z.map((x) => (x === da ? { ...x, menge: zahlFeld((dezimalLesen(x.menge) ?? 0) + 1) } : x));
      return [...z, { key: crypto.randomUUID(), artikel_id: a.id, artikelnummer: a.artikelnummer ?? null, bezeichnung: a.bezeichnung, menge: "1", einheit: a.einheit || "Stk", retour }];
    });
    toast.success(`${a.bezeichnung} ${retour ? "als Retour " : ""}dazu`, { duration: 1500 });
  };
  const freieZeile = () => setZeilen((z) => [...z, { key: crypto.randomUUID(), artikel_id: null, artikelnummer: null, bezeichnung: "", menge: "1", einheit: "Stk", retour: false }]);
  const zeileSetzen = (key: string, teil: Partial<Zeile>) => setZeilen((z) => z.map((x) => (x.key === key ? { ...x, ...teil } : x)));

  const pruefen = (): { kopf: KlsKopf; zeilen: KlsZeile[] } | null => {
    const liste: KlsZeile[] = [];
    for (const z of zeilen) {
      if (!z.bezeichnung.trim()) { toast.error("Jede Zeile braucht eine Bezeichnung — oder die Zeile entfernen."); return null; }
      const m = dezimalLesen(z.menge);
      if (m == null || m <= 0) { toast.error(`„${z.bezeichnung}“: Menge größer als 0 eintragen.`); return null; }
      liste.push({ artikel_id: z.artikel_id, artikelnummer: z.artikelnummer, bezeichnung: z.bezeichnung, menge: m, einheit: z.einheit, retour: z.retour });
    }
    return {
      kopf: {
        kunde_id: kopf.kunde_id, empf_name: kopf.empf_name.trim(), empf_strasse: kopf.empf_strasse.trim() || null, empf_plz: kopf.empf_plz.trim() || null,
        empf_ort: kopf.empf_ort.trim() || null, empf_email: kopf.empf_email.trim() || null, datum: kopf.datum || heute,
        lagerort_id: kopf.lagerort_id || null, notiz: kopf.notiz.trim() || null,
      },
      zeilen: liste,
    };
  };

  const speichern = async (leise = false): Promise<boolean> => {
    const d = pruefen();
    if (!d) return false;
    setLaeuft("speichern");
    try {
      await klsSpeichern(id, !gespeichert, d.kopf, d.zeilen);
      setGespeichert(true);
      setBasis(JSON.stringify([kopf, zeilen]));
      await neuLaden("kls");
      if (!leise) toast.success("Gespeichert");
      if (!gespeichert) navigate(`/kunden-lieferscheine/${id}`, { replace: true });
      return true;
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
      return false;
    } finally {
      setLaeuft(null);
    }
  };

  const abschliessen = async () => {
    setFrage(null);
    if (!kopf.empf_name.trim()) { toast.error("Bitte den Kunden eintragen."); return; }
    if (!zeilen.length) { toast.error("Noch keine Zeile auf dem Lieferschein."); return; }
    if (zeilen.some((z) => z.artikel_id) && !kopf.lagerort_id) { toast.error("Bitte das Lager wählen."); return; }
    if ((geaendert || !gespeichert) && !(await speichern(true))) return;
    setLaeuft("abschliessen");
    try {
      const nr = await klsAbschliessen(id);
      await neuLaden("kls", "lager", "material");
      toast.success(`Lieferschein ${nr} abgeschlossen`, { description: "Lager gebucht — jetzt unterschreiben lassen, drucken oder mailen." });
      navigate(`/kunden-lieferscheine/${id}`, { replace: true });
    } catch (e) {
      toast.error("Nicht abgeschlossen", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  const loeschen = async () => {
    setFrage(null);
    setLaeuft("loeschen");
    try {
      if (gespeichert) await klsLoeschen(id);
      await neuLaden("kls");
      toast.success("Entwurf gelöscht");
      navigate("/kunden-lieferscheine", { replace: true });
    } catch (e) {
      toast.error("Nicht gelöscht", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  const ausgabe = zeilen.filter((z) => !z.retour);
  const retour = zeilen.filter((z) => z.retour);

  const zeilenListe = (liste: Zeile[]) => (
    <ul className="divide-y">
      {liste.map((z) => {
        const lagerBestand = imLager(z.artikel_id);
        const m = dezimalLesen(z.menge) ?? 0;
        return (
          <li key={z.key} className="space-y-2 px-4 py-3 lg:px-5">
            <div className="flex items-start gap-2">
              {z.artikel_id ? (
                <p className="min-w-0 flex-1 pt-2.5 text-sm font-medium">
                  {z.bezeichnung}
                  {z.artikelnummer && <span className="block text-xs font-normal text-muted-foreground">{z.artikelnummer}</span>}
                </p>
              ) : (
                <Input aria-label="Bezeichnung" className="h-11 flex-1" placeholder="Bezeichnung (ohne Lagerbuchung)" value={z.bezeichnung}
                  onChange={(e) => zeileSetzen(z.key, { bezeichnung: e.target.value })} />
              )}
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${z.bezeichnung || "Zeile"} entfernen`}
                onClick={() => setZeilen((alt) => alt.filter((x) => x.key !== z.key))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Menge" className="zahl h-11 w-24 text-right" inputMode="decimal" value={z.menge} onChange={(e) => zeileSetzen(z.key, { menge: e.target.value })} />
              <Input aria-label="Einheit" className="h-11 w-20" value={z.einheit} disabled={!!z.artikel_id} onChange={(e) => zeileSetzen(z.key, { einheit: e.target.value })} />
              {lagerBestand != null && (
                <span className={cn("text-xs", !z.retour && m > lagerBestand ? "font-medium text-destructive" : "text-muted-foreground")}>
                  im Lager {zahl(lagerBestand)} {z.einheit}{!z.retour && m > lagerBestand ? " — zu wenig" : ""}
                </span>
              )}
              {!z.artikel_id && <span className="text-xs text-muted-foreground">freie Zeile — bucht nichts im Lager</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Seite titel={gespeichert ? "Lieferschein (Entwurf)" : "Neuer Lieferschein"} untertitel="Material an Kunden — bucht das Lager beim Abschließen" zurueckPfad="/kunden-lieferscheine">
      <Karte titel="Kunde">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kls-name">Name</Label>
            <Input id="kls-name" className="h-11" autoComplete="off" placeholder="Kontakt suchen oder Laufkunde eintragen" value={kopf.empf_name}
              onChange={(e) => setz({ empf_name: e.target.value, kunde_id: null })} />
            {kundenVorschlaege.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {kundenVorschlaege.map((k) => (
                  <button key={k.id} type="button" onClick={() => setz(ausKunde(k))}
                    className="min-h-11 rounded-md border bg-card px-3 text-left text-sm hover:bg-muted">
                    {k.name}{k.ort && <span className="text-muted-foreground"> · {k.ort}</span>}
                  </button>
                ))}
              </div>
            )}
            {kopf.kunde_id && <p className="text-xs text-muted-foreground">Aus den Kontakten übernommen.</p>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr]">
            <Input aria-label="Straße" className="h-11" placeholder="Straße" value={kopf.empf_strasse} onChange={(e) => setz({ empf_strasse: e.target.value })} />
            <Input aria-label="PLZ" className="h-11" placeholder="PLZ" inputMode="numeric" value={kopf.empf_plz} onChange={(e) => setz({ empf_plz: e.target.value })} />
            <Input aria-label="Ort" className="h-11" placeholder="Ort" value={kopf.empf_ort} onChange={(e) => setz({ empf_ort: e.target.value })} />
          </div>
          <Input aria-label="E-Mail des Kunden" type="email" inputMode="email" className="h-11" placeholder="E-Mail (für den Versand)" value={kopf.empf_email}
            onChange={(e) => setz({ empf_email: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kls-datum">Datum</Label>
              <Input id="kls-datum" type="date" className="h-11" value={kopf.datum} onChange={(e) => setz({ datum: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kls-lager">Aus Lager</Label>
              <Select value={kopf.lagerort_id} onValueChange={(v) => setz({ lagerort_id: v })}>
                <SelectTrigger id="kls-lager" className="h-11"><SelectValue placeholder="Lager wählen" /></SelectTrigger>
                <SelectContent>{lager.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Karte>

      <Karte titel={`Geliefert${ausgabe.length ? ` · ${ausgabe.length}` : ""}`} ohnePolster>
        {ausgabe.length === 0 ? <p className="px-4 pb-3 text-sm text-muted-foreground lg:px-5">Noch nichts — Artikel aus dem Lager dazugeben.</p> : <div className="border-t">{zeilenListe(ausgabe)}</div>}
        <div className="flex flex-wrap gap-2 border-t px-4 py-3 lg:px-5">
          <Button className="h-11 gap-1.5" onClick={() => setSuche({ retour: false })}><Plus className="h-4 w-4" /> Artikel</Button>
          <Button variant="outline" className="h-11 gap-1.5" onClick={freieZeile}><Plus className="h-4 w-4" /> Freie Zeile</Button>
        </div>
      </Karte>

      <Karte titel={`Retour${retour.length ? ` · ${retour.length}` : ""}`} ohnePolster>
        {retour.length === 0
          ? <p className="px-4 pb-3 text-sm text-muted-foreground lg:px-5">Kommt etwas vom Kunden zurück, hier dazugeben — geht beim Abschließen wieder ins Lager.</p>
          : <div className="border-t">{zeilenListe(retour)}</div>}
        <div className="border-t px-4 py-3 lg:px-5">
          <Button variant="outline" className="h-11 gap-1.5" onClick={() => setSuche({ retour: true })}><Undo2 className="h-4 w-4" /> Retour-Artikel</Button>
        </div>
      </Karte>

      <Karte titel="Hinweis auf dem Lieferschein">
        <Textarea aria-label="Hinweis" rows={2} placeholder="z. B. Sonderbestellung, abgeholt von …" value={kopf.notiz} onChange={(e) => setz({ notiz: e.target.value })} />
      </Karte>

      <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:mx-0 lg:rounded-lg lg:border"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Button variant="ghost" className="h-12 text-destructive hover:text-destructive" disabled={!!laeuft} onClick={() => setFrage("loeschen")} aria-label="Entwurf löschen">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button variant="outline" className="h-12 flex-1" disabled={!!laeuft || (gespeichert && !geaendert)} onClick={() => void speichern()}>
          {laeuft === "speichern" ? <Loader2 className="h-4 w-4 animate-spin" /> : geaendert || !gespeichert ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {geaendert || !gespeichert ? "Speichern" : "Gespeichert"}
        </Button>
        <Button className="h-12 flex-[2]" disabled={!!laeuft} onClick={() => setFrage("abschliessen")}>
          {laeuft === "abschliessen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Abschließen
        </Button>
      </div>

      <FormularDialog open={!!suche} onOpenChange={(o) => { if (!o) setSuche(null); }}
        titel={suche?.retour ? "Retour-Artikel" : "Artikel dazugeben"} beschreibung="Antippen gibt 1 dazu — nochmal antippen erhöht die Menge."
        fuss={<Button className="h-11" onClick={() => setSuche(null)}>Fertig</Button>}>
        <ArtikelSuche onWahl={artikelDazu} autoFocus listeKlasse="max-h-[60dvh]" />
      </FormularDialog>

      <AlertDialog open={frage === "abschliessen"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lieferschein abschließen?</AlertDialogTitle>
            <AlertDialogDescription>
              Er bekommt eine Nummer und bucht das Lager „{lager.find((x) => x.id === kopf.lagerort_id)?.name ?? "–"}“:
              {" "}{ausgabe.filter((z) => z.artikel_id).length} Artikel gehen hinaus{retour.some((z) => z.artikel_id) ? `, ${retour.filter((z) => z.artikel_id).length} kommen zurück` : ""}.
              Danach lässt er sich nicht mehr ändern — Rücknahmen später mit einem Retour-Lieferschein.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => void abschliessen()}>Abschließen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={frage === "loeschen"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
            <AlertDialogDescription>Am Lager hat er noch nichts gebucht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void loeschen()}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}

// ── Abgeschlossen: ansehen, unterschreiben, drucken, mailen ─────────────

function Ansicht({ l }: { l: KlsVoll }) {
  const neuLaden = useNeuLaden();
  const { firma } = useSitzung();
  const [unterschreiben, setUnterschreiben] = useState(false);
  const [mail, setMail] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const status = klsStatus(l);
  const zeilen = [...l.kunden_lieferschein_positionen].sort((a, b) => a.pos - b.pos);
  const ausgabe = zeilen.filter((z) => !z.retour);
  const retour = zeilen.filter((z) => z.retour);

  const drucken = async () => {
    if (!firma) return;
    const fenster = istMobilGeraet() ? null : window.open("", "_blank");
    setPdfLaeuft(true);
    try {
      if (fenster) await klsPdfAnsehen(l, firma, fenster);
      else await klsPdfTeilen(l, firma);
    } catch (e) {
      fenster?.close();
      toast.error("PDF ging nicht", { description: (e as Error).message });
    } finally {
      setPdfLaeuft(false);
    }
  };

  const liste = (titel: string, z: typeof zeilen) => z.length > 0 && (
    <Karte titel={`${titel} · ${z.length}`} ohnePolster>
      <ul className="divide-y border-t">
        {z.map((p) => (
          <li key={p.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm lg:px-5">
            <span className="zahl w-20 shrink-0 text-right font-semibold">{zahl(Number(p.menge))} {p.einheit}</span>
            <span className="min-w-0 flex-1">{p.bezeichnung}{p.artikelnummer && <span className="text-xs text-muted-foreground"> · {p.artikelnummer}</span>}</span>
            {!p.artikel_id && <span className="shrink-0 text-xs text-muted-foreground">ohne Lager</span>}
          </li>
        ))}
      </ul>
    </Karte>
  );

  return (
    <Seite titel={`Lieferschein ${l.nummer ?? ""}`.trim()} untertitel={`${l.empf_name} · ${datum(l.datum)}`} zurueckPfad="/kunden-lieferscheine">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPille eintrag={KLS_STATUS[status]} />
          <span className="text-sm text-muted-foreground">
            {l.lagerorte?.name ? `Lager „${l.lagerorte.name}“ gebucht` : "ohne Lagerbuchung"}
            {l.unterschrift_pfad && ` · unterschrieben von ${l.unterschrift_name || "Kunde"}`}
            {l.gesendet_am && ` · gemailt an ${l.gesendet_an}`}
          </span>
        </div>
        <p className="text-sm">
          {l.empf_name}{[l.empf_strasse, [l.empf_plz, l.empf_ort].filter(Boolean).join(" ")].filter(Boolean).map((t) => `, ${t}`).join("")}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {!l.unterschrift_pfad && (
            <Button className="col-span-2 h-12 gap-1.5 text-base sm:col-span-1" onClick={() => setUnterschreiben(true)}>
              <PenLine className="h-4 w-4" /> Kunde unterschreibt
            </Button>
          )}
          <Button variant="outline" className="h-11 gap-1.5" disabled={pdfLaeuft} onClick={() => void drucken()}>
            {pdfLaeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : istMobilGeraet() ? <FileDown className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
            {istMobilGeraet() ? "PDF" : "PDF / Drucken"}
          </Button>
          <Button variant="outline" className="h-11 gap-1.5" onClick={() => setMail(true)}><Mail className="h-4 w-4" /> Per E-Mail</Button>
          {l.rechnung ? (
            <Button asChild variant="outline" className="h-11 gap-1.5"><Link to={`/belege/${l.rechnung.id}`}><Receipt className="h-4 w-4" /> Rechnung {l.rechnung.nummer ?? "(Entwurf)"}</Link></Button>
          ) : (
            <Button asChild variant="outline" className="h-11 gap-1.5">
              <Link to={`/belege/neu?typ=rechnung${l.kunde_id ? `&kunde=${l.kunde_id}` : ""}&lieferschein=${l.id}`}><Receipt className="h-4 w-4" /> Rechnung schreiben</Link>
            </Button>
          )}
          {ausgabe.length > 0 && (
            <Button asChild variant="outline" className="h-11 gap-1.5"><Link to={`/kunden-lieferscheine/neu?retour=${l.id}`}><RotateCcw className="h-4 w-4" /> Retour dazu</Link></Button>
          )}
        </div>
      </section>

      {liste("Geliefert", ausgabe)}
      {liste("Retour", retour)}
      {l.notiz && <Karte titel="Hinweis"><p className="whitespace-pre-wrap text-sm">{l.notiz}</p></Karte>}

      <KundenUnterschrift
        open={unterschreiben}
        onOpenChange={setUnterschreiben}
        sicht={{ nummer: l.nummer, datum: l.datum, kunde: l.empf_name, projekt: "", baustelle: null, arbeiten: "", zeiten: [], material: [] }}
        nameVorschlag={l.empf_name}
        titel={`Lieferschein ${l.nummer ?? ""}`.trim()}
        hinweis="Mit Ihrer Unterschrift bestätigen Sie die Übernahme bzw. Rückgabe der angeführten Ware."
        inhalt={(
          <section className="space-y-4">
            {[["Sie bekommen", ausgabe], ["Sie geben zurück", retour]].map(([t, z]) => (z as typeof zeilen).length > 0 && (
              <div key={t as string} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{t as string}</p>
                <ul className="space-y-1.5 text-lg">
                  {(z as typeof zeilen).map((p) => <li key={p.id}><span className="zahl font-semibold">{zahl(Number(p.menge))} {p.einheit}</span> {p.bezeichnung}</li>)}
                </ul>
              </div>
            ))}
          </section>
        )}
        onBestaetigen={async (name, png) => {
          try {
            await klsUnterschreiben(l.id, name, png);
            await neuLaden("kls");
            toast.success("Unterschrieben", { description: "Jetzt drucken oder per E-Mail schicken." });
            setUnterschreiben(false);
            return true;
          } catch (e) {
            toast.error("Nicht unterschrieben", { description: (e as Error).message });
            return false;
          }
        }}
      />

      {firma && (
        <BelegMailDialog
          open={mail}
          onOpenChange={setMail}
          lieferscheinId={l.id}
          art="Lieferschein"
          vorgabe={mailVorgabe({ art: "Lieferschein", nummer: l.nummer, betreff: null, an: l.empf_email, firma: firma.name, telefon: firma.telefon, datum: datum(l.datum) })}
          anhangName={klsPdfDateiname(l)}
          vorbereiten={() => klsPdfErstellen(l, firma)}
        />
      )}
    </Seite>
  );
}
