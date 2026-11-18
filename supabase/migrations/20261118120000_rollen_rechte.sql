-- =====================================================================
--  Rollen mit Rechten (Stefan, 18.11.2026): „weitere Rollen neben Chef
--  und Monteur — Büro, Lehrling — Rechte selbst festlegen; Melanie soll
--  die Buchhaltung sehen, Klaus nicht.“
-- =====================================================================
--
-- Aufbau: `profiles.rolle` bleibt die Grundstufe (chef = Büro-Zugang,
-- monteur = Baustelle) — alle bestehenden Regeln mit ist_chef() gelten
-- unverändert. Darüber liegt `rollen` mit einer Liste von Rechten.
-- `profiles.rolle_id` leer = die eingebaute Rolle der Grundstufe
-- (Chef bzw. Monteur) → für alle bestehenden Konten ändert sich nichts.
--
-- Wo ein Recht fehlt, sperren zusätzliche RESTRICTIVE-Regeln (nur für
-- `authenticated`, das Angebot-Bestätigen als anon bleibt unberührt)
-- und die RPCs selbst. Neue Bereiche später: Recht in die Liste unten,
-- in `src/lib/rechte.ts` und in die Regeln — eigene Rollen bekommen es
-- erst, wenn der Chef es anhakt.
-- =====================================================================

create table public.rollen (
  id uuid primary key default gen_random_uuid(),
  -- eingebaute Rollen: chef, buero, monteur, lehrling; eigene: leer
  schluessel text unique check (schluessel in ('chef','buero','monteur','lehrling')),
  name text not null check (length(btrim(name)) between 1 and 40),
  basis text not null check (basis in ('chef','monteur')),
  rechte text[] not null default '{}' check (rechte <@ array[
    'rechnungen','eingang','buchhaltung','personal','mitarbeiter','einstellungen',
    'projekte_anlegen','stunden_andere','regie','material']::text[]),
  reihenfolge int not null default 100,
  created_at timestamptz not null default now()
);
create unique index rollen_name_key on public.rollen (lower(btrim(name)));

insert into public.rollen (schluessel, name, basis, rechte, reihenfolge) values
  ('chef', 'Chef', 'chef', array['rechnungen','eingang','buchhaltung','personal','mitarbeiter','einstellungen',
    'projekte_anlegen','stunden_andere','regie','material'], 0),
  ('buero', 'Büro', 'chef', array['rechnungen','eingang','buchhaltung',
    'projekte_anlegen','stunden_andere','regie','material'], 10),
  ('monteur', 'Monteur', 'monteur', array['projekte_anlegen','stunden_andere','regie','material'], 20),
  ('lehrling', 'Lehrling', 'monteur', array['regie','material'], 30);

alter table public.profiles add column rolle_id uuid references public.rollen(id) on delete restrict;
create index profiles_rolle_id_idx on public.profiles (rolle_id);

-- ── Wer hat welches Recht ───────────────────────────────────────────────
create or replace function public.hat_recht_von(p_user uuid, p_recht text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.aktiv and (r.schluessel = 'chef' or p_recht = any(r.rechte))
      from public.profiles p
      join public.rollen r on r.id = coalesce(p.rolle_id,
        (select x.id from public.rollen x where x.schluessel = case p.rolle when 'chef' then 'chef' else 'monteur' end))
     where p.id = p_user), false)
$$;

create or replace function public.hat_recht(p_recht text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.hat_recht_von(auth.uid(), p_recht)
$$;

-- Voller Chef = Grundstufe chef mit der eingebauten Rolle „Chef“ (oder ohne Rolle)
create or replace function public.ist_voller_chef_id(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.aktiv and p.rolle = 'chef'
       and (p.rolle_id is null or p.rolle_id = (select id from public.rollen where schluessel = 'chef'))
      from public.profiles p where p.id = p_user), false)
$$;

create or replace function public.ist_voller_chef() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_voller_chef_id(auth.uid())
$$;

