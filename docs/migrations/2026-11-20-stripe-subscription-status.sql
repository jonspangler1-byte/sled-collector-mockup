-- Add subscription status so the app can send members with an active or past_due
-- subscription to the Customer Portal instead of opening a new Checkout Session.
--
-- Run this once in the Supabase SQL editor for project cpmieqcsbvozwrbjagqm
-- (Dashboard → SQL Editor). Do not run it from this machine or from CI.
-- Safe to re-run (IF NOT EXISTS). Fresh installs can skip this and just use
-- docs/supabase-schema.sql, which already includes the column.

alter table public.profiles
  add column if not exists stripe_subscription_status text;
