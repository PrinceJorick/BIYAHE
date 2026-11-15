-- BIYAHE live backend: PostgreSQL + PostGIS + Realtime.
-- Run once in the Supabase SQL editor, then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
-- The app seeds corridor_status / safe_spots from its fixtures on first connect if they are empty.

create extension if not exists postgis;

-- Reference geometry for the commute corridors out of BatStateU Alangilan.
create table if not exists corridors (
  id         text primary key,
  name       text not null,
  via        text not null,
  usual_min  int  not null,
  -- Aggregate count of students who chose this corridor. No per-student rows exist anywhere (RA 10173).
  commuters  int  not null default 0,
  geom       geography(LineString, 4326)
);

create table if not exists corridor_status (
  corridor_id text primary key,
  status      text not null check (status in ('open', 'slow', 'closed')),
  min_lo      int  not null,
  min_hi      int  not null,
  note        text,
  source      text,
  provenance  text not null check (provenance in ('official', 'estimate')),
  updated_at  timestamptz not null default now()
);

create table if not exists safe_spots (
  id         text primary key,
  name       text not null,
  walk_min   int  not null,
  capacity   int  not null check (capacity >= 0),
  occupied   int  not null default 0 check (occupied >= 0),
  power      boolean not null default false,
  water      boolean not null default false,
  food       boolean not null default false,
  geom       geography(Point, 4326) not null,
  updated_at timestamptz not null default now()
);

-- PAGASA / LGU Batangas City / Campus advisories. payload keeps the issuer's structured record
-- (PagasaAdvisory / LguAdvisory in src/data.ts).
create table if not exists advisories (
  id        text primary key,
  source    text not null check (source in ('PAGASA', 'LGU', 'Campus')),
  issuer    text not null,
  title     text not null,
  body      text,
  severity  text not null check (severity in ('info', 'warning', 'critical')),
  scope     text not null default 'all',
  issued_at timestamptz not null default now(),
  payload   jsonb
);

create index if not exists safe_spots_geom_idx on safe_spots using gist (geom);
create index if not exists corridors_geom_idx on corridors using gist (geom);
create index if not exists advisories_issued_idx on advisories (issued_at desc);

-- The client reads spots through this view so it gets plain lat/lon.
create or replace view safe_spots_view with (security_invoker = true) as
  select id, name, walk_min, capacity, occupied, power, water, food, updated_at,
         st_y(geom::geometry) as lat, st_x(geom::geometry) as lon
  from safe_spots;

-- Open spots within walking distance of a point, nearest first.
create or replace function spots_near(lat double precision, lon double precision, meters int default 800)
returns table (id text, name text, spaces_left int, distance_m double precision)
language sql stable as $$
  select s.id, s.name, s.capacity - s.occupied,
         st_distance(s.geom, st_point(lon, lat)::geography)
  from safe_spots s
  where s.occupied < s.capacity
    and st_dwithin(s.geom, st_point(lon, lat)::geography, meters)
  order by 4;
$$;

insert into corridors (id, name, via, usual_min, commuters, geom) values
  ('lipa',     'Lipa City',            'JP Laurel Hwy',     50, 140, 'SRID=4326;LINESTRING(121.0744 13.7842, 121.0705 13.7875, 121.0655 13.7935, 121.064 13.8, 121.07 13.81)'),
  ('batangas', 'Batangas City proper', 'P. Burgos',         20, 210, 'SRID=4326;LINESTRING(121.0744 13.7842, 121.069 13.778, 121.064 13.77, 121.058 13.7575)'),
  ('bauan',    'Bauan / San Pascual',  'Diversion Rd',      35,  60, 'SRID=4326;LINESTRING(121.0744 13.7842, 121.062 13.783, 121.045 13.786, 121.02 13.79)'),
  ('sanjose',  'San Jose / Ibaan',     'Batangas–Lipa Rd',  30,  85, 'SRID=4326;LINESTRING(121.0744 13.7842, 121.085 13.792, 121.1 13.805, 121.115 13.82)'),
  ('tanauan',  'Tanauan / Sto. Tomas', 'STAR Tollway',      65,  45, 'SRID=4326;LINESTRING(121.0744 13.7842, 121.078 13.795, 121.085 13.82, 121.095 13.85)')
on conflict (id) do nothing;

-- Realtime: student views subscribe to these three tables.
alter publication supabase_realtime add table corridor_status, safe_spots, advisories;

-- Row level security.
-- DEMO POLICY: the anon key may read and write so the Staff / DRRMO demo works without sign-in.
-- Before any real deployment, replace the three "demo write" policies with ones limited to
-- authenticated staff (for example: using (auth.jwt() ->> 'role' = 'drrmo')).
alter table corridors enable row level security;
alter table corridor_status enable row level security;
alter table safe_spots enable row level security;
alter table advisories enable row level security;

create policy "public read" on corridors for select using (true);
create policy "public read" on corridor_status for select using (true);
create policy "public read" on safe_spots for select using (true);
create policy "public read" on advisories for select using (true);

create policy "demo write" on corridor_status for all using (true) with check (true);
create policy "demo write" on safe_spots for all using (true) with check (true);
create policy "demo write" on advisories for all using (true) with check (true);
