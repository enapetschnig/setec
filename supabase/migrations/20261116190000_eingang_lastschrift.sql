-- ══════════════════════════════════════════════════════════════════════
--  Eingangsrechnungen: Lastschrift (SEPA-Mandat beim Händler)
--  Der Händler bucht selbst ab (am Tag X jeden Monats, abzüglich Skonto) —
--  nach der Freigabe kommt die Rechnung nicht in „Zu überweisen“, sondern
--  in „Lastschrift“ und wird dort als abgebucht markiert.
--  Nur ergänzt: alte App liest die neuen Spalten nicht und läuft weiter.
-- ══════════════════════════════════════════════════════════════════════

alter table public.eingangsrechnungen
  add column if not exists lastschrift boolean not null default false,
  add column if not exists lastschrift_tag smallint check (lastschrift_tag between 1 and 31);

comment on column public.eingangsrechnungen.lastschrift is 'Händler hat ein SEPA-Mandat und bucht selbst ab — keine Überweisung';
comment on column public.eingangsrechnungen.lastschrift_tag is 'Abbuchung am Tag X jeden Monats (optional)';

-- Kontakt-Belege: freigegebene Lastschriften als eigener Status
create or replace function public.kontakt_belege(p_kontakt uuid)
returns table (
  quelle text, id uuid, nummer text, datum date, betrag numeric, status text,
  projekt_id uuid, projekt text
)
language sql stable security invoker set search_path = public as $$
  with k as (
    select array_agg(distinct public.lieferant_schluessel(n)) as schluessel
      from public.kunden, unnest(array_prepend(name, namen)) n
     where kunden.id = p_kontakt and btrim(n) <> ''
  )
  select 'rechnung', e.id, e.nummer, e.datum, e.brutto,
         case when e.bezahlt_am is not null then 'bezahlt'
              when e.freigabe = 'freigegeben' and e.lastschrift then 'lastschrift'
              else e.freigabe end,
         null::uuid, null::text
    from public.eingangsrechnungen e, k
   where public.lieferant_schluessel(e.lieferant) = any (k.schluessel)
  union all
  select 'lieferschein', l.id, l.nummer, l.datum, null,
         case when l.eingangsrechnung_id is null then 'offen' else 'zugeordnet' end,
         l.projekt_id, p.nummer || ' · ' || p.name
    from public.lieferscheine l
    left join public.projekte p on p.id = l.projekt_id, k
   where public.lieferant_schluessel(l.lieferant) = any (k.schluessel)
  union all
  select 'bestellung', b.id, b.nummer, b.datum,
         (select round(sum(bp.menge * coalesce(bp.ek_preis, 0)), 2) from public.bestell_positionen bp where bp.bestellung_id = b.id),
         b.status, b.projekt_id, p.nummer || ' · ' || p.name
    from public.bestellungen b
    left join public.projekte p on p.id = b.projekt_id, k
   where public.lieferant_schluessel(b.lieferant) = any (k.schluessel)
  order by 4 desc nulls last
$$;
