import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ClipboardList, ClipboardSignature, Clock, MapPin, Pencil, Trash2, Truck, UserRound, Users, X } from "lucide-react";
import { useSitzung } from "@/hooks/useSitzung";
import { terminWeiter } from "@/lib/kalender";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { datum as datumText, isoZuDatum, uhrzeit } from "@/lib/format";
import { artText, terminFarbe } from "@/lib/kalender";
import { name, type Fahrzeug, type Profil, type Projekt, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const kurz = (iso: string) => `${WT[(isoZuDatum(iso).getDay() + 6) % 7]} ${datumText(iso).slice(0, 6)}`;
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}–${t.bis ? uhrzeit(t.bis) : ""}`);

/**
 * Kleines Fenster direkt am Termin im Kalender — erst „Bearbeiten“ öffnet das
 * große Formular. Geräte lassen sich hier an- und abhaken.
 * Auf „Besichtigung“ der Knopf „Erstaufnahme“ (öffnet die zugehörige oder
 * legt sie mit Kunde und Ort an), auf „Service“ „Regiebericht“ (Kunde,
 * Termin bzw. Projekt vorbelegt) — für den Chef und wer eingeteilt ist.
 */
export function BalkenInfo({
  t, x, y, projekt, kunde, team, mitarbeiter, fahrzeuge, darf, konflikt, onZu, onBearbeiten, onErledigt, onGeraet, onPersonWeg, onLoeschen,
}: {
  t: Termin; x: number; y: number; projekt?: Projekt; kunde?: { name: string } | null; team?: Team; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; darf: boolean; konflikt: boolean;
  onZu: () => void; onBearbeiten: () => void; onErledigt: () => void; onGeraet: (id: string) => void; onPersonWeg: (id: string) => void; onLoeschen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: x + 8, top: y + 12 });
  const [loeschFrage, setLoeschFrage] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setLage({
      left: Math.max(8, Math.min(x + 8, window.innerWidth - r.width - 8)),
      top: y + 12 + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 12) : y + 12,
    });
  }, [x, y, t.id]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-block]")) onZu(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    document.addEventListener("pointerdown", weg, true);
    window.addEventListener("keydown", taste);
    return () => { document.removeEventListener("pointerdown", weg, true); window.removeEventListener("keydown", taste); };
  }, [onZu]);
  const navigate = useNavigate();
  const { profil } = useSitzung();
  const weiter = terminWeiter(t, darf || (!!profil && t.mitarbeiter.includes(profil.id)));
  const farbe = terminFarbe(t.art, projekt).streifen;
  const leute = t.mitarbeiter.map((id) => mitarbeiter.find((m) => m.id === id)).filter((m): m is Profil => !!m);
  const geraete = fahrzeuge.filter((f) => f.aktiv !== false);
  return (
    <div ref={ref} role="dialog" aria-label={t.titel} data-balken-info
      className="fixed z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-lg border-2 bg-card text-sm shadow-xl" style={{ ...lage, borderColor: farbe }}>
      <div className="flex items-start gap-2 border-b px-3 py-2.5" style={{ background: `${farbe}14` }}>
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: farbe }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{t.dringend && t.status !== "erledigt" ? "! " : ""}{t.titel}</p>
          <p className="text-xs text-muted-foreground">{artText(t.art)}{kunde ? ` · ${kunde.name}` : ""}</p>
          {projekt && <Link to={`/projekte/${projekt.id}`} className="text-xs font-medium text-primary hover:underline">{projekt.nummer} · {projekt.name}</Link>}
        </div>
        <button type="button" onClick={onZu} className="-mr-1 -mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schließen"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <p className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          {kurz(t.datum)}{t.bis_datum ? ` – ${kurz(t.bis_datum)}` : ""} · {zeitText(t)}
          {t.status === "erledigt" && <span className="ml-auto rounded-full bg-status-gruen px-2 text-xs font-semibold text-status-gruen-fg">Erledigt</span>}
        </p>
        {t.ort && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{t.ort}</span></p>}
        {!t.ort && kunde && <p className="flex items-center gap-2 text-muted-foreground"><UserRound className="h-4 w-4 shrink-0" /><span className="truncate">{kunde.name}</span></p>}
        {konflikt && <p className="rounded bg-status-rot px-2 py-1 text-xs font-medium text-status-rot-fg">⚠ Jemand oder ein Gerät ist doppelt eingeteilt oder abwesend</p>}
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-wrap gap-1">
            {team && <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">Team {team.name}</span>}
            {leute.map((m) => (
              <span key={m.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs">
                <Avatar profil={m} className="h-5 w-5 text-[9px]" />{m.vorname || name(m)}
                {darf && <button type="button" onClick={() => onPersonWeg(m.id)} className="-mr-1 rounded-full p-0.5 hover:bg-background" aria-label={`${name(m)} herausnehmen`}><X className="h-3 w-3" /></button>}
              </span>
            ))}
            {!team && !leute.length && <span className="text-xs text-muted-foreground">Noch niemand eingeteilt</span>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-wrap gap-1">
            {geraete.filter((f) => t.fahrzeuge.includes(f.id) || darf).map((f) => {
              const dabei = t.fahrzeuge.includes(f.id);
              return darf ? (
                <button key={f.id} type="button" onClick={() => onGeraet(f.id)} aria-pressed={dabei}
                  className={cn("rounded-full border px-2 py-0.5 text-xs", dabei ? "border-primary bg-primary-soft font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>
                  {dabei && <Check className="mr-0.5 inline h-3 w-3" />}{f.name}
                </button>
              ) : <span key={f.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{f.name}</span>;
            })}
            {!darf && !t.fahrzeuge.length && <span className="text-xs text-muted-foreground">kein Gerät</span>}
          </div>
        </div>
        {t.beschreibung && <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{t.beschreibung}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
        <Button size="sm" variant={darf ? "default" : "outline"} className="h-9 gap-1.5" onClick={onBearbeiten}>
          <Pencil className="h-4 w-4" /> {darf ? "Bearbeiten" : "Öffnen"}
        </Button>
        {weiter && (
          <Button size="sm" variant={darf ? "outline" : "default"} className="h-9 gap-1.5" onClick={() => { onZu(); navigate(weiter.pfad); }} data-termin-weiter={weiter.art}>
            {weiter.art === "erstaufnahme" ? <ClipboardList className="h-4 w-4" /> : <ClipboardSignature className="h-4 w-4" />} {weiter.text}
          </Button>
        )}
        {darf && <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onErledigt}><Check className="h-4 w-4" /> {t.status === "erledigt" ? "Wieder offen" : "Erledigt"}</Button>}
        {darf && (loeschFrage ? (
          <Button size="sm" variant="destructive" className="ml-auto h-9" onClick={onLoeschen}>Wirklich löschen</Button>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto h-9 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}><Trash2 className="h-4 w-4" /> Löschen</Button>
        ))}
      </div>
    </div>
  );
}
