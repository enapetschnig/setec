import type { StatusEintrag } from "@/lib/types";

/** Kunden-Lieferschein: Entwurf → abgeschlossen (Lager gebucht) → unterschrieben */
export type KlsStatus = "entwurf" | "fertig" | "unterschrieben";

export const KLS_STATUS: Record<KlsStatus, StatusEintrag> = {
  entwurf: { ton: "cyan", text: "Entwurf" },
  fertig: { ton: "blau", text: "Abgeschlossen" },
  unterschrieben: { ton: "gruen", text: "Unterschrieben" },
};

export function klsStatus(l: { status: string; unterschrift_pfad: string | null }): KlsStatus {
  if (l.status !== "fertig") return "entwurf";
  return l.unterschrift_pfad ? "unterschrieben" : "fertig";
}
