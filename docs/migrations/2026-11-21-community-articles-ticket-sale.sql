-- Sled Finder schema updates for an existing project (cpmieqcsbvozwrbjagqm):
--   * sled_type on sleds and listings, including 'Flexy Racer'
--   * display_name on profiles (name shown on the museum membership ticket)
--   * photo_posts + comments (community photos with captions and comments)
--   * articles table (magazine vs exclusive); magazine issue text stays in articles.js
--   * Sleds for Sale is Premium-only to browse as well as to post
--
-- Run this once in the Supabase SQL editor for project cpmieqcsbvozwrbjagqm
-- (Dashboard → SQL Editor). Do not run it from this machine or from CI.
-- Safe to re-run (IF NOT EXISTS / exception handlers / ON CONFLICT).
-- Fresh installs can skip this and just use docs/supabase-schema.sql, which
-- already includes these objects.

-- ───────── profiles.display_name ─────────
alter table public.profiles add column if not exists display_name text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_display_name_len
    check (char_length(display_name) <= 80);
exception when duplicate_object then null; end $$;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (handle, display_name) on public.profiles to authenticated;

-- ───────── sled_type ─────────
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

-- ───────── Sleds for Sale: Premium members only (browse and post) ─────────
drop policy if exists "listings: read" on public.listings;
create policy "listings: read" on public.listings for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (status = 'active' and deleted_at is null and public.is_premium(auth.uid()) and public.is_premium(owner))
);
revoke all on public.listings from anon;
grant select, insert, update, delete on public.listings to authenticated;

-- ───────── touch trigger for community rows (no lat/lng rounding) ─────────
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

-- ───────── photo_posts ─────────
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

-- ───────── comments (on photo posts and sleds; optional photos) ─────────
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

-- ───────── articles (magazine metadata vs exclusive online-only) ─────────
-- Magazine issue text stays in articles.js and is not copied here.
create table if not exists public.articles (
  id text primary key,
  category text not null check (category in ('magazine','exclusive')),
  title text not null,
  dek text not null default '',
  body text not null default '',
  byline text not null default '',
  published boolean not null default true,
  example boolean not null default false,
  sort_order int not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.articles enable row level security;

create or replace view public.article_teasers
with (security_invoker = false) as
  select id, category, title, dek, byline, published, example, sort_order, created_at
  from public.articles
  where published = true;
grant select on public.article_teasers to anon, authenticated;

drop policy if exists "articles: read body (premium)" on public.articles;
create policy "articles: read body (premium)" on public.articles for select
  using (published and (public.is_premium(auth.uid()) or public.is_admin(auth.uid())));
drop policy if exists "articles: admin write" on public.articles;
create policy "articles: admin write" on public.articles for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
grant select on public.articles to authenticated;
grant insert, update, delete on public.articles to authenticated;
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

-- Handle changes also update community rows (tables now exist).
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
