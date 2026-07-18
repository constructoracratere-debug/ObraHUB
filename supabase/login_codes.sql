-- ======================================================================
-- ObraHub — login_codes table (for Resend-based OTP delivery)
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Stores 6-digit login codes that are emailed via Resend and verified
-- server-side using the service role key (RLS disabled, server-only access).
-- ======================================================================

create table if not exists public.login_codes (
  email       text primary key,
  code        text not null,
  expires_at  timestamptz not null,
  consumed    boolean not null default false
);

comment on table public.login_codes is
  'Transient 6-digit login codes for the Resend OTP flow. Server-only access.';

-- RLS disabled intentionally: this table is only ever touched by the
-- service-role client in /api/auth/send-code and /api/auth/verify-code,
-- which bypass RLS. Never expose it to the browser client.
alter table public.login_codes disable row level security;
