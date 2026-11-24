import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowUp, CircleDashed, Clock, Copy, CornerDownRight, FileText, GripVertical, Link2, Minus, MoreVertical, Pencil, Plus, Replace, Rows3, Sigma, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextareaWachsend } from "@/components/ui/textarea-wachsend";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Leer } from "@/components/Bausteine";
import { euro, zahl, zahlUngueltig } from "@/lib/format";
import { arbeitszeitText, aufschlagAus, type Lohnart } from "@/lib/kalkulation";
import { RAUM_VORSCHLAEGE } from "@/lib/sprachParser";
import { EINHEITEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  aufschlagVon, duplizieren, entfernen, gruppenGroesse, istNachlass, kannVerschieben, mengeVon, mitAufschlag, mitEinkauf, ohneBetrag, positionBetrag, positionGesamt,
  VARIANTE_TEXT, varianteMoeglich, type Variante,
  positionsNummern, preisVon, preisText, tauschbar, titelPosition, verschieben, zahlText, ziehen, zwischensummen, type EditorPosition, type KatalogLeistung,
} from "./editor";
import { supabase } from "@/integrations/supabase/client";
import { ZahlFeld } from "./Eingabezeile";
import { PositionDialog } from "./PositionDialog";
import { BezeichnungSuche } from "./PositionSuche";

type Setzen = (f: (alt: EditorPosition[]) => EditorPosition[]) => void;

/** Langtext eines Artikels (leer, wenn er keinen hat oder nicht lesbar ist) */
async function artikelLangtext(id: string): Promise<string> {
  const { data } = await supabase.from("artikel").select("langtext").eq("id", id).maybeSingle();
  return data?.langtext?.trim() ?? "";
}

/** Eine Zeile, die sich am Griff ziehen lässt (Handy: Finger auf den Griff, PC: Maus) */
function Sortierbar({ id, an, children }: {
  id: string;
  an: boolean;
  children: (s: { ref: (el: HTMLElement | null) => void; style: CSSProperties; griff: ReactNode }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !an });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform), transition, position: "relative",
    zIndex: isDragging ? 20 : undefined, opacity: isDragging ? 0.9 : undefined,
  };
  const griff = an ? (
    <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label="Ziehen zum Verschieben" title="Ziehen zum Verschieben"
      className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing">
      <GripVertical className="h-4 w-4" />
    </button>
  ) : null;
  return <>{children({ ref: setNodeRef, style, griff })}</>;
}

/**
 * Positionsliste: am Handy Karten mit großem −/+, am PC eine Tabelle mit
 * Eingabefeldern. Titel (Räume) gliedern; ein angetippter Titel ist der
 * „aktive“ — neue Leistungen landen darunter. Vorne an jeder Zeile ein Griff
 * zum Verschieben; ein Titel nimmt seinen Raum mit. Der Nachlass steht nicht
 * in der Liste, sondern bei den Summen.
 */
