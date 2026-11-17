-- =====================================================================
--  Kalender: Termin-Art und Kunde (Stufe 1, docs/ABLAUF-TERMIN-BIS-RECHNUNG.md)
--
--  - termine.art: montage (Projektfarbe), besichtigung (weiß mit Rand),
--    service (blau), buero (grau). Neue Termine fragen zuerst nach der Art.
--  - termine.kunde_id: neuer Termin beginnt beim Kunden; Montage wählt dann
--    nur dessen Projekte „In Arbeit“, Besichtigung/Service haben kein Projekt.
--  - Bestand: Kunde aus dem Projekt, Art „montage“ mit Projekt, sonst „buero“.
--    Der Nachtrag läuft nur, wenn die Spalte neu ist (zweimal einspielen
--    überschreibt keine Arten, die inzwischen gewählt wurden).
--  - termin_push: auch ein Gerätewechsel (fahrzeuge) ist eine Änderung, die
--    gemeldet wird (termin_einsatz vermerkt ihn schon seit 20261110100000).
--  Nur ergänzend — nichts wird gelöscht.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'termine' and column_name = 'art') then
    alter table public.termine add column art text not null default 'montage';
    update public.termine set art = 'buero' where projekt_id is null;
  end if;
end $$;

alter table public.termine drop constraint if exists termine_art_check;
alter table public.termine add constraint termine_art_check
  check (art in ('montage', 'besichtigung', 'service', 'buero'));

alter table public.termine
  add column if not exists kunde_id uuid references public.kunden(id) on delete set null;
create index if not exists termine_kunde on public.termine (kunde_id);

update public.termine t set kunde_id = p.kunde_id
  from public.projekte p
 where t.projekt_id = p.id and t.kunde_id is null and p.kunde_id is not null;

-- ── Mitteilung auch bei Gerätewechsel ──────────────────────────────────
create or replace function public.termin_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.push_verbindung%rowtype;
  empfaenger uuid[];
begin
  if tg_op = 'UPDATE' and (new.datum, new.bis_datum, new.von, new.bis, new.ganztags, new.ort, new.titel, new.mitarbeiter, new.fahrzeuge)
     is not distinct from (old.datum, old.bis_datum, old.von, old.bis, old.ganztags, old.ort, old.titel, old.mitarbeiter, old.fahrzeuge) then
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
