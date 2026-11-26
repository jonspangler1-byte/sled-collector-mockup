-- Limited-time free access to the Sled Maker and Model Database.
-- After this is applied, anyone can read shared sleds, and any signed-in
-- (free) account can insert/update their own sleds, while
-- public.free_access_promo() is true.
--
-- Turn the promo ON (this file does this once):
--   update public.app_settings set value_bool = true where key = 'free_access_promo';
-- Turn the promo OFF (paywalls come back; existing posts stay, visible to the
-- owner and to paid members):
--   update public.app_settings set value_bool = false where key = 'free_access_promo';
--
-- The app also reads window.SF_CONFIG.FREE_ACCESS_PROMO. In live mode the
-- value from this function wins once the app can call it.

create table if not exists public.app_settings (
  key text primary key,
  value_bool boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings(key, value_bool)
values ('free_access_promo', true)
on conflict (key) do update set value_bool = excluded.value_bool, updated_at = now();

create or replace function public.free_access_promo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value_bool from public.app_settings where key = 'free_access_promo'), false)
$$;
grant execute on function public.free_access_promo() to anon, authenticated;
-- The flag is not secret. SELECT lets the RPC work even if SECURITY DEFINER is
-- not honored (local PGlite tests). Writes stay revoked so only the dashboard / SQL editor can change it.
grant select on public.app_settings to anon, authenticated;

-- Shared sleds: readable by anyone (including signed-out visitors) during the
-- promo. After the promo, the owner and any paid member (or admin) can still
-- read them — the owner does not have to be paid, so friends' promo posts
-- remain in the database for members.
drop policy if exists "sleds: read" on public.sleds;
create policy "sleds: read" on public.sleds for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (shared and deleted_at is null and (
    public.free_access_promo()
    or public.is_premium(auth.uid())
  ))
);
grant select on public.sleds to anon, authenticated;

-- Any signed-in account can post or edit their own sleds while the promo is on.
-- Sign-in is still required (owner = auth.uid()). When the promo is off,
-- posting and editing go back to paid members only.
drop policy if exists "sleds: insert (premium)" on public.sleds;
drop policy if exists "sleds: insert (premium or promo)" on public.sleds;
create policy "sleds: insert (premium or promo)" on public.sleds for insert
  with check (owner = auth.uid() and (public.is_premium(auth.uid()) or public.free_access_promo()));

drop policy if exists "sleds: update own (premium) or admin" on public.sleds;
drop policy if exists "sleds: update own (premium or promo) or admin" on public.sleds;
create policy "sleds: update own (premium or promo) or admin" on public.sleds for update
  using ((owner = auth.uid() and (public.is_premium(auth.uid()) or public.free_access_promo())) or public.is_admin(auth.uid()))
  with check ((owner = auth.uid() and (public.is_premium(auth.uid()) or public.free_access_promo())) or public.is_admin(auth.uid()));

-- Signed-in members can see shared-sled notices during the promo (and paid
-- members can still see them after, even when the poster is a free account).
drop policy if exists "notifications: read" on public.notifications;
create policy "notifications: read" on public.notifications for select using (
  auth.uid() is not null
  and actor_id is distinct from auth.uid()
  and (
    kind = 'article'
    or kind = 'listing'
    or (kind = 'sled' and (public.is_premium(auth.uid()) or public.free_access_promo()))
    or (kind = 'photo' and public.is_premium(auth.uid()) and (actor_id is null or public.is_premium(actor_id)))
  )
);
