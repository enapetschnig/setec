// Probefahrt 18.11.2026 (Prüfung „Geld“: M2, M3, L1, L7, L8, Vorlagen) — Listen, Summen, Übergabe.
// Rechnet jede Zahl selbst nach (aus den eigenen Testdaten) und vergleicht mit Oberfläche und Datenbank:
// - Kanzlei-Übergabe: nur freigegebene Eingangsrechnungen, keine abgelehnten, keine aus Odoo;
//   Warnung „… noch zu prüfen“, Zeile „… aus Odoo gehen nicht mit“; „Als übergeben merken“ merkt nur die richtige;
//   fibu_uebergeben lehnt zu prüfende, abgelehnte, Odoo-Rechnungen, Altrechnungen und Rollen ohne Buchhaltung ab
// - „Bezahlt {Jahr}“ nach dem Zahltag: Rechnungen (Filter, Zahl, Kennzahl, Monatsbänder), Kunde, Eingang
// - Offenes über alle Jahre (Zuzuordnen), Filter „Skonto läuft ab“, Startseite: Zahl = Einträge der Zielliste
// - Summen ohne Abgelehnte: Eingang (Fuß, Monatsband), Lieferant, Buchhaltung → Eingang
// - odoo_import: lesen nur mit dem Recht des Bereichs
// - Angebot aus Vorlage mit gelöschten Artikeln/Leistungen speichert (Verweis weg, Text und Preis bleiben),
//   auch wenn der Artikel erst während der Bearbeitung gelöscht wird
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank — braucht die
// Migrationen 20261118160000 und 20261118160100:
//   APP_URL=http://127.0.0.1:55110 API_URL=http://127.0.0.1:55100 ANON_KEY=… SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-18-geld-listen-uebergabe.mjs
// Legt selbst an (alles „ZZ“), räumt danach auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
const ANON_KEY = process.env.ANON_KEY ?? process.env.VITE_SUPABASE_KEY;
const BILDER = process.env.BILDER ?? "tests/bilder";
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("APP_URL, API_URL, ANON_KEY und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };
const pruef = (e, was) => { if (e) throw new Error(`${was}: ${e.message}`); };
const EUR = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const eur = (n) => EUR.format(n).replace(/ /g, " ");
const norm = (s) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const rund = (n) => Math.round(n * 100) / 100;
const summe = (l) => rund(l.reduce((s, x) => s + x.brutto, 0));

// Datum wie die App: lokaler Tag
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const heute = iso(new Date());
const tage = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const JAHR = new Date().getFullYear(), VJ = JAHR - 1;
const vm = new Date(); vm.setDate(1); vm.setMonth(vm.getMonth() - 1);
const VM = `${vm.getFullYear()}-${pad(vm.getMonth() + 1)}`;
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monatText = (ym) => `${MONATE[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

async function konto(email, rolle, vorname) {
  const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email);
  // Wer eine fertige Rechnung geschrieben hat, lässt sich nicht löschen (festgeschrieben) → wiederverwenden
  let id = alt && (await admin.auth.admin.deleteUser(alt.id)).error ? alt.id : null;
  if (id) await admin.auth.admin.updateUserById(id, { password: PW });
  else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    pruef(error, "Konto");
    id = data.user.id;
  }
  await admin.from("profiles").update({ aktiv: true, rolle, rolle_id: null, vorname, nachname: "ZZ", passwort_neu: false }).eq("id", id);
  return id;
}
async function als(email) {
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  pruef(error, `Anmelden ${email}`);
  return c;
}

const ids = {};
const angelegt = { belege: [], eingang: [], kunden: [], projekte: [], bestellungen: [], artikel: [], leistungen: [], vorlagen: [], kategorien: [], rollen: [], odoo: [] };
const fehler = [];
let browser;

try {
  // ── Konten: Chef, Büro (eingebaut), Rolle ohne Eingang, Rolle ohne Buchhaltung, Monteur ──
  ids.chef = await konto("zz-geld-chef@test.local", "chef", "Stefan");
  ids.buero = await konto("zz-geld-buero@test.local", "monteur", "Melanie");
  ids.ohneEingang = await konto("zz-geld-ohne-eingang@test.local", "monteur", "Otto");
  ids.ohneBuch = await konto("zz-geld-ohne-buch@test.local", "monteur", "Klaus");
  ids.monteur = await konto("zz-geld-monteur@test.local", "monteur", "Max");
  const chef = await als("zz-geld-chef@test.local");
  const { data: rollen } = await admin.from("rollen").select("id, schluessel");
  const r1 = await chef.from("rollen").insert({ name: "ZZ Geld ohne Eingang", basis: "chef", rechte: ["rechnungen", "buchhaltung"] }).select("id").single();
  const r2 = await chef.from("rollen").insert({ name: "ZZ Geld ohne Buchhaltung", basis: "chef", rechte: ["rechnungen", "eingang"] }).select("id").single();
  pruef(r1.error ?? r2.error, "Rollen");
  angelegt.rollen.push(r1.data.id, r2.data.id);
  pruef((await chef.from("profiles").update({ rolle_id: rollen.find((r) => r.schluessel === "buero").id }).eq("id", ids.buero)).error, "Rolle Büro");
  pruef((await chef.from("profiles").update({ rolle_id: r1.data.id }).eq("id", ids.ohneEingang)).error, "Rolle ohne Eingang");
  pruef((await chef.from("profiles").update({ rolle_id: r2.data.id }).eq("id", ids.ohneBuch)).error, "Rolle ohne Buchhaltung");
  const buero = await als("zz-geld-buero@test.local");
  const ohneEingang = await als("zz-geld-ohne-eingang@test.local");
  const ohneBuch = await als("zz-geld-ohne-buch@test.local");
  const monteur = await als("zz-geld-monteur@test.local");

  // ── Testdaten ────────────────────────────────────────────────────────
  const { data: kunden, error: eK } = await admin.from("kunden").insert([
    { name: "ZZ Geld Huber", art: "kunde" }, { name: "ZZ Geld Lieferant", art: "lieferant" },
  ]).select("id, name");
  pruef(eK, "Kontakte");
  const huber = kunden[0].id, lieferant = kunden[1].id;
  angelegt.kunden.push(huber, lieferant);

  const beleg = (x) => ({
    id: crypto.randomUUID(), typ: "rechnung", status: "offen", altbestand: false, kunde_id: huber, empf_name: "ZZ Geld Huber",
    faellig_am: null, gueltig_bis: null, angebot_id: null, betreff: "ZZ Geld", ...x,
  });
  const RA = beleg({ nummer: "ZZRE-A", datum: `${VJ}-12-15`, netto: 1000, ust: 200, brutto: 1200, faellig_am: `${VJ}-12-29`, zahlung: `${JAHR}-01-08` });
  const RB = beleg({ nummer: "ZZRE-B", datum: `${JAHR}-03-01`, netto: 250.42, ust: 50.08, brutto: 300.5, faellig_am: `${JAHR}-03-15`, zahlung: `${JAHR}-03-20` });
  const RC = beleg({ nummer: "ZZRE-C", datum: `${VJ}-11-05`, netto: 400, ust: 80, brutto: 480, faellig_am: `${VJ}-11-19`, zahlung: `${VJ}-11-30` });
  const RD = beleg({ nummer: "ZZRE-D", datum: `${JAHR}-06-10`, netto: 100, ust: 20, brutto: 120, faellig_am: `${JAHR}-06-24`, teilzahlung: 20 });
  const RE = beleg({ nummer: "ZZ-ALT-1", altbestand: true, datum: `${VM}-12`, netto: 41.67, ust: 8.33, brutto: 50, faellig_am: `${VM}-26` });
  const AN1 = beleg({ typ: "angebot", nummer: "ZZAN-1", datum: tage(-3), gueltig_bis: tage(30), netto: 1000, ust: 200, brutto: 1200 });
  const AN2 = beleg({ typ: "angebot", nummer: "ZZAN-2", datum: tage(-3), gueltig_bis: tage(30), netto: 2000, ust: 400, brutto: 2400 });
  const RV = beleg({ status: "entwurf", nummer: null, datum: heute, netto: 2000, ust: 400, brutto: 2400, angebot_id: AN2.id });
  const belege = [RA, RB, RC, RD, RE, AN1, AN2, RV];
  pruef((await admin.from("belege").insert(belege.map(({ zahlung, teilzahlung, ...b }) => b))).error, "Belege");
  angelegt.belege.push(...belege.map((b) => b.id));
  const zahlungen = [
    ...belege.filter((b) => b.zahlung).map((b) => ({ beleg_id: b.id, datum: b.zahlung, betrag: b.brutto, art: "zahlung", notiz: "ZZ Geld" })),
    { beleg_id: RD.id, datum: `${JAHR}-07-01`, betrag: RD.teilzahlung, art: "zahlung", notiz: "ZZ Geld" },
  ];
  pruef((await admin.from("zahlungen").insert(zahlungen)).error, "Zahlungen");
  const { data: bz } = await admin.from("belege").select("id, status, bezahlt_am").in("id", [RA.id, RB.id, RC.id, RD.id]);
  ok(bz.filter((b) => b.status === "bezahlt").length === 3 && bz.find((b) => b.id === RA.id)?.bezahlt_am === `${JAHR}-01-08`, "Zahlungen: drei bezahlt, Zahltag gesetzt");

  const eing = (x) => ({
    id: crypto.randomUUID(), lieferant: "ZZ Geld Lieferant", faellig_am: null, kategorie: "material", betrieb: true, bezahlt_am: null,
    freigabe: "freigegeben", abgelehnt_grund: null, skonto_prozent: null, skonto_bis: null, lastschrift: false, ust_satz: 20, ...x,
  });
  const EA = eing({ nummer: "ZZER-A", datum: `${VJ}-12-20`, netto: 200, ust: 40, brutto: 240, bezahlt_am: `${JAHR}-01-10` });
  const EB = eing({ nummer: "ZZER-B", datum: `${JAHR}-02-01`, netto: 100, ust: 20, brutto: 120, bezahlt_am: `${JAHR}-02-15` });
  const EC = eing({ nummer: "ZZER-C", datum: `${VJ}-10-01`, netto: 50, ust: 10, brutto: 60, bezahlt_am: `${VJ}-10-20` });
  const ED = eing({ nummer: "ZZER-D", datum: `${VJ}-09-01`, netto: 30, ust: 6, brutto: 36, freigabe: "offen", betrieb: false });
  const EF = eing({ nummer: "ZZER-F", datum: `${VM}-05`, netto: 500, ust: 100, brutto: 600, bezahlt_am: `${VM}-10` });
  const EG = eing({ nummer: "ZZER-G", datum: `${VM}-06`, netto: 200, ust: 40, brutto: 240, freigabe: "offen" });
  const EH = eing({ nummer: "ZZER-H", datum: `${VM}-07`, netto: 832.5, ust: 166.5, brutto: 999, freigabe: "abgelehnt", abgelehnt_grund: "ZZ falsch" });
  const EI = eing({ nummer: "ZZER-I", datum: `${VM}-08`, netto: 1500, ust: 300, brutto: 1800, bezahlt_am: `${VM}-09`, odoo: true });
  const EJ = eing({ nummer: "ZZER-J", datum: heute, netto: 833.33, ust: 166.67, brutto: 1000, faellig_am: tage(30), skonto_prozent: 3, skonto_bis: tage(2) });
  const EK = eing({ nummer: "ZZER-K", datum: heute, netto: 416.67, ust: 83.33, brutto: 500, faellig_am: tage(30), skonto_prozent: 2, skonto_bis: tage(2), lastschrift: true, lastschrift_tag: 28 });
  const eingang = [EA, EB, EC, ED, EF, EG, EH, EI, EJ, EK];
  pruef((await admin.from("eingangsrechnungen").insert(eingang.map(({ odoo, lastschrift_tag, ...r }) => ({ ...r, lastschrift_tag: lastschrift_tag ?? null })))).error, "Eingang");
  angelegt.eingang.push(...eingang.map((r) => r.id));

  const kat = await admin.from("rechnung_kategorien").insert({ name: "ZZ Geld Kategorie Odoo", richtung: "eingang", art: "sonstiges" }).select("id").single();
  pruef(kat.error, "Kategorie");
  angelegt.kategorien.push(kat.data.id);
  const odoo = [
    { tabelle: "eingangsrechnungen", zeile_id: EI.id, extern: "BILL/ZZ/1" },
    { tabelle: "belege", zeile_id: RE.id, extern: "ZZ-ALT-1" },
    { tabelle: "kunden", zeile_id: huber, extern: "ZZ Geld Huber" },
    { tabelle: "rechnung_kategorien", zeile_id: kat.data.id, extern: "ZZ Kat" },
    { tabelle: "zz_unbekannt", zeile_id: crypto.randomUUID(), extern: "ZZ ?" },
  ];
  pruef((await admin.from("odoo_import").insert(odoo)).error, "odoo_import");
  angelegt.odoo.push(...odoo.map((o) => o.zeile_id));

  // Förderfristen: zwei in 30 Tagen, eine später; Bestellungen: eine unterwegs, ein Entwurf
  const { data: pr, error: eP } = await admin.from("projekte").insert([
    { name: "ZZ Geld PV Frist 1", foerder_status: "eingereicht", foerder_frist: tage(10) },
    { name: "ZZ Geld PV Frist 2", foerder_status: "zugesagt", foerder_frist: tage(20) },
    { name: "ZZ Geld PV später", foerder_status: "zugesagt", foerder_frist: tage(90) },
  ]).select("id");
  pruef(eP, "Projekte");
  angelegt.projekte.push(...pr.map((p) => p.id));
  // Bestellungen brauchen ein Lieferziel; eine bestellte lässt sich nie mehr löschen (nur stornieren) und
  // hält ihr Lieferziel fest → eigenes Lager „ZZ Geld Lager“, das nach dem Lauf stillgelegt liegen bleibt
  let lager = (await admin.from("lagerorte").select("id").eq("name", "ZZ Geld Lager").maybeSingle()).data;
  if (!lager) {
    const l = await admin.from("lagerorte").insert({ name: "ZZ Geld Lager", art: "lager" }).select("id").single();
    pruef(l.error, "Lager");
    lager = l.data;
  }
  const { data: be, error: eB } = await admin.from("bestellungen").insert([
    { lieferant: "ZZ Geld Lieferant", status: "bestellt", lagerort_id: lager.id, notiz: "ZZ Geld" },
    { lieferant: "ZZ Geld Lieferant", status: "entwurf", lagerort_id: lager.id, notiz: "ZZ Geld" },
  ]).select("id, nummer, status");
  pruef(eB, "Bestellungen");
  angelegt.bestellungen.push(...be.map((b) => b.id));
  const bestNr = { bestellt: be.find((b) => b.status === "bestellt").nummer, entwurf: be.find((b) => b.status === "entwurf").nummer };
  // Zahl aus der Datenbank (stornierte Reste früherer Läufe zählen nicht)
  const bestStatus = (await admin.from("bestellungen").select("status")).data ?? [];
  const unterwegsDb = bestStatus.filter((b) => b.status === "bestellt" || b.status === "teilgeliefert").length;
  const offenDb = unterwegsDb + bestStatus.filter((b) => b.status === "entwurf").length;

  // ── Erwartung, selbst gerechnet ──────────────────────────────────────
  const rechnungen = [RA, RB, RC, RD, RE].map((r) => ({ ...r, bezahlt_am: r.zahlung ?? null }));
  const bezahltJahr = rechnungen.filter((r) => r.bezahlt_am?.startsWith(String(JAHR)));
  const offenePosten = rechnungen.filter((r) => !r.zahlung);
  const opSumme = rund(offenePosten.reduce((s, r) => s + r.brutto - (r.teilzahlung ?? 0), 0));
  const opUeber = offenePosten.filter((r) => r.faellig_am < heute).length;
  const eBezahltJahr = eingang.filter((r) => r.bezahlt_am?.startsWith(String(JAHR)));
  const eImJahr = eingang.filter((r) => r.datum.startsWith(String(JAHR)));
  const eZaehlt = (l) => l.filter((r) => r.freigabe !== "abgelehnt");
  const eMonat = eingang.filter((r) => r.datum.startsWith(VM));
  const eMit = eMonat.filter((r) => r.freigabe === "freigegeben" && !r.odoo);
  const skonto = eingang.filter((r) => !r.bezahlt_am && !r.lastschrift && r.freigabe !== "abgelehnt" && r.skonto_prozent && r.skonto_bis >= heute && r.skonto_bis <= tage(3));
  const zuordnen = eingang.filter((r) => !r.betrieb);
  const pruefen = eingang.filter((r) => r.freigabe === "offen" && !r.bezahlt_am);
  const ueberweisen = eingang.filter((r) => r.freigabe === "freigegeben" && !r.bezahlt_am && !r.lastschrift);
  ok(bezahltJahr.map((r) => r.nummer).join() === "ZZRE-A,ZZRE-B" && eBezahltJahr.length === 4 && eMit.length === 1, "Erwartung gerechnet");

  // ── Datenbank: fibu_uebergeben, odoo_import ──────────────────────────
  const ueber = (e, b = []) => ({ p_von: `${VM}-01`, p_bis: `${VM}-28`, p_format: "bmd", p_belege: b, p_eingaenge: e });
  const m1 = await monteur.rpc("fibu_uebergeben", ueber([EF.id]));
  ok(/Nur der Chef/.test(m1.error?.message ?? ""), `Monteur übergibt nicht (${m1.error?.message})`);
  const m2 = await ohneBuch.rpc("fibu_uebergeben", ueber([EF.id]));
  ok(/Buchhaltung ist für deine Rolle/.test(m2.error?.message ?? ""), `Rolle ohne Buchhaltung übergibt nicht (${m2.error?.message})`);
  const m3 = await chef.rpc("fibu_uebergeben", ueber([EG.id]));
  ok(/freigegebene/.test(m3.error?.message ?? ""), `zu prüfende geht nicht an die Kanzlei (${m3.error?.message})`);
  const m4 = await chef.rpc("fibu_uebergeben", ueber([EH.id]));
  ok(/freigegebene/.test(m4.error?.message ?? ""), `abgelehnte geht nicht an die Kanzlei (${m4.error?.message})`);
  const m5 = await chef.rpc("fibu_uebergeben", ueber([EF.id, EI.id]));
  ok(/Odoo/.test(m5.error?.message ?? ""), `Odoo-Eingangsrechnung geht nicht an die Kanzlei (${m5.error?.message})`);
  const m6 = await chef.rpc("fibu_uebergeben", ueber([], [RE.id]));
  ok(/Altrechnungen/.test(m6.error?.message ?? ""), `Altrechnung geht nicht an die Kanzlei (${m6.error?.message})`);
  const { count: nachAblehnung } = await admin.from("fibu_uebergaben").select("id", { count: "exact", head: true }).in("erstellt_von", Object.values(ids));
  ok(nachAblehnung === 0, "abgelehnte Aufrufe merken nichts");
  const m7 = await buero.rpc("fibu_uebergeben", ueber([EF.id]));
  ok(!m7.error && !!m7.data, `Büro (mit Buchhaltung) übergibt die freigegebene${m7.error ? `: ${m7.error.message}` : ""}`);
  if (m7.data) await admin.from("fibu_uebergaben").delete().eq("id", m7.data);

  const sicht = async (c) => {
    const { data } = await c.from("odoo_import").select("tabelle").in("zeile_id", angelegt.odoo);
    return (data ?? []).map((x) => x.tabelle).sort().join(",");
  };
  ok(await sicht(chef) === "belege,eingangsrechnungen,kunden,rechnung_kategorien,zz_unbekannt", `odoo_import Chef: alles (${await sicht(chef)})`);
  ok(await sicht(buero) === "belege,eingangsrechnungen,kunden,rechnung_kategorien", `odoo_import Büro: ohne Unbekanntes (${await sicht(buero)})`);
  ok(await sicht(ohneEingang) === "belege,kunden,rechnung_kategorien", `odoo_import ohne Eingang: keine Eingangsrechnungen (${await sicht(ohneEingang)})`);
  ok(await sicht(ohneBuch) === "belege,eingangsrechnungen,kunden", `odoo_import ohne Buchhaltung: keine Kategorien (${await sicht(ohneBuch)})`);
  ok(await sicht(monteur) === "", "odoo_import Monteur: nichts");

  // ── Vorlage mit Artikeln/Leistungen, die es nicht mehr gibt ──────────
  const { data: art, error: eA } = await admin.from("artikel").insert([
    { bezeichnung: "ZZ Geld Speicher 10 kWh", einheit: "Stk", vk_preis: 4100, ek_preis: 3000 },
    { bezeichnung: "ZZ Geld Altmodul", einheit: "Stk", vk_preis: 120, ek_preis: 80 },
  ]).select("id");
  pruef(eA, "Artikel");
  angelegt.artikel.push(...art.map((a) => a.id));
  const { data: lei, error: eL } = await admin.from("leistungen").insert({ kurztext: "ZZ Geld Alte Montage", preis: 90, einheit: "h" }).select("id").single();
  pruef(eL, "Leistung");
  angelegt.leistungen.push(lei.id);
  const vp = (x) => ({ art: "artikel", bezeichnung: "", langtext: null, menge: 1, einheit: "Stk", einzelpreis: 0, ek_preis: null, minuten: null, artikel_id: null, leistung_id: null, ...x });
  const { data: vorlage, error: eV } = await admin.from("angebot_vorlagen").insert({
    name: "ZZ Geld Vorlage", betreff: "ZZ Geld Vorlage Betreff", netto: 0,
    positionen: [
      vp({ art: "titel", bezeichnung: "ZZ Speicher" }),
      vp({ bezeichnung: "ZZ Geld Speicher 10 kWh", einzelpreis: 4100, ek_preis: 3000, artikel_id: art[0].id }),
      vp({ bezeichnung: "ZZ Geld Altmodul", menge: 10, einzelpreis: 120, ek_preis: 80, artikel_id: art[1].id }),
      vp({ art: "leistung", bezeichnung: "ZZ Geld Alte Montage", menge: 3, einheit: "h", einzelpreis: 90, minuten: 60, leistung_id: lei.id }),
      vp({ art: "pauschale", bezeichnung: "ZZ Geld Netzanmeldung", einheit: "Psch", einzelpreis: 290 }),
    ],
  }).select("id").single();
  pruef(eV, "Vorlage");
  angelegt.vorlagen.push(vorlage.id);
  // Altmodul und Montage sind gelöscht, seit die Vorlage gespeichert wurde
  pruef((await admin.from("artikel").delete().eq("id", art[1].id)).error, "Artikel löschen");
  pruef((await admin.from("leistungen").delete().eq("id", lei.id)).error, "Leistung löschen");

  // ── Oberfläche ───────────────────────────────────────────────────────
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  // 409 auf beleg_positionen = Verweis auf einen gelöschten Artikel → gewollt, dann der zweite Versuch (gezählt, kein Fehler)
  let verweis409 = 0;
  const anmelden = async (viewport) => {
    const ctx = await browser.newContext({ viewport, locale: "de-AT" });
    await ctx.addInitScript(() => localStorage.setItem("setec.installhinweis", "x"));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("response", (r) => {
      if (!r.url().includes("/rest/v1/") || r.status() < 400) return;
      if (r.status() === 409 && r.url().includes("/rest/v1/beleg_positionen")) verweis409++;
      else fehler.push(`${r.status()} ${r.url().split("?")[0]}`);
    });
    await page.goto(`${APP_URL}/auth`);
    await page.locator("#benutzer").fill("zz-geld-chef@test.local");
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    return page;
  };
  const page = await anmelden({ width: 1440, height: 900 });
  const gehe = async (pfad, warten) => {
    await page.goto(`${APP_URL}${pfad}`);
    await page.getByText(warten).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
  };
  // Zahl am Filterknopf „Text 3“ (in der Gruppe, sonst auf der ganzen Seite); fehlt der Knopf: 0
  const chipZahl = async (gruppe, text) => {
    const bereich = gruppe ? page.getByRole("group", { name: gruppe }) : page;
    const knopf = bereich.getByRole("button", { name: new RegExp(`^${text}\\s+\\d+$`) });
    if (!(await knopf.count())) return 0;
    return Number(norm(await knopf.first().innerText()).match(/(\d+)$/)?.[1]);
  };
  const text = async () => norm(await page.locator("main").first().innerText());
  const zeilen = async (muster) => page.getByText(muster).count();

  // Startseite: jede Zahl mit der Zielliste vergleichen (gerechnet aus den Testdaten)
  await gehe("/", /Zu erledigen/);
  // die Punkte kommen aus vielen Abfragen — warten, bis die letzte da ist
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText("Förderfristen in 30 Tagen").first().waitFor({ timeout: 20000 }).catch(() => {});
  const alleZeigen = page.getByRole("button", { name: /Alle \d+ anzeigen/ });
  if (await alleZeigen.count()) await alleZeigen.click();
  await page.waitForTimeout(400);
  const start = await text();
  await page.screenshot({ path: `${BILDER}/geld-start-pc.png` });
  const punkte = [
    [`${opUeber} Rechnungen sind überfällig`, "/offene-posten?filter=ueberfaellig"],
    [`${offenePosten.length} offene Rechnungen · ${eur(opSumme)}`, "/offene-posten?filter=alle"],
    ["1 Angebot wartet auf Antwort", "/angebote?filter=offen"],
    ["1 Rechnung noch Entwurf", "/rechnungen?filter=entwurf"],
    [`${skonto.length} Rechnung: Skonto läuft in 3 Tagen ab`, "/eingang?filter=skonto"],
    [`${pruefen.length} Eingangsrechnungen prüfen und freigeben`, "/eingang"],
    [`${ueberweisen.length} Rechnung überweisen · ${eur(970)}`, "/eingang?filter=freigegeben"],
    [`${zuordnen.length} Eingangsrechnung zuordnen`, "/eingang?filter=zuzuordnen"],
    [`${unterwegsDb} ${unterwegsDb === 1 ? "Bestellung" : "Bestellungen"} unterwegs`, "/bestellungen?filter=unterwegs"],
    ["2 Förderfristen in 30 Tagen", "/projekte?filter=foerderung&frist=30"],
  ];
  for (const [t, ziel] of punkte) {
    ok(start.includes(t), `Startseite: „${t}“`);
    const link = page.locator(`a[href="${ziel}"]`);
    ok(await link.count() > 0, `Startseite: „${t}“ führt nach ${ziel}`);
  }

  // Zielliste je Punkt: dieselbe Zahl
  await gehe("/offene-posten?filter=ueberfaellig", /ZZRE-D/);
  ok(await chipZahl(null, "Überfällig") === opUeber && await chipZahl(null, "Alle offenen") === offenePosten.length,
    `Offene Posten: Überfällig ${opUeber}, Alle offenen ${offenePosten.length}`);
  ok((await text()).includes(`Offen ${eur(opSumme)}`), `Offene Posten: Offen ${eur(opSumme)} (wie Startseite, nach Teilzahlung)`);
  await gehe("/angebote?filter=offen", /ZZAN-1/);
  ok(await chipZahl("Status", "Ohne Antwort") === 1 && await zeilen("ZZAN-2") === 0, "Angebote: Ohne Antwort 1 (verrechnetes nicht)");
  await gehe("/rechnungen?filter=entwurf", /Entwurf/);
  ok(await chipZahl("Status", "Entwürfe") === 1, "Rechnungen: Entwürfe 1");
  await gehe("/eingang?filter=skonto", /ZZER-J/);
  ok(await chipZahl("Status", "Skonto läuft ab") === skonto.length && await zeilen("ZZER-K") === 0, `Eingang: Skonto läuft ab ${skonto.length}, Lastschrift nicht`);
  ok((await text()).includes(`${eur(30)} Skonto bis`), "Eingang Skonto: Skonto-Betrag in der Zeile");
  await gehe("/eingang", /ZZER-G/);
  ok(await chipZahl("Status", "Zu prüfen") === pruefen.length && await zeilen("ZZER-D") === 1, `Eingang: Zu prüfen ${pruefen.length} (auch aus ${VJ})`);
  await gehe("/eingang?filter=freigegeben", /ZZER-J/);
  ok(await chipZahl("Status", "Zu überweisen") === ueberweisen.length, `Eingang: Zu überweisen ${ueberweisen.length}`);
  await gehe("/eingang?filter=zuzuordnen", /ZZER-D/);
  ok(await chipZahl("Status", "Zuzuordnen") === zuordnen.length, `Eingang: Zuzuordnen ${zuordnen.length} — Rechnung aus ${VJ} sichtbar`);
  ok((await text()).includes("Offenes aus allen Jahren"), "Eingang Zuzuordnen: „Offenes aus allen Jahren“");
  await gehe("/bestellungen?filter=unterwegs", bestNr.bestellt);
  ok(await chipZahl(null, "Unterwegs") === unterwegsDb && await chipZahl(null, "Offen") === offenDb,
    `Bestellungen: Unterwegs ${unterwegsDb} (ohne Entwurf), Offen ${offenDb}`);
  ok(await zeilen(bestNr.entwurf) === 0, "Bestellungen unterwegs: der Entwurf nicht");
  await gehe("/projekte?filter=foerderung&frist=30", /ZZ Geld PV Frist 1/);
  ok(await zeilen("ZZ Geld PV Frist 2") > 0 && await zeilen("ZZ Geld PV später") === 0 && (await text()).includes("Frist in 30 Tagen 2"), "Projekte: Frist in 30 Tagen 2, die spätere nicht");

  // Rechnungen: Bezahlt {Jahr} nach dem Zahltag
  await gehe("/rechnungen?filter=bezahlt", /ZZRE-B/);
  const rText = await text();
  ok(await chipZahl("Status", "Bezahlt") === bezahltJahr.length, `Rechnungen: Filter Bezahlt ${bezahltJahr.length}`);
  ok(await zeilen("ZZRE-A") > 0 && await zeilen("ZZRE-C") === 0, `Rechnungen: Dezember-${VJ}-Rechnung, im Jänner bezahlt, steht unter ${JAHR}; ${VJ} bezahlte nicht`);
  ok(rText.includes(`Bezahlt ${JAHR} ${eur(summe(bezahltJahr))} ${bezahltJahr.length} Rechnungen · brutto`), `Rechnungen: Kennzahl Bezahlt ${JAHR} = ${eur(summe(bezahltJahr))}`);
  ok(rText.includes(`${bezahltJahr.length} Rechnungen · ${eur(summe(bezahltJahr))} brutto`), "Rechnungen: Fuß = Kennzahl");
  const jaenner = page.getByRole("region", { name: `Jänner ${JAHR}` });
  ok(await jaenner.count() === 1 && norm(await jaenner.innerText()).includes("ZZRE-A"), `Rechnungen: Band „Jänner ${JAHR}“ (Zahlmonat) hat ZZRE-A`);
  await page.screenshot({ path: `${BILDER}/geld-rechnungen-bezahlt-pc.png` });
  await page.getByRole("button", { name: /Archiv/ }).click();
  await page.getByRole("menuitem", { name: String(VJ) }).click();
  await page.waitForTimeout(600);
  const vjBezahlt = rechnungen.filter((r) => r.bezahlt_am?.startsWith(String(VJ)));
  ok(await chipZahl("Status", "Bezahlt") === vjBezahlt.length && await zeilen("ZZRE-A") === 0 && await zeilen("ZZRE-C") > 0, `Rechnungen ${VJ}: Bezahlt ${vjBezahlt.length} (ZZRE-C)`);
  ok((await text()).includes(`Bezahlt ${VJ} ${eur(summe(vjBezahlt))}`), `Rechnungen: Kennzahl Bezahlt ${VJ} = ${eur(summe(vjBezahlt))}`);
  await page.getByRole("button", { name: String(JAHR), exact: true }).click();

  // Kunde: Kennzahl Bezahlt {Jahr}
  await gehe(`/kunden?k=${huber}`, /Angebote & Rechnungen/);
  const huberBezahlt = bezahltJahr.filter((r) => r.kunde_id === huber);
  ok((await text()).includes(`Bezahlt ${JAHR} ${eur(summe(huberBezahlt))} ${huberBezahlt.length} Rechnungen`), `Kunde: Bezahlt ${JAHR} = ${eur(summe(huberBezahlt))}`);

  // Eingang: Bezahlt nach Zahltag, Summen ohne Abgelehnte
  await gehe("/eingang?filter=bezahlt", /ZZER-B/);
  const eText = await text();
  ok(await chipZahl("Status", "Bezahlt") === eBezahltJahr.length, `Eingang: Bezahlt ${eBezahltJahr.length} (nach Zahltag)`);
  ok(await chipZahl("Wie bezahlt", "Alle") === eBezahltJahr.length && await chipZahl("Wie bezahlt", "Überwiesen") === eBezahltJahr.length, "Eingang: Unterfilter gleich");
  ok(await zeilen("ZZER-A") > 0 && await zeilen("ZZER-C") === 0, `Eingang: Dezember-${VJ}-Rechnung, ${JAHR} bezahlt, steht unter ${JAHR}`);
  ok(eText.includes(`${eBezahltJahr.length} Rechnungen · ${eur(summe(eBezahltJahr))} brutto`), `Eingang Bezahlt: Fuß ${eur(summe(eBezahltJahr))}`);
  const eJaenner = page.getByRole("region", { name: `Jänner ${JAHR}` });
  ok(await eJaenner.count() === 1 && norm(await eJaenner.innerText()).includes("ZZER-A"), `Eingang: Band „Jänner ${JAHR}“ (Zahlmonat) hat ZZER-A`);
  await gehe("/eingang?filter=alle", /ZZER-H/);
  ok((await text()).includes(`${eImJahr.length} Rechnungen · ${eur(summe(eZaehlt(eImJahr)))} brutto (ohne Abgelehnte)`), `Eingang Alle: Fuß ${eur(summe(eZaehlt(eImJahr)))} ohne die abgelehnte`);
  const band = page.getByRole("region", { name: monatText(VM) });
  ok(norm(await band.innerText()).includes(eur(summe(eZaehlt(eMonat)))), `Eingang: Band ${monatText(VM)} = ${eur(summe(eZaehlt(eMonat)))} ohne Abgelehnte`);
  await gehe("/eingang?filter=abgelehnt", /ZZER-H/);
  ok((await text()).includes("1 Rechnung · abgelehnt, zählen in keine Summe"), "Eingang Abgelehnt: keine Summe");

  // Lieferant: Rechnungen {Jahr} ohne Abgelehnte
  await gehe(`/kunden?k=${lieferant}&art=lieferant`, /ZZER-/);
  const lText = await text();
  ok(lText.includes(`Rechnungen ${JAHR} ${eur(summe(eZaehlt(eImJahr)))} ${eZaehlt(eImJahr).length} Rechnungen, brutto, ohne abgelehnte`),
    `Lieferant: Rechnungen ${JAHR} = ${eur(summe(eZaehlt(eImJahr)))}, ${eZaehlt(eImJahr).length} Rechnungen`);

  // Buchhaltung → Eingang (Vormonat): Summen ohne Abgelehnte
  await gehe("/buchhaltung?reiter=eingang", /ZZER-F/);
  const bText = await text();
  const netto = rund(eZaehlt(eMonat).reduce((s, r) => s + r.netto, 0)), vst = rund(eZaehlt(eMonat).reduce((s, r) => s + r.ust, 0));
  ok(bText.includes(`Netto ${eur(netto)} ${eZaehlt(eMonat).length} Rechnungen, ohne 1 abgelehnte`) && bText.includes(`Vorsteuer ${eur(vst)}`),
    `Buchhaltung Eingang: Netto ${eur(netto)}, Vorsteuer ${eur(vst)} ohne die abgelehnte`);

  // Kanzlei: nur die freigegebene, Warnung, Odoo-Zeile; merken merkt nur sie
  await gehe("/buchhaltung?reiter=kanzlei", /Eingangsrechnungen/);
  await page.getByText("ZZER-F").first().waitFor({ timeout: 20000 });
  const kText = await text();
  await page.screenshot({ path: `${BILDER}/geld-kanzlei-pc.png`, fullPage: true });
  ok(kText.includes(`Eingangsrechnungen ${eur(summe(eMit) - eMit.reduce((s, r) => s + r.ust, 0))} netto ${eMit.length} Beleg · Vorsteuer ${eur(eMit.reduce((s, r) => s + r.ust, 0))}`),
    `Kanzlei: Eingangsrechnungen ${eMit.length} Beleg, netto ${eur(500)}`);
  ok(kText.includes("1 Eingangsrechnung im Zeitraum ist noch zu prüfen — sie geht erst nach der Freigabe mit."), "Kanzlei: Warnung zu prüfen");
  ok(kText.includes("1 abgelehnte Eingangsrechnung geht nicht mit."), "Kanzlei: Hinweis abgelehnt");
  ok(kText.includes("1 Altrechnung und 1 Eingangsrechnung aus Odoo gehen nicht mit, die sind im alten Programm schon verbucht."), "Kanzlei: Zeile Altrechnung + Odoo");
  ok(await zeilen("ZZER-G") === 0 && await zeilen("ZZER-H") === 0 && await zeilen("ZZER-I") === 0, "Kanzlei: zu prüfende, abgelehnte, Odoo nicht in der Liste");
  await page.getByRole("button", { name: "Als übergeben merken" }).click();
  await page.getByText(/als übergeben gemerkt/).first().waitFor({ timeout: 15000 });
  const { data: gemerkt } = await admin.from("fibu_uebergabe_belege").select("beleg_id, eingang_id").in("eingang_id", angelegt.eingang);
  ok(gemerkt?.length === 1 && gemerkt[0].eingang_id === EF.id, `Kanzlei: gemerkt nur ZZER-F (${gemerkt?.length})`);
  await page.getByText(`${monatText(VM)} ist schon übergeben.`).first().waitFor({ timeout: 15000 }).catch(() => {});
  ok((await text()).includes(`${monatText(VM)} ist schon übergeben.`) && (await text()).includes("noch zu prüfen"), "Kanzlei danach: schon übergeben, Warnung bleibt");
  await admin.from("fibu_uebergaben").delete().in("erstellt_von", Object.values(ids));

  // Angebot aus der Vorlage: gelöschter Artikel und Leistung — und ein Artikel, der beim Bearbeiten verschwindet
  await gehe(`/belege/neu?typ=angebot&vorlage=${vorlage.id}&preise=vorlage`, /Vorlage „ZZ Geld Vorlage“/);
  pruef((await admin.from("artikel").delete().eq("id", art[0].id)).error, "Artikel während der Bearbeitung löschen");
  verweis409 = 0;
  await page.getByRole("button", { name: "Speichern", exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL((u) => /\/belege\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 20000 });
  await page.waitForTimeout(500);
  ok(verweis409 === 1, `erster Versuch scheitert am gelöschten Artikel (409), zweiter klappt (${verweis409}× 409)`);
  const { data: an } = await admin.from("belege").select("id, netto").eq("betreff", "ZZ Geld Vorlage Betreff");
  ok(an?.length === 1, "Angebot aus der Vorlage gespeichert");
  if (an?.length) {
    angelegt.belege.push(an[0].id);
    const { data: pos } = await admin.from("beleg_positionen").select("bezeichnung, menge, einzelpreis, artikel_id, leistung_id").eq("beleg_id", an[0].id).order("pos");
    const p = (b) => pos.find((x) => x.bezeichnung === b);
    ok(pos.length === 5, `5 Positionen (${pos.length})`);
    ok(p("ZZ Geld Altmodul")?.artikel_id === null && Number(p("ZZ Geld Altmodul")?.einzelpreis) === 120 && Number(p("ZZ Geld Altmodul")?.menge) === 10, "gelöschter Artikel: Verweis weg, Text/Menge/Preis bleiben");
    ok(p("ZZ Geld Alte Montage")?.leistung_id === null && Number(p("ZZ Geld Alte Montage")?.einzelpreis) === 90, "gelöschte Leistung: Verweis weg, Preis bleibt");
    ok(p("ZZ Geld Speicher 10 kWh")?.artikel_id === null && Number(p("ZZ Geld Speicher 10 kWh")?.einzelpreis) === 4100, "beim Bearbeiten gelöschter Artikel: Speichern klappt trotzdem");
    ok(Number(an[0].netto) === 4100 + 1200 + 270 + 290, `Netto stimmt (${an[0].netto})`);
  }
  await page.screenshot({ path: `${BILDER}/geld-vorlage-gespeichert-pc.png` });
  await page.context().close();

  // Handy: keine waagrechte Scrollleiste auf den geänderten Seiten
  const handy = await anmelden({ width: 390, height: 844 });
  for (const [pfad, warten, name] of [
    ["/rechnungen?filter=bezahlt", /ZZRE-B/, "rechnungen-bezahlt"], ["/eingang?filter=skonto", /ZZER-J/, "eingang-skonto"],
    ["/buchhaltung?reiter=kanzlei", /ZZER-F/, "kanzlei"], ["/bestellungen?filter=unterwegs", bestNr.bestellt, "bestellungen"],
    ["/projekte?filter=foerderung&frist=30", /ZZ Geld PV Frist 1/, "projekte-frist"],
  ]) {
    await handy.goto(`${APP_URL}${pfad}`);
    await handy.getByText(warten).first().waitFor({ timeout: 20000 });
    await handy.waitForTimeout(600);
    ok(await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Handy ${name}: keine waagrechte Scrollleiste`);
    await handy.screenshot({ path: `${BILDER}/geld-${name}-handy.png` });
  }
  await handy.context().close();
  ok(fehler.length === 0, `keine Fehler in Konsole und Netz${fehler.length ? `: ${[...new Set(fehler)].join(" | ")}` : ""}`);
} finally {
  await browser?.close();
  // aufräumen
  if (Object.keys(ids).length) await admin.from("fibu_uebergaben").delete().in("erstellt_von", Object.values(ids));
  await admin.from("odoo_import").delete().in("zeile_id", angelegt.odoo);
  await admin.from("zahlungen").delete().eq("notiz", "ZZ Geld");
  if (angelegt.belege.length) await admin.from("beleg_positionen").delete().in("beleg_id", angelegt.belege);
  if (angelegt.belege.length) await admin.from("belege").delete().in("id", angelegt.belege);
  if (angelegt.eingang.length) await admin.from("eingangsrechnungen").delete().in("id", angelegt.eingang);
  if (angelegt.vorlagen.length) await admin.from("angebot_vorlagen").delete().in("id", angelegt.vorlagen);
  if (angelegt.artikel.length) await admin.from("artikel").delete().in("id", angelegt.artikel);
  if (angelegt.leistungen.length) await admin.from("leistungen").delete().in("id", angelegt.leistungen);
  // bestellte: nur stornieren (löschen sperrt der Trigger), Entwurf löschen; das Lager bleibt stillgelegt
  if (angelegt.bestellungen.length) {
    await admin.from("bestellungen").update({ status: "storniert" }).in("id", angelegt.bestellungen).neq("status", "entwurf");
    await admin.from("bestellungen").delete().in("id", angelegt.bestellungen).eq("status", "entwurf");
    await admin.from("lagerorte").update({ aktiv: false }).eq("name", "ZZ Geld Lager");
  }
  if (angelegt.projekte.length) await admin.from("projekte").delete().in("id", angelegt.projekte);
  if (angelegt.kategorien.length) await admin.from("rechnung_kategorien").delete().in("id", angelegt.kategorien);
  if (angelegt.kunden.length) await admin.from("kunden").delete().in("id", angelegt.kunden);
  for (const id of Object.values(ids)) await admin.from("profiles").update({ rolle_id: null }).eq("id", id);
  if (angelegt.rollen.length) await admin.from("rollen").delete().in("id", angelegt.rollen);
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  const rest = await Promise.all([
    admin.from("belege").select("id", { count: "exact", head: true }).in("id", angelegt.belege.length ? angelegt.belege : [crypto.randomUUID()]),
    admin.from("eingangsrechnungen").select("id", { count: "exact", head: true }).in("id", angelegt.eingang.length ? angelegt.eingang : [crypto.randomUUID()]),
  ]);
  console.log(`aufgeräumt (übrig: ${rest[0].count ?? "?"} Belege, ${rest[1].count ?? "?"} Eingangsrechnungen)`);
}
console.log(fehlschlaege ? `${fehlschlaege} Prüfungen fehlgeschlagen` : "alles gut");
process.exit(fehlschlaege ? 1 : 0);