revoke execute on function public.hat_recht_von(uuid, text), public.ist_voller_chef_id(uuid) from public, anon, authenticated;
grant execute on function public.hat_recht_von(uuid, text), public.ist_voller_chef_id(uuid) to service_role;
revoke execute on function public.hat_recht(text), public.ist_voller_chef() from public, anon;
grant execute on function public.hat_recht(text), public.ist_voller_chef() to authenticated;

-- ── Rollen pflegen: nur der volle Chef ─────────────────────────────────
alter table public.rollen enable row level security;
create policy rollen_lesen on public.rollen for select to authenticated using ((select public.ist_aktiv()));
create policy rollen_anlegen on public.rollen for insert to authenticated with check ((select public.ist_voller_chef()));
create policy rollen_aendern on public.rollen for update to authenticated
  using ((select public.ist_voller_chef())) with check ((select public.ist_voller_chef()));
create policy rollen_loeschen on public.rollen for delete to authenticated using ((select public.ist_voller_chef()));

create or replace function public.rollen_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.schluessel is not null then raise exception 'Die eingebauten Rollen bleiben — du kannst ihre Rechte ändern.'; end if;
    if exists (select 1 from public.profiles where rolle_id = old.id) then
      raise exception 'Diese Rolle hat noch jemand — zuerst eine andere Rolle geben.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.schluessel is not null and auth.uid() is not null then raise exception 'Eingebaute Rollen gibt es schon.'; end if;
    return new;
  end if;
  if new.schluessel is distinct from old.schluessel then raise exception 'Eingebaute Rollen bleiben eingebaut.'; end if;
  if new.basis is distinct from old.basis then raise exception 'Büro oder Baustelle legst du beim Anlegen fest.'; end if;
  if old.schluessel = 'chef' and (new.rechte is distinct from old.rechte or new.name is distinct from old.name) then
    raise exception 'Der Chef darf immer alles.';
  end if;
  return new;
end $$;
create trigger rollen_schutz before insert or update or delete on public.rollen
  for each row execute function public.rollen_schutz();
revoke execute on function public.rollen_schutz() from public, anon, authenticated;

-- ── Profil: Rollen vergibt nur der volle Chef ──────────────────────────
create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_chef uuid := (select id from public.rollen where schluessel = 'chef');
  v_alt_voll boolean := old.rolle = 'chef' and (old.rolle_id is null or old.rolle_id = v_chef);
  v_neu_voll boolean;
begin
  if auth.uid() is not null and not public.ist_chef() then
    if new.rolle is distinct from old.rolle or new.rolle_id is distinct from old.rolle_id
       or new.aktiv is distinct from old.aktiv or new.gesperrt is distinct from old.gesperrt then
      raise exception 'Rolle und Freischaltung kann nur der Chef ändern.';
    end if;
    if new.lohnart is distinct from old.lohnart or new.wochenstunden is distinct from old.wochenstunden
       or new.urlaub_tage is distinct from old.urlaub_tage or new.konto_ab is distinct from old.konto_ab then
      raise exception 'Stundensatz, Sollzeit und Urlaubsanspruch kann nur der Chef ändern.';
    end if;
    if new.gruppe is distinct from old.gruppe then
      raise exception 'Die Gruppe im Terminplaner legt der Chef fest.';
    end if;
    if new.passwort_neu and not old.passwort_neu then
      raise exception 'Ein vorläufiges Passwort vergibt nur der Chef.';
    end if;
  elsif auth.uid() is not null and not public.ist_voller_chef() then
    -- Büro-Rollen: nie sich selbst oder andere befördern
    if new.rolle is distinct from old.rolle or new.rolle_id is distinct from old.rolle_id then
      raise exception 'Rollen vergibt nur der Chef.';
    end if;
    if (new.aktiv is distinct from old.aktiv or new.gesperrt is distinct from old.gesperrt
        or new.lohnart is distinct from old.lohnart or new.wochenstunden is distinct from old.wochenstunden
        or new.urlaub_tage is distinct from old.urlaub_tage or new.konto_ab is distinct from old.konto_ab
        or new.gruppe is distinct from old.gruppe or (new.passwort_neu and not old.passwort_neu)) then
      if not public.hat_recht('mitarbeiter') then
        raise exception 'Das darf nur, wer „Mitarbeiter & Zugänge“ verwalten darf.';
      end if;
      if v_alt_voll and old.id <> auth.uid() then
        raise exception 'Beim Chef ändert das nur der Chef selbst.';
      end if;
    end if;
  end if;
  -- Grundstufe folgt der Rolle; alte App-Fassungen setzen nur `rolle` → eingebaute Rolle
  if new.rolle_id is distinct from old.rolle_id and new.rolle_id is not null then
    new.rolle := (select basis from public.rollen where id = new.rolle_id);
  elsif new.rolle is distinct from old.rolle then
    new.rolle_id := null;
  end if;
  -- Freischalten hebt eine Sperre auf; gesperrt heißt immer auch nicht aktiv
  if new.aktiv and not old.aktiv then
    new.gesperrt := false;
  end if;
  if new.gesperrt and not old.gesperrt then
    new.aktiv := false;
  end if;
  v_neu_voll := new.rolle = 'chef' and (new.rolle_id is null or new.rolle_id = v_chef);
  if v_alt_voll and old.aktiv and not (v_neu_voll and new.aktiv)
     and not exists (select 1 from public.profiles where id <> old.id and rolle = 'chef' and aktiv
                       and (rolle_id is null or rolle_id = v_chef)) then
    raise exception 'Es muss mindestens ein aktiver Chef bleiben.';
  end if;
  return new;
