-- =====================================================================
--  Erstaufnahme → Angebot ohne Projekt → Annahme → Projekt (Stufe 3,
--  docs/ABLAUF-TERMIN-BIS-RECHNUNG.md Abschnitte 2–4)
--
--  - erstaufnahmen: Besichtigung vor dem Angebot (Nummer EA-2026-001),
--    Kunde, Adresse (Schnappschuss), Termin, Kundenwunsch, Notizen,
--    Messwerte (freie Liste), Status offen | angebot | auftrag | kein_auftrag.
--  - erstaufnahme_fotos: Fotos und Skizzen; Speicher „projekt-dateien“ unter
--    ea/<erstaufnahme_id>/… (die Policies dort prüfen nur den Bucket) — bei
--    der Annahme werden nur dateien-Zeilen eingetragen, nichts kopiert.
--  - belege.erstaufnahme_id: Angebot hängt an der Erstaufnahme, nicht an
--    einem Projekt. Neue Angebote legen kein Projekt mehr an (App).
--  - projekt_aus_angebot(beleg): Chef „angenommen“ und angebot_annehmen
--    (Kunde online, anon) — legt das Projekt an bzw. stellt ein altes
--    Angebots-Projekt auf „In Arbeit“; idempotent, eine Transaktion.
--  - projekt_aus_erstaufnahme(ea): „Gleich Projekt“ (Kleinauftrag).
--  Nur ergänzend — bestehende Daten bleiben, wie sie sind.
-- =====================================================================

-- ── Nummernkreis EA ─────────────────────────────────────────────────────
alter table public.nummernkreise drop constraint nummernkreise_typ_check;
alter table public.nummernkreise add constraint nummernkreise_typ_check
  check (typ in ('projekt','angebot','rechnung','regie','pruefung','bestellung','kundenlieferschein','erstaufnahme'));

create or replace function public.naechste_nummer(p_typ text, p_datum date) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_jahr int := extract(year from coalesce(p_datum, current_date))::int;
  v_n int;
begin
  insert into public.nummernkreise as nk (typ, jahr, letzte)
  values (p_typ, v_jahr, 1)
  on conflict (typ, jahr) do update set letzte = nk.letzte + 1
  returning nk.letzte into v_n;

  return case p_typ
    when 'projekt' then v_jahr || '-' || lpad(v_n::text, 4, '0')
    when 'angebot' then 'AN-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'rechnung' then 'RE-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'regie' then 'RB-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'pruefung' then 'PR-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'bestellung' then 'BE-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'kundenlieferschein' then 'LS-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'erstaufnahme' then 'EA-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
  end;
end $$;
revoke execute on function public.naechste_nummer(text, date) from public, anon, authenticated;

