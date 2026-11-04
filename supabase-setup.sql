-- Plate: one-time database setup.
-- Supabase dashboard → SQL Editor → New query → paste all of this → Run.

-- One row per piece of a person's log (one row per day, plus their foods, meals and settings).
create table if not exists public.plate_data (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  updated_at bigint      not null,               -- when the phone made the change (ms)
  server_at  timestamptz not null default now(), -- when the server received it (used for syncing)
  primary key (user_id, key)
);
create index if not exists plate_data_user_server_at on public.plate_data (user_id, server_at);

-- Stamp every insert/update with the server's clock.
create or replace function public.plate_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_at := now();
  return new;
end $$;
drop trigger if exists plate_touch on public.plate_data;
create trigger plate_touch before insert or update on public.plate_data
  for each row execute function public.plate_touch();

-- Privacy: each signed-in person can only see and change their own rows.
alter table public.plate_data enable row level security;
drop policy if exists "read own"   on public.plate_data;
drop policy if exists "add own"    on public.plate_data;
drop policy if exists "change own" on public.plate_data;
drop policy if exists "delete own" on public.plate_data;
create policy "read own"   on public.plate_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own"    on public.plate_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "change own" on public.plate_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.plate_data for delete to authenticated using ((select auth.uid()) = user_id);

-- Let signed-in users reach the table through the app (signed-out visitors get nothing).
revoke all on public.plate_data from anon;
grant select, insert, update, delete on public.plate_data to authenticated;
