-- =====================================================================
--  Datenübernahme aus dem bisherigen Programm (Odoo)
-- =====================================================================
--
-- Kontakte, Ansprechpersonen, PV-Anlagen, Artikel, Altrechnungen samt
-- Zahlungen und Eingangsrechnungen samt Positionen kommen einmalig aus
-- einem Odoo-Export. Damit sich später NUR das Übernommene neu machen
-- lässt (ohne an Daten zu rühren, die in der App entstanden sind), merkt
-- sich `odoo_import` jede angelegte Zeile mit ihrem Schlüssel in Odoo
-- (Anzeigename, Rechnungsnummer, BILL/…). Die Tabellen selbst bleiben,
-- wie sie sind — keine neue Spalte, die die App kennen müsste.
--
-- Artikel tragen wie Datanorm- und CSV-Artikel ihre Herkunft in `quelle`.
-- Sie haben keinen Listenpreis (Odoo kennt nur Kosten und Verkaufspreis),
-- darum lässt `rabatte_anwenden` ihre Einkaufspreise in Ruhe.
-- =====================================================================

alter table public.artikel drop constraint artikel_quelle_check;
alter table public.artikel add constraint artikel_quelle_check
  check (quelle in ('manuell', 'datanorm', 'csv', 'demo', 'odoo'));

create table public.odoo_import (
  tabelle text not null,
  zeile_id uuid not null,
  extern text,
  created_at timestamptz not null default now(),
  primary key (tabelle, zeile_id)
);
comment on table public.odoo_import is
  'Welche Zeilen aus dem Odoo-Export stammen (Tabelle, ID, Schlüssel in Odoo) — zum gezielten Neu-Machen der Übernahme.';

alter table public.odoo_import enable row level security;
create policy odoo_import_chef_lesen on public.odoo_import for select to authenticated
  using (public.ist_chef());

notify pgrst, 'reload schema';
