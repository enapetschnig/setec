-- =====================================================================
--  Plantafel: Einsätze plant nur der Chef
--
--  Bisher durfte jedes aktive Konto jeden Termin ändern — und weil sich
--  jeder über /start selbst registriert und sofort aktiv ist, war das zu
--  offen. Jetzt:
--  - anlegen, verschieben, löschen: nur der Chef
--  - ein Monteur darf bei Einsätzen, in denen er eingeteilt ist, nur den
--    Status setzen („Erledigt“, „Wieder offen“) — sonst nichts
--  Dazu Tagesbeginn/-ende des Wochenplans als Betriebs-Einstellung.
-- =====================================================================

drop policy if exists termine_anlegen on public.termine;
drop policy if exists termine_aendern on public.termine;
drop policy if exists termine_loeschen on public.termine;

create policy termine_anlegen on public.termine for insert to authenticated
  with check (public.ist_chef());
create policy termine_aendern on public.termine for update to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and auth.uid() = any(mitarbeiter)))
  with check (public.ist_chef() or (public.ist_aktiv() and auth.uid() = any(mitarbeiter)));
create policy termine_loeschen on public.termine for delete to authenticated
  using (public.ist_chef());

-- RLS kennt keine Spalten: der Monteur darf nur den Status ändern. Was
-- termin_einsatz daraus macht (begonnen/erledigt am, geändert am), zählt nicht.
create or replace function public.termin_nur_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.ist_chef() then return new; end if;
  if (to_jsonb(new) - array['status', 'begonnen_am', 'erledigt_am', 'erledigt_von', 'geaendert_am', 'geaendert_von'])
     is distinct from (to_jsonb(old) - array['status', 'begonnen_am', 'erledigt_am', 'erledigt_von', 'geaendert_am', 'geaendert_von']) then
    raise exception 'Die Einteilung ändert nur der Chef — du kannst den Einsatz nur erledigt melden.';
  end if;
  return new;
end $$;

drop trigger if exists termine_nur_status on public.termine;
create trigger termine_nur_status before update on public.termine
  for each row execute function public.termin_nur_status();

-- Wochenplan: sichtbare Stunden (Standard 6–18 Uhr)
alter table public.firma
  add column if not exists plan_von smallint not null default 6,
  add column if not exists plan_bis smallint not null default 18;
alter table public.firma drop constraint if exists firma_plan_stunden;
alter table public.firma add constraint firma_plan_stunden
  check (plan_von >= 0 and plan_bis <= 24 and plan_von < plan_bis);