export function PositionenEditor({
  positionen: allePositionen, setPositionen: setAlle, bearbeitbar, pc, aktiverTitel, setAktiverTitel, stundensatz, kalk = true, materialAufschlag = 0, lohnarten = [],
  varianten = false, katalog = [],
}: {
  positionen: EditorPosition[];
  setPositionen: Setzen;
  bearbeitbar: boolean;
  pc: boolean;
  aktiverTitel: string | null;
  setAktiverTitel: (id: string | null) => void;
  /** Standard-Stundensatz für „Preis kalkulieren“ */
  stundensatz?: number;
  /** Spalten EK und Aufschlag am PC */
  kalk?: boolean;
  /** Aufschlag des Betriebs — für den ersten Einkaufspreis einer Position ohne Preis */
  materialAufschlag?: number;
  /** Stundensätze zum Tauschen an einer Arbeitszeit-Position */
  lohnarten?: Lohnart[];
  /** Angebot: Positionen als optional/alternativ markieren (Preis steht da, zählt nicht) */
  varianten?: boolean;
  /** Leistungskatalog — Bezeichnung tippen sucht darin und im Artikelstamm, ein Treffer ersetzt die Zeile */
  katalog?: KatalogLeistung[];
}) {
  // Der Nachlass bleibt unsichtbar am Ende — alles hier arbeitet mit dem Rest
  const positionen = useMemo(() => allePositionen.filter((p) => !istNachlass(p)), [allePositionen]);
  const setPositionen: Setzen = (f) => setAlle((alt) => [...f(alt.filter((p) => !istNachlass(p))), ...alt.filter(istNachlass)]);
  const sensoren = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const abgelegt = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setPositionen((alt) => ziehen(alt, String(e.active.id), String(e.over!.id)));
  };
  const ziehbar = (p: EditorPosition) => bearbeitbar && p.art !== "abzug";
  const satz = stundensatz ?? 0;
  const ersetzen = (id: string, f: (p: EditorPosition) => EditorPosition) =>
    setPositionen((alt) => alt.map((p) => (p.id === id ? f(p) : p)));
  const [bearbeiten, setBearbeiten] = useState<EditorPosition | null>(null);
  const [titelLoeschen, setTitelLoeschen] = useState<EditorPosition | null>(null);
  const [langOffen, setLangOffen] = useState<Set<string>>(new Set());

  const nummern = useMemo(() => positionsNummern(positionen.map((p) => p.art)), [positionen]);
  const zs = useMemo(() => zwischensummen(positionen.map((p) => ({ art: p.art, gesamt: positionGesamt(p) }))), [positionen]);
  const titelAnzahl = positionen.filter((p) => p.art === "titel").length;

  /** „EK 10,00 · +30 %“ unter dem Preis — nur intern, nie auf dem PDF */
  const kalkText = (p: EditorPosition) => {
    if (p.ek_preis == null) return null;
    const auf = aufschlagAus({ preis: preisVon(p), ek: p.ek_preis, minuten: p.minuten, satz: stundensatz ?? 0 });
    return (
      <span title="Einkauf und Aufschlag — nur intern" className={cn("zahl block whitespace-nowrap text-[11px] leading-tight text-muted-foreground", auf != null && auf < 0 && "text-destructive")}>
        EK {preisText(p.ek_preis)}{auf != null && ` · ${auf > 0 ? "+" : ""}${Math.round(auf)} %`}
      </span>
    );
  };
  const aendern = (id: string, werte: Partial<EditorPosition>) =>
    setPositionen((alt) => alt.map((p) => (p.id === id ? { ...p, ...werte } : p)));
  /** Zeile gegen den gewählten Treffer getauscht: der Langtext gehört zum neuen, also nicht offen lassen */
  const getauscht = (neu: EditorPosition) => {
    setPositionen((alt) => alt.map((p) => (p.id === neu.id ? neu : p)));
    setLangOffen((s) => { const n = new Set(s); n.delete(neu.id); return n; });
  };
  const mengePlus = (p: EditorPosition, d: number) => aendern(p.id, { menge: zahlText(Math.max(0, mengeVon(p) + d)) });
  const loeschen = (p: EditorPosition) => {
    if (p.art === "titel" && gruppenGroesse(positionen, p.id) > 0) { setTitelLoeschen(p); return; }
    setPositionen((alt) => entfernen(alt, p.id));
    if (aktiverTitel === p.id) setAktiverTitel(null);
  };
  const aktion = (p: EditorPosition, was: Aktion | Lohnart) => {
    if (typeof was === "object") { aendern(p.id, { bezeichnung: arbeitszeitText(was), einzelpreis: preisText(was.satz) }); return; }
    if (was === "optional" || was === "alternativ") { aendern(p.id, { variante: p.variante === was ? null : was }); return; }
    if (was === "zaehlt") { aendern(p.id, { variante: null }); return; }
    if (was === "bearbeiten") setBearbeiten(p);
    else if (was === "hoch") setPositionen((alt) => verschieben(alt, p.id, -1));
    else if (was === "runter") setPositionen((alt) => verschieben(alt, p.id, 1));
    else if (was === "kopieren") {
      const { liste, neueId } = duplizieren(positionen, p.id);
      setPositionen(() => liste);
      if (p.art === "titel") setAktiverTitel(neueId);
    } else if (was === "loeschen") loeschen(p);
    else if (was === "langtext") {
      setLangOffen((s) => new Set(s).add(p.id));
      // Zeile aus einem Artikel: dessen Langtext gleich vorschlagen (ältere Zeilen hatten ihn nicht übernommen)
      if (p.artikel_id && !p.langtext) void artikelLangtext(p.artikel_id).then((t) => {
        if (t) setPositionen((alt) => alt.map((x) => (x.id === p.id && !x.langtext ? { ...x, langtext: t } : x)));
      });
    }
    else if (was === "hier") setAktiverTitel(p.id);
    else if (was === "titelDavor") {
      const t = titelPosition("");
      setPositionen((alt) => {
        const i = alt.findIndex((x) => x.id === p.id);
        return [...alt.slice(0, i), t, ...alt.slice(i)];
      });
      setAktiverTitel(t.id);
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-titel-id="${t.id}"]`)?.focus(), 50);
    }
  };

  if (!positionen.length) {
    return (
      <section className="rounded-lg border bg-card">
        <Leer icon={FileText} text={bearbeitbar ? (pc ? "Noch keine Positionen — unten eintippen, diktieren oder aus dem Projekt übernehmen." : "Noch keine Positionen — Leistung antippen, diktieren oder aus dem Projekt übernehmen.") : "Keine Positionen."} />
      </section>
    );
  }

  const dialoge = (
    <>
      <PositionDialog
        position={bearbeiten}
        stundensatz={stundensatz}
        katalog={katalog}
        onOpenChange={(o) => { if (!o) setBearbeiten(null); }}
        onUebernehmen={(p) => { aendern(p.id, p); setBearbeiten(null); }}
        onLoeschen={(id) => {
          const p = positionen.find((x) => x.id === id);
          setBearbeiten(null);
          if (p) loeschen(p);
        }}
      />
      <AlertDialog open={!!titelLoeschen} onOpenChange={(o) => { if (!o) setTitelLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>„{titelLoeschen?.bezeichnung}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Unter dem Titel stehen {titelLoeschen ? gruppenGroesse(positionen, titelLoeschen.id) : 0} Positionen.
              Nur die Überschrift löschen (die Positionen rutschen zum Titel davor) oder alles?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="outline" className="h-11" onClick={() => {
              if (titelLoeschen) setPositionen((alt) => entfernen(alt, titelLoeschen.id));
              if (aktiverTitel === titelLoeschen?.id) setAktiverTitel(null);
              setTitelLoeschen(null);
            }}>Nur Überschrift</Button>
            <Button variant="destructive" className="h-11" onClick={() => {
              if (titelLoeschen) setPositionen((alt) => entfernen(alt, titelLoeschen.id, true));
              if (aktiverTitel === titelLoeschen?.id) setAktiverTitel(null);
              setTitelLoeschen(null);
            }}>Mit Positionen löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // ── PC: Tabelle ──
  // EK und Aufschlag als eigene Spalten (nur intern) — ab 1280 px, sonst klein unter dem Preis
  const kalkSpalten = kalk && positionen.some((p) => !ohneBetrag(p));
  const kalkZelle = "hidden xl:table-cell";
  if (pc) {
    return (
      <section className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {bearbeitbar && <th className="w-8" aria-label="Verschieben" />}
              <th className={cn("w-14 py-2.5 text-left font-medium", bearbeitbar ? "pl-1" : "pl-4")}>Pos.</th>
              <th className="py-2.5 pr-2 text-left font-medium">Bezeichnung</th>
              <th className="w-20 py-2.5 pr-2 text-right font-medium">Menge</th>
              <th className="w-20 py-2.5 pr-2 text-left font-medium">Einheit</th>
              {kalkSpalten && <th className={cn(kalkZelle, "w-24 py-2.5 pr-2 text-right font-medium")} title="Einkaufspreis je Einheit — nur intern">EK</th>}
              {kalkSpalten && <th className={cn(kalkZelle, "w-24 py-2.5 pr-2 text-right font-medium")} title="Aufschlag auf den Einkauf — nur intern">Aufschlag</th>}
              <th className="w-28 py-2.5 pr-2 text-right font-medium">EP netto</th>
              <th className="w-28 py-2.5 pr-3 text-right font-medium">Gesamt</th>
              {bearbeitbar && <th className="w-12 py-2.5 pr-3" aria-label="Aktionen" />}
            </tr>
          </thead>
          <DndContext sensors={sensoren} collisionDetection={closestCenter} onDragEnd={abgelegt}>
          <SortableContext items={positionen.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <tbody>
            {positionen.map((p, i) => {
              const titel = p.art === "titel";
              const text = p.art === "text";
              const aktiv = bearbeitbar && titel && p.id === aktiverTitel;
              const langtextSichtbar = !titel && (!!p.langtext || langOffen.has(p.id));
              const auf = aufschlagVon(p, satz);
              return (
                <Sortierbar key={p.id} id={p.id} an={ziehbar(p)}>{({ ref, style, griff }) => (
                <tr
                  ref={ref}
                  style={style}
                  className={cn("border-b bg-card align-top last:border-b-0", titel && "bg-muted/40", aktiv && "bg-primary-soft")}
                  onClick={titel && bearbeitbar ? () => setAktiverTitel(p.id) : undefined}
                >
                  {bearbeitbar && <td className="py-1.5 pl-1" onClick={(e) => e.stopPropagation()}>{griff}</td>}
                  <td className={cn("zahl py-2.5 text-xs text-muted-foreground", bearbeitbar ? "pl-1" : "pl-4", titel && "pt-3.5 text-sm font-semibold text-foreground")}>{nummern[i]}</td>
                  {titel || text ? (
                    <>
                    <td colSpan={3} className="py-1.5 pr-2">
                      {bearbeitbar && text ? (
                        // Hinweistext wächst mit — langer Text bleibt ganz lesbar (Stefan 24.11.)
                        <TextareaWachsend
                          value={p.bezeichnung}
                          onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                          className="py-[7px] italic"
                          placeholder="Hinweistext"
                          data-text-id={p.id}
                          aria-label="Hinweistext"
                        />
                      ) : bearbeitbar ? (
                        <Input
                          value={p.bezeichnung}
                          onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                          onFocus={titel ? () => setAktiverTitel(p.id) : undefined}
                          className={cn("h-9", titel && "font-semibold", text && "italic")}
                          placeholder={titel ? "Titel, z. B. Küche oder Verteiler" : "Hinweistext"}
                          list={titel ? "titel-vorschlaege" : undefined}
                          data-titel-id={titel ? p.id : undefined}
                          data-text-id={text ? p.id : undefined}
                          aria-label={titel ? `Titel ${nummern[i]}` : "Hinweistext"}
                        />
                      ) : (
                        <p className={cn("py-1 whitespace-pre-line [overflow-wrap:anywhere]", titel && "font-semibold", text && "italic text-muted-foreground")}>{p.bezeichnung}</p>
                      )}
                      {titel && p.langtext && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.langtext}</p>}
                      {aktiv && bearbeitbar && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</p>}
                    </td>
                    {kalkSpalten && <td className={kalkZelle} />}
                    {kalkSpalten && <td className={kalkZelle} />}
                    <td />
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar ? (
                          tauschbar(p) ? (
                            <BezeichnungSuche p={p} katalog={katalog} stundensatz={satz} ariaLabel={`Bezeichnung ${nummern[i]}`}
                              onText={(t) => aendern(p.id, { bezeichnung: t })} onTausch={getauscht} />
                          ) : (
                            <TextareaWachsend value={p.bezeichnung} onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className="py-[7px]" aria-label={`Bezeichnung ${nummern[i]}`} />
                          )
                        ) : (
                          <p className="py-1 font-medium">{p.bezeichnung}</p>
                        )}
                        {/* Langtext klein und grau — erst ein Klick macht ihn zum Bearbeiten auf, sonst wird die Tabelle lang */}
                        {langtextSichtbar && (bearbeitbar && langOffen.has(p.id) ? (
                          <TextareaWachsend
                            value={p.langtext}
                            onChange={(e) => aendern(p.id, { langtext: e.target.value })}
                            onBlur={() => setLangOffen((s) => { const n = new Set(s); n.delete(p.id); return n; })}
                            placeholder="Langtext"
                            className="mt-1 min-h-[3.25rem] text-xs md:[@media(pointer:fine)]:text-xs"
                            autoFocus
                          />
                        ) : bearbeitbar ? (
                          <button type="button" onClick={() => setLangOffen((s) => new Set(s).add(p.id))} title="Langtext bearbeiten"
                            className="mt-0.5 line-clamp-2 w-full rounded px-3 text-left text-xs text-muted-foreground hover:bg-muted/60">
                            {p.langtext}
                          </button>
                        ) : <p className="whitespace-pre-line text-xs text-muted-foreground">{p.langtext}</p>)}
                        {p.quelle && <Herkunft />}
                        {p.variante && <VarianteHinweis v={p.variante} />}
                      </td>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar
                          ? <Input value={p.menge} onChange={(e) => aendern(p.id, { menge: e.target.value })} inputMode="decimal" className={cn("zahl h-9 text-right", zahlUngueltig(p.menge) && "border-destructive text-destructive")} aria-label={`Menge ${nummern[i]}`} />
                          : <p className="zahl py-1 text-right">{zahl(mengeVon(p))}</p>}
                      </td>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar ? (
                          <select
                            value={p.einheit}
                            onChange={(e) => aendern(p.id, { einheit: e.target.value })}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {(EINHEITEN.includes(p.einheit) ? EINHEITEN : [p.einheit, ...EINHEITEN]).map((e) => <option key={e} value={e}>{e}</option>)}
                          </select>
                        ) : <p className="py-1">{p.einheit}</p>}
                      </td>
                      {kalkSpalten && (
                        <td className={cn(kalkZelle, "py-1.5 pr-2")}>
                          {bearbeitbar && p.art !== "arbeit" && p.art !== "abzug" ? (
                            <ZahlFeld wert={p.ek_preis} onWert={(n) => ersetzen(p.id, (x) => mitEinkauf(x, n, satz, materialAufschlag))}
                              className="h-9 bg-muted/30" placeholder="–" aria-label={`Einkauf ${nummern[i]}`} data-ek-id={p.id} />
                          ) : <p className="zahl py-1 text-right text-muted-foreground">{p.ek_preis != null ? preisText(p.ek_preis) : ""}</p>}
                        </td>
                      )}
                      {kalkSpalten && (
                        <td className={cn(kalkZelle, "py-1.5 pr-2")}>
                          {bearbeitbar && auf != null ? (
                            <div className="relative">
                              <ZahlFeld wert={auf} nachkomma={1} onWert={(n) => { if (n != null) ersetzen(p.id, (x) => mitAufschlag(x, n, satz)); }}
                                className={cn("h-9 bg-muted/30 pr-6", auf < 0 && "text-destructive")} aria-label={`Aufschlag ${nummern[i]}`} data-auf-id={p.id} />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                          ) : <p className={cn("zahl py-1 text-right text-muted-foreground", auf != null && auf < 0 && "text-destructive")}>{auf != null ? `${zahl(auf)} %` : ""}</p>}
                        </td>
                      )}
                      <td className="py-1.5 pr-2">
                        {bearbeitbar
                          ? <Input value={p.einzelpreis} onChange={(e) => aendern(p.id, { einzelpreis: e.target.value })} inputMode="decimal" className={cn("zahl h-9 text-right", zahlUngueltig(p.einzelpreis) && "border-destructive text-destructive")} data-preis-id={p.id} aria-label={`Einzelpreis ${nummern[i]}`} />
                          : <p className="zahl py-1 text-right">{euro(preisVon(p))}</p>}
                        <span className={cn("block pt-0.5 text-right", kalkSpalten && "xl:hidden")}>{kalkText(p)}</span>
                      </td>
                    </>
                  )}
                  <td className={cn("zahl py-2.5 pr-3 text-right", titel ? "pt-3.5 font-semibold" : "font-medium")}>
                    {titel ? (titelAnzahl > 1 ? euro(zs[i] ?? 0) : "") : text ? "" : p.variante ? <VarianteBetrag p={p} /> : euro(positionGesamt(p))}
                  </td>
                  {bearbeitbar && (
                    <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <ZeilenMenue p={p} positionen={positionen} lohnarten={lohnarten} varianten={varianten} onAktion={(a) => aktion(p, a)} pc />
                      </div>
                    </td>
                  )}
                </tr>
                )}</Sortierbar>
              );
            })}
          </tbody>
          </SortableContext>
          </DndContext>
        </table>
        <datalist id="titel-vorschlaege">
          {RAUM_VORSCHLAEGE.map((r) => <option key={r} value={r} />)}
        </datalist>
        {dialoge}
      </section>
    );
  }

  // ── Handy: Karten ──
  return (
    <DndContext sensors={sensoren} collisionDetection={closestCenter} onDragEnd={abgelegt}>
    <SortableContext items={positionen.map((p) => p.id)} strategy={verticalListSortingStrategy}>
    <section className="space-y-2">
      {positionen.map((p, i) => (
        <Sortierbar key={p.id} id={p.id} an={ziehbar(p)}>{({ ref, style, griff }) => {
        if (p.art === "titel") {
          const aktiv = bearbeitbar && p.id === aktiverTitel;
          // Titel direkt in der Karte benennen; solange er leer ist, stehen die üblichen Räume zum Antippen da
          const vorschlaege = bearbeitbar && !p.bezeichnung.trim()
            ? RAUM_VORSCHLAEGE.filter((r) => !positionen.some((x) => x.art === "titel" && x.bezeichnung.trim().toLowerCase() === r.toLowerCase())).slice(0, 10)
            : [];
          return (
            <div ref={ref} style={style} className={cn("rounded-lg border px-3 py-2", aktiv ? "border-primary bg-primary-soft" : "bg-muted", i > 0 && "mt-4", griff && "pl-1")}>
              <div className="flex items-center gap-2">
                {griff}
                <span className="zahl shrink-0 text-sm font-semibold text-muted-foreground">{nummern[i]}</span>
                {bearbeitbar ? (
                  <Input
                    value={p.bezeichnung}
                    onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                    onFocus={() => setAktiverTitel(p.id)}
                    placeholder="Titel, z. B. Küche"
                    className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-semibold shadow-none focus-visible:border-input focus-visible:bg-card"
                    data-titel-id={p.id}
                    aria-label={`Titel ${nummern[i]}`}
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                ) : <span className="min-w-0 flex-1 truncate font-semibold">{p.bezeichnung || "Ohne Namen"}</span>}
                {titelAnzahl > 1 && <span className="zahl shrink-0 text-sm font-semibold">{euro(zs[i] ?? 0)}</span>}
                {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} lohnarten={lohnarten} varianten={varianten} onAktion={(a) => aktion(p, a)} />}
              </div>
              {vorschlaege.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pb-1">
                  {vorschlaege.map((r) => (
                    <button key={r} type="button" onClick={() => { aendern(p.id, { bezeichnung: r }); setAktiverTitel(p.id); }}
                      className="h-9 rounded-full border bg-card px-3 text-sm font-medium active:bg-primary-soft">{r}</button>
                  ))}
                </div>
              )}
              {aktiv && bearbeitbar && !vorschlaege.length && <span className="flex items-center gap-1 px-1.5 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</span>}
              {p.langtext && <span className="line-clamp-2 block px-1.5 text-xs text-muted-foreground">{p.langtext}</span>}
            </div>
          );
        }
        if (p.art === "text") {
          return (
            <div ref={ref} style={style} className={cn("flex items-start gap-2 rounded-lg border border-dashed bg-card px-3 py-2.5", griff && "pl-1")}>
              {griff}
              <button type="button" className="min-w-0 flex-1 text-left text-sm italic text-muted-foreground [overflow-wrap:anywhere]" onClick={() => bearbeitbar && setBearbeiten(p)} disabled={!bearbeitbar}>
                {p.bezeichnung || "Hinweistext"}
              </button>
              {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} lohnarten={lohnarten} varianten={varianten} onAktion={(a) => aktion(p, a)} />}
            </div>
          );
        }
        return (
          <div ref={ref} style={style} className={cn("rounded-lg border bg-card p-3", griff && "pl-1")}>
            <div className="flex items-start gap-2">
              {griff && <span className="-my-1.5">{griff}</span>}
              <span className="zahl w-9 shrink-0 pt-0.5 text-xs text-muted-foreground">{nummern[i]}</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => bearbeitbar && setBearbeiten(p)} disabled={!bearbeitbar}>
                <span className="block text-sm font-medium leading-snug [overflow-wrap:anywhere]">{p.bezeichnung || <span className="text-muted-foreground">Ohne Bezeichnung</span>}</span>
                {p.langtext && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.langtext}</span>}
                {p.quelle && <Herkunft />}
                {p.variante && <VarianteHinweis v={p.variante} />}
              </button>
              {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} lohnarten={lohnarten} varianten={varianten} onAktion={(a) => aktion(p, a)} />}
            </div>
            <div className={cn("mt-2 flex items-center gap-2", griff && "pl-2")}>
              {bearbeitbar ? (
                <div className="flex shrink-0 items-center">
                  <Button variant="outline" size="icon" className="h-11 w-11 rounded-r-none" aria-label="weniger" onClick={() => mengePlus(p, -1)}><Minus className="h-4 w-4" /></Button>
                  <Input
                    value={p.menge}
                    onChange={(e) => aendern(p.id, { menge: e.target.value })}
                    inputMode="decimal"
                    className={cn("zahl h-11 w-16 rounded-none border-x-0 px-1 text-center", zahlUngueltig(p.menge) && "text-destructive")}
                    aria-label="Menge"
                  />
                  <Button variant="outline" size="icon" className="h-11 w-11 rounded-l-none" aria-label="mehr" onClick={() => mengePlus(p, 1)}><Plus className="h-4 w-4" /></Button>
                </div>
              ) : (
                <span className="zahl font-medium">{zahl(mengeVon(p))}</span>
              )}
              {/* Einheit nie abschneiden („S..“ statt „Stk“ am iPhone SE) — eher bricht die EK-Zeile um */}
              <span className="shrink-0 text-sm text-muted-foreground">{p.einheit}</span>
              <button
                type="button"
                className="ml-auto min-w-0 text-right"
                onClick={() => bearbeitbar && setBearbeiten(p)}
                disabled={!bearbeitbar}
                aria-label="Preis bearbeiten"
              >
                <span className="zahl block font-semibold">{p.variante ? <VarianteBetrag p={p} /> : euro(positionGesamt(p))}</span>
                <span className="zahl block text-xs text-muted-foreground">à {euro(preisVon(p))}</span>
                {kalkText(p)}
              </button>
            </div>
          </div>
        );
        }}</Sortierbar>
      ))}
      {dialoge}
    </section>
    </SortableContext>
    </DndContext>
  );
}

function Herkunft() {
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
      <Link2 className="h-3 w-3" /> aus dem Projekt übernommen
    </span>
  );
}

/** „Optional · nicht in der Summe“ unter der Bezeichnung */
function VarianteHinweis({ v }: { v: Variante }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground" data-variante={v}>
      <span className="rounded-full border border-primary/40 bg-primary-soft px-2 py-0.5 font-semibold text-primary">{VARIANTE_TEXT[v]}</span>
      nicht in der Summe
    </span>
  );
}

/** Betrag einer optionalen/alternativen Position — in Klammern, zählt nicht */
function VarianteBetrag({ p }: { p: EditorPosition }) {
  return <span className="font-normal text-muted-foreground" title="Zählt nicht in die Summe">({euro(positionBetrag(p))})</span>;
}

type Aktion = "bearbeiten" | "hoch" | "runter" | "kopieren" | "loeschen" | "langtext" | "hier" | "titelDavor" | Variante | "zaehlt";

function ZeilenMenue({ p, positionen, lohnarten = [], varianten = false, onAktion, pc }: {
  p: EditorPosition;
  positionen: EditorPosition[];
  lohnarten?: Lohnart[];
  varianten?: boolean;
  onAktion: (a: Aktion | Lohnart) => void;
  pc?: boolean;
}) {
  const andereSaetze = p.art === "arbeit" ? lohnarten.filter((l) => arbeitszeitText(l) !== p.bezeichnung || l.satz !== preisVon(p)) : [];
  const titel = p.art === "titel";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("shrink-0", pc ? "h-8 w-8" : "-mr-1 -mt-1 h-10 w-10")} aria-label="Weitere Aktionen">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {titel && <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("hier")}><CornerDownRight className="h-4 w-4" /> Hier hinzufügen</DropdownMenuItem>}
        <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("bearbeiten")}><Pencil className="h-4 w-4" /> {titel ? "Umbenennen" : "Bearbeiten"}</DropdownMenuItem>
        {pc && !titel && p.art !== "text" && !p.langtext && (
          <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("langtext")}><FileText className="h-4 w-4" /> Langtext hinzufügen</DropdownMenuItem>
        )}
        {!titel && <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("titelDavor")}><Rows3 className="h-4 w-4" /> Titel darüber einfügen</DropdownMenuItem>}
        {varianten && varianteMoeglich(p) && (
          <>
            <DropdownMenuSeparator />
            {p.variante ? (
              <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("zaehlt")}><Sigma className="h-4 w-4" /> Wieder in die Summe</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("optional")}><CircleDashed className="h-4 w-4" /> Als optional (nicht in Summe)</DropdownMenuItem>
                <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("alternativ")}><Replace className="h-4 w-4" /> Als Alternative (nicht in Summe)</DropdownMenuItem>
              </>
            )}
            {p.variante && (
              <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion(p.variante === "optional" ? "alternativ" : "optional")}>
                {p.variante === "optional" ? <Replace className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />} Stattdessen {p.variante === "optional" ? "Alternative" : "optional"}
              </DropdownMenuItem>
            )}
          </>
        )}
        {andereSaetze.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Stundensatz tauschen</DropdownMenuLabel>
            {andereSaetze.map((l) => (
              <DropdownMenuItem key={l.name} className="h-11 gap-2" onClick={() => onAktion(l)}>
                <Clock className="h-4 w-4" /> <span className="flex-1">{l.standard ? "Standard" : l.name}</span><span className="zahl text-muted-foreground">{euro(l.satz)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="h-11 gap-2" disabled={!kannVerschieben(positionen, p.id, -1)} onClick={() => onAktion("hoch")}><ArrowUp className="h-4 w-4" /> Nach oben</DropdownMenuItem>
        <DropdownMenuItem className="h-11 gap-2" disabled={!kannVerschieben(positionen, p.id, 1)} onClick={() => onAktion("runter")}><ArrowDown className="h-4 w-4" /> Nach unten</DropdownMenuItem>
        <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("kopieren")}><Copy className="h-4 w-4" /> {titel ? "Raum kopieren" : "Kopieren"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-11 gap-2 text-destructive focus:text-destructive" onClick={() => onAktion("loeschen")}><Trash2 className="h-4 w-4" /> Löschen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
