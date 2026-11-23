-- ══════════════════════════════════════════════════════════════════════
--  Prüfung 22.11.2026 — vier hohe Befunde (H2–H5), behoben 23.11.
--  H2  Kunde nimmt am Handy eines angemeldeten Monteurs/Lehrlings an
--  H3  Nachtrag zur selben Erstaufnahme bleibt offen
--  H4  Teilrechnung, die eine Schlussrechnung abzieht, nicht stornierbar
--  H5  Kunden-Lieferschein: Speichern in einem Schritt, Zeilen eindeutig
--      (dazu B2: scheitert das Speichern, bleiben die gespeicherten Zeilen)
-- ══════════════════════════════════════════════════════════════════════

-- ── H2: Annahme gilt als anonym, egal wer auf dem Gerät angemeldet ist ──
-- Der Kunde unterschreibt oft am Handy des Monteurs, dort ist der Monteur
-- angemeldet. Die Anfrage trug dessen Konto, und `erstaufnahme_schutz` ließ
-- Status/Projekt der Erstaufnahme nur Chef oder anonym ändern. Annehmen tut
-- der Kunde — für den Rest dieser Anfrage ist sie anonym, wie im Browser des
-- Kunden (gleiche Wirkung, nur weniger Rechte).
create or replace function public.angebot_annehmen(p_token text, p_name text, p_stand timestamp with time zone, p_unterschrift text, p_akzeptiert boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_link public.angebot_links;
  v_zustand text;
  b public.belege;
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

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
end $function$;

-- ── H3: andere Varianten fallen nur beim ersten Auftrag weg ─────────────
-- Bisher setzte jeder Aufruf (auch Teilrechnung, „In Rechnung umwandeln“,
-- erneutes „Angenommen“ zum schon angenommenen Angebot) alle offenen Angebote
-- derselben Erstaufnahme auf „abgelehnt“ — auch einen später verschickten
-- Nachtrag. Jetzt nur, wenn die Erstaufnahme mit diesem Aufruf zum ersten Mal
-- Auftrag wird (der Kunde hat sich für eine Variante entschieden).
create or replace function public.projekt_aus_angebot_intern(p_beleg uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  b public.belege;
  e public.erstaufnahmen;
  v_projekt uuid;
  v_ea_adresse boolean;
  v_erster_auftrag boolean := false;
begin
  select * into b from public.belege where id = p_beleg for update;
  if b.id is null or b.typ <> 'angebot' then raise exception 'Angebot nicht gefunden.'; end if;
  if b.status = 'abgelehnt' then raise exception 'Das Angebot ist abgelehnt — daraus wird kein Projekt.'; end if;
  if b.status = 'offen' then
    update public.belege set status = 'angenommen' where id = b.id;
  end if;
  if b.erstaufnahme_id is not null then
    select * into e from public.erstaufnahmen where id = b.erstaufnahme_id for update;
    v_erster_auftrag := e.id is not null and e.status is distinct from 'auftrag';
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
    if v_erster_auftrag then
      update public.belege set status = 'abgelehnt'
       where erstaufnahme_id = e.id and typ = 'angebot' and id <> b.id and status = 'offen';
    end if;
  end if;
  return v_projekt;
end $function$;

-- ── H4: abgezogene Teilrechnung nicht stornieren ───────────────────────
-- Die Schlussrechnung zieht die Teilrechnung ab (`abgezogen_in`); eine
-- Stornorechnung schriebe den Betrag ein zweites Mal gut. Erst die
-- Schlussrechnung stornieren (Trigger `teil_freigeben_bei_storno` gibt die
-- Teilrechnung frei) bzw. im Entwurf die Abzugszeile entfernen.
create or replace function public.beleg_stornieren(p_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  b public.belege;
  s public.belege;
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
  if b.abgezogen_in is not null then
    select * into s from public.belege where id = b.abgezogen_in;
    if s.status = 'entwurf' then
      raise exception 'Diese Teilrechnung ist im Entwurf der Schlussrechnung abgezogen. Dort zuerst die Zeile „abzüglich … Teilrechnung“ entfernen, dann stornieren.';
    end if;
    raise exception 'Diese Teilrechnung ist in der Schlussrechnung % abgezogen. Zuerst die Schlussrechnung stornieren — dann ist die Teilrechnung wieder frei. Sonst bekäme der Kunde den Betrag doppelt gutgeschrieben.', coalesce(s.nummer, '');
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

-- ── H5: Kunden-Lieferschein ─────────────────────────────────────────────
-- Doppel-Tipp auf „Abschließen“ mit ungespeicherter Änderung: zwei Speichern
-- (Zeilen löschen, dann einfügen — zwei Anfragen) liefen ineinander → jede
-- Zeile doppelt, doppelter Lagerabgang. Scheiterte das Einfügen, waren alle
-- Zeilen weg (B2).

-- Zeilennummer je Lieferschein eindeutig — schützt auch ältere App-Fassungen
-- (das zweite Einfügen scheitert statt zu verdoppeln). Live gab es noch keinen
-- Kunden-Lieferschein; die App vergibt `pos` immer 1…n.
drop index if exists public.kunden_lieferschein_positionen_lieferschein_id_pos_idx;
alter table public.kunden_lieferschein_positionen
  add constraint kunden_lieferschein_positionen_pos_eindeutig unique (lieferschein_id, pos);

-- Zeilen ändern wartet auf ein laufendes Abschließen (das den Lieferschein
-- sperrt) und sieht danach „fertig“ — vorher las es den Status ohne Sperre.
create or replace function public.kunden_lieferschein_pos_schutz() returns trigger
language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.kunden_lieferscheine
   where id = coalesce(new.lieferschein_id, old.lieferschein_id)
   for share;
  if v_status = 'fertig' then
    raise exception 'Der Lieferschein ist abgeschlossen — Zeilen nicht mehr änderbar.';
  end if;
  return coalesce(new, old);
end $$;

-- Speichern in einem Schritt: sperrt den Lieferschein (ein zweites Speichern
-- oder Abschließen wartet), ersetzt Kopf und Zeilen; scheitert etwas, bleibt
-- der alte Stand. Mit den Rechten des Aufrufers (RLS: nur der Chef).
create function public.kunden_lieferschein_speichern(p_id uuid, p_neu boolean, p_kopf jsonb, p_zeilen jsonb) returns void
language plpgsql set search_path = public as $$
declare
  l public.kunden_lieferscheine;
  z jsonb;
  v_pos int := 0;
  v_menge numeric;
begin
  if not public.ist_chef() then raise exception 'Nur der Chef.'; end if;
  if jsonb_typeof(coalesce(p_zeilen, '[]'::jsonb)) <> 'array' then raise exception 'Die Zeilen fehlen.'; end if;
  if p_neu then
    insert into public.kunden_lieferscheine (id) values (p_id) on conflict (id) do nothing;
  end if;
  select * into l from public.kunden_lieferscheine where id = p_id for update;
  if not found then raise exception 'Der Lieferschein ist gelöscht.'; end if;
  if l.status <> 'entwurf' then raise exception 'Der Lieferschein ist schon abgeschlossen.'; end if;

  update public.kunden_lieferscheine set
    kunde_id = nullif(p_kopf->>'kunde_id', '')::uuid,
    empf_name = coalesce(btrim(p_kopf->>'empf_name'), ''),
    empf_strasse = nullif(btrim(p_kopf->>'empf_strasse'), ''),
    empf_plz = nullif(btrim(p_kopf->>'empf_plz'), ''),
    empf_ort = nullif(btrim(p_kopf->>'empf_ort'), ''),
    empf_email = nullif(btrim(p_kopf->>'empf_email'), ''),
    datum = coalesce(nullif(p_kopf->>'datum', '')::date, l.datum),
    lagerort_id = nullif(p_kopf->>'lagerort_id', '')::uuid,
    notiz = nullif(btrim(p_kopf->>'notiz'), '')
  where id = p_id;

  delete from public.kunden_lieferschein_positionen where lieferschein_id = p_id;
  for z in select value from jsonb_array_elements(coalesce(p_zeilen, '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    if coalesce(btrim(z->>'bezeichnung'), '') = '' then
      raise exception 'Zeile %: Die Bezeichnung fehlt.', v_pos;
    end if;
    v_menge := round((z->>'menge')::numeric, 3);
    if v_menge is null or v_menge <= 0 then
      raise exception 'Zeile % („%“): Menge zu klein — mindestens 0,001.', v_pos, btrim(z->>'bezeichnung');
    end if;
    insert into public.kunden_lieferschein_positionen (lieferschein_id, pos, artikel_id, artikelnummer, bezeichnung, menge, einheit, retour)
    values (p_id, v_pos, nullif(z->>'artikel_id', '')::uuid, nullif(btrim(z->>'artikelnummer'), ''), btrim(z->>'bezeichnung'), v_menge,
            coalesce(nullif(btrim(z->>'einheit'), ''), 'Stk'), coalesce((z->>'retour')::boolean, false));
  end loop;
end $$;
revoke execute on function public.kunden_lieferschein_speichern(uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.kunden_lieferschein_speichern(uuid, boolean, jsonb, jsonb) to authenticated;
