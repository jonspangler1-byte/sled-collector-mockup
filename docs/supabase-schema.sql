-- Sled Finder · Supabase schema + row-level security (RLS)
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run (idempotent where practical).
--
-- Rules this encodes (from the demo's membership rules):
--   * Anyone (even signed out) can browse active Sleds for Sale.
--   * Only Premium members (or admin) can post sleds, post sale ads, upload photos, and edit their own posts.
--   * Premium members can see other members' SHARED sleds (search + Sled Picker Map). Private sleds: owner only.
--   * When a membership lapses, that member's shared sleds and ads are hidden from others and come back on renewal.
--     The owner can always see (and delete) their own data.
--   * Admin (Sled Finder / Jonathan) can read, correct or remove any post or ad.
--   * Membership (premium_until) and admin can ONLY be changed by the server (Stripe webhook / SQL editor),
--     never by the app: the anon/authenticated roles have no UPDATE right on those columns.
--   * Locations are town level. lat/lng are rounded to 2 decimals (~1 km) on save. Never store a street address.


-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  is_admin boolean not null default false,
  premium_until timestamptz,                 -- null = never paid; past = lapsed; future = premium
  stripe_customer_id text unique,
  stripe_subscription_id text,
  stripe_subscription_status text,         -- Stripe status: active, past_due, canceled, ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- New sign-up → profile row with a placeholder handle the member can change.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'collector_' || substr(replace(new.id::text, '-', ''), 1, 8))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
$$;
create or replace function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or (premium_until is not null and premium_until > now())
                   from public.profiles where id = uid), false)
$$;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select
  using (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "profiles: update own handle" on public.profiles;
create policy "profiles: update own handle" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- Column-level: the app may change ONLY the handle. Membership/admin/Stripe columns are server-only.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (handle) on public.profiles to authenticated;

-- ───────────────────────── shared helpers ─────────────────────────
create or replace function public.touch_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner <> old.owner then
    raise exception 'owner cannot be changed';
  end if;
  new.updated_at := now();
  new.owner_handle := (select handle from public.profiles where id = new.owner);
  if new.lat is not null then new.lat := round(new.lat::numeric, 2); end if;
  if new.lng is not null then new.lng := round(new.lng::numeric, 2); end if;
  return new;
end $$;

create or replace function public.touch_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
-- AFTER update so the new handle is visible when touch_row() re-reads it.
create or replace function public.propagate_handle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    update public.sleds set owner_handle = new.handle where owner = new.id;
    update public.listings set owner_handle = new.handle where owner = new.id;
  end if;
  return null;
end $$;

-- ───────────────────────── sleds (My Sleds / collection posts) ─────────────────────────
create table if not exists public.sleds (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null,                   -- the id the phone made ("u1732...") so offline edits merge
  owner_handle text,                         -- filled by trigger, shown as @handle
  maker int not null default 0,              -- matrix row number; 0 = unknown/custom
  brand text not null default '',            -- "Fire Fly" / "Yankee Clipper" for maker 2
  model text not null default '',
  country text not null default 'US' check (country in ('US','CA','GB','IE')),
  region text not null default '',           -- state / province / county
  town text not null default '',             -- town level only
  lat double precision, lng double precision,
  shared boolean not null default false,
  photos text[] not null default '{}',       -- public URLs in the "photos" storage bucket
  data jsonb not null default '{}',          -- every other field the app keeps (years, condition, notes…)
  edited_by text,
  deleted_at timestamptz,                    -- soft delete so other phones learn about it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, client_id)
);
create index if not exists sleds_shared_idx on public.sleds (shared, maker) where deleted_at is null;
create index if not exists sleds_owner_idx on public.sleds (owner, updated_at);
alter table public.sleds enable row level security;
drop trigger if exists sleds_touch on public.sleds;
create trigger sleds_touch before insert or update on public.sleds
  for each row execute function public.touch_row();

