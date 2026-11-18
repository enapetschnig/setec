-- Fahrzeuge und Maschinen ↔ Dokumente (Stefan, 18.11.2026): Leasingvertrag,
-- Versicherungspolizze, Rechnung für den Garantiefall, Foto vom Typenschild.
-- Gespeichert in den Firmendokumenten (eine Ablage, Ordner „Fuhrpark“) mit
-- Verweis aufs Fahrzeug — Regeln (Chef pflegt, „nur Chef“ verbirgt) gelten
-- unverändert. Fahrzeug gelöscht → Dokument bleibt in der Ablage.
alter table public.firmen_dokumente
  add column fahrzeug_id uuid references public.fahrzeuge(id) on delete set null;
create index firmen_dokumente_fahrzeug_id_idx on public.firmen_dokumente (fahrzeug_id);
