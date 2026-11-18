-- Iteration 3: Student Lounge rename and the canonical safe-spot table for all three campuses.
-- Coordinates are the project owner's values (2026-11-18), at full precision. They are owner-supplied map
-- points, not an on-site survey.
--
-- Idempotent: safe to run more than once, on a fresh schema or one seeded by an older app version.
-- Run in the Supabase SQL editor after supabase/schema.sql (or: supabase db push / psql -f this file).
-- The app does not depend on it to show correct names and positions (it always takes those from
-- src/campuses), but it keeps the database itself, spots_near() and any other reader correct.
begin;

-- 1. Capacity may be unassessed (null) rather than guessed. The existing check (capacity >= 0) still applies.
alter table safe_spots alter column capacity drop not null;

-- 2. The pre-Iteration-3 record 'cics' is the place now called Student Lounge: carry its occupancy and amenities
--    over by renaming it in place. If a 'lounge' row already exists, the legacy row is redundant and removed.
update safe_spots set id = 'lounge', name = 'Student Lounge', updated_at = now()
  where id = 'cics' and not exists (select 1 from safe_spots where id = 'lounge');
delete from safe_spots where id = 'cics';

-- 3. Canonical fixed attributes. New spots are inserted empty; existing rows get the new name, position,
--    capacity and walking estimate, and keep their live occupancy (clamped to a known capacity) and amenities.
--    Capacity: footprint estimates (README, src/campuses); null = not yet assessed.
insert into safe_spots (id, name, walk_min, capacity, occupied, power, water, food, geom) values
  -- BSU Alangilan
  ('lounge',     'Student Lounge',                                      1, null, 0, false, false, false, 'SRID=4326;POINT(121.07417575704717 13.78393267903075)'),
  ('gym',        'Sparta Gymnasium',                                    1, 1030, 0, true,  true,  false, 'SRID=4326;POINT(121.07413074951742 13.784276340529747)'),
  ('library',    'Einstein Bldg Library, 2nd Floor',                    1, 250,  0, true,  false, false, 'SRID=4326;POINT(121.0749349027738 13.784168707874697)'),
  -- BSU Pablo Borbon
  ('pb-gym',     'Felistiano "Sanoy" Leviste Multi-Purpose Gymnasium',  4, 570,  0, true,  true,  false, 'SRID=4326;POINT(121.05277271784234 13.753079262668649)'),
  ('pb-library', 'Main Library',                                        3, 230,  0, true,  false, false, 'SRID=4326;POINT(121.0525887000107 13.754549329790514)'),
  -- BSU Malvar
  ('mv-gym',     'Gymnasium',                                           2, null, 0, true,  true,  false, 'SRID=4326;POINT(121.15574880496467 14.044572113490197)')
on conflict (id) do update set
  name       = excluded.name,
  walk_min   = excluded.walk_min,
  capacity   = excluded.capacity,
  occupied   = case when excluded.capacity is null then safe_spots.occupied else least(safe_spots.occupied, excluded.capacity) end,
  geom       = excluded.geom,
  updated_at = now();

-- 4. Spots with unassessed capacity are never "full"; spaces_left is null for them.
create or replace function spots_near(lat double precision, lon double precision, meters int default 800)
returns table (id text, name text, spaces_left int, distance_m double precision)
language sql stable as $$
  select s.id, s.name, s.capacity - s.occupied,
         st_distance(s.geom, st_point(lon, lat)::geography)
  from safe_spots s
  where (s.capacity is null or s.occupied < s.capacity)
    and st_dwithin(s.geom, st_point(lon, lat)::geography, meters)
  order by 4;
$$;

commit;

-- Check (read-only):
--   select id, name, capacity, occupied, lat, lon from safe_spots_view order by id;
