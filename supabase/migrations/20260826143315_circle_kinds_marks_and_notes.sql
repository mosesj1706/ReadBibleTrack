-- Three kinds of circle, and the two ways a person marks up what they read.

-- ------------------------------------------------------------ circle kind --

-- A couple, a family and a group of friends are not the same thing. The kind
-- does not change the rules — a couple is not capped at two, because couples
-- and families blur — but it changes how the app talks about the group, and
-- what a sensible size looks like when inviting.
alter table public.circles
  add column kind text not null default 'friends'
    check (kind in ('couple', 'family', 'friends'));


-- ----------------------------------------------------------------- marks ---

-- A mark is a highlight colour, a star, or both, over a range of verses.
--
-- One table rather than two, because a verse can be highlighted *and* starred,
-- and two tables would mean two rows describing the same span. The last check
-- keeps an empty mark from existing at all.
create table public.marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_id integer not null,
  end_id integer not null,
  colour text check (colour in ('yellow', 'green', 'blue', 'pink', 'orange')),
  -- Important, or a favourite.
  starred boolean not null default false,
  -- Private until deliberately shared with the circle.
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  constraint marks_ordered check (start_id <= end_id),
  constraint marks_in_canon check (start_id >= 1001001 and end_id <= 66022999),
  constraint marks_do_something check (colour is not null or starred)
);


-- ----------------------------------------------------------------- notes ---

-- What someone writes in the margin.
--
-- Not to be confused with the `notes` table inside a bundled translation, which
-- holds the translators' footnotes. Different database entirely: those ship
-- read-only with the text, these belong to a person.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_id integer not null,
  end_id integer not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_ordered check (start_id <= end_id),
  constraint notes_in_canon check (start_id >= 1001001 and end_id <= 66022999)
);

-- "What is marked in this passage?" leads with the person, then the span.
create index marks_by_user on public.marks (user_id, start_id);
create index marks_span on public.marks (start_id, end_id);
create index notes_by_user on public.notes (user_id, start_id);
create index notes_span on public.notes (start_id, end_id);


-- ---------------------------------------------------------------- access ---

alter table public.marks enable row level security;
alter table public.notes enable row level security;

grant select, insert, update, delete on public.marks to authenticated;
grant select, insert, update, delete on public.notes to authenticated;

-- Yours always; a circle-mate's only where they chose to share it. Reading
-- together should not mean everything in your margin is on display.
create policy marks_read on public.marks
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (shared and (select private.shares_circle_with(user_id)))
  );

create policy marks_write_own on public.marks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy marks_update_own on public.marks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy marks_delete_own on public.marks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy notes_read on public.notes
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (shared and (select private.shares_circle_with(user_id)))
  );

create policy notes_write_own on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy notes_update_own on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notes_delete_own on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);