end $$;

-- ── Bereiche sperren, wo das Recht fehlt ───────────────────────────────
-- Angebote, Rechnungen, Offene Posten
do $$
declare t text;
begin
  foreach t in array array['belege','beleg_positionen','zahlungen','mahnungen','angebot_links','angebot_verlauf','angebot_vorlagen'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.hat_recht(%L)) or not (select public.ist_chef())) with check ((select public.hat_recht(%L)) or not (select public.ist_chef()))',
      t || '_recht', t, 'rechnungen', 'rechnungen');
  end loop;
  -- Eingangsrechnungen, Bestellungen, Mails im Postfach
  foreach t in array array['eingangsrechnungen','eingang_anteile','eingang_positionen','bestellungen','bestell_positionen','postfach_mails'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.hat_recht(%L)) or not (select public.ist_chef())) with check ((select public.hat_recht(%L)) or not (select public.ist_chef()))',
      t || '_recht', t, 'eingang', 'eingang');
  end loop;
  -- Buchhaltung
  foreach t in array array['fibu_uebergaben','fibu_uebergabe_belege','rechnung_kategorien'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.hat_recht(%L)) or not (select public.ist_chef())) with check ((select public.hat_recht(%L)) or not (select public.ist_chef()))',
      t || '_recht', t, 'buchhaltung', 'buchhaltung');
  end loop;
end $$;

-- Postfach einrichten = Betriebs-Einstellungen (lesen dürfen alle Büro-Rollen)
create policy postfaecher_recht_anlegen on public.postfaecher as restrictive for insert to authenticated
  with check ((select public.hat_recht('einstellungen')));
create policy postfaecher_recht_aendern on public.postfaecher as restrictive for update to authenticated
  using ((select public.hat_recht('einstellungen')));
create policy postfaecher_recht_loeschen on public.postfaecher as restrictive for delete to authenticated
  using ((select public.hat_recht('einstellungen')));

-- Lohnkosten/Sätze ändern = Mitarbeiter (lesen bleibt: Rechnung und Nachkalkulation brauchen den Satz)
create policy saetze_recht_anlegen on public.mitarbeiter_saetze as restrictive for insert to authenticated
  with check ((select public.hat_recht('mitarbeiter')));
create policy saetze_recht_aendern on public.mitarbeiter_saetze as restrictive for update to authenticated
  using ((select public.hat_recht('mitarbeiter')));
create policy saetze_recht_loeschen on public.mitarbeiter_saetze as restrictive for delete to authenticated
  using ((select public.hat_recht('mitarbeiter')));

