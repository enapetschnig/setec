import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CalendarPlus, Plus, Truck, X } from "lucide-react";
import { FAHRZEUG_ICON } from "@/components/fuhrpark/fuhrparkDaten";
import { datum as datumText, isoZuDatum, uhrzeit } from "@/lib/format";
import { geraetDoppelt } from "@/lib/kalender";
import { amTag, type Konflikt } from "@/lib/plantafel";
import { name, type Fahrzeug, type FahrzeugArt, type Profil, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WT = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const tagText = (iso: string) => `${WT[(isoZuDatum(iso).getDay() + 6) % 7]}, ${datumText(iso).slice(0, 6)}`;
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}–${t.bis ? uhrzeit(t.bis) : ""}`);

type Offen = { fahrzeugId: string | null; x: number; y: number };

/**
 * Geräte & Fahrzeuge in der Tageszeile des Kalenders (Christoph 18.11.2026:
 * keine eigenen Spalten mehr, „oben neben dem Datum + Fahrzeug“).
 * Je belegtem Fahrzeug ein Kärtchen (rot = doppelt vergeben), dahinter
 * „+ Fahrzeug“: Fahrzeug wählen → zu einem Einsatz des Tages mitnehmen oder
 * als eigenen Termin reservieren. Antippen eines Kärtchens: wo es dabei ist,
 * dort entfernen oder zu einem weiteren Einsatz mitnehmen.
 */
export function FahrzeugTag({ tag, fahrzeuge, termine, konfliktListe, mitarbeiter, darf, aendern, onReservieren, onTermin }: {
  tag: string;
  /** aktive Geräte & Fahrzeuge, schon sortiert */
  fahrzeuge: Fahrzeug[];
  termine: Termin[];
  konfliktListe: Konflikt[];
  mitarbeiter: Profil[];
  darf: boolean;
  aendern: (t: Termin, neu: Partial<Termin>, text?: string) => Promise<boolean>;
  onReservieren: (fahrzeugId: string, tag: string) => void;
  onTermin: (t: Termin, x: number, y: number) => void;
}) {
  const [offen, setOffen] = useState<Offen | null>(null);
  const amTage = termine.filter((t) => amTag(t, tag));
  const belegt = fahrzeuge.filter((f) => amTage.some((t) => t.fahrzeuge.includes(f.id)));
  if (!belegt.length && !darf) return null;

  return (
    <>
      {belegt.map((f) => {
        const Icon = FAHRZEUG_ICON[f.art as FahrzeugArt] ?? Truck;
        const rot = geraetDoppelt(konfliktListe, f.id, tag).size > 0;
        const bei = amTage.filter((t) => t.fahrzeuge.includes(f.id)).map((t) => t.titel);
        return (
          <button key={f.id} type="button" onClick={(e) => setOffen({ fahrzeugId: f.id, x: e.clientX, y: e.clientY })}
            title={`${f.name}${rot ? " — doppelt vergeben" : ""} · ${bei.join(", ")}`}
            className={cn("flex h-5 max-w-40 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium",
              rot ? "border-status-rot-fg/50 bg-status-rot text-status-rot-fg" : "bg-card hover:border-foreground/40")}>
            <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{rot ? "⚠ " : ""}{f.name}</span>
          </button>
        );
      })}
      {darf && fahrzeuge.length > 0 && (
        <button type="button" onClick={(e) => setOffen({ fahrzeugId: null, x: e.clientX, y: e.clientY })}
          className="flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
          title="Fahrzeug oder Gerät für diesen Tag einteilen">
          <Plus className="h-3 w-3" /> Fahrzeug
        </button>
      )}
      {/* Ins body — die Tageszeile klebt mit eigenem z-index, sonst lägen die nächsten Tage darüber */}
      {offen && createPortal(
        <FahrzeugFenster offen={offen} tag={tag} fahrzeuge={fahrzeuge} amTage={amTage} konfliktListe={konfliktListe}
          mitarbeiter={mitarbeiter} darf={darf} aendern={aendern} onReservieren={onReservieren} onTermin={onTermin}
          onWahl={(id) => setOffen({ ...offen, fahrzeugId: id })} onZu={() => setOffen(null)} />,
        document.body,
      )}
    </>
  );
}

function FahrzeugFenster({ offen, tag, fahrzeuge, amTage, konfliktListe, mitarbeiter, darf, aendern, onReservieren, onTermin, onWahl, onZu }: {
  offen: Offen;
  tag: string;
  fahrzeuge: Fahrzeug[];
  amTage: Termin[];
  konfliktListe: Konflikt[];
  mitarbeiter: Profil[];
  darf: boolean;
  aendern: (t: Termin, neu: Partial<Termin>, text?: string) => Promise<boolean>;
  onReservieren: (fahrzeugId: string, tag: string) => void;
  onTermin: (t: Termin, x: number, y: number) => void;
  onWahl: (id: string | null) => void;
  onZu: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: offen.x + 8, top: offen.y + 10 });
  // Aus der Fahrzeugliste gekommen? Dann gibt es „zurück“
  const [ausListe] = useState(offen.fahrzeugId === null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setLage({
      left: Math.max(8, Math.min(offen.x + 8, window.innerWidth - r.width - 8)),
      top: offen.y + 10 + r.height > window.innerHeight - 8 ? Math.max(8, offen.y - r.height - 10) : offen.y + 10,
    });
  }, [offen.x, offen.y, offen.fahrzeugId]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onZu(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    const t = window.setTimeout(() => document.addEventListener("pointerdown", weg, true), 0);
    window.addEventListener("keydown", taste);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", weg, true); window.removeEventListener("keydown", taste); };
  }, [onZu]);

  const f = fahrzeuge.find((x) => x.id === offen.fahrzeugId);
  const leute = (t: Termin) => t.mitarbeiter.map((id) => mitarbeiter.find((m) => m.id === id)?.vorname ?? name(mitarbeiter.find((m) => m.id === id))).filter(Boolean).join(", ");
  const zeile = (t: Termin) => [zeitText(t), leute(t)].filter(Boolean).join(" · ");

  return (
    <div ref={ref} role="dialog" aria-label="Fahrzeug einteilen" data-fahrzeug-fenster
      className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border-2 border-primary/40 bg-card text-sm shadow-xl" style={lage}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {f && ausListe && (
          <button type="button" onClick={() => onWahl(null)} className="-ml-1 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Anderes Fahrzeug">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{f ? f.name : "Fahrzeug oder Gerät"}</p>
          <p className="text-xs text-muted-foreground">{tagText(tag)}</p>
        </div>
        <button type="button" onClick={onZu} className="-mr-1 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schließen"><X className="h-4 w-4" /></button>
      </div>

      {!f ? (
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {fahrzeuge.map((x) => {
            const Icon = FAHRZEUG_ICON[x.art as FahrzeugArt] ?? Truck;
            const bei = amTage.filter((t) => t.fahrzeuge.includes(x.id));
            const rot = geraetDoppelt(konfliktListe, x.id, tag).size > 0;
            return (
              <li key={x.id}>
                <button type="button" onClick={() => onWahl(x.id)} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{x.name}</span>
                  <span className={cn("max-w-36 shrink-0 truncate text-xs", rot ? "font-semibold text-status-rot-fg" : bei.length ? "text-foreground" : "text-muted-foreground")}>
                    {rot ? "doppelt" : bei.length ? `bei ${bei[0].titel}${bei.length > 1 ? ` +${bei.length - 1}` : ""}` : "frei"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="max-h-[26rem] space-y-2 overflow-y-auto p-2">
          {(() => {
            const dabei = amTage.filter((t) => t.fahrzeuge.includes(f.id));
            const andere = amTage.filter((t) => !t.fahrzeuge.includes(f.id) && t.mitarbeiter.length > 0);
            return (
              <>
                {dabei.length > 0 && (
                  <section>
                    <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Dabei bei</p>
                    <ul className="space-y-1">
                      {dabei.map((t) => (
                        <li key={t.id} className="flex items-center gap-1 rounded-md border">
                          <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left hover:bg-muted" onClick={(e) => { onZu(); onTermin(t, e.clientX, e.clientY); }}>
                            <span className="block truncate font-medium">{t.titel}</span>
                            <span className="block truncate text-xs text-muted-foreground">{zeile(t)}</span>
                          </button>
                          {darf && (
                            <button type="button" className="mr-1 shrink-0 rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                              aria-label={`${f.name} bei ${t.titel} entfernen`} title="Hier entfernen"
                              onClick={() => { onZu(); void aendern(t, { fahrzeuge: t.fahrzeuge.filter((x) => x !== f.id) }, `${f.name} nicht mehr bei ${t.titel}`); }}>
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {darf && (
                  <section>
                    <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">{dabei.length ? "Auch mitnehmen zu" : "Mitnehmen zu"}</p>
                    {andere.length ? (
                      <ul className="space-y-1">
                        {andere.map((t) => (
                          <li key={t.id}>
                            <button type="button" className="w-full rounded-md border px-2 py-1.5 text-left hover:border-primary/50 hover:bg-primary-soft"
                              onClick={() => { onZu(); void aendern(t, { fahrzeuge: [...t.fahrzeuge, f.id] }, `${f.name} → ${t.titel}`); }}>
                              <span className="block truncate font-medium">{t.titel}</span>
                              <span className="block truncate text-xs text-muted-foreground">{zeile(t)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">An diesem Tag ist sonst niemand eingeteilt.</p>
                    )}
                  </section>
                )}
                {darf && (
                  <button type="button" onClick={() => { onZu(); onReservieren(f.id, tag); }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-primary hover:bg-primary/10">
                    <CalendarPlus className="h-4 w-4" /> Eigenen Termin für {f.name} …
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
