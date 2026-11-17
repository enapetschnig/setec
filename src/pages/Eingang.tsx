import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Check, Download, Inbox, Loader2, MailOpen, Paperclip, Plus, Search, X } from "lucide-react";
import { bilanzText, postfachAbrufen, usePostfaecher } from "@/lib/postfach";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { BelegZeile, JahrWahl, MonatsListe, useJahrWahl } from "@/components/JahrWahl";
import { useOdooZeilen } from "@/hooks/useOdooZeilen";
import { imJahr, jahreAus } from "@/lib/jahre";
import { EingangDialog } from "@/components/eingang/EingangDialog";
import { ueberwiesen, useEingangsrechnungen, type EingangMitAnteilen } from "@/components/eingang/eingangDaten";
import { ablauf, bezahltText, kategorieText, lastschriftBetrag, zahlung, zahlweg, ZAHLWEGE, zuordnung, zuZahlen, type Zahlweg } from "@/components/eingang/eingangLogik";
import { Checkbox } from "@/components/ui/checkbox";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { ibanPruefen, sepaXml } from "@/lib/sepa";
import { passtSuche } from "@/components/regie/regieLogik";
import { datum, euro, isoTag } from "@/lib/format";
import { EINGANG_STATUS, FREIGABE_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useKategorien } from "@/components/buchhaltung/buchhaltungDaten";

type Filter = "alle" | "pruefen" | "freigegeben" | "lastschrift" | "bezahlt" | "abgelehnt" | "zuzuordnen";

/** Der Ablauf von links nach rechts: prüfen → freigeben → überweisen */
const FILTER: { wert: Filter; text: string }[] = [
  { wert: "pruefen", text: "Zu prüfen" },
  { wert: "freigegeben", text: "Zu überweisen" },
  { wert: "lastschrift", text: "Lastschrift" },
  { wert: "bezahlt", text: "Bezahlt" },
  { wert: "abgelehnt", text: "Abgelehnt" },
  { wert: "zuzuordnen", text: "Zuzuordnen" },
  { wert: "alle", text: "Alle" },
];

const LEER_TEXT: Record<Filter, string> = {
  alle: "Noch keine Eingangsrechnung. Rechnung vom Großhändler fotografieren, „Mit KI ausfüllen“, Projekt wählen — fertig.",
  pruefen: "Nichts zu prüfen.",
  freigegeben: "Nichts zu überweisen.",
  lastschrift: "Keine offene Lastschrift. Bucht ein Händler selbst ab (SEPA-Mandat), in der Rechnung „Händler bucht per Lastschrift ab“ einschalten.",
  bezahlt: "Noch nichts bezahlt.",
  abgelehnt: "Keine abgelehnten Rechnungen.",
  zuzuordnen: "Alles zugeordnet.",
};

/** Noch zu tun — zeigt alle Jahre; Bezahltes, Abgelehntes, „Alle“ nur das gewählte Jahr */
const OFFENES: Filter[] = ["pruefen", "freigegeben", "lastschrift"];

const passt = (r: EingangMitAnteilen, f: Filter) =>
  f === "alle" ? true
    : f === "zuzuordnen" ? zuordnung(r, r.eingang_anteile) !== "zugeordnet"
      : f === "bezahlt" ? ablauf(r) === "ueberwiesen"
        : ablauf(r) === f;

/**
 * /eingang — Eingangsrechnungen (nur Chef), Filter über ?filter=.
 * Jahresansicht wie Rechnungen (JahrWahl): Bezahltes nur im gewählten Jahr
 * (Odoo-Übernahme 2023–2025 im Archiv), Suche und Offenes über alle Jahre.
 */
