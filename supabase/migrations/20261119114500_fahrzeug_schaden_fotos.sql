-- Schaden am Fahrzeug mit Fotos (Stefan, Besprechung 17.11.2026: „Schaden am
-- Auto per App mit Fotos protokollieren“ — „super“). Der Monteur meldet am
-- Handy einen Schaden (Bordbuch `fahrzeug_eintraege`) und hängt ein oder
-- mehrere Fotos an; der Chef sieht sie am Eintrag.
--
-- - fahrzeug_eintrag_fotos: je Foto eine Zeile am Bordbuch-Eintrag.
-- - Speicher: privater Bucket „fahrzeug-fotos“, Pfad <eintrag_id>/<datei>.
-- - Rechte wie bei den Einträgen: sehen alle Aktiven; anhängen der Chef oder
--   wer den Eintrag selbst angelegt hat; löschen nur der Chef.
-- - Eintrag gelöscht → seine Fotos gehen mit: die Zeilen per Fremdschlüssel
--   (on delete cascade), die Dateien entfernt die App gleich danach über die
--   Storage-API (SQL darf storage.objects nicht löschen, storage.protect_delete).
-- Nur ergänzend — bestehende Tabellen und Regeln bleiben, wie sie sind.

create table public.fahrzeug_eintrag_fotos (
  id uuid primary key default gen_random_uuid(),
  eintrag_id uuid not null references public.fahrzeug_eintraege(id) on delete cascade,
  -- <eintrag_id>/<zufall>-<name>.jpg im Bucket fahrzeug-fotos
  pfad text not null unique check (pfad like eintrag_id::text || '/%'),
  name text,
  mime text,
  groesse bigint check (groesse >= 0),
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.fahrzeug_eintrag_fotos (eintrag_id, created_at);

alter table public.fahrzeug_eintrag_fotos enable row level security;

create policy fz_fotos_lesen on public.fahrzeug_eintrag_fotos for select to authenticated
  using (public.ist_aktiv());
-- Anhängen: der Chef an jeden Eintrag, sonst nur an den selbst gemeldeten
create policy fz_fotos_anlegen on public.fahrzeug_eintrag_fotos for insert to authenticated
  with check (public.ist_aktiv() and erstellt_von = auth.uid()
    and exists (select 1 from public.fahrzeug_eintraege e
                 where e.id = eintrag_id and (public.ist_chef() or e.erstellt_von = auth.uid())));
create policy fz_fotos_loeschen on public.fahrzeug_eintrag_fotos for delete to authenticated
  using (public.ist_chef());

-- ── Speicher: privat, je Eintrag ein Ordner ──────────────────────────────
-- Ohne allowed_mime_types: Fotos aus der iPhone-Galerie kommen auch als HEIC
-- (bildVerkleinern lässt sie dann unverändert)
insert into storage.buckets (id, name, public, file_size_limit)
values ('fahrzeug-fotos', 'fahrzeug-fotos', false, 20971520)
on conflict (id) do nothing;

-- Sehen darf sie, wer die Bordbuch-Einträge sieht. Der Chef sieht den ganzen
-- Bucket — auch die Dateien eines eben gelöschten Eintrags: Löschen im Speicher
-- braucht zusätzlich diese Leseregel, sonst entfernt die App sie still nicht.
create policy fz_fotos_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'fahrzeug-fotos' and (public.ist_chef() or (public.ist_aktiv()
    and (storage.foldername(storage.objects.name))[1] in (select e.id::text from public.fahrzeug_eintraege e))));
-- Hochladen: der Chef zu jedem Eintrag, sonst nur zum selbst gemeldeten
create policy fz_fotos_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'fahrzeug-fotos' and public.ist_aktiv()
    and (storage.foldername(storage.objects.name))[1] in (select e.id::text from public.fahrzeug_eintraege e
                                                           where public.ist_chef() or e.erstellt_von = auth.uid()));
-- Löschen: der Chef; sonst nur die eigene, noch nicht eingetragene Datei
-- (Hochladen gelang, die Zeile nicht — die App räumt sie gleich wieder weg).
-- Was in fahrzeug_eintrag_fotos steht, löscht ein Monteur nie.
create policy fz_fotos_dateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'fahrzeug-fotos' and (public.ist_chef()
    or (public.ist_aktiv() and storage.objects.owner = auth.uid()
        and not exists (select 1 from public.fahrzeug_eintrag_fotos f where f.pfad = storage.objects.name))));
