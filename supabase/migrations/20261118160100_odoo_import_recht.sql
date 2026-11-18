-- =====================================================================
--  odoo_import: lesen nur mit dem Recht des Bereichs
-- =====================================================================
--
-- Bisher las jeder mit Chef-Zugang (auch eine Büro-Rolle ohne „Eingang“
-- oder ohne „Rechnungen“) die ganze Liste der Übernahme samt Odoo-Schlüssel
-- (Rechnungsnummern, BILL/…). Die App liest nur die Eingangsrechnungen
-- (Etikett „Odoo“ unter /eingang und beim Lieferanten, Übergabe an die
-- Kanzlei) — mit dem Recht „eingang“, wie die Eingangsrechnungen selbst.
--
-- Je Tabelle das Recht ihres Bereichs (wie die Regeln aus
-- 20261118120000_rollen_rechte.sql); Stammdaten, die jeder mit Chef-Zugang
-- ohnehin sieht (Kontakte, Ansprechpersonen, Anlagen, Artikel), bleiben frei;
-- unbekannte Tabellen nur der volle Chef. Die bestehende Regel
-- odoo_import_chef_lesen (ist_chef) bleibt — das hier schränkt nur ein.
-- =====================================================================

create policy odoo_import_recht on public.odoo_import as restrictive for select to authenticated
  using (case tabelle
    when 'eingangsrechnungen' then (select public.hat_recht('eingang'))
    when 'eingang_positionen' then (select public.hat_recht('eingang'))
    when 'belege' then (select public.hat_recht('rechnungen'))
    when 'zahlungen' then (select public.hat_recht('rechnungen'))
    when 'rechnung_kategorien' then (select public.hat_recht('buchhaltung'))
    when 'kunden' then true
    when 'kontakt_personen' then true
    when 'anlagen' then true
    when 'artikel' then true
    when 'artikel_lieferanten' then true
    else (select public.ist_voller_chef())
  end);

notify pgrst, 'reload schema';