drop policy if exists "sleds: read" on public.sleds;
create policy "sleds: read" on public.sleds for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (shared and deleted_at is null and public.is_premium(auth.uid()) and public.is_premium(owner))
);
drop policy if exists "sleds: insert (premium)" on public.sleds;
create policy "sleds: insert (premium)" on public.sleds for insert
  with check (owner = auth.uid() and public.is_premium(auth.uid()));
drop policy if exists "sleds: update own (premium) or admin" on public.sleds;
create policy "sleds: update own (premium) or admin" on public.sleds for update
  using ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()))
  with check ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()));
drop policy if exists "sleds: delete own or admin" on public.sleds;
create policy "sleds: delete own or admin" on public.sleds for delete
  using (owner = auth.uid() or public.is_admin(auth.uid()));
grant select, insert, update, delete on public.sleds to authenticated;
revoke all on public.sleds from anon;

-- ───────────────────────── listings (Sleds for Sale) ─────────────────────────
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null,
  owner_handle text,
  title text not null check (char_length(title) between 1 and 140),
  maker int not null default 0,
  brand text not null default '',
  model text not null default '',
  price text not null default '',
  country text not null default 'US' check (country in ('US','CA','GB','IE')),
  town text not null default '',
  lat double precision, lng double precision,
  contact_email text not null default '',    -- shown on the ad (seller chose to publish it)
  photos text[] not null default '{}',
  data jsonb not null default '{}',          -- years, condition, ship, desc…
  status text not null default 'active' check (status in ('active','sold','hidden')),
  edited_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, client_id)
);
create index if not exists listings_active_idx on public.listings (country, created_at desc) where deleted_at is null and status = 'active';
alter table public.listings enable row level security;
drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before insert or update on public.listings
  for each row execute function public.touch_row();

drop policy if exists "listings: read" on public.listings;
create policy "listings: read" on public.listings for select using (
  (status = 'active' and deleted_at is null and public.is_premium(owner))
  or owner = auth.uid()
  or public.is_admin(auth.uid())
);
drop policy if exists "listings: insert (premium)" on public.listings;
create policy "listings: insert (premium)" on public.listings for insert
  with check (owner = auth.uid() and public.is_premium(auth.uid()));
drop policy if exists "listings: update own (premium) or admin" on public.listings;
create policy "listings: update own (premium) or admin" on public.listings for update
  using ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()))
  with check ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()));
drop policy if exists "listings: delete own or admin" on public.listings;
create policy "listings: delete own or admin" on public.listings for delete
  using (owner = auth.uid() or public.is_admin(auth.uid()));
grant select on public.listings to anon;
grant select, insert, update, delete on public.listings to authenticated;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profile();
drop trigger if exists profiles_handle on public.profiles;
create trigger profiles_handle after update of handle on public.profiles
  for each row execute function public.propagate_handle();

-- ───────────────────────── Stripe webhook bookkeeping (server only) ─────────────────────────
create table if not exists public.stripe_events (
  id text primary key,                       -- Stripe event id, makes the webhook idempotent
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;   -- no policies = app can't touch it
revoke all on public.stripe_events from anon, authenticated;

-- ───────────────────────── Storage: photos bucket ─────────────────────────
-- Public-read bucket with unguessable paths <user-id>/<sled-id>/<random>.jpg, 2 MB max, images only.
-- (Public read keeps photo URLs simple and cacheable; anyone holding an exact URL can view that photo.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos: premium upload to own folder" on storage.objects;
create policy "photos: premium upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_premium(auth.uid()));
drop policy if exists "photos: replace own" on storage.objects;
create policy "photos: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));
drop policy if exists "photos: delete own or admin" on storage.objects;
create policy "photos: delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));

-- ───────────────────────── One-time admin setup ─────────────────────────
-- After Jonathan signs in to the live app once, make his account admin (replace the email):
--   update public.profiles set is_admin = true, handle = 'sledfinder'
--   where id = (select id from auth.users where email = 'JONATHANS-SIGN-IN-EMAIL');
-- Comp a member by hand (e.g. a museum volunteer), one year:
--   update public.profiles set premium_until = now() + interval '1 year'
--   where id = (select id from auth.users where email = 'MEMBER-EMAIL');