-- Personal-Dokumente der anderen (Lohnzettel, Krankenscheine)
create policy personal_dokumente_recht on public.personal_dokumente as restrictive for all to authenticated
  using (user_id = (select auth.uid()) or (select public.hat_recht('personal')))
  with check (user_id = (select auth.uid()) or (select public.hat_recht('personal')));
create policy speicher_recht on storage.objects as restrictive for all to authenticated
  using (case bucket_id
    when 'personal' then (storage.foldername(name))[1] = (select auth.uid())::text or (select public.hat_recht('personal'))
    when 'beleg-archiv' then (select public.hat_recht('rechnungen'))
    when 'eingangsrechnungen' then (select public.hat_recht('eingang'))
    else true end)
  with check (case bucket_id
    when 'personal' then (storage.foldername(name))[1] = (select auth.uid())::text or (select public.hat_recht('personal'))
    when 'beleg-archiv' then (select public.hat_recht('rechnungen'))
    when 'eingangsrechnungen' then (select public.hat_recht('eingang'))
    else true end);

-- Baustelle: Projekt anlegen, Regiebericht, Material, Stunden für Kollegen
create policy projekte_recht_anlegen on public.projekte as restrictive for insert to authenticated
  with check ((select public.hat_recht('projekte_anlegen')));
create policy regie_recht_anlegen on public.regieberichte as restrictive for insert to authenticated
  with check ((select public.hat_recht('regie')));
create policy material_recht_anlegen on public.material_buchungen as restrictive for insert to authenticated
  with check ((select public.hat_recht('material')));
create policy zeiten_recht_anlegen on public.zeiten as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.hat_recht('stunden_andere')));
create policy zeiten_recht_aendern on public.zeiten as restrictive for update to authenticated
  using (user_id = (select auth.uid()) or (select public.hat_recht('stunden_andere')))
  with check (user_id = (select auth.uid()) or (select public.hat_recht('stunden_andere')));

-- Betriebsdaten: Arbeitsfelder (Stundensätze, Plan-Zeiten, WhatsApp-Vorlagen,
-- interne Arten) darf jede Büro-Rolle, die Fibu-Felder die Buchhaltung,
-- alles andere (Name, Anschrift, Bank, Logo …) nur „Einstellungen“
create or replace function public.firma_recht() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_frei text[] := array['updated_at','stundensaetze','plan_von','plan_bis','whatsapp_vorlagen','intern_arten'];
  v_fibu text[] := array['fibu_format','fibu_konten'];
begin
  if auth.uid() is null or public.hat_recht('einstellungen') then return new; end if;
  if (to_jsonb(new) - v_frei - v_fibu) is distinct from (to_jsonb(old) - v_frei - v_fibu) then
    raise exception 'Die Betriebsdaten ändert nur, wer die Einstellungen verwalten darf.';
  end if;
  if (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei) and not public.hat_recht('buchhaltung') then
    raise exception 'Die Buchhaltungs-Einstellungen sind für deine Rolle nicht freigegeben.';
  end if;
  return new;
end $$;
create trigger firma_recht before update on public.firma
  for each row execute function public.firma_recht();
revoke execute on function public.firma_recht() from public, anon, authenticated;

