-- Registrierung absichern (16.11.2026, Review nach „ein Link für alle“):
-- 1. Keine Chef-Adressen mehr im Trigger. hallo@epowergmbh.at hatte bei SETEC
--    kein Konto — weil E-Mails nicht bestätigt werden, hätte sich jeder damit
--    als Chef registrieren können. Beide Chefs gibt es schon; weitere Chefs
--    ernennt der Chef unter Einstellungen → Mitarbeiter.
-- 2. Reste des Firmen-Links (Tabelle einladungen samt Klartext-Token,
--    Hilfsfunktionen) weg.
-- 3. SMS-Drossel atomar: sms_platz() zählt und reserviert in einem Schritt
--    unter einer Sperre — parallele Anfragen kommen nicht mehr alle durch.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, vorname, nachname, email, rolle, aktiv)
  values (new.id,
          left(btrim(coalesce(new.raw_user_meta_data->>'vorname', '')), 60),
          left(btrim(coalesce(new.raw_user_meta_data->>'nachname', '')), 60),
          new.email,
          'monteur',
          true)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop function if exists public.einladung_benutzervorschlag(text, text, text);
drop function if exists public.einladung_token();
drop function if exists public.einladung_hash(text);
drop function if exists public.benutzer_aus_name(text);
drop table if exists public.einladungen;

alter table public.sms_einladungen add constraint sms_einladungen_status_check
  check (status in ('sendet', 'gesendet', 'fehler'));

-- Nur die Edge Function (service_role) ruft das auf. Gibt die Zeilen-ID
-- zurück oder wirft „zu_viele_nummer“ / „zu_viele_tag“.
create or replace function public.sms_platz(p_nummer text, p_von uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sms_einladungen'));
  if (select count(*) from public.sms_einladungen
       where nummer = p_nummer and status <> 'fehler' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'zu_viele_nummer';
  end if;
  if (select count(*) from public.sms_einladungen
       where status <> 'fehler' and created_at > now() - interval '24 hours') >= 40 then
    raise exception 'zu_viele_tag';
  end if;
  insert into public.sms_einladungen (nummer, status, gesendet_von) values (p_nummer, 'sendet', p_von)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.sms_platz(text, uuid) from public, anon, authenticated;
grant execute on function public.sms_platz(text, uuid) to service_role;
