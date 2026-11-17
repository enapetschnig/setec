-- =====================================================================
--  Regiebericht auch ohne Projekt (Service, Reparatur, Wartung)
--  Besprechung 17.11.2026, Abschnitt d) — docs/ABLAUF-TERMIN-BIS-RECHNUNG.md, 6.
-- =====================================================================
--
-- Nur ergänzend: bestehende Berichte haben alle ein Projekt und bleiben
-- gültig. Neu:
--   1. regieberichte.projekt_id optional; dafür kunde_id, Einsatzort als
--      Schnappschuss (strasse/plz/ort) und termin_id. Pflicht: Projekt ODER
--      Kunde. Ein Kunde mit Regieberichten lässt sich nicht löschen
--      (restrict) — der unterschriebene Bericht ist ein Beleg.
--   2. Material am Regiebericht ohne Projekt: CHECK buchung_passt verlangt
--      bei Ausfassen/Rückgabe/direkt Projekt ODER Regiebericht. Der Bus
--      wird weiter abgebucht (lagerbestand hängt nicht am Projekt).
--      nur_in_arbeit_buchen lässt Buchungen ohne Projekt schon heute durch.
--   3. Fotos am Regiebericht: dateien.regiebericht_id, projekt_id optional,
--      CHECK Projekt ODER Regiebericht. Mit Projekt hängen sie an beidem
--      (stehen auch im Projektordner). Nach der Unterschrift fest wie
--      Stunden und Material — sonst änderte sich das unterschriebene PDF.
--   4. Entwurf ohne Projekt löschen: Stunden, Material und Fotos des
--      Berichts gehen mit — sie hängen an nichts anderem (sonst verwaiste
--      Stunden bzw. der CHECK aus 2./3. bricht das Löschen ab).
--   5. regie_schutz: termin_id darf nach der Unterschrift noch auf leer
--      (Termin gelöscht → on delete set null), sonst nichts.
--   6. regie_zeiten_zuordnen: ohne Projekt nimmt „weg“ nichts heraus —
--      Stunden ohne Projekt und ohne Bericht hingen an nichts mehr.
--      „dazu“ greift ohne Projekt ohnehin nicht (projekt_id = null).
--   7. Unterschrift ohne Projekt: regie/<regie_id>/unterschriften/… —
--      die Policy unterschriften_bleiben (%/unterschriften/%) gilt auch dort.
-- =====================================================================

-- ── 1. Regiebericht: Projekt oder Kunde ─────────────────────────────────
alter table public.regieberichte
  alter column projekt_id drop not null,
  add column kunde_id uuid references public.kunden(id) on delete restrict,
  add column strasse text,
  add column plz text,
  add column ort text,
  add column termin_id uuid references public.termine(id) on delete set null,
  add constraint regie_projekt_oder_kunde check (projekt_id is not null or kunde_id is not null);

create index regieberichte_kunde_id_idx on public.regieberichte (kunde_id);
create index regieberichte_termin_id_idx on public.regieberichte (termin_id);
-- „Noch nicht verrechnet“ unter Rechnungen
create index regieberichte_offen_idx on public.regieberichte (datum)
  where status = 'unterschrieben' and rechnung_id is null;

-- ── 2. Material: Projekt oder Regiebericht ──────────────────────────────
alter table public.material_buchungen drop constraint buchung_passt;
alter table public.material_buchungen add constraint buchung_passt check (case art
  when 'korrektur' then menge <> 0 and artikel_id is not null and lagerort_id is not null
  when 'zugang' then menge > 0 and artikel_id is not null and lagerort_id is not null
  when 'abgang' then menge > 0 and artikel_id is not null and lagerort_id is not null
  when 'ausfassung' then menge > 0 and (projekt_id is not null or regiebericht_id is not null) and (artikel_id is null or lagerort_id is not null)
  when 'rueckgabe' then menge > 0 and (projekt_id is not null or regiebericht_id is not null) and (artikel_id is null or lagerort_id is not null)
  when 'direkt' then menge > 0 and (projekt_id is not null or regiebericht_id is not null) and lagerort_id is null
end);

-- ── 3. Fotos am Regiebericht ────────────────────────────────────────────
alter table public.dateien
  alter column projekt_id drop not null,
  add column regiebericht_id uuid references public.regieberichte(id) on delete set null,
  add constraint dateien_projekt_oder_regie check (projekt_id is not null or regiebericht_id is not null);
