import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Palmtree, Pencil, Search, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { datum as datumText, isoZuDatum } from "@/lib/format";
import { nichtEingeplant } from "@/lib/kalender";
import { projektFarbe } from "@/lib/plantafel";
import { projekteSuchen } from "@/lib/projektSuche";
import { abwesenheitTon } from "@/lib/terminplaner";
import { ABWESENHEIT_ART, type AbwesenheitArt, type Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const kurz = (iso: string) => `${WT[(isoZuDatum(iso).getDay() + 6) % 7]} ${datumText(iso).slice(0, 6)}`;
const TON = {
  rot: "bg-status-rot text-status-rot-fg",
  gruen: "bg-status-gruen text-status-gruen-fg",
  gelb: "bg-status-gelb text-status-gelb-fg",
} as const;
const normal = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("de").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Was angetippt bzw. aufgezogen wurde — eine Person, ein Tag oder Zeitraum, evtl. eine Uhrzeit */
export type LeerWahl = {
  x: number;
  y: number;
  wer: string;
  datum: string;
  bisDatum?: string;
  von?: string;
  bis?: string;
  /** Zeitraum aufgezogen statt angetippt — dann gilt er auch für die Montage */
  aufgezogen?: boolean;
  /** Liegt dort schon eine Abwesenheit? Dann: bearbeiten, löschen oder trotzdem ein Einsatz */
  abwesenheit?: { id: string | null; art: string | null; von: string | null; bis: string | null } | null;
};

/** Kunden zur Suche: Name vorne zuerst, dann irgendwo im Namen oder Ort */
function kundenSuchen(kunden: Kunde[], q: string): Kunde[] {
  const n = normal(q.trim());
  if (n.length < 2) return [];
  return kunden
    .filter((k) => k.art !== "lieferant" && (normal(k.name).includes(n) || normal(k.ort).startsWith(n)))
    .sort((a, b) => Number(!normal(b.name).startsWith(n)) - Number(!normal(a.name).startsWith(n)) || a.name.localeCompare(b.name, "de"))
    .slice(0, 4);
}

/**
 * Kleines Fenster an der angetippten Stelle (nur Chef) — schnell einplanen
 * ohne großes Formular (Christoph 18.11.2026): Projekt oder Kunde tippen,
 * antippen, fertig. Ohne Suche stehen die noch nicht eingeplanten Projekte
 * oben. Projekt = Montage, Kunde = Besichtigung. „Mit Details …“ öffnet das
 * große Formular, „Abwesenheit“ den Urlaub/Krank-Dialog; auf einer
 * Abwesenheit zusätzlich bearbeiten/löschen.
 */
export function ZellWahl({ wahl, projekte, kunden, eingeplant, onProjekt, onKunde, onMehr, onAbwesenheit, onAbwBearbeiten, onAbwLoeschen, onZu }: {
  wahl: LeerWahl;
  projekte: ProjektMitKunde[];
  kunden: Kunde[];
  /** Projekte mit einem Einsatz ab heute */
  eingeplant: Set<string>;
  onProjekt: (p: ProjektMitKunde) => void;
  onKunde: (k: Kunde) => void;
  /** großes Formular, getippter Text als Titel */
  onMehr: (text: string) => void;
  onAbwesenheit: () => void;
  onAbwBearbeiten: (id: string) => void;
  onAbwLoeschen: (id: string) => void;
  onZu: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: wahl.x + 8, top: wahl.y + 8 });
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [suche, setSuche] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const unten = window.innerHeight - r.height - 8;
    setLage({
      left: Math.max(8, Math.min(wahl.x + 8, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(unten, wahl.y + 8 > unten ? wahl.y - r.height - 8 : wahl.y + 8)),
    });
    setLoeschFrage(false);
    setSuche("");
  }, [wahl.x, wahl.y]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onZu(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    // erst nach dem Loslassen scharf schalten — sonst schließt das eigene Antippen sofort
    const t = window.setTimeout(() => document.addEventListener("pointerdown", weg, true), 0);
    window.addEventListener("keydown", taste);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", weg, true); window.removeEventListener("keydown", taste); };
  }, [onZu]);

  const q = suche.trim();
  const ungeplant = useMemo(() => nichtEingeplant(projekte, eingeplant), [projekte, eingeplant]);
  const projektListe = useMemo(() => {
    if (q) return projekteSuchen(projekte.filter((p) => p.status === "aktiv" || p.status === "angebot"), q).slice(0, 6);
    const rest = projekte.filter((p) => p.status === "aktiv" && !ungeplant.includes(p));
    return [...ungeplant, ...rest].slice(0, 6);
  }, [projekte, ungeplant, q]);
  const kundenListe = useMemo(() => kundenSuchen(kunden, q), [kunden, q]);

  const a = wahl.abwesenheit;
  const art = a ? ABWESENHEIT_ART[a.art as AbwesenheitArt] : undefined;
  const zeit = `${kurz(wahl.datum)}${wahl.bisDatum && wahl.bisDatum > wahl.datum ? ` – ${kurz(wahl.bisDatum)}` : ""}${wahl.aufgezogen && wahl.von ? ` · ${wahl.von}–${wahl.bis}` : ""}`;

  const erstes = () => {
    if (projektListe[0]) onProjekt(projektListe[0]);
    else if (kundenListe[0]) onKunde(kundenListe[0]);
    else onMehr(q);
  };

  return (
    <div ref={ref} role="dialog" aria-label="Einplanen" data-zell-wahl
      className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border-2 border-primary/40 bg-card text-sm shadow-xl" style={lage}>
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{wahl.wer}</p>
          <p className="text-xs text-muted-foreground">{zeit}</p>
        </div>
        <button type="button" onClick={onZu} className="-mr-1 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schließen"><X className="h-4 w-4" /></button>
      </div>
      {a?.id && (
        <div className="space-y-2 border-b px-3 py-2.5">
          <p className={cn("rounded px-2 py-1 text-xs font-semibold", TON[abwesenheitTon(a.art)])}>
            {art?.text ?? "Abwesend"}{a.von && a.bis ? ` · ${a.von === a.bis ? kurz(a.von) : `${kurz(a.von)} – ${kurz(a.bis)}`}` : ""}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-10 flex-1 gap-1.5" onClick={() => onAbwBearbeiten(a.id!)}><Pencil className="h-4 w-4" /> Bearbeiten</Button>
            {loeschFrage ? (
              <Button size="sm" variant="destructive" className="h-10 flex-1" onClick={() => onAbwLoeschen(a.id!)}>Wirklich löschen</Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-10 flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}><Trash2 className="h-4 w-4" /> Löschen</Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5 p-2">
        <form onSubmit={(e) => { e.preventDefault(); erstes(); }} className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {/* Am PC gleich tippen; am Handy erst auf Antippen — sonst verdeckt die Tastatur die Liste */}
          <input value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus={window.matchMedia?.("(pointer: fine)").matches}
            placeholder={a?.id ? "Trotzdem einplanen: Projekt oder Kunde …" : "Projekt oder Kunde …"} aria-label="Projekt oder Kunde suchen"
            enterKeyHint="go" autoComplete="off"
            className="h-10 w-full rounded-md border bg-background pl-8 pr-2 text-base [@media(pointer:fine)]:text-sm" />
        </form>

        {projektListe.length > 0 && (
          <ul className="space-y-0.5">
            {!q && <li className="px-1 pt-0.5 text-[11px] text-muted-foreground">{ungeplant.length ? "Noch nicht eingeplant zuerst" : "Projekte in Arbeit"}</li>}
            {projektListe.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onProjekt(p)} title={`${p.nummer} ${p.name} — als Montage einplanen`}
                  className="flex w-full items-stretch gap-2 rounded-md px-1.5 py-1 text-left hover:bg-primary-soft">
                  <span className="w-1.5 shrink-0 rounded-full" style={{ background: projektFarbe(p) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono font-semibold">{p.nummer}</span>
                      {!eingeplant.has(p.id) && p.status === "aktiv" && <span className="rounded-full bg-status-gelb px-1.5 text-[10px] font-semibold text-status-gelb-fg">nicht eingeplant</span>}
                      {p.status === "angebot" && <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">Angebot</span>}
                    </span>
                    <span className="block truncate font-medium">{p.name}</span>
                    {(p.kunden?.name || p.ort) && <span className="block truncate text-xs text-muted-foreground">{[p.kunden?.name, p.ort ?? p.kunden?.ort].filter(Boolean).join(" · ")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {kundenListe.length > 0 && (
          <ul className="space-y-0.5">
            <li className="px-1 pt-0.5 text-[11px] text-muted-foreground">Besichtigung bei</li>
            {kundenListe.map((k) => (
              <li key={k.id}>
                <button type="button" onClick={() => onKunde(k)} title={`Besichtigung bei ${k.name}`}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-primary-soft">
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{k.name}</span>
                    {k.ort && <span className="block truncate text-xs text-muted-foreground">{[k.strasse, k.ort].filter(Boolean).join(", ")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {q && !projektListe.length && !kundenListe.length && (
          <p className="px-1 py-1 text-xs text-muted-foreground">Nichts gefunden — „Mit Details“ legt einen Termin „{q}“ an.</p>
        )}
        {!q && !projektListe.length && (
          <p className="px-1 py-1 text-xs text-muted-foreground">Kein Projekt in Arbeit — Kunden tippen für eine Besichtigung.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t p-2">
        <Button className="h-11 gap-1.5" variant="outline" onClick={onAbwesenheit}><Palmtree className="h-4 w-4" /> Abwesenheit</Button>
        <Button className="h-11 gap-1.5" variant="outline" onClick={() => onMehr(q)}><CalendarPlus className="h-4 w-4" /> Mit Details …</Button>
      </div>
    </div>
  );
}
