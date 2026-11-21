// Grundablauf Rechte (20.11.2026): was Monteur, Lehrling und Büro sehen dürfen und was nicht —
// im Menü, auf der Seite (ProtectedRoute) und in der Datenbank (RLS), mit den anonymisierten Echtdaten.
// Chef sieht alles; Monteur/Lehrling nie Rechnungen, Eingangsrechnungen, Buchhaltung, Mitarbeiter;
// Büro hat Rechnungen und Buchhaltung, aber nicht „Mitarbeiter & Zugänge“ und kann sich nicht zum Chef machen.
import { expect, test } from "@playwright/test";
import { als, anmelden, handySeite, konto, nurTestumgebung, wache } from "./grundtest-hilfe";

nurTestumgebung();

const BUERO_SEITEN = ["/rechnungen", "/angebote", "/eingang", "/buchhaltung", "/mitarbeiter", "/offene-posten"];

async function anzahl(db: Awaited<ReturnType<typeof als>>, tabelle: string) {
  const { count, error } = await db.from(tabelle).select("id", { count: "exact", head: true });
  return error ? -1 : count ?? 0;
}

test("Chef: sieht Rechnungen, Eingang und Buchhaltung der Echtdaten", async ({ page }) => {
  const chef = await als(await konto("chef"));
  expect(await anzahl(chef, "belege"), "Belege").toBeGreaterThan(0);
  expect(await anzahl(chef, "eingangsrechnungen")).toBeGreaterThan(0);
  expect((await chef.rpc("hat_recht", { p_recht: "mitarbeiter" })).data).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, await konto("chef"));
  for (const pfad of BUERO_SEITEN) {
    await page.goto(pfad);
    await expect(page.locator("h1:visible").first(), pfad).toBeVisible();
    await expect(page.getByText(/Nur für den Chef|nicht freigegeben/), pfad).toHaveCount(0);
  }
  expect(w.abstuerze).toEqual([]);
  expect(w.abgelehnt).toEqual([]);
});

for (const rolle of ["monteur", "lehrling"] as const) {
  test(`${rolle}: keine Büro-Bereiche — weder im Menü noch auf der Seite noch in der Datenbank`, async ({ browser }) => {
    const k = await konto(rolle);
    const db = await als(k);
    expect(await anzahl(db, "belege"), "Belege lesen").toBe(0);
    expect(await anzahl(db, "eingangsrechnungen"), "Eingangsrechnungen lesen").toBe(0);
    expect(await anzahl(db, "rechnung_kategorien"), "Buchhaltungs-Kategorien lesen").toBe(0);
    const neu = await db.from("belege").insert({ typ: "rechnung", empf_name: "ZZGT darf nicht" }).select("id");
    expect(neu.error, "Rechnung anlegen muss scheitern").not.toBeNull();
    // Selbst zum Chef machen geht nicht
    await db.from("profiles").update({ rolle: "chef" }).eq("id", k.id);
    expect((await db.rpc("ist_chef")).data).toBe(false);

    const page = await handySeite(browser);
    const w = wache(page);
    await anmelden(page, k);
    await expect(page.getByText("Stunden öffnen").first()).toBeVisible();
    for (const karte of ["Rechnungen öffnen", "Angebote öffnen", "Eingangsrechnungen öffnen", "Buchhaltung öffnen"]) {
      await expect(page.getByText(karte), karte).toHaveCount(0);
    }
    for (const pfad of BUERO_SEITEN) {
      await page.goto(pfad);
      await expect(page.getByText(/Nur für den Chef|Für deine Rolle nicht freigegeben/), pfad).toBeVisible();
    }
    expect(w.abstuerze).toEqual([]);
    await page.context().close();
  });
}

test("Lehrling: kein Projekt anlegen, aber Regiebericht schreiben", async () => {
  const db = await als(await konto("lehrling"));
  expect((await db.rpc("hat_recht", { p_recht: "projekte_anlegen" })).data).toBe(false);
  expect((await db.rpc("hat_recht", { p_recht: "regie" })).data).toBe(true);
  const p = await db.from("projekte").insert({ name: "ZZGT Lehrling darf nicht" }).select("id");
  expect(p.error, "Projekt anlegen muss scheitern").not.toBeNull();
});

test("Büro: Rechnungen und Buchhaltung ja, Mitarbeiter & Zugänge nein", async ({ page }) => {
  const k = await konto("buero");
  const db = await als(k);
  expect(await anzahl(db, "belege")).toBeGreaterThan(0);
  expect(await anzahl(db, "rechnung_kategorien")).toBeGreaterThan(0);
  expect((await db.rpc("hat_recht", { p_recht: "mitarbeiter" })).data).toBe(false);
  expect((await db.rpc("ist_voller_chef")).data).toBe(false);
  // Büro darf sich nicht selbst die volle Chef-Rolle geben
  const { data: chefRolle } = await db.from("rollen").select("id").eq("schluessel", "chef").single();
  await db.from("profiles").update({ rolle_id: chefRolle?.id ?? null }).eq("id", k.id);
  expect((await db.rpc("ist_voller_chef")).data).toBe(false);

  await page.setViewportSize({ width: 1440, height: 900 });
  const w = wache(page);
  await anmelden(page, k);
  for (const pfad of ["/rechnungen", "/buchhaltung", "/eingang"]) {
    await page.goto(pfad);
    await expect(page.locator("h1:visible").first(), pfad).toBeVisible();
    await expect(page.getByText(/Nur für den Chef|nicht freigegeben/), pfad).toHaveCount(0);
  }
  await page.goto("/mitarbeiter");
  await expect(page.getByText("Für deine Rolle nicht freigegeben")).toBeVisible();
  await expect(page.locator("nav[data-menue-gruppe]").getByRole("link", { name: "Mitarbeiter & Zugänge", exact: true })).toHaveCount(0);
  expect(w.abstuerze).toEqual([]);
});
