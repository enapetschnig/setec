-- ══════════════════════════════════════════════════════════════════════
--  Kunden-Lieferscheine (Wunsch SETEC 16.11.2026)
--  Kunde kauft nur Material (Theke) oder bekommt etwas eigens bestellt:
--  Lieferschein mit Artikeln aus dem Lager, auch Retour-Zeilen. Beim
--  Abschließen bekommt er die Nummer LS-2026-001 und bucht den Lagerstand
--  (Ausgabe = Abgang, Retour = Zugang; freie Zeilen ohne Artikel buchen
--  nichts). Danach fest; der Kunde unterschreibt am Gerät, PDF per Mail
--  oder Druck. Eine Rechnung daraus ändert den Lagerstand nicht.
--  Getrennt von `lieferscheine` (das sind die Lieferscheine der Lieferanten)
--  und von `belege` (Rechnungslisten, Buchhaltung, Offene Posten bleiben sauber).
--  Nur der Chef (Lagerabgang ist Chef-Sache, Trigger material_person_schutz).
-- ══════════════════════════════════════════════════════════════════════

-- ── Nummernkreis LS- ─────────────────────────────────────────────────
alter table public.nummernkreise drop constraint nummernkreise_typ_check;
alter table public.nummernkreise add constraint nummernkreise_typ_check
  check (typ in ('projekt','angebot','rechnung','regie','pruefung','bestellung','kundenlieferschein'));

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
  end;
end $$;
revoke execute on function public.naechste_nummer(text, date) from public, anon, authenticated;

