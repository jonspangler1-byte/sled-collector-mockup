-- Sled Finder · let signed-in members (free, paid, or lapsed) browse and post Sleds for Sale
-- Incremental migration for project cpmieqcsbvozwrbjagqm. Run in the Supabase SQL editor
-- (do not run from an agent machine). Safe to re-run.
--
-- Why: sale ads were limited to paying members on both sides (poster and viewer). Jonathan
-- wants signed-in free members to browse and post listings. Lapsed members get the same
-- sale access so they are not left with less than a free account. Other paid gates
-- (catalog, map, photo ID, community photos) are unchanged. Shared sleds still hide
-- when a membership lapses; sale ads stay visible.
--
-- A later per-listing "members only" flag may restrict some ads to paid members.
-- This migration does not add that column; the read policy is written so it can be
-- added later without changing the signed-in browse/post rule for ordinary ads.

-- Listings: any signed-in member can read active ads, and insert or update their own.
drop policy if exists "listings: read" on public.listings;
create policy "listings: read" on public.listings for select using (
  owner = auth.uid()
  or public.is_admin(auth.uid())
  or (status = 'active' and deleted_at is null and auth.uid() is not null)
);

drop policy if exists "listings: insert (premium)" on public.listings;
drop policy if exists "listings: insert (signed-in)" on public.listings;
create policy "listings: insert (signed-in)" on public.listings for insert
  with check (owner = auth.uid() and auth.uid() is not null);

drop policy if exists "listings: update own (premium) or admin" on public.listings;
drop policy if exists "listings: update own or admin" on public.listings;
create policy "listings: update own or admin" on public.listings for update
  using (owner = auth.uid() or public.is_admin(auth.uid()))
  with check (owner = auth.uid() or public.is_admin(auth.uid()));

-- Sale-ad photos use the same public photos bucket. Allow any signed-in member to
-- upload into their own folder; catalog and community-photo *rows* stay premium-only.
drop policy if exists "photos: premium upload to own folder" on storage.objects;
drop policy if exists "photos: upload to own folder" on storage.objects;
create policy "photos: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Sale notices are visible to signed-in members, including free and lapsed.
-- Shared-sled and community-photo notices stay paid-to-paid.
drop policy if exists "notifications: read" on public.notifications;
create policy "notifications: read" on public.notifications for select using (
  auth.uid() is not null
  and actor_id is distinct from auth.uid()
  and (
    kind = 'article'
    or kind = 'listing'
    or (
      kind in ('sled','photo')
      and public.is_premium(auth.uid())
      and (actor_id is null or public.is_premium(actor_id))
    )
  )
);
