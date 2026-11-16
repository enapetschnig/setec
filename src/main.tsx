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

// Link aus der Mail „Passwort vergessen“: Steht die Adresse, von der aus er
// angefordert wurde, nicht in der uri_allow_list von Supabase Auth, zeigt er
// auf die nackte site_url (?token_hash=…&type=recovery). Dann hierher weiter.
{
  const q = new URLSearchParams(window.location.search);
  if (q.get("token_hash") && q.get("type") === "recovery" && window.location.pathname !== "/passwort-neu") {
    window.history.replaceState(null, "", `/passwort-neu${window.location.search}`);
  }
}

// Hauptfarbe aus kunde.config.ts anwenden, bevor die App rendert.
farbenAnwenden();

// Chrome bietet die Installation nur EINMAL kurz nach dem Laden an —
// deshalb schon hier zuhören, nicht erst im Dialog.
installationBeobachten();

// Handyansicht am PC: im Rahmen ohne Scrollbalken, wie am Handy
if (imHandyRahmen()) document.documentElement.classList.add("handyrahmen");

createRoot(document.getElementById("root")!).render(<App />);
