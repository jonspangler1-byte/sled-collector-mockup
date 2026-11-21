-- Sled Finder · in-app notifications + web-push subscriptions
-- Incremental migration for an existing project. Run in the Supabase SQL editor of
-- project cpmieqcsbvozwrbjagqm (do not run from an agent machine).
-- Safe to re-run. A brand-new run of docs/supabase-schema.sql already includes these objects.
--
-- What this adds:
--   * notifications: one broadcast row per new shared sled, published article,
--     community photo post, or active sale listing (created by triggers; the app cannot write them).
--   * notification_reads: per-user read state for the unread badge.
--   * notification_settings: per-user category toggles (default on) and a push master switch.
--   * push_subscriptions: Web Push endpoints for installed PWA / browser users.
-- The poster is never shown their own notice (actor_id). Sale, shared-sled and photo
-- notices are Premium-only and only while the actor is still a current member.
-- Article notices are visible to any signed-in user (teasers are public; the body stays Premium).
-- Magazine issue text in articles.js does not fire a notice; insert a published, non-example
-- row in public.articles when an article should notify people.

-- ───────────────────────── notifications ─────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sled','article','photo','listing')),
  target_id text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 280),
  href text not null default '#/notifications' check (char_length(href) <= 200),
  created_at timestamptz not null default now(),
  unique (kind, target_id)
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists notifications_actor_idx on public.notifications (actor_id);
alter table public.notifications enable row level security;

drop policy if exists "notifications: read" on public.notifications;
create policy "notifications: read" on public.notifications for select using (
  auth.uid() is not null
  and actor_id is distinct from auth.uid()
  and (
    kind = 'article'
    or (
      kind in ('sled','photo','listing')
      and public.is_premium(auth.uid())
      and (actor_id is null or public.is_premium(actor_id))
    )
  )
);

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- ───────────────────────── notification_reads ─────────────────────────
create table if not exists public.notification_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.notification_reads enable row level security;

drop policy if exists "notification_reads: own" on public.notification_reads;
create policy "notification_reads: own" on public.notification_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notification_reads from anon, authenticated;
grant select, insert, update, delete on public.notification_reads to authenticated;

-- ───────────────────────── notification_settings ─────────────────────────
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notify_sleds boolean not null default true,
  notify_articles boolean not null default true,
  notify_photos boolean not null default true,
  notify_listings boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;

drop policy if exists "notification_settings: own" on public.notification_settings;
create policy "notification_settings: own" on public.notification_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update, delete on public.notification_settings to authenticated;

-- ───────────────────────── push_subscriptions ─────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '' check (char_length(user_agent) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: own" on public.push_subscriptions;
create policy "push_subscriptions: own" on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Existing accounts get default (all-on) settings. New sign-ups get a row from handle_new_user.
insert into public.notification_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'collector_' || substr(replace(new.id::text, '-', ''), 1, 8))
  on conflict (id) do nothing;
  insert into public.notification_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

create or replace function public.touch_notification_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists notification_settings_touch on public.notification_settings;
create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function public.touch_notification_settings();

create or replace function public.touch_push_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions
  for each row execute function public.touch_push_subscription();

-- ───────────────────────── content triggers ─────────────────────────
-- One notice per item (kind + target_id). Re-sharing the same item does not create a second row.
-- Example (placeholder) articles are skipped. Do not put a VAPID private key, service_role key,
-- or webhook secret in this file or in the database.
create or replace function public.emit_content_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  k text;
  tid text;
  act uuid;
  handle text;
  ttl text;
  bdy text;
  ref text;
  go boolean := false;
  cap text;
  visible boolean;
  was_visible boolean;
