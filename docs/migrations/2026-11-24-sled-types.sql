-- Expand allowed sled_type values on sleds and listings.
-- Cutter was already allowed. Adds: Ski Sled, Steerable Sled, Clipper, Sleigh, Tri-Runner.
-- Safe to re-run.

alter table public.sleds drop constraint if exists sleds_sled_type_check;
alter table public.sleds add constraint sleds_sled_type_check
  check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Ski Sled','Steerable Sled','Clipper','Sleigh','Tri-Runner','Other'));

alter table public.listings drop constraint if exists listings_sled_type_check;
alter table public.listings add constraint listings_sled_type_check
  check (sled_type in ('','Runner','Toboggan','Cutter','Bobsled','Saucer','Traverse','Flexy Racer','Ski Sled','Steerable Sled','Clipper','Sleigh','Tri-Runner','Other'));
