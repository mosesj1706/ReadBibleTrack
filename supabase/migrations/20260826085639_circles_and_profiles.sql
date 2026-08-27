-- Profiles, circles, membership, and the shared reading log.
--
-- The shape follows from one decision made long before this file: reading
-- progress is a set of [start_id, end_id] ranges over verse ids. That is why a
-- circle's progress is one aggregate over `reading_log` rather than a row per
-- verse per person, and why nothing here mentions a translation — a verse id
-- means the same thing in all of them.

create extension if not exists pgcrypto;

-- Helpers live outside `public` so they are not reachable through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;


-- ---------------------------------------------------------------- profiles --

-- One row per signed-in person. Created by the client after the first sign-in,
-- rather than by a trigger on auth.users: Supabase restricts SQL against the
-- auth schema, and we need to ask for a display name anyway.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ----------------------------------------------------------------- circles --

-- A short, speakable invite code. The alphabet leaves out anything that is
-- ambiguous read aloud or written down: no O/0, no I/1/L.
-- Security definer so the uniqueness check can actually see every circle.
-- Under RLS the caller sees only their own, so the loop would think every code
-- was free and leave collisions to the unique constraint.
create or replace function private.new_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for _ in 1 .. 6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.circles c where c.join_code = code);
  end loop;
  return code;
end;
$$;

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  join_code text not null unique default private.new_join_code(),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- The primary key already indexes (circle_id, user_id). "Which circles am I
-- in?" leads with user_id, so it needs its own index.
create index circle_members_by_user on public.circle_members (user_id);
create index circles_created_by on public.circles (created_by);


-- ------------------------------------------------------------ reading log --

-- Verse ids are book * 1e6 + chapter * 1e3 + verse, so the whole canon fits
-- between Genesis 1:1 and the open upper bound of Revelation 22.
create table public.reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_id integer not null,
  end_id integer not null,
  read_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint reading_log_ordered check (start_id <= end_id),
  constraint reading_log_in_canon check (start_id >= 1001001 and end_id <= 66022999)
);

-- Group progress reads every member's spans; a personal history reads one
-- person's, newest first.
create index reading_log_by_user on public.reading_log (user_id, read_on desc);
create index reading_log_span on public.reading_log (start_id, end_id);


-- ------------------------------------------------------------- membership --

-- Asking "is the caller in this circle?" from inside a policy on
-- circle_members would recurse: the policy would query the table it guards.
-- A security definer function breaks the loop, and turns a per-row policy
-- check into one indexed lookup. The auth.uid() check inside is what keeps it
-- safe despite bypassing RLS.
create or replace function private.is_circle_member(target uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = target
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_circle_owner(target uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = target
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- "Do I share a circle with this person?" — what lets circle-mates see each
-- other's names and reading, and nobody else's.
create or replace function private.shares_circle_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other
  );
$$;


-- ------------------------------------------------------------ joining ------

-- Joining cannot be a plain insert: the circle is invisible until you are a
-- member of it, so a newcomer holding a code could never find the row. This
-- runs as definer to resolve the code, and refuses anonymous callers.
create or replace function public.join_circle(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select c.id into target
  from public.circles c
  where c.join_code = upper(trim(code));

  if target is null then
    raise exception 'no circle has the code %', upper(trim(code))
      using errcode = 'no_data_found';
  end if;

  insert into public.circle_members (circle_id, user_id)
  values (target, me)
  on conflict (circle_id, user_id) do nothing;

  return target;
end;
$$;

-- Whoever creates a circle owns it. Done here so that it cannot be forgotten
-- by a caller, and so the creator can see the row they just made.
create or replace function private.claim_new_circle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.circle_members (circle_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger circles_claim_owner
after insert on public.circles
for each row execute function private.claim_new_circle();


-- ----------------------------------------------------------------- access --

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.reading_log enable row level security;

-- Since 2026-04-28 a new table in `public` is not exposed to the Data API
-- until its roles are granted access. RLS decides which rows; this decides
-- whether the table can be reached at all. `anon` is granted nothing: there is
-- no part of this app to read signed out.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, delete on public.circle_members to authenticated;
grant select, insert, delete on public.reading_log to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.new_join_code() to authenticated;
grant execute on function private.is_circle_member(uuid) to authenticated;
grant execute on function private.is_circle_owner(uuid) to authenticated;
grant execute on function private.shares_circle_with(uuid) to authenticated;
grant execute on function public.join_circle(text) to authenticated;

revoke execute on function public.join_circle(text) from public, anon;


-- profiles: yours, and the people you read with.
create policy profiles_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.shares_circle_with(id)));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);


-- circles: visible once you are in them.
--
-- `created_by` is checked as well as membership, and it has to be. Ownership is
-- granted by an AFTER INSERT trigger, but a RETURNING clause is evaluated
-- before after-triggers fire — so on `insert ... returning` the membership row
-- does not exist yet, and a membership-only policy hides the circle from the
-- very person creating it. Postgres reports that as a row-level security
-- violation on the insert, which is a thoroughly misleading error.
create policy circles_read on public.circles
  for select to authenticated
  using (
    (select auth.uid()) = created_by
    or (select private.is_circle_member(id))
  );

create policy circles_create on public.circles
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy circles_owner_updates on public.circles
  for update to authenticated
  using ((select private.is_circle_owner(id)))
  with check ((select private.is_circle_owner(id)));

create policy circles_owner_deletes on public.circles
  for delete to authenticated
  using ((select private.is_circle_owner(id)));


-- membership: everyone in a circle can see who else is in it.
create policy circle_members_read on public.circle_members
  for select to authenticated
  using ((select private.is_circle_member(circle_id)));

-- Direct inserts only ever add yourself. Joining by code goes through
-- join_circle(); this covers nothing else adding people quietly.
create policy circle_members_join_self on public.circle_members
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Leave a circle yourself, or be removed by its owner.
create policy circle_members_leave on public.circle_members
  for delete to authenticated
  using ((select auth.uid()) = user_id or (select private.is_circle_owner(circle_id)));


-- reading log: your own history, and what your circles have read.
create policy reading_log_read on public.reading_log
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.shares_circle_with(user_id)));

create policy reading_log_write_own on public.reading_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_log_delete_own on public.reading_log
  for delete to authenticated
  using ((select auth.uid()) = user_id);
