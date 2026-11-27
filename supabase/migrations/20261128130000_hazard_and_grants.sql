-- Route hazard (flood / ponding) so the "Route is flooded" message survives sync between devices, and explicit
-- Data API grants (newer Supabase projects do not expose new tables to anon/authenticated automatically).
-- RLS stays on; the "demo write" policies in schema.sql still apply (no staff sign-in yet).
alter table corridor_status add column if not exists hazard text check (hazard in ('flood', 'ponding'));
grant select on corridors, corridor_status, safe_spots, advisories, safe_spots_view to anon, authenticated;
grant insert, update, delete on corridor_status, safe_spots, advisories to anon, authenticated;
