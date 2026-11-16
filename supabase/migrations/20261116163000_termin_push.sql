-- =====================================================================
--  Mitteilungen aufs Handy bei Terminänderung (Web-Push)
--
--  - push_abos: je Gerät ein Abo (Endpoint + Schlüssel des Browsers).
--    Nur eigene Zeilen; angemeldet wird über push_abo_registrieren, damit
--    ein weitergegebenes Handy das Abo übernehmen kann.
--  - push_verbindung: Adresse und Geheimnis der Edge Function termin-push.
--    Steht nicht im Repo (öffentlich) — die Zeile wird einmal per SQL
--    eingetragen. Leer = Trigger still. Wie cockpit_verbindung.
--  - Trigger termin_push (AFTER): Insert, Delete und Updates, bei denen sich
--    Tag, Zeit, Ort, Titel oder Personen ändern — eine reine
--    Status-Änderung („Erledigt“) schickt nichts. Empfänger: alte und neue
--    Mitarbeiter ohne den, der geändert hat. Ein Fehler beim Senden darf das
--    Speichern nie aufhalten.
-- =====================================================================

create extension if not exists pg_net;

create table if not exists public.push_abos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  geraet text,
  zuletzt_ok_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_abos_user on public.push_abos (user_id);
alter table public.push_abos enable row level security;
drop policy if exists push_abos_eigene on public.push_abos;
create policy push_abos_eigene on public.push_abos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gerät anmelden: übernimmt ein Abo auch, wenn es vorher einem anderen Konto
-- gehörte (geteiltes Handy) — die Zeilenregel allein ließe das nicht zu.
create or replace function public.push_abo_registrieren(p_endpoint text, p_p256dh text, p_auth text, p_geraet text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.ist_aktiv() then raise exception 'Nicht angemeldet.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Ungültiges Push-Abo.' using errcode = '22023';
  end if;
  insert into public.push_abos (user_id, endpoint, p256dh, auth, geraet)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_geraet, 160))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh,
    auth = excluded.auth, geraet = excluded.geraet;
end $$;
revoke all on function public.push_abo_registrieren(text, text, text, text) from public, anon;
grant execute on function public.push_abo_registrieren(text, text, text, text) to authenticated;

-- ── Verbindung zur Edge Function ───────────────────────────────────────
create table if not exists public.push_verbindung (
  einzig boolean primary key default true check (einzig),
  url text not null,
  secret text not null
);
-- Keine Policies: nur Dienstrolle und der Trigger (security definer) lesen das Geheimnis.
alter table public.push_verbindung enable row level security;
revoke all on public.push_verbindung from anon, authenticated;

create or replace function public.termin_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.push_verbindung%rowtype;
  empfaenger uuid[];
begin
  if tg_op = 'UPDATE' and (new.datum, new.bis_datum, new.von, new.bis, new.ganztags, new.ort, new.titel, new.mitarbeiter)
     is not distinct from (old.datum, old.bis_datum, old.von, old.bis, old.ganztags, old.ort, old.titel, old.mitarbeiter) then
    return null;                          -- nur Status o. Ä.: keine Mitteilung
  end if;

  select array_agg(distinct u) into empfaenger
    from unnest(case when tg_op = 'INSERT' then '{}'::uuid[] else old.mitarbeiter end
             || case when tg_op = 'DELETE' then '{}'::uuid[] else new.mitarbeiter end) u
   where u is distinct from auth.uid();
  -- Nur wer überhaupt ein Gerät angemeldet hat — sonst kein Aufruf
  if empfaenger is null or not exists (select 1 from public.push_abos a where a.user_id = any(empfaenger)) then
    return null;
  end if;

  select * into v from public.push_verbindung limit 1;
  if not found then return null; end if;  -- nicht eingerichtet: still

  begin
    perform net.http_post(
      url := v.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v.secret),
      body := jsonb_build_object(
        'op', tg_op,
        'aenderer', auth.uid(),
        'empfaenger', to_jsonb(empfaenger),
        'alt', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
        'neu', case when tg_op = 'DELETE' then null else to_jsonb(new) end
      )
    );
  exception when others then
    raise warning 'termin_push: %', sqlerrm;  -- Speichern geht trotzdem durch
  end;
  return null;
end $$;

drop trigger if exists termine_push on public.termine;
create trigger termine_push
  after insert or update or delete on public.termine
  for each row execute function public.termin_push();
