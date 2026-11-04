-- Plate: friends setup (v1.2). Run this once, after supabase-setup.sql.
-- Supabase dashboard → SQL Editor → New query → paste all of this → Run. Safe to run again.
--
-- How sharing stays private:
--  * The rules on plate_data do NOT change: nobody can read another person's rows directly.
--    (The app's sync reads "every row I'm allowed to see", so a broader rule would pull friends'
--    days into your own log.)
--  * A friend's diary is only reachable through plate_friend_day below, which checks for an
--    accepted friendship and returns just that day's entries and the daily targets. Foods, saved
--    meals, recents and the rest of settings (including the USDA key) are never returned.
--  * The two new tables have no direct access at all: everything goes through these functions.

create table if not exists public.plate_profiles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  username   text        not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.plate_friendships (
  requester  uuid        not null references auth.users (id) on delete cascade,
  addressee  uuid        not null references auth.users (id) on delete cascade,
  status     text        not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Only one row per pair of people, whichever of them asked first.
create unique index if not exists plate_friendships_pair
  on public.plate_friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists plate_friendships_addressee on public.plate_friendships (addressee);

alter table public.plate_profiles    enable row level security;
alter table public.plate_friendships enable row level security;
revoke all on public.plate_profiles    from anon, authenticated;
revoke all on public.plate_friendships from anon, authenticated;

-- Your own username (null until you pick one).
create or replace function public.plate_my_username() returns text
language sql stable security definer set search_path = '' as $$
  select username from public.plate_profiles where user_id = auth.uid();
$$;

-- Pick or change your username.
create or replace function public.plate_set_username(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  clean text := lower(ltrim(trim(coalesce(p_username, '')), '@'));
begin
  if clean !~ '^[a-z0-9_]{3,20}$' then raise exception 'plate_bad_username'; end if;
  insert into public.plate_profiles (user_id, username) values (auth.uid(), clean)
    on conflict (user_id) do update set username = excluded.username;
  return clean;
exception when unique_violation then
  raise exception 'plate_username_taken';
end $$;

-- Everyone you're connected to: friends, requests you received, requests you sent.
create or replace function public.plate_friends()
returns table (user_id uuid, username text, status text, incoming boolean)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.username, f.status, f.addressee = auth.uid()
  from public.plate_friendships f
  join public.plate_profiles p
    on p.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by p.username;
$$;

-- Ask someone to be friends. If they already asked you, this accepts their request.
-- Returns 'sent' or 'accepted'.
create or replace function public.plate_friend_request(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me   uuid := auth.uid();
  them uuid;
  cur  public.plate_friendships%rowtype;
begin
  if not exists (select 1 from public.plate_profiles where user_id = me) then
    raise exception 'plate_no_username';
  end if;
  select user_id into them from public.plate_profiles
    where username = lower(ltrim(trim(coalesce(p_username, '')), '@'));
  if them is null then raise exception 'plate_user_not_found'; end if;
  if them = me then raise exception 'plate_self'; end if;

  select * into cur from public.plate_friendships
    where (requester = me and addressee = them) or (requester = them and addressee = me);
  if found then
    if cur.status = 'accepted' then raise exception 'plate_already_friends'; end if;
    if cur.requester = me then raise exception 'plate_already_requested'; end if;
    update public.plate_friendships set status = 'accepted'
      where requester = them and addressee = me;
    return 'accepted';
  end if;

  if (select count(*) from public.plate_friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'plate_too_many_requests';
  end if;
  insert into public.plate_friendships (requester, addressee) values (me, them);
  return 'sent';
end $$;

-- Accept a request someone sent you. (Only the person who received it can do this.)
create or replace function public.plate_friend_accept(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.plate_friendships set status = 'accepted'
    where requester = p_other and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'plate_request_gone'; end if;
end $$;

-- Unfriend, decline a request, or cancel one you sent. Sharing stops immediately.
create or replace function public.plate_friend_remove(p_other uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.plate_friendships
    where (requester = auth.uid() and addressee = p_other)
       or (requester = p_other and addressee = auth.uid());
$$;

-- One day of a friend's diary, plus their daily targets. Accepted friends only.
create or replace function public.plate_friend_day(p_friend uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.plate_friendships
    where status = 'accepted'
      and ((requester = auth.uid() and addressee = p_friend)
        or (requester = p_friend and addressee = auth.uid()))
  ) then
    raise exception 'plate_not_friends';
  end if;
  return jsonb_build_object(
    'entries', coalesce((select value from public.plate_data
                         where user_id = p_friend and key = 'day:' || to_char(p_date, 'YYYY-MM-DD')), '[]'::jsonb),
    'targets', (select value -> 'targets' from public.plate_data
                where user_id = p_friend and key = 'settings')
  );
end $$;

-- Used by "Erase all my data": removes your username and every friend connection.
create or replace function public.plate_forget_me() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.plate_friendships where auth.uid() in (requester, addressee);
  delete from public.plate_profiles where user_id = auth.uid();
end $$;

-- Only signed-in people can call these (functions are open to everyone by default).
revoke all on function public.plate_my_username()             from public, anon;
revoke all on function public.plate_set_username(text)        from public, anon;
revoke all on function public.plate_friends()                 from public, anon;
revoke all on function public.plate_friend_request(text)      from public, anon;
revoke all on function public.plate_friend_accept(uuid)       from public, anon;
revoke all on function public.plate_friend_remove(uuid)       from public, anon;
revoke all on function public.plate_friend_day(uuid, date)    from public, anon;
revoke all on function public.plate_forget_me()               from public, anon;
grant execute on function public.plate_my_username()          to authenticated;
grant execute on function public.plate_set_username(text)     to authenticated;
grant execute on function public.plate_friends()              to authenticated;
grant execute on function public.plate_friend_request(text)   to authenticated;
grant execute on function public.plate_friend_accept(uuid)    to authenticated;
grant execute on function public.plate_friend_remove(uuid)    to authenticated;
grant execute on function public.plate_friend_day(uuid, date) to authenticated;
grant execute on function public.plate_forget_me()            to authenticated;
