// 23.11.2026 · Prüfung 22.11. (H4): Eine Teilrechnung ließ sich stornieren, obwohl die Schlussrechnung sie schon
// abzog — die Stornorechnung schrieb den Betrag ein zweites Mal gut (Kunde schuldete laut Belegen zu wenig).
// Jetzt sperrt `beleg_stornieren` jede Teilrechnung mit `abgezogen_in` (Schlussrechnung fertig oder Entwurf), die App
// sagt im Storno-Fenster warum und führt zur Schlussrechnung. Storniert man die Schlussrechnung, ist die Teilrechnung
// wieder frei (Trigger `teil_freigeben_bei_storno`) und lässt sich stornieren.
import { expect, test } from "@playwright/test";
import { umgebung } from "./umgebung";
import { admin, als, anmelden, konto, LAUF, nurTestumgebung, testProjekt, wache } from "./grundtest-hilfe";

nurTestumgebung();

const U = umgebung();

test("Teilrechnung, die in der Schlussrechnung abgezogen ist, lässt sich nicht stornieren", async ({ browser }) => {
  const chef = await als(await konto("chef"));
  const p = await testProjekt("Teil-Storno");
  const kopf = { projekt_id: p.projektId, kunde_id: p.kundeId, empf_name: p.name, ust_satz: 20 };
  const beleg = async (felder: Record<string, unknown>, zeilen: Record<string, unknown>[]) => {
    const { data: b, error } = await chef.from("belege").insert({ status: "entwurf", ...kopf, ...felder }).select("id").single();
    if (error) throw error;
    // Sammel-Insert: jede Zeile mit denselben Feldern
    const { error: eP } = await chef.from("beleg_positionen").insert(zeilen.map((z, i) => ({
      beleg_id: b.id, pos: i + 1, art: "leistung", menge: 1, einheit: "Psch", quelle: null, ...z,
    })));
    if (eP) throw eP;
    return b.id as string;
  };
  const fertig = async (id: string) => {
    const { error } = await chef.rpc("beleg_fertigstellen", { p_id: id });
    if (error) throw error;
  };
  const stornos = async (id: string) => (await admin.from("belege").select("id", { count: "exact", head: true }).eq("storno_von", id)).count;

  // Angebot 1.000 netto, angenommen → 1. Teilrechnung 300 → Schlussrechnung mit Abzug
  const angebot = await beleg({ typ: "angebot", betreff: `${LAUF} Angebot` }, [{ bezeichnung: `${LAUF} Anlage`, einzelpreis: 1000 }]);
  await fertig(angebot);
  const { error: eA } = await chef.rpc("projekt_aus_angebot", { p_beleg: angebot });
  if (eA) throw eA;
  const teil = await beleg({ typ: "rechnung", teil_nr: 1, angebot_id: angebot, betreff: `${LAUF} 1. Teilrechnung` },
    [{ bezeichnung: "1. Teilrechnung: 30 %", einzelpreis: 300 }]);
  await fertig(teil);
  const schluss = await beleg({ typ: "rechnung", angebot_id: angebot, betreff: `${LAUF} Schlussrechnung` }, [
    { bezeichnung: `${LAUF} Anlage`, einzelpreis: 1000 },
    { art: "abzug", bezeichnung: "abzüglich 1. Teilrechnung", einzelpreis: -300, quelle: { zeiten: [], material: [], regie: [], teil: [teil] } },
  ]);
  // wie die App beim Speichern der Schlussrechnung (quellenBinden)
  const { data: gebunden, error: eB } = await chef.from("belege").update({ abgezogen_in: schluss }).eq("id", teil).is("abgezogen_in", null).select("id");
  if (eB) throw eB;
  expect(gebunden).toHaveLength(1);

  // Schlussrechnung noch Entwurf → gesperrt
  const r1 = await chef.rpc("beleg_stornieren", { p_id: teil });
  expect(r1.error?.message ?? "").toMatch(/Schlussrechnung/);
  // Schlussrechnung fertig → gesperrt
  await fertig(schluss);
  const r2 = await chef.rpc("beleg_stornieren", { p_id: teil });
  expect(r2.error?.message ?? "").toMatch(/Schlussrechnung/);
  expect(await stornos(teil)).toBe(0);
  const { data: t1 } = await admin.from("belege").select("status, abgezogen_in").eq("id", teil).single();
  expect(t1).toEqual({ status: "offen", abgezogen_in: schluss });

  // In der App: Storno-Fenster erklärt es und führt zur Schlussrechnung
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-AT", timezoneId: "Europe/Vienna", baseURL: U.app, serviceWorkers: "block" });
  await ctx.route(/supabase\.(co|in)\//, (r) => r.abort("blockedbyclient"));
  await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
  const page = await ctx.newPage();
  const w = wache(page);
  await anmelden(page, await konto("chef"));
  const { data: s } = await admin.from("belege").select("nummer").eq("id", schluss).single();
  await page.goto(`/belege/${teil}`);
  await page.locator("header").getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Stornieren" }).click();
  const fenster = page.getByRole("alertdialog");
  await expect(fenster).toContainText(`in der Schlussrechnung ${s!.nummer} abgezogen`);
  await expect(fenster.getByRole("button", { name: "Stornieren", exact: true })).toHaveCount(0);
  await fenster.getByRole("button", { name: "Schlussrechnung öffnen" }).click();
  await expect(page).toHaveURL(new RegExp(`/belege/${schluss}$`));
  expect(await stornos(teil)).toBe(0);
  expect(w.abstuerze).toEqual([]);
  await ctx.close();

  // Schlussrechnung storniert → Teilrechnung wieder frei → Storno geht
  const { error: eS } = await chef.rpc("beleg_stornieren", { p_id: schluss });
  if (eS) throw eS;
  const { data: t2 } = await admin.from("belege").select("abgezogen_in").eq("id", teil).single();
  expect(t2?.abgezogen_in).toBeNull();
  const r3 = await chef.rpc("beleg_stornieren", { p_id: teil });
  expect(r3.error?.message ?? null).toBeNull();
  expect(await stornos(teil)).toBe(1);
});