create index dateien_regiebericht_id_idx on public.dateien (regiebericht_id);

create or replace function public.regie_foto_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE')
     and new.regiebericht_id is not null
     and (tg_op = 'INSERT' or new.regiebericht_id is distinct from old.regiebericht_id)
     and public.regie_unterschrieben(new.regiebericht_id) then
    raise exception 'Der Regiebericht ist schon unterschrieben — Fotos lassen sich nicht mehr ändern.';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and public.regie_unterschrieben(old.regiebericht_id) then
    if tg_op = 'DELETE' then
      raise exception 'Foto aus einem unterschriebenen Regiebericht — kann nicht gelöscht werden.';
    end if;
    if new.regiebericht_id is distinct from old.regiebericht_id or new.pfad is distinct from old.pfad then
      raise exception 'Der Regiebericht ist schon unterschrieben — Fotos lassen sich nicht mehr ändern.';
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.regie_foto_schutz() from public, anon, authenticated;
create trigger dateien_regie_schutz before insert or update or delete on public.dateien
  for each row execute function public.regie_foto_schutz();

-- ── 4. Entwurf ohne Projekt löschen: Buchungen und Fotos gehen mit ──────
-- Läuft vor dem Löschen (security definer: auch Stunden eines Kollegen aus
-- der Partie — die hängen an nichts anderem). Unterschriebene Berichte hält
-- regie_schutz auf; dann rollt alles zurück.
create or replace function public.regie_ohne_projekt_aufraeumen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.projekt_id is null and old.status = 'entwurf' then
    delete from public.zeiten where regiebericht_id = old.id and projekt_id is null and rechnung_id is null;
    delete from public.material_buchungen where regiebericht_id = old.id and projekt_id is null and rechnung_id is null;
    delete from public.dateien where regiebericht_id = old.id and projekt_id is null;
  end if;
  return old;
end $$;
revoke execute on function public.regie_ohne_projekt_aufraeumen() from public, anon, authenticated;
create trigger regieberichte_ohne_projekt_aufraeumen before delete on public.regieberichte
  for each row execute function public.regie_ohne_projekt_aufraeumen();

-- ── 5. Festgeschrieben, nur Verrechnung und gelöschter Termin ändern sich ─
create or replace function public.regie_schutz() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'entwurf' then
      raise exception 'Ein unterschriebener Regiebericht kann nicht gelöscht werden.';
    end if;
    return old;
  end if;
  if old.status = 'unterschrieben'
     and ((to_jsonb(new) - 'rechnung_id' - 'updated_at' - 'termin_id') is distinct from (to_jsonb(old) - 'rechnung_id' - 'updated_at' - 'termin_id')
          or (new.termin_id is distinct from old.termin_id and new.termin_id is not null)) then
    raise exception 'Ein unterschriebener Regiebericht ist festgeschrieben.';
  end if;
  return new;
end $$;

-- ── 6. Stunden zuordnen: ohne Projekt nichts herausnehmen ───────────────
create or replace function public.regie_zeiten_zuordnen(
  p_regie uuid,
  p_dazu uuid[] default '{}',
  p_weg uuid[] default '{}'
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_projekt uuid;
  v_datum date;
  v_status text;
  v_dazu uuid[];
  v_weg uuid[];
begin
  if not public.ist_aktiv() then
    raise exception 'Kein Zugriff.';
  end if;

  -- Sperre gegen gleichzeitiges Unterschreiben auf einem zweiten Gerät
  select projekt_id, datum, status into v_projekt, v_datum, v_status
    from public.regieberichte where id = p_regie for update;
  if not found then
    raise exception 'Regiebericht nicht gefunden.';
  end if;
  if v_status <> 'entwurf' then
    raise exception 'Der Regiebericht ist schon unterschrieben.';
  end if;

  with geaendert as (
    update public.zeiten set regiebericht_id = p_regie
     where id = any(coalesce(p_dazu, '{}'))
       and regiebericht_id is null
       and rechnung_id is null
       and projekt_id = v_projekt
       and datum = v_datum
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_dazu from geaendert;

  with geaendert as (
    update public.zeiten set regiebericht_id = null
     where id = any(coalesce(p_weg, '{}'))
       and regiebericht_id = p_regie
       and rechnung_id is null
       and v_projekt is not null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_weg from geaendert;

  return v_dazu || v_weg;
end $$;

revoke execute on function public.regie_zeiten_zuordnen(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.regie_zeiten_zuordnen(uuid, uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