-- ── RPCs, die an den Regeln vorbeigehen (security definer) ─────────────
CREATE OR REPLACE FUNCTION public.beleg_fertigstellen(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.belege;
  f public.firma;
  v_netto numeric(12,2);
  v_ust numeric(12,2);
  v_nr text;
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann Belege fertigstellen.';
  end if;
  select * into b from public.belege where id = p_id for update;
  if b.id is null then
    raise exception 'Beleg nicht gefunden.';
  end if;
  if b.status <> 'entwurf' then
    return b.nummer;
  end if;
  if not exists (select 1 from public.beleg_positionen where beleg_id = p_id and art not in ('titel','text')) then
    raise exception 'Der Beleg hat noch keine Position mit Betrag.';
  end if;
  if coalesce(btrim(b.empf_name), '') = '' then
    raise exception 'Bitte zuerst den Empfänger eintragen.';
  end if;

  select * into f from public.firma where id = 1;
  select coalesce(sum(gesamt), 0) into v_netto from public.beleg_positionen where beleg_id = p_id;
  v_ust := case when b.reverse_charge or f.kleinunternehmer then 0 else round(v_netto * b.ust_satz / 100, 2) end;
  v_nr := coalesce(b.nummer, public.naechste_nummer(b.typ, b.datum));

  update public.belege set
    nummer = v_nr,
    status = 'offen',
    fertig_am = now(),
    netto = v_netto,
    ust = v_ust,
    brutto = v_netto + v_ust,
    faellig_am = case when b.typ = 'rechnung' then coalesce(b.faellig_am, b.datum + f.zahlungsziel_tage) end,
    gueltig_bis = case when b.typ = 'angebot' then coalesce(b.gueltig_bis, b.datum + f.angebot_gueltig_tage) end
  where id = p_id;
  return v_nr;
end $function$;

CREATE OR REPLACE FUNCTION public.beleg_stornieren(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.belege;
  v_id uuid := gen_random_uuid();
  -- Datum und Nummernjahr nach Wiener Zeit (der Server rechnet in UTC)
  v_heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann stornieren.';
  end if;
  select * into b from public.belege where id = p_id for update;
  if b.id is null or b.typ <> 'rechnung' or b.status not in ('offen','bezahlt') then
    raise exception 'Nur fertige Rechnungen können storniert werden.';
  end if;

  -- erst als Entwurf — die Positionen einer fertigen Rechnung sind fest
  insert into public.belege (id, typ, status, storno_von, projekt_id, kunde_id,
    empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email,
    datum, leistung_von, leistung_bis, betreff, einleitung, schlusstext, ust_satz, reverse_charge)
  values (v_id, 'rechnung', 'entwurf', b.id, b.projekt_id, b.kunde_id,
    b.empf_name, b.empf_zusatz, b.empf_strasse, b.empf_plz, b.empf_ort, b.empf_uid, b.empf_email,
    v_heute, b.leistung_von, b.leistung_bis,
    'Storno zu Rechnung ' || b.nummer || coalesce(' — ' || nullif(btrim(b.betreff), ''), ''),
    'Hiermit stornieren wir unsere Rechnung ' || b.nummer || ' vom ' || to_char(b.datum, 'DD.MM.YYYY') || ' in voller Höhe.',
    case when b.status = 'bezahlt' then 'Den bereits bezahlten Betrag schreiben wir Ihnen gut.' end,
    b.ust_satz, b.reverse_charge);

  insert into public.beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id)
  select v_id, pos, art, bezeichnung, langtext,
         case when art in ('titel','text') then menge else -menge end,
         einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id
    from public.beleg_positionen
   where beleg_id = b.id;

  update public.belege set
    status = 'storno',
    nummer = public.naechste_nummer('rechnung', v_heute),
    fertig_am = now(),
    netto = -b.netto,
    ust = -b.ust,
    brutto = -b.brutto
  where id = v_id;

  update public.belege set status = 'storniert' where id = b.id;
  update public.zeiten set rechnung_id = null where rechnung_id = b.id;
  update public.material_buchungen set rechnung_id = null where rechnung_id = b.id;
  update public.regieberichte set rechnung_id = null where rechnung_id = b.id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.rechnung_aendern(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.belege;
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann Rechnungen ändern.';
  end if;
  select * into b from public.belege where id = p_id for update;
  if b.id is null or b.typ <> 'rechnung' then
    raise exception 'Rechnung nicht gefunden.';
  end if;
  if b.status = 'entwurf' then
    return;
  end if;
  if b.altbestand then
    raise exception 'Eine Altrechnung wird direkt bearbeitet.';
  end if;
  if b.status <> 'offen' then
    raise exception 'Nur offene Rechnungen lassen sich ändern — bezahlte und stornierte nicht.';
  end if;
  if exists (select 1 from public.zahlungen where beleg_id = p_id) then
    raise exception 'Auf die Rechnung ist schon eine Zahlung gebucht. Erst die Zahlung löschen — oder stornieren und neu erstellen.';
  end if;
  if exists (select 1 from public.mahnungen where beleg_id = p_id) then
    raise exception 'Die Rechnung wurde schon gemahnt. Bitte stornieren und neu erstellen.';
  end if;
  if exists (select 1 from public.fibu_uebergabe_belege where beleg_id = p_id) then
    raise exception 'Die Rechnung ist schon an die Kanzlei übergeben und damit festgeschrieben. Bitte stornieren und neu erstellen.';
  end if;
  if b.abgezogen_in is not null then
    raise exception 'Die Teilrechnung ist schon in der Schlussrechnung abgezogen. Bitte stornieren und neu erstellen.';
  end if;
  perform set_config('mayr.rechnung_aendern', p_id::text, true);
  update public.belege set status = 'entwurf', fertig_am = null, archiv_stand = archiv_stand + 1 where id = p_id;
  perform set_config('mayr.rechnung_aendern', '', true);
end $function$;

CREATE OR REPLACE FUNCTION public.angebot_link_erstellen(p_beleg uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.belege;
  v_token text;
  v_tage int;
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then raise exception 'Nur der Chef kann einen Bestätigungslink erzeugen.'; end if;
  select * into b from public.belege where id = p_beleg;
  if b.id is null or b.typ <> 'angebot' then raise exception 'Angebot nicht gefunden.'; end if;
  if b.status <> 'offen' then
    raise exception 'Einen Link gibt es nur für fertige, offene Angebote (jetzt: %).', b.status;
  end if;
  select coalesce(angebot_gueltig_tage, 30) into v_tage from public.firma limit 1;
  update public.angebot_links set gesperrt_am = now() where beleg_id = p_beleg and gesperrt_am is null;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.angebot_links (beleg_id, token, ablauf)
  values (p_beleg, v_token, greatest(coalesce(b.gueltig_bis, b.datum + coalesce(v_tage, 30)), current_date));
  insert into public.angebot_verlauf (beleg_id, art, text) values (p_beleg, 'link', 'Bestätigungslink erzeugt');
  return v_token;
end $function$;

CREATE OR REPLACE FUNCTION public.angebot_link_sperren(p_beleg uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then raise exception 'Nur der Chef kann den Link sperren.'; end if;
  update public.angebot_links set gesperrt_am = now() where beleg_id = p_beleg and gesperrt_am is null;
  if found then
    insert into public.angebot_verlauf (beleg_id, art, text) values (p_beleg, 'gesperrt', 'Bestätigungslink gesperrt');
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.projekt_aus_angebot(p_beleg uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.hat_recht('rechnungen') then raise exception 'Angebote und Rechnungen sind für deine Rolle nicht freigegeben.'; end if;
  if not public.ist_chef() then raise exception 'Nur der Chef kann ein Angebot annehmen.'; end if;
  return public.projekt_aus_angebot_intern(p_beleg);
end $function$;

CREATE OR REPLACE FUNCTION public.passwort_setzen(p_user uuid, p_passwort text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not public.hat_recht('mitarbeiter') then raise exception 'Passwörter vergibt nur, wer „Mitarbeiter & Zugänge“ verwalten darf.'; end if;
  if public.ist_voller_chef_id(p_user) and not public.ist_voller_chef() then raise exception 'Das Passwort des Chefs vergibt nur der Chef.'; end if;
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann Passwörter vergeben.';
  end if;
  if length(coalesce(p_passwort, '')) < 6 then
    raise exception 'Das Passwort braucht mindestens 6 Zeichen.';
  end if;
  if octet_length(p_passwort) > 72 then
    raise exception 'Das Passwort ist zu lang.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_passwort, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_user;
  if not found then
    raise exception 'Diesen Mitarbeiter gibt es nicht.';
  end if;
  update public.profiles set passwort_neu = true where id = p_user;
end $function$;
