-- ============================================================================
-- Ansprechpersonen je Kontakt (Wunsch SETEC 16.11.2026): beim Lieferanten
-- Außendienst und Innendienst mit Telefon und E-Mail. Mehrere je Kontakt,
-- verschwinden mit dem Kontakt. Das alte Textfeld kunden.ansprechpartner bleibt
-- (Rechnung, Regiebericht lesen es weiter).
-- Rechte wie bei kunden: jeder Aktive liest und pflegt.
-- ============================================================================
create table if not exists public.kontakt_personen (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  funktion text check (funktion is null or length(funktion) <= 60),
  telefon text check (telefon is null or length(telefon) <= 60),
  email text check (email is null or length(email) <= 200),
  notiz text check (notiz is null or length(notiz) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kontakt_personen_kunde_idx on public.kontakt_personen (kunde_id);
create trigger kontakt_personen_updated before update on public.kontakt_personen
  for each row execute function public.updated_at_setzen();

alter table public.kontakt_personen enable row level security;
create policy kontakt_personen_lesen on public.kontakt_personen for select to authenticated
  using ((select public.ist_aktiv()));
create policy kontakt_personen_anlegen on public.kontakt_personen for insert to authenticated
  with check ((select public.ist_aktiv()));
create policy kontakt_personen_aendern on public.kontakt_personen for update to authenticated
  using ((select public.ist_aktiv())) with check ((select public.ist_aktiv()));
create policy kontakt_personen_loeschen on public.kontakt_personen for delete to authenticated
  using ((select public.ist_aktiv()));

grant select, insert, update, delete on public.kontakt_personen to authenticated;
