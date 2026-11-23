-- Name the three online placeholders and mark them coming soon (titles only; no new body).
-- Apply in the Supabase SQL editor after 2026-11-23-articles-free-exclusive.sql.
-- Notices are disabled so this update is not announced as a new article.

alter table public.articles disable trigger articles_notify;

update public.articles
   set title = 'Collector Focus',
       dek = 'Exclusive, online only.',
       sort_order = 101,
       data = coalesce(data, '{}'::jsonb) || '{"comingSoon": true}'::jsonb,
       updated_at = now()
 where id = 'placeholder-1';

update public.articles
   set title = 'Paris Racers',
       dek = 'Exclusive, online only.',
       sort_order = 102,
       data = coalesce(data, '{}'::jsonb) || '{"comingSoon": true}'::jsonb,
       updated_at = now()
 where id = 'placeholder-2';

update public.articles
   set title = 'Big Sleds!',
       dek = 'Exclusive, online only.',
       sort_order = 103,
       data = coalesce(data, '{}'::jsonb) || '{"comingSoon": true}'::jsonb,
       updated_at = now()
 where id = 'placeholder-3';

alter table public.articles enable trigger articles_notify;

-- Teasers stay public and still omit body and data. Expose comingSoon as coming_soon.
drop view if exists public.article_teasers;
create view public.article_teasers
with (security_invoker = false) as
  select id, access, source, title, dek, byline, published, example, sort_order, created_at,
         coalesce((data->>'comingSoon')::boolean, false) as coming_soon
  from public.articles
  where published = true;
grant select on public.article_teasers to anon, authenticated;
