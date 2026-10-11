-- Climbing Training Tracker — Supabase schema.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run.
--
-- One generic table holds every synced record (check-ins, exercises, workouts,
-- templates, schedule entries). Each row is owned by a user; row-level security
-- means a signed-in user can only ever read/write their own rows.
-- AI settings (including API keys) are only saved if the user opts in — see
-- public.user_settings at the bottom.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid()
                         references auth.users (id) on delete cascade,
  kind       text        not null
                         check (kind in ('check_in','exercise','workout','template','schedule')),
  id         text        not null,
  data       jsonb       not null,
  updated_at bigint      not null,           -- client edit time (epoch ms) — drives last-write-wins
  deleted_at bigint,                          -- soft-delete tombstone (epoch ms)
  synced_at  timestamptz not null default now(), -- server time of last write — drives incremental pulls
  primary key (user_id, kind, id)
);

create index if not exists records_user_synced_idx
  on public.records (user_id, synced_at);

alter table public.records enable row level security;

drop policy if exists "users manage their own records" on public.records;
create policy "users manage their own records"
  on public.records
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Server-side last-write-wins + server timestamp.
-- A stale write (older or equal updated_at) is silently skipped, so a device
-- that was offline can never overwrite a newer edit made elsewhere.
create or replace function public.records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null; -- skip this row's update
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_guard_trg on public.records;
create trigger records_guard_trg
  before insert or update on public.records
  for each row execute function public.records_guard();

-- ---------------------------------------------------------------------------
-- Opt-in: AI settings saved to the account (provider, models, API keys).
-- Only written when the user turns on "Save API keys to my account". Turning it
-- off overwrites the row with enabled = false and no keys.
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id    uuid        primary key default auth.uid()
                         references auth.users (id) on delete cascade,
  enabled    boolean     not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at bigint      not null,           -- client edit time (epoch ms), last-write-wins
  synced_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "users manage their own settings" on public.user_settings;
create policy "users manage their own settings"
  on public.user_settings
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists user_settings_guard_trg on public.user_settings;
create trigger user_settings_guard_trg
  before insert or update on public.user_settings
  for each row execute function public.records_guard();