export default function Eingang() {
  const pc = useIstPc();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const f = params.get("filter");
  const filter: Filter = FILTER.some((x) => x.wert === f) ? f as Filter : f === "unbezahlt" ? "freigegeben" : f === "ueberwiesen" ? "bezahlt" : "pruefen";
  /** Unter „Bezahlt“: nach Zahlweg (überwiesen, Lastschrift, bar) */
  const w = params.get("weg");
  const weg: Zahlweg | null = filter === "bezahlt" && ZAHLWEGE.some((x) => x.wert === w) ? w as Zahlweg : null;
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  /** Zu überweisen: abgewählte bleiben stehen */
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [markiert, setMarkiert] = useState(false);
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<EingangMitAnteilen | "neu" | null>(null);
  const { data: alle = [], isLoading, error, refetch } = useEingangsrechnungen();
  const { data: odoo } = useOdooZeilen("eingangsrechnungen");
  const [jahr, setJahr] = useJahrWahl("eingang");
  const jahre = useMemo(() => jahreAus(alle.map((r) => r.datum), new Date().getFullYear()), [alle]);
  const ueberAlle = suche.trim() ? "Suche in allen Jahren" : OFFENES.includes(filter) ? "Offenes aus allen Jahren" : null;
  const imZeitraum = useMemo(() => alle.filter((r) => imJahr(r.datum, jahr)), [alle, jahr]);
  const { data: kategorien = [] } = useKategorien();
  const katName = (r: EingangMitAnteilen) => kategorien.find((k) => k.id === r.kategorie_id)?.name ?? kategorieText(r.kategorie);
  const { data: kontakte = [] } = useKunden();
  // Postfach (Einstellungen → E-Mail): Rechnungen aus Mails holen — sonst alle 15 Minuten von selbst
  const { data: postfaecher = [] } = usePostfaecher();
  const einlesen = postfaecher.filter((p) => p.aktiv && p.rechnungen_einlesen);
  const [ruftAb, setRuftAb] = useState(false);
  const abrufen = async () => {
    setRuftAb(true);
    try {
      const b = await postfachAbrufen();
      await neuLaden("eingang", "postfaecher");
      const text = bilanzText(b);
      if (b.meldungen.length) toast.warning(text, { description: b.meldungen.join(" · "), duration: 15_000 });
      else toast.success(text, { duration: 8_000 });
    } catch (e) {
      toast.error("Postfach nicht abgerufen", { description: (e as Error).message });
    } finally {
      setRuftAb(false);
    }
  };

  // ?offen=<id> aus dem Lieferanten-Kontakt: diese Rechnung gleich öffnen
  const offenParam = params.get("offen");
  useEffect(() => {
    const r = offenParam ? alle.find((x) => x.id === offenParam) : undefined;
    if (!r) return;
    setOffen(r);
    const neu = new URLSearchParams(params);
    neu.delete("offen");
    setParams(neu, { replace: true });
  }, [offenParam, alle, params, setParams]);

  const wegSetzen = (wert: Zahlweg | null) => {
    const neu = new URLSearchParams(params);
    if (wert) neu.set("weg", wert);
    else neu.delete("weg");
    setParams(neu, { replace: true });
  };
  const bezahlte = useMemo(() => (suche.trim() ? alle : imZeitraum).filter((r) => passt(r, "bezahlt")), [alle, imZeitraum, suche]);

  const filterSetzen = (w: Filter) => {
    const neu = new URLSearchParams(params);
    neu.delete("weg");
    if (w === "pruefen") neu.delete("filter");
    else neu.set("filter", w);
    setParams(neu, { replace: true });
  };

  const anzahl = useMemo(() => {
    const z = {} as Record<Filter, number>;
    FILTER.forEach((x) => { z[x.wert] = (OFFENES.includes(x.wert) ? alle : imZeitraum).filter((r) => passt(r, x.wert)).length; });
    return z;
  }, [alle, imZeitraum]);

  const liste = useMemo(() => (ueberAlle ? alle : imZeitraum).filter((r) => passt(r, filter) && (!weg || zahlweg(r) === weg) && passtSuche([
    r.lieferant, r.nummer, r.notiz, katName(r), ...r.eingang_anteile.flatMap((a) => [a.text, a.projekte?.nummer, a.projekte?.name]),
  ], suche)).sort((a, b) => (filter === "freigegeben" ? (zuZahlen(a, heute).bis ?? a.faellig_am ?? "9").localeCompare(zuZahlen(b, heute).bis ?? b.faellig_am ?? "9")
    : filter === "lastschrift" ? (lastschriftBetrag(a).am ?? a.datum).localeCompare(lastschriftBetrag(b).am ?? b.datum) : 0)),
  [alle, imZeitraum, ueberAlle, filter, weg, suche, heute]);

  // Vorschläge: bisherige Lieferanten und die Lieferanten-Kontakte
  const lieferanten = useMemo(() => [...new Set([
    ...alle.map((r) => r.lieferant.trim()),
    ...kontakte.filter((k) => k.art === "lieferant").map((k) => k.name.trim()),
  ])].sort((a, b) => a.localeCompare(b, "de")), [alle, kontakte]);
  const summe = liste.reduce((s, r) => s + Number(r.brutto), 0);

  // ── Überweisen ──
  const ueberweisen = filter === "freigegeben";
  /** Lastschrift: der Händler bucht selbst ab — hier nur als abgebucht markieren */
  const lastschrift = filter === "lastschrift";
  const gewaehlt = ueberweisen || lastschrift ? liste.filter((r) => !abgewaehlt.has(r.id)) : [];
  const betragVon = (r: EingangMitAnteilen) => (lastschrift ? lastschriftBetrag(r) : zuZahlen(r, heute));
  const zahlSumme = gewaehlt.reduce((s, r) => s + betragVon(r).betrag, 0);
  const skontoSumme = gewaehlt.reduce((s, r) => s + betragVon(r).skonto, 0);
  const ohneIban = gewaehlt.filter((r) => !ibanPruefen(r.iban));
  const eigeneIban = ibanPruefen(firma?.iban);
  const sepaLaden = () => {
    if (!eigeneIban || !firma) { toast.error("Eigene IBAN fehlt", { description: "In den Einstellungen unter Bank eintragen." }); return; }
    const mit = gewaehlt.filter((r) => ibanPruefen(r.iban));
    if (!mit.length) return;
    const datei = sepaXml({ name: firma.name, iban: eigeneIban, bic: firma.bic }, mit.map((r) => ({
      id: r.id, empfaenger: r.lieferant, iban: ibanPruefen(r.iban)!, betrag: zuZahlen(r, heute).betrag,
      zweck: [r.nummer ? `Rechnung ${r.nummer}` : "Rechnung", r.datum.split("-").reverse().join("."), zuZahlen(r, heute).skonto ? "abzgl. Skonto" : ""].filter(Boolean).join(" "),
    })), heute);
    const url = URL.createObjectURL(new Blob([datei], { type: "application/xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ueberweisungen-${heute}.xml`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`SEPA-Datei mit ${mit.length} ${mit.length === 1 ? "Überweisung" : "Überweisungen"}`, { description: "Im Online-Banking hochladen und dort unterschreiben." });
  };
  const alsUeberwiesen = async () => {
    setMarkiert(true);
    try {
      await ueberwiesen(gewaehlt.map((r) => r.id), heute);
      await neuLaden("eingang");
      toast.success(`${gewaehlt.length} als ${lastschrift ? "abgebucht" : "überwiesen"} markiert`);
      setAbgewaehlt(new Set());
    } catch (e) {
      toast.error("Nicht markiert", { description: (e as Error).message });
    } finally {
      setMarkiert(false);
    }
  };

  return (
    <Seite
      titel="Eingangsrechnungen"
      untertitel={isLoading ? undefined : `${imZeitraum.length} ${imZeitraum.length === 1 ? "Rechnung" : "Rechnungen"} ${jahr ?? "· alle Jahre"}`}
      breit
      aktionen={
        <div className="flex gap-2">
          {einlesen.length > 0 && (
            <Button variant="outline" className="h-11 gap-1.5 px-3 sm:px-4" disabled={ruftAb} onClick={() => void abrufen()}
              title={`Rechnungen aus ${einlesen.map((p) => p.adresse).join(", ")} holen (passiert auch alle 15 Minuten von selbst)`}>
              {ruftAb ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailOpen className="h-4 w-4" />}{pc ? (ruftAb ? "Liest Mails …" : "Postfach abrufen") : ""}
              {!pc && <span className="sr-only">Postfach abrufen</span>}
            </Button>
          )}
          <Button className="h-11 gap-1.5 px-3 sm:px-4" onClick={() => setOffen("neu")}>
            <Plus className="h-4 w-4" />{pc ? "Rechnung erfassen" : "Neu"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <JahrWahl jahre={jahre} jahr={jahr} onWahl={setJahr} ueberAlle={ueberAlle} />
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button
              key={x.wert}
              type="button"
              onClick={() => filterSetzen(x.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {x.text}
              <span className={cn("zahl text-xs", filter === x.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[x.wert] ?? 0}</span>
            </button>
          ))}
        </div>
        {filter === "bezahlt" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wie bezahlt">
            {[{ wert: null, text: "Alle" }, ...ZAHLWEGE].map((x) => (
              <button key={x.wert ?? "alle"} type="button" onClick={() => wegSetzen(x.wert as Zahlweg | null)}
                className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
                  weg === x.wert ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-muted")}>
                {x.text}
                <span className="zahl text-xs text-muted-foreground">{x.wert ? bezahlte.filter((r) => zahlweg(r) === x.wert).length : bezahlte.length}</span>
              </button>
            ))}
          </div>
        )}
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Lieferant, Nummer, Projekt …"
            className="h-11 pl-9 pr-10" inputMode="search" enterKeyHint="search" autoComplete="off" />
          {suche && (
            <button type="button" onClick={() => setSuche("")} aria-label="Suche leeren"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <Leer icon={Inbox} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      ) : liste.length === 0 ? (
        <Leer icon={Inbox} text={suche.trim() ? "Nichts gefunden."
          : !ueberAlle && jahr && alle.some((r) => passt(r, filter)) ? `${jahr} keine — ältere unter „Archiv“.` : LEER_TEXT[filter]}>
          {!suche.trim() && (filter === "alle" || filter === "pruefen") && (
            <Button className="h-11 gap-1.5" onClick={() => setOffen("neu")}><Plus className="h-4 w-4" /> Rechnung erfassen</Button>
          )}
        </Leer>
      ) : (
        <div className="space-y-2">
          <MonatsListe
            eintraege={liste}
            tabelle={pc}
            // Zu überweisen / Lastschrift: nach Fälligkeit sortiert — dort keine Monate
            gruppieren={!ueberweisen && !lastschrift}
            schluessel={(r) => r.id}
            datum={(r) => r.datum}
            betrag={(r) => (ablauf(r) === "abgelehnt" ? null : Number(r.brutto))}
            kopf={{ name: "Lieferant · Kategorie, Projekt" }}
            // Häkchen vorne: 1rem + 1,25rem + 1rem
            kopfKlasse={ueberweisen || lastschrift ? "pl-[3.25rem]" : undefined}
            zeile={(r) => {
              const z = zuordnung(r, r.eingang_anteile);
              const zahl = zahlung(r, heute);
              const schritt = ablauf(r);
              const zz = zuZahlen(r, heute);
              const ls = lastschriftBetrag(r);
              const projekte = r.eingang_anteile.map((a) => a.projekte ? `${a.projekte.nummer} ${a.projekte.name}` : "").filter(Boolean);
              const wohin = [...projekte, ...(r.betrieb ? ["Betrieb"] : [])].join(" · ");
              return (
                <BelegZeile
                  onClick={() => setOffen(r)}
                  vorne={(ueberweisen || lastschrift) && (
                    <Checkbox className="h-5 w-5 shrink-0" checked={!abgewaehlt.has(r.id)} aria-label={`${r.lieferant} ${lastschrift ? "abgebucht" : "überweisen"}`}
                      onCheckedChange={(c) => setAbgewaehlt((alt) => { const n = new Set(alt); if (c) n.delete(r.id); else n.add(r.id); return n; })} />
                  )}
                  nummer={r.nummer ?? <span className="text-muted-foreground">ohne Nummer</span>}
                  name={r.lieferant}
                  datum={r.datum}
                  odoo={!!odoo?.has(r.id)}
                  unter={(
                    <span className="flex min-w-0 items-center gap-1">
                      {r.datei_pfad && <Paperclip className="h-3 w-3 shrink-0" aria-label="mit Beleg" />}
                      <span className="truncate">{(lastschrift && ls.am ? [`Abbuchung ca. ${datum(ls.am)}`, wohin] : [katName(r), wohin]).filter(Boolean).join(" · ")}</span>
                    </span>
                  )}
                  pillen={(
                    <>
                      <StatusPille eintrag={schritt === "ueberwiesen" ? { ton: "gruen", text: bezahltText(r) } : FREIGABE_STATUS[schritt]} />
                      {r.lastschrift && schritt !== "lastschrift" && schritt !== "ueberwiesen" && schritt !== "abgelehnt" && <StatusPille eintrag={FREIGABE_STATUS.lastschrift} />}
                      {z !== "zugeordnet" && <StatusPille eintrag={EINGANG_STATUS[z]} />}
                      {zahl === "ueberfaellig" && schritt !== "abgelehnt" && <StatusPille eintrag={EINGANG_STATUS.ueberfaellig} />}
                      {ueberweisen && !ibanPruefen(r.iban) && <StatusPille eintrag={{ ton: "gelb", text: "IBAN fehlt" }} />}
                      {r.postfach_mail_id && <StatusPille eintrag={{ ton: "blau", text: "aus E-Mail" }} />}
                    </>
                  )}
                  betrag={euro(ueberweisen ? zz.betrag : lastschrift ? ls.betrag : Number(r.brutto))}
                  betragUnter={ueberweisen && zz.skonto ? `${euro(zz.skonto)} Skonto bis ${datum(zz.bis!)}`
                    : lastschrift && ls.skonto ? `− ${euro(ls.skonto)} Skonto`
                      : `${euro(Number(r.netto))} netto`}
                />
              );
            }}
          />
          {ueberweisen ? (
            <section className="sticky bottom-3 space-y-2 rounded-lg border bg-card p-3 lg:static">
              <p className="text-sm">
                <span className="font-semibold">{gewaehlt.length} {gewaehlt.length === 1 ? "Überweisung" : "Überweisungen"}</span> ·{" "}
                <span className="zahl font-semibold">{euro(zahlSumme)}</span>
                {skontoSumme > 0 && <span className="text-muted-foreground"> · spart {euro(skontoSumme)} Skonto</span>}
              </p>
              {ohneIban.length > 0 && <p className="text-xs text-muted-foreground">{ohneIban.length} ohne gültige IBAN — kommen nicht in die SEPA-Datei.</p>}
              {!eigeneIban && <p className="text-xs text-muted-foreground">Für die SEPA-Datei die eigene IBAN in den Einstellungen eintragen.</p>}
              <div className="flex flex-wrap gap-2">
                <Button className="h-11 gap-1.5" disabled={!eigeneIban || gewaehlt.length === ohneIban.length} onClick={sepaLaden}>
                  <Download className="h-4 w-4" /> SEPA-Datei fürs Banking
                </Button>
                <Button variant="outline" className="h-11 gap-1.5" disabled={!gewaehlt.length || markiert} onClick={() => void alsUeberwiesen()}>
                  {markiert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Als überwiesen markieren
                </Button>
              </div>
            </section>
          ) : lastschrift ? (
            <section className="sticky bottom-3 space-y-2 rounded-lg border bg-card p-3 lg:static">
              <p className="text-sm">
                <span className="font-semibold">{gewaehlt.length} {gewaehlt.length === 1 ? "Lastschrift" : "Lastschriften"}</span> ·{" "}
                <span className="zahl font-semibold">{euro(zahlSumme)}</span>
                {skontoSumme > 0 && <span className="text-muted-foreground"> · abzüglich {euro(skontoSumme)} Skonto</span>}
              </p>
              <p className="text-xs text-muted-foreground">Der Händler bucht selbst ab — keine Überweisung nötig. Ist die Abbuchung am Konto, hier abhaken.</p>
              <Button variant="outline" className="h-11 gap-1.5" disabled={!gewaehlt.length || markiert} onClick={() => void alsUeberwiesen()}>
                {markiert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Als abgebucht markieren
              </Button>
            </section>
          ) : (
            <p className="px-1 text-right text-xs text-muted-foreground">
              {liste.length} {liste.length === 1 ? "Rechnung" : "Rechnungen"} · <span className="zahl font-semibold text-foreground">{euro(summe)}</span> brutto
            </p>
          )}
        </div>
      )}

      <EingangDialog
        open={offen !== null}
        onOpenChange={(o) => { if (!o) setOffen(null); }}
        rechnung={offen === "neu" ? null : offen}
        lieferanten={lieferanten}
      />
    </Seite>
  );
}
