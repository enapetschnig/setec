import type { ReactNode } from "react";
import { KUNDE } from "@/kunde.config";

/** Schwarzer Kopf mit Logo wie die Anmeldeseite, darunter eine Karte */
export function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="bg-marke-schwarz px-6 pb-14 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-md">
          <img src={KUNDE.logoQuerHell} alt={KUNDE.firma} className="h-16 w-auto" />
        </div>
      </div>
      <div className="relative -mt-8 flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
