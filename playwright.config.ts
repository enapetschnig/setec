import { defineConfig } from "@playwright/test";
import { umgebung } from "./tests/roboter/umgebung";

// Grundtests und Probefahrten des Roboters (tests/roboter/*.spec.ts) — NUR gegen die Testumgebung
// (testumgebung.mjs start + daten). Startet die App selbst mit den Adressen der Testumgebung;
// die .env der App (echte Datenbank) wird dabei überstimmt. Die älteren *.mjs-Skripte laufen weiter mit node.
const u = umgebung();

export default defineConfig({
  testDir: "./tests/roboter",
  testMatch: "*.spec.ts",
  // Gemeinsames (Konten, Grundbestand, Firmensätze) einmal vorab — die Tests lesen es nur, damit sie parallel laufen.
  globalSetup: "./tests/roboter/vorab.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  fullyParallel: true, // jeder Test legt eigene Daten an (LAUF-Präfix), Gemeinsames nur aus vorab.ts
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: u.app,
    headless: true,
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    ...(process.env.CHROME ? { launchOptions: { executablePath: process.env.CHROME } } : {}),
  },
  webServer: {
    command: `npx vite --port ${u.port} --strictPort --host 127.0.0.1`,
    url: u.app,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: u.api, VITE_SUPABASE_KEY: u.anon, VITE_OHNE_WATCH: "1" },
  },
});
