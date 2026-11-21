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
  display_name text not null default '' check (char_length(display_name) <= 80),
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
-- Column-level: the app may change ONLY handle and display_name. Membership/admin/Stripe columns are server-only.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (handle, display_name) on public.profiles to authenticated;

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
  sled_type text not null default '' check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Other')),
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
  sled_type text not null default '' check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Other')),
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
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (status = 'active' and deleted_at is null and public.is_premium(auth.uid()) and public.is_premium(owner))
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
revoke all on public.listings from anon;
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


-- Re-running this file on an existing project also adds columns (fresh installs already have them above).
alter table public.profiles add column if not exists display_name text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_display_name_len check (char_length(display_name) <= 80);
exception when duplicate_object then null; end $$;
grant update (handle, display_name) on public.profiles to authenticated;

alter table public.sleds add column if not exists sled_type text not null default '';
alter table public.listings add column if not exists sled_type text not null default '';
do $$ begin
  alter table public.sleds add constraint sleds_sled_type_check
    check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.listings add constraint listings_sled_type_check
    check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Other'));
exception when duplicate_object then null; end $$;

-- Shared touch trigger for community posts and comments (no lat/lng rounding).
create or replace function public.touch_owned_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner <> old.owner then
    raise exception 'owner cannot be changed';
  end if;
  new.updated_at := now();
  new.owner_handle := (select handle from public.profiles where id = new.owner);
  return new;
end $$;

-- ───────────────────────── photo_posts (community photo gallery) ─────────────────────────
-- Signed-in Premium members post one or more photos with a caption. There is no private
-- flag: these are community posts. Visibility matches shared sleds (Premium-to-Premium;
-- the owner and admin can always see their own, including when lapsed).
create table if not exists public.photo_posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null,
  owner_handle text,
  caption text not null default '',
  photos text[] not null default '{}',
  data jsonb not null default '{}',
  edited_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, client_id)
);
create index if not exists photo_posts_live_idx on public.photo_posts (created_at desc) where deleted_at is null;
alter table public.photo_posts enable row level security;
drop trigger if exists photo_posts_touch on public.photo_posts;
create trigger photo_posts_touch before insert or update on public.photo_posts
  for each row execute function public.touch_owned_row();

drop policy if exists "photo_posts: read" on public.photo_posts;
create policy "photo_posts: read" on public.photo_posts for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (deleted_at is null and public.is_premium(auth.uid()) and public.is_premium(owner))
);
drop policy if exists "photo_posts: insert (premium)" on public.photo_posts;
create policy "photo_posts: insert (premium)" on public.photo_posts for insert
  with check (owner = auth.uid() and public.is_premium(auth.uid()) and cardinality(photos) >= 1);
drop policy if exists "photo_posts: update own (premium) or admin" on public.photo_posts;
create policy "photo_posts: update own (premium) or admin" on public.photo_posts for update
  using ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()))
  with check ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()));
drop policy if exists "photo_posts: delete own or admin" on public.photo_posts;
create policy "photo_posts: delete own or admin" on public.photo_posts for delete
  using (owner = auth.uid() or public.is_admin(auth.uid()));
grant select, insert, update, delete on public.photo_posts to authenticated;
revoke all on public.photo_posts from anon;

-- ───────────────────────── comments (on photo posts and sleds) ─────────────────────────
-- Optional photos on a comment use the same photos bucket (2 MB jpeg/png/webp).
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id text not null,
  owner_handle text,
  target_type text not null check (target_type in ('photo_post','sled')),
  target_id text not null,
  body text not null default '',
  photos text[] not null default '{}',
  data jsonb not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, client_id),
  check (char_length(body) <= 2000),
  check (char_length(body) > 0 or cardinality(photos) >= 1)
);
create index if not exists comments_target_idx on public.comments (target_type, target_id, created_at) where deleted_at is null;
alter table public.comments enable row level security;
drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before insert or update on public.comments
  for each row execute function public.touch_owned_row();

drop policy if exists "comments: read" on public.comments;
create policy "comments: read" on public.comments for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (deleted_at is null and public.is_premium(auth.uid()) and public.is_premium(owner))
);
drop policy if exists "comments: insert (premium)" on public.comments;
create policy "comments: insert (premium)" on public.comments for insert
  with check (owner = auth.uid() and public.is_premium(auth.uid())
              and (char_length(body) > 0 or cardinality(photos) >= 1));
