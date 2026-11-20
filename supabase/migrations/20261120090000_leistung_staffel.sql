-- Staffel der Montagezeit (Stefan 20.11.2026): je nach Menge der Position
-- gilt eine andere Zeit je Stück, z. B. ab 2 Stk 160 min, ab 11 Stk 145 min.
-- [{"ab": 2, "minuten": 160}, {"ab": 11, "minuten": 145}] — leer/null = keine Staffel.
-- Unter der ersten Stufe gilt `minuten`. Die App bietet sie nur in der Kategorie „Montagearbeiten“ an.
alter table public.leistungen add column if not exists staffel jsonb;
alter table public.leistungen drop constraint if exists leistungen_staffel_liste;
alter table public.leistungen add constraint leistungen_staffel_liste
  check (staffel is null or jsonb_typeof(staffel) = 'array');
