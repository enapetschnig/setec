-- =====================================================================
--  Kontakte im Hintergrund auf die Karte bringen
-- =====================================================================
-- Bisher suchte nur die App die Lage eines Kontakts — beim Speichern, beim
-- Öffnen oder über „Lage suchen“ unter der Karte (1/s, nur solange die Seite
-- offen ist). Die ~1000 importierten Kontakte hat nie jemand geöffnet → die
-- Karte war leer (Stefan 18.11.2026). Jetzt stößt pg_cron jede Minute die
-- Edge Function `geo-suchen` an, solange ein Kontakt ohne aktuelle Lage da ist.
--
-- `geo_anfrage` = dieselbe Regel wie geoAnfrage() in
-- supabase/functions/_shared/geo.ts (nur fürs Entscheiden, ob es etwas zu tun gibt).
-- `geo_verbindung` (URL + Geheimnis der Function) steht nicht im Repo
-- (öffentlich) — die Zeile wird einmal per SQL eingetragen. Leer = Cron still.
-- =====================================================================

create or replace function public.geo_anfrage(p_strasse text, p_plz text, p_ort text) returns text
language sql immutable parallel safe as $$
  with t as (
    select nullif(regexp_replace(coalesce(p_strasse, ''), '^\s+|\s+$', '', 'g'), '') s,
           nullif(regexp_replace(coalesce(p_plz, ''), '^\s+|\s+$', '', 'g'), '') p,
           nullif(regexp_replace(coalesce(p_ort, ''), '^\s+|\s+$', '', 'g'), '') o
  )
  select case when p is null and o is null then null
    else concat_ws(', ', s, concat_ws(' ', p, o)) || case when p ~ '^\d{5}$' then ', Deutschland' else ', Österreich' end
  end from t
$$;

create table if not exists public.geo_verbindung (
  einzig boolean primary key default true check (einzig),
  url text not null,
  secret text not null
);
-- Keine Policies: nur Dienstrolle und die Funktion unten (security definer)
alter table public.geo_verbindung enable row level security;
revoke all on public.geo_verbindung from anon, authenticated;

create or replace function public.geo_suchen_anstossen() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.geo_verbindung%rowtype;
begin
  select * into v from public.geo_verbindung limit 1;
  if not found then return; end if;       -- nicht eingerichtet: still
  if not exists (
    select 1 from public.kunden k
     where public.geo_anfrage(k.strasse, k.plz, k.ort) is distinct from k.geo_adresse
       and public.geo_anfrage(k.strasse, k.plz, k.ort) is not null
  ) then return; end if;
  perform net.http_post(
    url := v.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-geo-secret', v.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function public.geo_suchen_anstossen() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('geo-suchen', '* * * * *', $$ select public.geo_suchen_anstossen() $$);
