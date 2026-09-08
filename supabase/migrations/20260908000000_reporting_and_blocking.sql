-- Reporting a note, blocking a person, and removing someone from a circle.
--
-- The app lets people write a note against a verse and share it with their
-- circle, which makes it an app with user-generated content. That carries an
-- obligation the first version did not meet: someone who is shown something
-- ugly needs a way to report it and a way to stop seeing the person who wrote
-- it, and whoever started the circle needs a way to put them out of it.
--
-- Until now the only remedy was to leave your own circle, which is the wrong
-- shape entirely — it asks the person who was hurt to give up the thing they
-- came for.
--
-- Blocking is deliberately narrower than banishment. It hides shared marks and
-- notes in both directions and nothing else: reading progress is the circle's
-- shared purpose and stays visible, and a person who blocks someone should not
-- thereby vanish from the circle themselves. Removing a member is the stronger
-- remedy, and belongs to whoever started the circle.


-- --------------------------------------------------------------- blocking --

create table public.member_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint member_blocks_not_self check (blocker_id <> blocked_id)
);

-- Every policy below asks "is either of us blocking the other?", so the index
-- has to serve the reverse direction as well as the primary key's.
create index member_blocks_by_blocked on public.member_blocks (blocked_id, blocker_id);

alter table public.member_blocks enable row level security;
grant select, insert, delete on public.member_blocks to authenticated;

-- A block is yours: you can see the ones you made and take them back. You
-- cannot see who has blocked you, which is the point — telling someone they
-- have been blocked hands them a reason to make another account.
create policy member_blocks_read_own on public.member_blocks
  for select to authenticated
  using ((select auth.uid()) = blocker_id);

create policy member_blocks_write_own on public.member_blocks
  for insert to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy member_blocks_delete_own on public.member_blocks
  for delete to authenticated
  using ((select auth.uid()) = blocker_id);

-- Symmetric on purpose. If it hid only one direction, blocking someone would
-- leave your own shared notes still landing in front of them, which is not
-- what anyone means by the word.
--
-- Security definer because the policies that call it must see every block row,
-- not the caller's own — `member_blocks_read_own` would otherwise hide exactly
-- the rows the check depends on.
create or replace function private.blocked_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = (select auth.uid()))
  );
$$;


-- -------------------------------------------------------------- reporting --

-- What was reported, kept apart from the thing itself.
--
-- `body` is a copy rather than a reference: the first thing an author does
-- when challenged is delete the note, and a report that empties itself when
-- that happens is no use to whoever has to judge it.
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('note', 'mark')),
  start_id integer not null,
  end_id integer not null,
  body text,
  reason text check (reason is null or length(reason) <= 1000),
  created_at timestamptz not null default now(),
  constraint content_reports_ordered check (start_id <= end_id),
  constraint content_reports_not_self check (reporter_id <> author_id)
);

create index content_reports_recent on public.content_reports (created_at desc);

alter table public.content_reports enable row level security;
grant select, insert on public.content_reports to authenticated;

-- You may report, and you may see what you reported. There is no update or
-- delete policy, so RLS narrows those statements to no rows rather than
-- refusing them: the call comes back clean and the report is still there. A
-- report is evidence, and it is read with the service key when someone acts
-- on it.
create policy content_reports_write_own on public.content_reports
  for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy content_reports_read_own on public.content_reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id);


-- ------------------------------------------------- blocked content, hidden --

-- The read policies gain one clause. Dropped and recreated rather than
-- altered, because a policy's `using` expression cannot be changed in place.
drop policy marks_read on public.marks;
create policy marks_read on public.marks
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      shared
      and (select private.shares_circle_with(user_id))
      and not (select private.blocked_with(user_id))
    )
  );

drop policy notes_read on public.notes;
create policy notes_read on public.notes
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      shared
      and (select private.shares_circle_with(user_id))
      and not (select private.blocked_with(user_id))
    )
  );


-- ------------------------------------------------------ removing a member --

-- Whoever started the circle can put someone out of it. Deliberately not the
-- other way about: a member cannot remove the owner, and cannot remove another
-- member. `circle_members_leave` already covers removing yourself, and this
-- policy excludes that case so the two cannot be confused.
create policy circle_members_owner_removes on public.circle_members
  for delete to authenticated
  using (
    user_id <> (select auth.uid())
    and (select private.is_circle_owner(circle_id))
  );
