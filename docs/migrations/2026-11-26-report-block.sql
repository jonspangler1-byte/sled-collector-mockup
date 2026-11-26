-- Report and Block for user-generated content (App Store guideline 1.2).
-- Run once in the Supabase SQL editor (project cpmieqcsbvozwrbjagqm). Safe to run again.
-- The web app works before this is run: reports still go to the developer's Google Form,
-- and blocks are kept on the phone. After it runs, reports are stored here, blocks sync
-- across devices, and the admin can hide reported posts for everyone.

-- ───────── 1. Admin "hidden" flag on shared content ─────────
alter table public.sleds       add column if not exists hidden_by_admin boolean not null default false;
alter table public.listings    add column if not exists hidden_by_admin boolean not null default false;
alter table public.photo_posts add column if not exists hidden_by_admin boolean not null default false;
alter table public.comments    add column if not exists hidden_by_admin boolean not null default false;

-- Only an admin may set or clear the flag; an owner's normal edit keeps the old value.
create or replace function public.keep_hidden_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin(auth.uid()) or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.hidden_by_admin := false;
  else new.hidden_by_admin := old.hidden_by_admin; end if;
  return new;
end $$;
drop trigger if exists sleds_keep_hidden on public.sleds;
create trigger sleds_keep_hidden before insert or update on public.sleds for each row execute function public.keep_hidden_flag();
drop trigger if exists listings_keep_hidden on public.listings;
create trigger listings_keep_hidden before insert or update on public.listings for each row execute function public.keep_hidden_flag();
drop trigger if exists photo_posts_keep_hidden on public.photo_posts;
create trigger photo_posts_keep_hidden before insert or update on public.photo_posts for each row execute function public.keep_hidden_flag();
drop trigger if exists comments_keep_hidden on public.comments;
create trigger comments_keep_hidden before insert or update on public.comments for each row execute function public.keep_hidden_flag();

-- Hidden rows disappear for everyone except the owner and admins. RESTRICTIVE policies
-- are ANDed with the existing read policies, so nothing else about who can read changes.
drop policy if exists "sleds: not hidden" on public.sleds;
create policy "sleds: not hidden" on public.sleds as restrictive for select
  using (not hidden_by_admin or owner = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "listings: not hidden" on public.listings;
create policy "listings: not hidden" on public.listings as restrictive for select
  using (not hidden_by_admin or owner = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "photo_posts: not hidden" on public.photo_posts;
create policy "photo_posts: not hidden" on public.photo_posts as restrictive for select
  using (not hidden_by_admin or owner = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "comments: not hidden" on public.comments;
create policy "comments: not hidden" on public.comments as restrictive for select
  using (not hidden_by_admin or owner = auth.uid() or public.is_admin(auth.uid()));

-- ───────── 2. Reports ─────────
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null check (kind in ('sled','listing','photo','comment')),
  target_id uuid not null,                       -- row id in sleds / listings / photo_posts / comments
  target_owner uuid references public.profiles(id) on delete set null,
  target_handle text not null default '' check (char_length(target_handle) <= 60),
  reason text not null check (reason in ('spam','abusive','sexual','scam','off_topic','other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','hidden','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
alter table public.content_reports enable row level security;

drop policy if exists "content_reports: insert own" on public.content_reports;
create policy "content_reports: insert own" on public.content_reports for insert to authenticated
  with check (reporter = auth.uid() and status = 'open' and resolved_at is null and resolved_by is null);
drop policy if exists "content_reports: read own or admin" on public.content_reports;
create policy "content_reports: read own or admin" on public.content_reports for select
  using (reporter = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "content_reports: admin update" on public.content_reports;
create policy "content_reports: admin update" on public.content_reports for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

revoke all on public.content_reports from anon, authenticated;
grant select, insert, update on public.content_reports to authenticated;

-- Admin action on a report: 'hide' hides the post for everyone, 'unhide' restores it,
-- 'dismiss' closes the report and leaves the post alone.
create or replace function public.moderate_report(report_id uuid, action text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.content_reports; tbl text; hide boolean;
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  select * into r from public.content_reports where id = report_id;
  if not found then raise exception 'report not found'; end if;
  if action not in ('hide','unhide','dismiss') then raise exception 'bad action'; end if;
  if action in ('hide','unhide') then
    tbl := case r.kind when 'sled' then 'sleds' when 'listing' then 'listings' when 'photo' then 'photo_posts' else 'comments' end;
    hide := action = 'hide';
    execute format('update public.%I set hidden_by_admin = $1 where id = $2', tbl) using hide, r.target_id;
    update public.content_reports set status = case when hide then 'hidden' else 'dismissed' end,
      resolved_at = now(), resolved_by = auth.uid()
      where kind = r.kind and target_id = r.target_id and (status = 'open' or not hide);
  else
    update public.content_reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid() where id = report_id;
  end if;
  return action;
end $$;
revoke all on function public.moderate_report(uuid, text) from public, anon;
grant execute on function public.moderate_report(uuid, text) to authenticated;

-- ───────── 3. Blocks ─────────
create table if not exists public.user_blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  blocked_handle text not null default '' check (char_length(blocked_handle) <= 60),
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
drop policy if exists "user_blocks: own" on public.user_blocks;
create policy "user_blocks: own" on public.user_blocks for all
  using (blocker = auth.uid()) with check (blocker = auth.uid());
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
