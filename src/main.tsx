import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { farbenAnwenden } from "./kunde.config";
import { installationBeobachten } from "./lib/installieren";
import { imHandyRahmen } from "./lib/handyansicht";
import "./index.css";

// Bis 16.11.2026 hieß die App „mayr“ — Gemerktes (Sitzung, Seitenleiste,
// Belegsicherung …) einmal unter den neuen Namen übernehmen.
try {
  for (const alt of Object.keys(localStorage).filter((k) => k.startsWith("mayr."))) {
    const neu = "setec." + alt.slice(5);
    if (localStorage.getItem(neu) === null) localStorage.setItem(neu, localStorage.getItem(alt)!);
    localStorage.removeItem(alt);
  }
} catch { /* privater Modus: nichts zu übernehmen */ }

// Hauptfarbe aus kunde.config.ts anwenden, bevor die App rendert.
farbenAnwenden();

// Chrome bietet die Installation nur EINMAL kurz nach dem Laden an —
// deshalb schon hier zuhören, nicht erst im Dialog.
installationBeobachten();

// Handyansicht am PC: im Rahmen ohne Scrollbalken, wie am Handy
if (imHandyRahmen()) document.documentElement.classList.add("handyrahmen");

createRoot(document.getElementById("root")!).render(<App />);
