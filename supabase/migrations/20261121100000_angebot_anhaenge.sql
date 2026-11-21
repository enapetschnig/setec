-- Wunsch SETEC 21.11.2026 (Stefan): „PV-Planung (SolarEdge-PDF) als Anhang
-- mit dem Angebot versenden“. Eigene Dateien direkt am Angebot — neben den
-- Datenblättern der Artikel. Sie gehen immer mit dem Angebot mit (wie
-- Datenblätter „mit dem Angebot“): Mail (`beleg-mail` prüft über
-- `angebot_datenblaetter`), Bestätigungslink (Liste über dieselbe Funktion,
-- Laden über `datenblatt_oeffentlich`).
-- Speicher: „projekt-dateien“ unter angebot/<beleg_id>/… — nur Chef mit Recht
-- „rechnungen“ (wie die Belege selbst), der Kunde nur mit gültigem Link.

create table if not exists public.beleg_anhaenge (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.belege(id) on delete cascade,
  name text not null,
  pfad text not null unique check (pfad like 'angebot/%'),
  groesse bigint,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists beleg_anhaenge_beleg on public.beleg_anhaenge (beleg_id);
comment on table public.beleg_anhaenge is
  'Eigene Anhänge am Angebot (PV-Planung, Pläne …) — gehen mit Mail und Bestätigungslink mit. Datei in projekt-dateien/angebot/<beleg_id>/…';

alter table public.beleg_anhaenge enable row level security;
create policy beleg_anhaenge_chef on public.beleg_anhaenge for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy beleg_anhaenge_recht on public.beleg_anhaenge as restrictive for all to authenticated
  using ((select public.hat_recht('rechnungen')) or not (select public.ist_chef()))
  with check ((select public.hat_recht('rechnungen')) or not (select public.ist_chef()));

/** Datenblätter und eigene Anhänge, die der Kunde zu diesem Angebot sehen darf */
create or replace function public.angebot_datenblaetter(p_beleg uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_angenommen boolean;
begin
  select b.status = 'angenommen' into v_angenommen from public.belege b where b.id = p_beleg;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'pfad', x.pfad, 'artikel', x.artikel, 'sichtbar', x.sichtbar)
           order by x.artikel is not null, x.artikel, x.name), '[]'::jsonb)
    into v
    from (
      select a.name, a.pfad, 'angebot'::text as sichtbar, null::text as artikel
        from public.beleg_anhaenge a
       where a.beleg_id = p_beleg
      union all
      select * from (
        select distinct on (d.pfad) d.name, d.pfad, d.sichtbar, a.bezeichnung as artikel
          from public.artikel_dateien d
          join public.artikel a on a.id = d.artikel_id
         where d.art = 'datenblatt'
           and (d.sichtbar = 'angebot' or (d.sichtbar = 'auftrag' and coalesce(v_angenommen, false)))
           and d.artikel_id in (
             select p.artikel_id from public.beleg_positionen p where p.beleg_id = p_beleg and p.artikel_id is not null
             union
             select m.artikel_id from public.beleg_positionen p
               join public.leistung_material m on m.leistung_id = p.leistung_id
              where p.beleg_id = p_beleg
           )
      ) blaetter
    ) x;
  return v;
end $$;
revoke execute on function public.angebot_datenblaetter(uuid) from public, anon, authenticated;
grant execute on function public.angebot_datenblaetter(uuid) to service_role;

/** Darf eine Datei öffentlich geladen werden? Datenblatt (nie „intern“, „auftrag“ erst nach Annahme) oder eigener Anhang eines Angebots mit gültigem Link. */
create or replace function public.datenblatt_oeffentlich(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_name like 'angebot/%' then
    return exists (
      select 1 from public.beleg_anhaenge a
        join public.belege b on b.id = a.beleg_id and b.typ = 'angebot' and b.status in ('offen', 'angenommen')
        join public.angebot_links l on l.beleg_id = b.id and l.gesperrt_am is null
       where a.pfad = p_name);
  end if;
  if p_name not like 'artikel/%' then return false; end if;
  return exists (
    select 1 from public.artikel_dateien d
     where d.pfad = p_name and d.art = 'datenblatt' and d.sichtbar <> 'intern'
       and exists (
         select 1 from public.angebot_links l
           join public.belege b on b.id = l.beleg_id and b.status in ('offen', 'angenommen')
           join public.beleg_positionen p on p.beleg_id = b.id
           left join public.leistung_material m on m.leistung_id = p.leistung_id
          where l.gesperrt_am is null
            and (d.sichtbar = 'angebot' or b.status = 'angenommen')
            and (p.artikel_id = d.artikel_id or m.artikel_id = d.artikel_id)));
end $$;
revoke execute on function public.datenblatt_oeffentlich(text) from public;
grant execute on function public.datenblatt_oeffentlich(text) to anon, authenticated;

-- Speicher: Angebots-Anhänge sieht/ändert in der App nur der Chef mit Recht „rechnungen“
-- (projektdateien_lesen gibt den Bucket sonst jedem Aktiven frei). Nur für Angemeldete: der Kunde (anon)
-- lädt über datenblatt_oeffentlich_lesen; ein angemeldeter Monteur auch dann nicht, wenn ein Link besteht.
create policy angebot_anhang_recht on storage.objects as restrictive for all to authenticated
  using (case when bucket_id = 'projekt-dateien' and name like 'angebot/%'
    then (select public.ist_chef()) and (select public.hat_recht('rechnungen'))
    else true end)
  with check (case when bucket_id = 'projekt-dateien' and name like 'angebot/%'
    then (select public.ist_chef()) and (select public.hat_recht('rechnungen'))
    else true end);
-- Angebot gelöscht → Zeilen per cascade; die Datei löscht die App vorher (SQL darf den Speicher nicht).

notify pgrst, 'reload schema';
