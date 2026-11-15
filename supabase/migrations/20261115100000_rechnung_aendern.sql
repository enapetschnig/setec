-- Rechnung ändern, bis sie an die Kanzlei geht (Wunsch aus der Besprechung
-- mit SETEC am 11.11.2026: „Rechnungen nach dem Speichern anpassen, bis zur
-- finalen Festschreibung durch den Steuerberater“).
--
-- „Rechnung ändern“ macht eine fertige, offene Rechnung wieder zum Entwurf —
-- sie behält ihre Nummer (keine Lücke im Nummernkreis), beim erneuten
-- Fertigstellen wird nur neu gerechnet. Das schon verschickte PDF bleibt im
-- Archiv liegen (BAO § 131: der ursprüngliche Inhalt bleibt ersichtlich), die
-- neue Fassung kommt daneben: <id>.pdf, dann <id>-1.pdf, <id>-2.pdf …
-- (`archiv_stand`).
--
-- Nicht mehr ändern lässt sich eine Rechnung, sobald etwas darauf aufbaut:
-- eine Zahlung, eine Mahnung, die Übergabe an die Kanzlei, der Abzug in einer
-- Schlussrechnung — dann wie bisher stornieren und neu erstellen.
alter table public.belege add column if not exists archiv_stand int not null default 0;

create or replace function public.rechnung_aendern(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.belege;
begin
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
end $$;
revoke execute on function public.rechnung_aendern(uuid) from public, anon;
grant execute on function public.rechnung_aendern(uuid) to authenticated;

-- Festschreiben wie bisher — nur der Weg über rechnung_aendern() darf zurück in den Entwurf
create or replace function public.beleg_schutz() returns trigger
language plpgsql set search_path = public as $$
declare
  v_frei constant text[] := array['status', 'bezahlt_am', 'empf_email', 'projekt_id', 'kunde_id', 'angebot_id', 'abgezogen_in', 'kategorie_id', 'updated_at'];
  v_summe numeric;
  v_letzte date;
begin
  if new.altbestand is distinct from old.altbestand then
    raise exception 'Ob eine Rechnung aus dem alten Programm stammt, lässt sich nachträglich nicht ändern.';
  end if;
  if new.archiv_stand < old.archiv_stand then
    raise exception 'Der Archivstand einer Rechnung geht nicht zurück.';
  end if;
  if old.altbestand then
    if new.status not in ('offen', 'bezahlt') then
      raise exception 'Eine Altrechnung wird nicht storniert — ausbuchen oder löschen.';
    end if;
    perform public.altrechnung_pruefen(new);
    if new.brutto is distinct from old.brutto then
      select coalesce(sum(betrag), 0), max(datum) into v_summe, v_letzte from public.zahlungen where beleg_id = new.id;
      if v_summe > new.brutto then
        raise exception 'Darauf ist schon mehr bezahlt (% €). Erst die Zahlung löschen.', v_summe;
      end if;
      if v_summe >= new.brutto then
        new.status := 'bezahlt';
        new.bezahlt_am := v_letzte;
      else
        new.status := 'offen';
        new.bezahlt_am := null;
      end if;
    end if;
    return new;
  end if;
  if old.typ = 'rechnung' and old.status = 'offen' and new.status = 'entwurf'
     and current_setting('mayr.rechnung_aendern', true) = old.id::text then
    return new;
  end if;
  if old.typ = 'rechnung' and old.status = 'entwurf' and new.archiv_stand <> old.archiv_stand then
    raise exception 'Der Archivstand ändert sich nur über „Rechnung ändern“.';
  end if;
  if old.typ = 'rechnung' and old.status = 'entwurf' and old.nummer is not null and new.nummer is distinct from old.nummer then
    raise exception 'Eine geänderte Rechnung behält ihre Nummer.';
  end if;
  if old.typ = 'rechnung' and old.status <> 'entwurf' then
    if new.status = 'entwurf' then
      raise exception 'Eine fertige Rechnung kann nur über „Rechnung ändern“ zurück in den Entwurf.';
    end if;
    if old.status = 'storniert' and new.status <> 'storniert' then
      raise exception 'Eine stornierte Rechnung bleibt storniert. Für die neue Rechnung „Korrektur anlegen“.';
    end if;
    if old.status = 'storno' and new.status <> 'storno' then
      raise exception 'Eine Stornorechnung bleibt, wie sie ist.';
    end if;
    if (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei)
       or (new.projekt_id is distinct from old.projekt_id and new.projekt_id is not null)
       or (new.kunde_id is distinct from old.kunde_id and new.kunde_id is not null)
       or (new.angebot_id is distinct from old.angebot_id and new.angebot_id is not null) then
      raise exception 'Eine fertige Rechnung ist festgeschrieben. Zum Ändern „Rechnung ändern“ — oder stornieren und neu erstellen.';
    end if;
  end if;
  return new;
end $$;

-- Erneut fertigstellen: die Nummer bleibt
create or replace function public.beleg_fertigstellen(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  b public.belege;
  f public.firma;
  v_netto numeric(12,2);
  v_ust numeric(12,2);
  v_nr text;
begin
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
end $$;

-- Eine Rechnung mit Nummer wird nicht gelöscht — auch nicht als Entwurf nach „Rechnung ändern“
drop policy belege_nicht_loeschen on public.belege;
create policy belege_nicht_loeschen on public.belege as restrictive for delete to authenticated
  using (case when typ = 'angebot' then not public.angebot_verrechnet(id)
              when altbestand then true
              else status = 'entwurf' and nummer is null end);

-- Archiv: je Fassung eine Datei, abgelegt wird nur die aktuelle
drop policy beleg_archiv_ablegen on storage.objects;
create policy beleg_archiv_ablegen on storage.objects for insert to authenticated
  with check (
    bucket_id = 'beleg-archiv' and public.ist_chef()
    and exists (select 1 from public.belege b
                 where b.typ = 'rechnung' and b.status <> 'entwurf'
                   and name = b.id::text || case when b.archiv_stand > 0 then '-' || b.archiv_stand else '' end || '.pdf')
  );

drop policy beleg_archiv_verwaist_loeschen on storage.objects;
create policy beleg_archiv_verwaist_loeschen on storage.objects for delete to authenticated
  using (
    bucket_id = 'beleg-archiv' and public.ist_chef()
    and not exists (select 1 from public.belege b where b.id::text = left(name, 36))
  );
