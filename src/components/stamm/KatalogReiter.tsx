import { Link, useLocation } from "react-router-dom";
import { ListChecks, Package } from "lucide-react";
import { useSitzung } from "@/hooks/useSitzung";
import { cn } from "@/lib/utils";

/**
 * Artikel und Leistungen sind EIN Katalog: Artikel = Material vom
 * Großhändler, Leistung = Artikel samt Montagezeit (so rechnet ein
 * Elektriker Angebote). Oben auf beiden Seiten umschalten — Monteure sehen
 * nur die Artikel.
 */
export function KatalogReiter() {
  const { istChef } = useSitzung();
  const { pathname } = useLocation();
  if (!istChef) return null;
  const reiter = [
    { pfad: "/artikel", text: "Artikel", unter: "Material", icon: Package },
    { pfad: "/leistungen", text: "Leistungen", unter: "mit Montagezeit", icon: ListChecks },
  ];
  return (
    <nav className="grid grid-cols-2 gap-2 sm:flex" aria-label="Katalog">
      {reiter.map(({ pfad, text, unter, icon: I }) => {
        const aktiv = pathname.startsWith(pfad);
        return (
          <Link key={pfad} to={pfad} replace aria-current={aktiv ? "page" : undefined}
            className={cn("flex h-12 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors",
              aktiv ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
            <I className="h-4 w-4 shrink-0" />
            <span className="min-w-0 leading-tight">{text}<span className="block text-xs font-normal opacity-80">{unter}</span></span>
          </Link>
        );
      })}
    </nav>
  );
}
