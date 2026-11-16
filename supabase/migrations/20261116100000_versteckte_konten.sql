-- Versteckte Konten (16.11.2026, Christoph: „mein Konto ausblenden“): der
-- Support-Zugang von ePower soll bei SETEC in keiner Mitarbeiter-, Stunden-
-- oder Personalliste auftauchen. Wer versteckt ist, sieht nur sich selbst so;
-- für alle anderen gibt es die Zeile nicht (lesen, ändern, löschen).
-- Setzen nur per SQL/Service — aus der App heraus lässt sich das nicht ändern.
alter table public.profiles add column if not exists versteckt boolean not null default false;

create policy profile_versteckt_lesen on public.profiles as restrictive for select to authenticated
  using (id = auth.uid() or not versteckt);
create policy profile_versteckt_aendern on public.profiles as restrictive for update to authenticated
  using (id = auth.uid() or not versteckt);
create policy profile_versteckt_loeschen on public.profiles as restrictive for delete to authenticated
  using (not versteckt);

create or replace function public.profil_versteckt_schutz() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.versteckt is distinct from old.versteckt then
    raise exception 'Ob ein Konto versteckt ist, lässt sich in der App nicht ändern.';
  end if;
  return new;
end $$;
create trigger profil_versteckt_schutz before update on public.profiles
  for each row execute function public.profil_versteckt_schutz();

update public.profiles set versteckt = true where email = 'epower@setec.handwerkapp.at';