-- ── Tabellen ────────────────────────────────────────────────────────────
create table public.erstaufnahmen (
  id uuid primary key default gen_random_uuid(),
  -- '' nur als Platzhalter; der Trigger vergibt die Nummer
  nummer text not null default '' unique,
  kunde_id uuid references public.kunden(id) on delete set null,
  strasse text,
  plz text,
  ort text,
  termin_id uuid references public.termine(id) on delete set null,
  kundenwunsch text,
  notizen text,
  -- [{bezeichnung, wert, einheit}] — freie Liste mit Vorschlägen
  messwerte jsonb not null default '[]'::jsonb check (jsonb_typeof(messwerte) = 'array'),
  status text not null default 'offen' check (status in ('offen','angebot','auftrag','kein_auftrag')),
  projekt_id uuid references public.projekte(id) on delete set null,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.erstaufnahmen (kunde_id);
create index on public.erstaufnahmen (projekt_id);
create index on public.erstaufnahmen (status);
-- Je Besichtigungstermin eine Erstaufnahme („öffnet die zugehörige“)
create unique index erstaufnahmen_termin_einmal on public.erstaufnahmen (termin_id) where termin_id is not null;

create table public.erstaufnahme_fotos (
  id uuid primary key default gen_random_uuid(),
  erstaufnahme_id uuid not null references public.erstaufnahmen(id) on delete cascade,
  -- Bild wie gezeigt (mit Zeichnung); original_pfad = Foto ohne Zeichnung
  pfad text not null unique check (pfad like 'ea/%'),
  original_pfad text check (original_pfad is null or original_pfad like 'ea/%'),
  beschriftung text,
  skizze boolean not null default false,
  reihenfolge int not null default 0,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.erstaufnahme_fotos (erstaufnahme_id, reihenfolge);

alter table public.belege
  add column if not exists erstaufnahme_id uuid references public.erstaufnahmen(id) on delete set null;
create index if not exists belege_erstaufnahme on public.belege (erstaufnahme_id) where erstaufnahme_id is not null;

-- Projekt-Datei aus einem Erstaufnahme-Foto (Ordner „Erstaufnahme“ im Projekt)
alter table public.dateien
  add column if not exists erstaufnahme_foto_id uuid references public.erstaufnahme_fotos(id) on delete set null;

-- ── Trigger ─────────────────────────────────────────────────────────────
create trigger erstaufnahmen_updated before update on public.erstaufnahmen
  for each row execute function public.updated_at_setzen();

create function public.erstaufnahme_nummer_vergeben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nummer := public.naechste_nummer('erstaufnahme', current_date);
  return new;
end $$;
create trigger erstaufnahmen_nummer before insert on public.erstaufnahmen
  for each row execute function public.erstaufnahme_nummer_vergeben();

-- Nummer fest; Status und Projekt setzt nur der Chef (bzw. die Funktionen)
create function public.erstaufnahme_schutz() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.nummer is distinct from old.nummer then
    raise exception 'Die Nummer der Erstaufnahme bleibt, wie sie ist.';
  end if;
  if auth.uid() is null or public.ist_chef() then return new; end if;
  if tg_op = 'INSERT' and (new.status <> 'offen' or new.projekt_id is not null) then
    raise exception 'Eine neue Erstaufnahme beginnt „offen“ und ohne Projekt.';
  end if;
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.projekt_id is distinct from old.projekt_id) then
    raise exception 'Ob aus der Erstaufnahme ein Angebot oder Auftrag wird, entscheidet der Chef.';
  end if;
  return new;
end $$;
create trigger erstaufnahmen_schutz before insert or update on public.erstaufnahmen
  for each row execute function public.erstaufnahme_schutz();

-- Angebot zur Erstaufnahme gespeichert → Erstaufnahme „Angebot“
create function public.beleg_erstaufnahme_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.typ = 'angebot' and new.erstaufnahme_id is not null then
    update public.erstaufnahmen set status = 'angebot' where id = new.erstaufnahme_id and status = 'offen';
  end if;
  return null;
end $$;
create trigger belege_erstaufnahme_status after insert or update of erstaufnahme_id on public.belege
  for each row execute function public.beleg_erstaufnahme_status();

-- Fotos, die nach dem Auftrag dazukommen oder geändert werden, landen auch im Projekt
create function public.erstaufnahme_foto_ins_projekt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e public.erstaufnahmen;
begin
  select * into e from public.erstaufnahmen where id = new.erstaufnahme_id;
  if e.projekt_id is null then return null; end if;
  if tg_op = 'UPDATE' then
    update public.dateien
       set pfad = new.pfad,
           beschreibung = 'Erstaufnahme ' || e.nummer || coalesce(': ' || nullif(btrim(new.beschriftung), ''), '')
     where erstaufnahme_foto_id = new.id;
    if found then return null; end if;
  end if;
  perform public.erstaufnahme_dateien_eintragen(e.id, e.projekt_id);
  return null;
end $$;

-- ── Fotos der Erstaufnahme als Projekt-Dateien (ohne Kopieren) ──────────
create function public.erstaufnahme_dateien_eintragen(p_ea uuid, p_projekt uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.dateien (projekt_id, user_id, pfad, name, mime, groesse, art, beschreibung, erstaufnahme_foto_id)
  select p_projekt,
         (select p.id from public.profiles p where p.id = f.erstellt_von),
         f.pfad,
         coalesce(nullif(btrim(f.beschriftung), ''), case when f.skizze then 'Skizze' else 'Foto' end)
           || case when f.pfad like '%.png' then '.png' else '.jpg' end,
         case when f.pfad like '%.png' then 'image/png' else 'image/jpeg' end,
         (select (o.metadata->>'size')::bigint from storage.objects o where o.bucket_id = 'projekt-dateien' and o.name = f.pfad),
         'foto',
         'Erstaufnahme ' || e.nummer || coalesce(': ' || nullif(btrim(f.beschriftung), ''), ''),
         f.id
    from public.erstaufnahme_fotos f
    join public.erstaufnahmen e on e.id = f.erstaufnahme_id
   where f.erstaufnahme_id = p_ea
     and not exists (select 1 from public.dateien d where d.erstaufnahme_foto_id = f.id)
  on conflict (pfad) do nothing;
end $$;
revoke execute on function public.erstaufnahme_dateien_eintragen(uuid, uuid) from public, anon, authenticated;

create trigger erstaufnahme_fotos_projekt after insert or update of pfad, beschriftung on public.erstaufnahme_fotos
  for each row execute function public.erstaufnahme_foto_ins_projekt();

/**
 * Erstaufnahme ins Projekt: Status „auftrag“, Fotos/Skizzen als Dateien,
 * Besichtigungstermin bekommt das Projekt, Kundenwunsch/Notizen/Messwerte in
 * die (leere) Projektbeschreibung. Mehrfach aufrufen schadet nicht.
 */
create function public.erstaufnahme_ins_projekt(p_ea uuid, p_projekt uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.erstaufnahmen;
  v_text text;
begin
  select * into e from public.erstaufnahmen where id = p_ea for update;
  if e.id is null then return; end if;
  update public.erstaufnahmen set status = 'auftrag', projekt_id = p_projekt
   where id = p_ea and (status <> 'auftrag' or projekt_id is distinct from p_projekt);
  perform public.erstaufnahme_dateien_eintragen(p_ea, p_projekt);
  if e.termin_id is not null then
    update public.termine set projekt_id = p_projekt where id = e.termin_id and projekt_id is null;
  end if;
  v_text := concat_ws(E'\n\n',
    'Aus Erstaufnahme ' || e.nummer,
    'Kundenwunsch: ' || nullif(btrim(e.kundenwunsch), ''),
    'Notizen: ' || nullif(btrim(e.notizen), ''),
    'Messwerte: ' || nullif((
      select string_agg(btrim(concat_ws(' ', btrim(m->>'bezeichnung') || ':', btrim(m->>'wert'), nullif(btrim(m->>'einheit'), ''))), '; ')
        from jsonb_array_elements(e.messwerte) m
       where nullif(btrim(m->>'wert'), '') is not null), ''));
  update public.projekte set beschreibung = left(v_text, 4000)
   where id = p_projekt and nullif(btrim(beschreibung), '') is null;
end $$;
revoke execute on function public.erstaufnahme_ins_projekt(uuid, uuid) from public, anon, authenticated;

/**
 * Angebot angenommen → Projekt. Intern (auch für angebot_annehmen als anon):
 *  - Angebot „offen“ → „angenommen“; abgelehnte werden kein Projekt
 *  - hat es ein Projekt (alte Angebote): wie bisher „Angebot“ → „In Arbeit“
 *  - sonst das Projekt der Erstaufnahme (andere Variante schon angenommen)
 *    oder ein neues: Name = Betreff, Kunde, Adresse aus Erstaufnahme bzw.
 *    Angebotsanschrift, „In Arbeit“
 *  - Erstaufnahme ins Projekt, andere offene Varianten → „abgelehnt“
 */
create function public.projekt_aus_angebot_intern(p_beleg uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b public.belege;
  e public.erstaufnahmen;
  v_projekt uuid;
  v_ea_adresse boolean;
begin
  select * into b from public.belege where id = p_beleg for update;
  if b.id is null or b.typ <> 'angebot' then raise exception 'Angebot nicht gefunden.'; end if;
  if b.status = 'abgelehnt' then raise exception 'Das Angebot ist abgelehnt — daraus wird kein Projekt.'; end if;
  if b.status = 'offen' then
    update public.belege set status = 'angenommen' where id = b.id;
  end if;
  if b.erstaufnahme_id is not null then
    select * into e from public.erstaufnahmen where id = b.erstaufnahme_id for update;
  end if;

  v_projekt := b.projekt_id;
  if v_projekt is null and e.projekt_id is not null then
    v_projekt := e.projekt_id;
  end if;
  if v_projekt is null then
    v_ea_adresse := e.id is not null and coalesce(nullif(btrim(e.strasse), ''), nullif(btrim(e.ort), '')) is not null;
    insert into public.projekte (name, kunde_id, status, strasse, plz, ort)
    values (
      left(coalesce(nullif(btrim(b.betreff), ''), nullif(btrim(b.empf_name), ''), 'Angebot ' || coalesce(b.nummer, '')), 120),
      coalesce(b.kunde_id, e.kunde_id),
      'aktiv',
      case when v_ea_adresse then nullif(btrim(e.strasse), '') else nullif(btrim(b.empf_strasse), '') end,
      case when v_ea_adresse then nullif(btrim(e.plz), '') else nullif(btrim(b.empf_plz), '') end,
      case when v_ea_adresse then nullif(btrim(e.ort), '') else nullif(btrim(b.empf_ort), '') end)
    returning id into v_projekt;
  else
    update public.projekte set status = 'aktiv' where id = v_projekt and status = 'angebot';
  end if;

  update public.belege set projekt_id = v_projekt where id = b.id and projekt_id is null;
  if e.id is not null then
    perform public.erstaufnahme_ins_projekt(e.id, v_projekt);
    update public.belege set status = 'abgelehnt'
     where erstaufnahme_id = e.id and typ = 'angebot' and id <> b.id and status = 'offen';
  end if;
  return v_projekt;
end $$;
revoke execute on function public.projekt_aus_angebot_intern(uuid) from public, anon, authenticated;

/** Chef: „Angebot angenommen“ — gibt die Projekt-ID zurück */
create function public.projekt_aus_angebot(p_beleg uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_chef() then raise exception 'Nur der Chef kann ein Angebot annehmen.'; end if;
  return public.projekt_aus_angebot_intern(p_beleg);
end $$;
revoke execute on function public.projekt_aus_angebot(uuid) from public, anon;
grant execute on function public.projekt_aus_angebot(uuid) to authenticated;

/** Chef: „Gleich Projekt“ — Kleinauftrag ohne Angebot. Gibt die Projekt-ID zurück. */
create function public.projekt_aus_erstaufnahme(p_ea uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e public.erstaufnahmen;
  v_projekt uuid;
  v_name text;
begin
  if not public.ist_chef() then raise exception 'Nur der Chef macht aus einer Erstaufnahme ein Projekt.'; end if;
  select * into e from public.erstaufnahmen where id = p_ea for update;
  if e.id is null then raise exception 'Erstaufnahme nicht gefunden.'; end if;
  if e.projekt_id is not null then return e.projekt_id; end if;
  select left(coalesce(
           nullif(btrim(split_part(btrim(coalesce(e.kundenwunsch, '')), E'\n', 1)), ''),
           (select k.name from public.kunden k where k.id = e.kunde_id),
           'Auftrag ' || e.nummer), 120)
    into v_name;
  insert into public.projekte (name, kunde_id, status, strasse, plz, ort)
  values (v_name, e.kunde_id, 'aktiv', nullif(btrim(e.strasse), ''), nullif(btrim(e.plz), ''), nullif(btrim(e.ort), ''))
  returning id into v_projekt;
  perform public.erstaufnahme_ins_projekt(e.id, v_projekt);
  return v_projekt;
end $$;
revoke execute on function public.projekt_aus_erstaufnahme(uuid) from public, anon;
grant execute on function public.projekt_aus_erstaufnahme(uuid) to authenticated;

-- ── Kunde nimmt online an: Projekt wie beim Chef ───────────────────────
create or replace function public.angebot_annehmen(p_token text, p_name text, p_stand timestamptz, p_unterschrift text, p_akzeptiert boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link public.angebot_links;
  v_zustand text;
  b public.belege;
  v_name text := btrim(coalesce(p_name, ''));
begin
  v_link := public.angebot_link_zu(p_token);
  -- Sperre gegen zwei gleichzeitige Annahmen
  if v_link.id is not null then
    select * into b from public.belege where id = v_link.beleg_id for update;
  end if;
  v_zustand := public.angebot_link_zustand(v_link);
  if v_zustand = 'angenommen' then raise exception 'Dieses Angebot wurde bereits angenommen.'; end if;
  if v_zustand = 'abgelaufen' then raise exception 'Dieses Angebot ist abgelaufen — bitte melden Sie sich bei uns.'; end if;
  if v_zustand <> 'offen' then raise exception 'Dieses Angebot kann nicht mehr angenommen werden.'; end if;
  if p_stand is null or b.updated_at is distinct from p_stand then
    raise exception 'Das Angebot wurde inzwischen geändert — bitte die Seite neu laden und noch einmal prüfen.';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Bitte Vor- und Nachnamen eintragen.'; end if;
  if not coalesce(p_akzeptiert, false) then raise exception 'Bitte bestätigen Sie das Angebot mit dem Haken.'; end if;
  if p_unterschrift is null or split_part(p_unterschrift, '/', 1) <> v_link.token
     or not exists (select 1 from storage.objects o where o.bucket_id = 'angebot-bestaetigung' and o.name = p_unterschrift) then
    raise exception 'Die Unterschrift fehlt — bitte noch einmal unterschreiben.';
  end if;

  -- Status „angenommen“ + Projekt (neu, aus der Erstaufnahme, oder altes „Angebot“ → „In Arbeit“)
  perform public.projekt_aus_angebot_intern(b.id);
  insert into public.angebot_verlauf (beleg_id, art, name, unterschrift_pfad, betrag, text, gelesen)
  values (b.id, 'angenommen', v_name, p_unterschrift, b.brutto, 'Online angenommen', false);
  return jsonb_build_object('zustand', 'angenommen', 'zeit', now());
end $$;
revoke execute on function public.angebot_annehmen(text, text, timestamptz, text, boolean) from public;
grant execute on function public.angebot_annehmen(text, text, timestamptz, text, boolean) to anon, authenticated;

-- ── Rechte ──────────────────────────────────────────────────────────────
alter table public.erstaufnahmen enable row level security;
alter table public.erstaufnahme_fotos enable row level security;

-- Erstaufnahmen: alle Aktiven (Monteure mit Besichtigung), löschen nur der Chef und nicht nach dem Auftrag
create policy erstaufnahmen_lesen on public.erstaufnahmen for select to authenticated using (public.ist_aktiv());
create policy erstaufnahmen_anlegen on public.erstaufnahmen for insert to authenticated with check (public.ist_aktiv());
create policy erstaufnahmen_aendern on public.erstaufnahmen for update to authenticated
  using (public.ist_aktiv()) with check (public.ist_aktiv());
create policy erstaufnahmen_loeschen on public.erstaufnahmen for delete to authenticated
  using (public.ist_chef() and status <> 'auftrag');

create policy ea_fotos_lesen on public.erstaufnahme_fotos for select to authenticated using (public.ist_aktiv());
create policy ea_fotos_anlegen on public.erstaufnahme_fotos for insert to authenticated with check (public.ist_aktiv());
create policy ea_fotos_aendern on public.erstaufnahme_fotos for update to authenticated
  using (public.ist_aktiv()) with check (public.ist_aktiv());
-- Nach dem Auftrag stecken die Fotos im Projekt — dann bleiben sie
create policy ea_fotos_loeschen on public.erstaufnahme_fotos for delete to authenticated
  using ((erstellt_von = auth.uid() or public.ist_chef())
         and not exists (select 1 from public.erstaufnahmen e where e.id = erstaufnahme_id and e.status = 'auftrag'));

-- Speicher: eine Datei, auf die ein Erstaufnahme-Foto zeigt, löscht niemand
-- (auch nicht „Foto löschen“ im Projekt — dort verschwindet nur die Zeile)
create policy erstaufnahme_dateien_bleiben on storage.objects as restrictive for delete to authenticated
  using (not (storage.objects.bucket_id = 'projekt-dateien' and storage.objects.name like 'ea/%'
              and exists (select 1 from public.erstaufnahme_fotos f
                           where f.pfad = storage.objects.name or f.original_pfad = storage.objects.name)));

alter publication supabase_realtime add table public.erstaufnahmen;

notify pgrst, 'reload schema';