drop policy if exists "comments: update own (premium) or admin" on public.comments;
create policy "comments: update own (premium) or admin" on public.comments for update
  using ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()))
  with check ((owner = auth.uid() and public.is_premium(auth.uid())) or public.is_admin(auth.uid()));
drop policy if exists "comments: delete own or admin" on public.comments;
create policy "comments: delete own or admin" on public.comments for delete
  using (owner = auth.uid() or public.is_admin(auth.uid()));
grant select, insert, update, delete on public.comments to authenticated;
revoke all on public.comments from anon;

-- ───────────────────────── articles (magazine vs exclusive) ─────────────────────────
-- Magazine issue text stays in articles.js and is not copied here. This table holds
-- exclusive (online-only) articles, plus any future magazine-issue metadata.
-- Category 'magazine' = Vintage Runner (annual, around Thanksgiving / winter).
-- Category 'exclusive' = online-only pieces published throughout the year, not printed.
create table if not exists public.articles (
  id text primary key,
  category text not null check (category in ('magazine','exclusive')),
  title text not null,
  dek text not null default '',
  body text not null default '',
  byline text not null default '',
  published boolean not null default true,
  example boolean not null default false,          -- placeholder / example, not a finished article
  sort_order int not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.articles enable row level security;

-- Teasers (no body) are readable by anyone, so free and lapsed members can see titles.
create or replace view public.article_teasers
with (security_invoker = false) as
  select id, category, title, dek, byline, published, example, sort_order, created_at
  from public.articles
  where published = true;
grant select on public.article_teasers to anon, authenticated;

-- Full article body: Premium (or admin) only. Magazine issue text is not stored here.
drop policy if exists "articles: read body (premium)" on public.articles;
create policy "articles: read body (premium)" on public.articles for select
  using (published and (public.is_premium(auth.uid()) or public.is_admin(auth.uid())));
drop policy if exists "articles: admin write" on public.articles;
create policy "articles: admin write" on public.articles for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
grant select on public.articles to authenticated;
grant insert, update, delete on public.articles to authenticated;  -- RLS limits writes to admin
revoke all on public.articles from anon;

insert into public.articles (id, category, title, dek, body, example, published, sort_order)
values
  ('placeholder-1','exclusive','Coming soon: online-only article 1',
   'A short exclusive for members, not printed in the magazine. Example placeholder.',
   'This exclusive article is still being written. When it is ready, paid members will read it here. It is online only and will not be printed in the magazine. This entry is an example placeholder.',
   true, true, 1),
  ('placeholder-2','exclusive','Coming soon: online-only article 2',
   'A future short article that will not appear in the printed Vintage Runner. Example placeholder.',
   'This exclusive article is still being written. When it is ready, paid members will read it here. It is online only and will not be printed in the magazine. This entry is an example placeholder.',
   true, true, 2),
  ('placeholder-3','exclusive','Coming soon: online-only article 3',
   'Another members-only short piece, being written now. Example placeholder.',
   'This exclusive article is still being written. When it is ready, paid members will read it here. It is online only and will not be printed in the magazine. This entry is an example placeholder.',
   true, true, 3)
on conflict (id) do nothing;

-- Handle changes also propagate to community photo posts and comments (tables exist by this point).
create or replace function public.propagate_handle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    update public.sleds set owner_handle = new.handle where owner = new.id;
    update public.listings set owner_handle = new.handle where owner = new.id;
    update public.photo_posts set owner_handle = new.handle where owner = new.id;
    update public.comments set owner_handle = new.handle where owner = new.id;
  end if;
  return null;
end $$;

-- ───────────────────────── One-time admin setup ─────────────────────────
-- After Jonathan signs in to the live app once, make his account admin (replace the email):
--   update public.profiles set is_admin = true, handle = 'sledfinder'
--   where id = (select id from auth.users where email = 'JONATHANS-SIGN-IN-EMAIL');
-- Comp a member by hand (e.g. a museum volunteer), one year:
--   update public.profiles set premium_until = now() + interval '1 year'
--   where id = (select id from auth.users where email = 'MEMBER-EMAIL');
