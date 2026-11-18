-- =====================================================================
-- Scannen findet auch die Artikelnummer (18.11.2026)
--
-- Aus Odoo kamen nur 92 von 949 Artikeln mit EAN. Auf Großhändler-
-- Etiketten und Kartons steht oft die Artikelnummer als Strichcode
-- (Code 128) — die fand der Scanner bisher nicht. Reihenfolge jetzt:
-- zugeordneter Code, EAN, dann genau die Artikelnummer bzw.
-- Hersteller-Nummer (mindestens 4 Zeichen, damit „16A“ nichts trifft).
-- =====================================================================

create index if not exists artikel_artikelnummer_idx on public.artikel (artikelnummer);

create or replace function public.artikel_zu_code(p_code text)
returns table (artikel_id uuid, menge numeric)
language sql stable set search_path = public as $$
  select t.artikel_id, t.menge
  from (
    select c.artikel_id, c.menge, 0 as rang, a.lagerartikel, a.created_at
      from public.artikel_codes c
      join public.artikel a on a.id = c.artikel_id
     where c.code = btrim(p_code) and a.aktiv
    union all
    select a.id, 1::numeric, 1, a.lagerartikel, a.created_at
      from public.artikel a
     where a.ean = btrim(p_code) and a.aktiv
    union all
    select a.id, 1::numeric, 2, a.lagerartikel, a.created_at
      from public.artikel a
     where length(btrim(p_code)) >= 4 and a.artikelnummer = btrim(p_code) and a.aktiv
    union all
    select a.id, 1::numeric, 3, a.lagerartikel, a.created_at
      from public.artikel a
     where length(btrim(p_code)) >= 4 and a.hersteller_nr = btrim(p_code) and a.aktiv
  ) t
  order by t.rang, t.lagerartikel desc, t.created_at, t.artikel_id
  limit 1
$$;

grant execute on function public.artikel_zu_code(text) to authenticated;