begin
  -- Read columns via jsonb so this one function can be attached to four tables
  -- without referencing a field that does not exist on NEW/OLD for that table.
  if tg_table_name = 'sleds' then
    k := 'sled';
    tid := new.id::text;
    act := new.owner;
    handle := coalesce(nullif(n->>'owner_handle', ''), (select p.handle from public.profiles p where p.id = new.owner));
    visible := coalesce((n->>'shared')::boolean, false) and n->>'deleted_at' is null;
    was_visible := coalesce((o->>'shared')::boolean, false) and o->>'deleted_at' is null;
    go := visible and (tg_op = 'INSERT' or not was_visible);
    ttl := 'New shared sled';
    bdy := trim(both from (
      case when handle is not null then '@' || handle || ' shared ' else 'A member shared ' end
      || coalesce(nullif(n->>'model', ''), 'a sled')
      || case when coalesce(n->>'sled_type', '') <> '' then ' (' || (n->>'sled_type') || ')' else '' end
    ));
    ref := '#/sled/c' || new.id::text;
  elsif tg_table_name = 'photo_posts' then
    k := 'photo';
    tid := new.id::text;
    act := new.owner;
    handle := coalesce(nullif(n->>'owner_handle', ''), (select p.handle from public.profiles p where p.id = new.owner));
    visible := n->>'deleted_at' is null;
    was_visible := o->>'deleted_at' is null and tg_op = 'UPDATE';
    go := visible and (tg_op = 'INSERT' or not was_visible);
    cap := left(btrim(coalesce(n->>'caption', '')), 120);
    ttl := 'New community photo';
    bdy := trim(both from (
      case when handle is not null then '@' || handle || ' posted a photo' else 'A member posted a photo' end
      || case when cap <> '' then ': ' || cap else '' end
    ));
    ref := '#/photopost/c' || new.id::text;
  elsif tg_table_name = 'listings' then
    k := 'listing';
    tid := new.id::text;
    act := new.owner;
    visible := coalesce(n->>'status', '') = 'active' and n->>'deleted_at' is null;
    was_visible := coalesce(o->>'status', '') = 'active' and o->>'deleted_at' is null;
    go := visible and (tg_op = 'INSERT' or not was_visible);
    ttl := 'New sled for sale';
    bdy := trim(both from (
      coalesce(nullif(n->>'title', ''), 'A sled is for sale')
      || case when coalesce(n->>'price', '') <> '' then ' · ' || (n->>'price') else '' end
    ));
    ref := '#/listing/c' || new.id::text;
  elsif tg_table_name = 'articles' then
    k := 'article';
    tid := new.id;
    act := null;
    visible := coalesce((n->>'published')::boolean, false) and not coalesce((n->>'example')::boolean, false);
    was_visible := coalesce((o->>'published')::boolean, false) and not coalesce((o->>'example')::boolean, false);
    go := visible and (tg_op = 'INSERT' or not was_visible);
    ttl := case when n->>'category' = 'magazine' then 'New Vintage Runner article' else 'New exclusive article' end;
    bdy := left(coalesce(nullif(n->>'title', ''), 'A new article is up'), 280);
    ref := case when n->>'category' = 'magazine' then '#/article/' else '#/exclusive/' end || new.id;
  else
    return null;
  end if;

  if go then
    insert into public.notifications (kind, target_id, actor_id, title, body, href)
    values (k, tid, act, left(ttl, 140), left(bdy, 280), left(ref, 200))
    on conflict (kind, target_id) do nothing;
  elsif tg_op = 'UPDATE' and not visible then
    delete from public.notifications where kind = k and target_id = tid;
  end if;
  return null;
end
$$;

drop trigger if exists sleds_notify on public.sleds;
create trigger sleds_notify after insert or update on public.sleds
  for each row execute function public.emit_content_notification();

drop trigger if exists photo_posts_notify on public.photo_posts;
create trigger photo_posts_notify after insert or update on public.photo_posts
  for each row execute function public.emit_content_notification();

drop trigger if exists listings_notify on public.listings;
create trigger listings_notify after insert or update on public.listings
  for each row execute function public.emit_content_notification();

drop trigger if exists articles_notify on public.articles;
create trigger articles_notify after insert or update on public.articles
  for each row execute function public.emit_content_notification();
