-- EIN Weg in die App (16.11.2026, Christoph: „Mitarbeiter sollen sich selber
-- registrieren … und dass es da nur einen Prozess gibt“): der Firmen-Link.
--
-- Der Chef hat genau EINEN gültigen Link /einladung/<token> — als Aushang mit
-- QR-Code, in der WhatsApp-Gruppe, wo er will. Wer ihn öffnet, installiert die
-- App, trägt Vor- und Nachnamen, Benutzernamen und Passwort ein und ist sofort
-- freigeschaltet (Monteur; Chef-Rolle und Team gibt der Chef danach unter
-- Einstellungen → Mitarbeiter). Wandert der Link zu Falschen: „Neuen Link
-- erzeugen“ — der alte gilt ab sofort nicht mehr.
--
-- Abgelöst: persönliche Einladungen je Mitarbeiter, Zugangslinks und das
-- Registrieren ohne Link mit Freischaltung. Ein Konto ohne gültigen Link (nur
-- noch direkt über die Auth-API möglich) bleibt wie bisher nicht freigeschaltet
-- und sieht nichts.
--
-- Der Token steht beim Firmen-Link im Klartext in der Tabelle (nur der Chef
-- liest sie): Er hängt ohnehin am Aushang, und der Chef muss den QR-Code
-- jederzeit wieder zeigen und drucken können.

alter table public.einladungen add column if not exists mehrfach boolean not null default false;
alter table public.einladungen add column if not exists token text;
alter table public.einladungen drop constraint if exists einladungen_check;
alter table public.einladungen add constraint einladungen_check
  check (mehrfach or profil_id is not null or (btrim(vorname) <> '' and btrim(nachname) <> ''));
comment on column public.einladungen.mehrfach is 'Firmen-Link: beliebig oft einlösbar, höchstens einer gültig';
comment on column public.einladungen.token is 'Klartext nur beim Firmen-Link (Aushang/QR), sonst null';

-- Offene persönliche Einladungen gelten nicht mehr
update public.einladungen set zurueckgezogen_am = now()
 where not mehrfach and eingeloest_am is null and zurueckgezogen_am is null;

drop function if exists public.einladung_erstellen(text, text, text, uuid, uuid);
drop function if exists public.einladung_neu(uuid);
drop function if exists public.einladung_zurueckziehen(uuid);

create unique index if not exists einladungen_ein_firmen_link on public.einladungen ((true))
  where mehrfach and zurueckgezogen_am is null;

-- Chef: den gültigen Firmen-Link holen (gibt es keinen, entsteht er) — p_neu: alten ersetzen
create or replace function public.firmen_link(p_neu boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.ist_chef() then raise exception 'Den Firmen-Link verwaltet der Chef.'; end if;
  perform pg_advisory_xact_lock(hashtext('firmen_link'));
  if not p_neu then
    select token into v_token from public.einladungen where mehrfach and zurueckgezogen_am is null;
    if v_token is not null then return v_token; end if;
  end if;
  update public.einladungen set zurueckgezogen_am = now() where mehrfach and zurueckgezogen_am is null;
  v_token := public.einladung_token();
  insert into public.einladungen (token_hash, token, mehrfach, gueltig_bis)
  values (public.einladung_hash(v_token), v_token, true, 'infinity');
  return v_token;
end $$;
revoke execute on function public.firmen_link(boolean) from public, anon;
grant execute on function public.firmen_link(boolean) to authenticated;

-- Öffentlich: Was steht hinter dem Link? (ohne Anmeldung)
create or replace function public.einladung_lesen(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  e public.einladungen;
  v_firma text;
begin
  select * into e from public.einladungen where token_hash = public.einladung_hash(p_token);
  if not found then return json_build_object('status', 'unbekannt'); end if;
  if not e.mehrfach then return json_build_object('status', 'zurueckgezogen'); end if;
  select name into v_firma from public.firma where id = 1;
  return json_build_object(
    'status', case when e.zurueckgezogen_am is not null then 'zurueckgezogen' else 'gueltig' end,
    'art', 'firma',
    'firma', v_firma
  );
end $$;
grant execute on function public.einladung_lesen(text) to anon, authenticated;

-- Einlösen beim Anlegen des Kontos
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bootstrap boolean := lower(new.email) in ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');
  v_token text := new.raw_user_meta_data->>'einladung';
  v_vorname text := left(btrim(coalesce(new.raw_user_meta_data->>'vorname', '')), 60);
  v_nachname text := left(btrim(coalesce(new.raw_user_meta_data->>'nachname', '')), 60);
  v_link boolean := false;
begin
  if v_token is not null and v_token <> '' and v_vorname <> '' and v_nachname <> '' then
    v_link := exists (select 1 from public.einladungen
                       where token_hash = public.einladung_hash(v_token) and mehrfach and zurueckgezogen_am is null);
  end if;
  insert into public.profiles (id, vorname, nachname, email, rolle, aktiv)
  values (new.id, v_vorname, v_nachname, new.email,
          case when v_bootstrap then 'chef' else 'monteur' end,
          v_bootstrap or v_link)
  on conflict (id) do nothing;
  if v_link then
    update public.einladungen set eingeloest_am = now(), eingeloest_von = new.id
     where token_hash = public.einladung_hash(v_token) and mehrfach;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