-- ── Tabellen ─────────────────────────────────────────────────────────
create table public.kunden_lieferscheine (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  status text not null default 'entwurf' check (status in ('entwurf', 'fertig')),
  kunde_id uuid references public.kunden(id) on delete set null,
  -- Empfänger beim Schreiben festgehalten (auch Laufkunde ohne Kontakt)
  empf_name text not null default '',
  empf_strasse text,
  empf_plz text,
  empf_ort text,
  empf_email text,
  datum date not null default current_date,
  -- aus diesem Lager wird ausgegeben bzw. zurückgenommen
  lagerort_id uuid references public.lagerorte(id) on delete restrict,
  notiz text,
  fertig_am timestamptz,
  unterschrift_pfad text,
  unterschrift_name text,
  unterschrieben_am timestamptz,
  gesendet_an text,
  gesendet_am timestamptz,
  rechnung_id uuid references public.belege(id) on delete set null,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.kunden_lieferscheine (kunde_id);
create index on public.kunden_lieferscheine (datum desc);
create trigger kunden_lieferscheine_updated before update on public.kunden_lieferscheine
  for each row execute function public.updated_at_setzen();

create table public.kunden_lieferschein_positionen (
  id uuid primary key default gen_random_uuid(),
  lieferschein_id uuid not null references public.kunden_lieferscheine(id) on delete cascade,
  pos int not null default 0,
  artikel_id uuid references public.artikel(id) on delete set null,
  artikelnummer text,
  bezeichnung text not null check (btrim(bezeichnung) <> ''),
  menge numeric(12,3) not null check (menge > 0),
  einheit text not null default 'Stk',
  -- Retour: kommt vom Kunden zurück (Zugang ins Lager)
  retour boolean not null default false
);
create index on public.kunden_lieferschein_positionen (lieferschein_id, pos);

-- ── Rechte: nur der Chef ─────────────────────────────────────────────
alter table public.kunden_lieferscheine enable row level security;
alter table public.kunden_lieferschein_positionen enable row level security;
create policy kls_chef on public.kunden_lieferscheine for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy klsp_chef on public.kunden_lieferschein_positionen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- ── Festschreiben ────────────────────────────────────────────────────
-- Fertig = Lager ist gebucht: Inhalt fest. Danach nur noch Unterschrift
-- (einmal), Versandvermerk, Rechnung und Notiz. Löschen nur als Entwurf.
create function public.kunden_lieferschein_schutz() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'fertig' then
      raise exception 'Der Lieferschein ist abgeschlossen und im Lager gebucht — löschen geht nicht. Für Rücknahmen einen Retour-Lieferschein schreiben.';
    end if;
    return old;
  end if;
  if old.status = 'fertig' then
    -- kunde_id bleibt frei: wird der Kontakt gelöscht, setzt die Datenbank ihn auf NULL (Name steht im Lieferschein)
    if (new.status, new.nummer, new.empf_name, new.empf_strasse, new.empf_plz, new.empf_ort, new.datum, new.lagerort_id, new.fertig_am)
       is distinct from (old.status, old.nummer, old.empf_name, old.empf_strasse, old.empf_plz, old.empf_ort, old.datum, old.lagerort_id, old.fertig_am) then
      raise exception 'Der Lieferschein ist abgeschlossen — Inhalt nicht mehr änderbar.';
    end if;
    if old.unterschrift_pfad is not null
       and (new.unterschrift_pfad, new.unterschrift_name, new.unterschrieben_am) is distinct from (old.unterschrift_pfad, old.unterschrift_name, old.unterschrieben_am) then
      raise exception 'Der Lieferschein ist schon unterschrieben.';
    end if;
  elsif new.unterschrift_pfad is not null then
    raise exception 'Erst abschließen, dann unterschreiben lassen.';
  end if;
  if new.status = 'fertig' and old.status = 'entwurf' and current_setting('setec.kls_abschluss', true) is distinct from 'ja' then
    raise exception 'Abschließen nur über „Abschließen“ (bucht das Lager).';
  end if;
  return new;
end $$;
create trigger kunden_lieferschein_schutz before update or delete on public.kunden_lieferscheine
  for each row execute function public.kunden_lieferschein_schutz();

create function public.kunden_lieferschein_pos_schutz() returns trigger
language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.kunden_lieferscheine
   where id = coalesce(new.lieferschein_id, old.lieferschein_id);
  if v_status = 'fertig' then
    raise exception 'Der Lieferschein ist abgeschlossen — Zeilen nicht mehr änderbar.';
  end if;
  return coalesce(new, old);
end $$;
create trigger kunden_lieferschein_pos_schutz before insert or update or delete on public.kunden_lieferschein_positionen
  for each row execute function public.kunden_lieferschein_pos_schutz();

-- ── Abschließen: Nummer + Lagerbuchung in einem Schritt ──────────────
create function public.kunden_lieferschein_abschliessen(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  l public.kunden_lieferscheine;
  v_nummer text;
begin
  if not public.ist_chef() then raise exception 'Nur der Chef.'; end if;
  select * into l from public.kunden_lieferscheine where id = p_id for update;
  if not found then raise exception 'Lieferschein nicht gefunden.'; end if;
  if l.status <> 'entwurf' then raise exception 'Der Lieferschein ist schon abgeschlossen.'; end if;
  if btrim(l.empf_name) = '' then raise exception 'Bitte den Kunden eintragen.'; end if;
  if not exists (select 1 from public.kunden_lieferschein_positionen where lieferschein_id = p_id) then
    raise exception 'Der Lieferschein hat keine Zeilen.';
  end if;
  if l.lagerort_id is null and exists (select 1 from public.kunden_lieferschein_positionen where lieferschein_id = p_id and artikel_id is not null) then
    raise exception 'Bitte das Lager wählen, aus dem ausgegeben wird.';
  end if;

  v_nummer := public.naechste_nummer('kundenlieferschein', l.datum);

  insert into public.material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, ek_preis, vorgang, notiz, user_id)
  select case when p.retour then 'zugang' else 'abgang' end, p.artikel_id, p.bezeichnung, p.einheit, p.menge, l.lagerort_id,
         a.ek_preis, p_id,
         left((case when p.retour then 'Retour ' else '' end) || 'Lieferschein ' || v_nummer || ' · ' || l.empf_name, 200),
         auth.uid()
    from public.kunden_lieferschein_positionen p
    left join public.artikel a on a.id = p.artikel_id
   where p.lieferschein_id = p_id and p.artikel_id is not null
   order by p.pos;

  perform set_config('setec.kls_abschluss', 'ja', true);
  update public.kunden_lieferscheine set status = 'fertig', nummer = v_nummer, fertig_am = now() where id = p_id;
  perform set_config('setec.kls_abschluss', '', true);
  return v_nummer;
end $$;
revoke execute on function public.kunden_lieferschein_abschliessen(uuid) from public, anon;
grant execute on function public.kunden_lieferschein_abschliessen(uuid) to authenticated;

-- ── Ablage der Unterschrift (privat, nur Chef; nie löschen) ──────────
insert into storage.buckets (id, name, public) values ('kunden-lieferscheine', 'kunden-lieferscheine', false)
  on conflict (id) do nothing;
create policy kls_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'kunden-lieferscheine' and public.ist_chef());
create policy kls_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'kunden-lieferscheine' and public.ist_chef());
