-- Mileage Tracker — Phase 2 initial schema
-- ---------------------------------------------------------------------------
-- How to run: open your Supabase project (region: Canada Central,
-- ca-central-1), go to SQL Editor, paste this whole file and run it.
-- It is idempotent: it can be run more than once without error.
--
-- Every table is scoped to one user. Row level security is enabled on all
-- tables and the policies below let a signed-in user see and change ONLY
-- rows where user_id = auth.uid(). Client-generated UUIDs are used
-- everywhere so offline writes can be upserted safely in later phases.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  tech_id text not null default '',
  home_address text not null default '',
  home_place_id text,
  home_lat double precision,
  home_lng double precision,
  office_location_id uuid,
  home_office_km numeric not null default 23,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- locations ------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  address text not null default '',
  place_id text,
  lat double precision,
  lng double precision,
  type text not null check (type in ('home', 'office', 'customer')),
  last_used_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- profiles.office_location_id points at the Office row in locations.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_office_location_id_fk'
  ) then
    alter table public.profiles
      add constraint profiles_office_location_id_fk
      foreign key (office_location_id) references public.locations (id) on delete set null;
  end if;
end $$;

-- days -----------------------------------------------------------------------
create table if not exists public.days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  start_odometer integer not null,
  end_odometer integer,
  status text not null default 'open' check (status in ('open', 'closed')),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- legs -----------------------------------------------------------------------
-- Each leg stores its own copy of names/addresses/types so editing a saved
-- location later never changes past reports. claimable is null when the leg
-- is not claimable. Money is integer cents only (parking_cents).
create table if not exists public.legs (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  from_name text not null,
  from_address text not null default '',
  from_type text not null check (from_type in ('home', 'office', 'customer')),
  to_name text not null,
  to_address text not null default '',
  to_type text not null check (to_type in ('home', 'office', 'customer')),
  odo_start integer not null,
  odo_end integer not null,
  distance integer not null,
  claimable integer,
  parking_cents integer,
  parking_note text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- indexes --------------------------------------------------------------------
create index if not exists profiles_user_id_idx on public.profiles (user_id);
create index if not exists locations_user_id_idx on public.locations (user_id);
create index if not exists days_user_id_idx on public.days (user_id);
create index if not exists days_user_date_idx on public.days (user_id, date);
create index if not exists legs_user_id_idx on public.legs (user_id);
create index if not exists legs_day_position_idx on public.legs (day_id, position);

-- table privileges for the API roles (RLS below still restricts the rows) ---
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.days to authenticated;
grant select, insert, update, delete on public.legs to authenticated;

-- row level security -----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.days enable row level security;
alter table public.legs enable row level security;

-- profiles: the row's user_id is the user's own id.
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (user_id = auth.uid());
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (user_id = auth.uid());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own" on public.profiles
  for delete using (user_id = auth.uid());

-- locations
drop policy if exists "locations: select own" on public.locations;
create policy "locations: select own" on public.locations
  for select using (user_id = auth.uid());
drop policy if exists "locations: insert own" on public.locations;
create policy "locations: insert own" on public.locations
  for insert with check (user_id = auth.uid());
drop policy if exists "locations: update own" on public.locations;
create policy "locations: update own" on public.locations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "locations: delete own" on public.locations;
create policy "locations: delete own" on public.locations
  for delete using (user_id = auth.uid());

-- days
drop policy if exists "days: select own" on public.days;
create policy "days: select own" on public.days
  for select using (user_id = auth.uid());
drop policy if exists "days: insert own" on public.days;
create policy "days: insert own" on public.days
  for insert with check (user_id = auth.uid());
drop policy if exists "days: update own" on public.days;
create policy "days: update own" on public.days
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "days: delete own" on public.days;
create policy "days: delete own" on public.days
  for delete using (user_id = auth.uid());

-- legs
drop policy if exists "legs: select own" on public.legs;
create policy "legs: select own" on public.legs
  for select using (user_id = auth.uid());
drop policy if exists "legs: insert own" on public.legs;
create policy "legs: insert own" on public.legs
  for insert with check (user_id = auth.uid());
drop policy if exists "legs: update own" on public.legs;
create policy "legs: update own" on public.legs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "legs: delete own" on public.legs;
create policy "legs: delete own" on public.legs
  for delete using (user_id = auth.uid());
