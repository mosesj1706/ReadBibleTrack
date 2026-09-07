-- What someone has deliberately un-marked.
--
-- Merging reading is a union, and a union cannot express taking something
-- back: nothing distinguishes "never read" from "read, then un-read", because
-- both are an absence. So a removal has to be a fact that travels, rather than
-- something inferred from what is missing.
--
-- Without this, un-marking survived only until the next sync — and not because
-- another device restored it. `syncNow` pulls before it pushes, so the pull
-- unioned the server's copy back in and the push then wrote it out again. The
-- device that removed a chapter undid its own removal, silently.
--
-- Deliberately not shared with the circle, unlike `reading_log`. Reading is
-- something a circle sees; changing your mind about a chapter is not, and
-- showing it would make un-marking feel like an admission.

create table public.reading_removals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_id integer not null,
  end_id integer not null,
  removed_at timestamptz not null default now(),
  constraint reading_removals_ordered check (start_id <= end_id),
  constraint reading_removals_in_canon check (start_id >= 1001001 and end_id <= 66022999)
);

-- The only question ever asked of it is "what has this person taken back?".
create index reading_removals_by_user on public.reading_removals (user_id, start_id);

alter table public.reading_removals enable row level security;

-- RLS decides which rows; this decides whether the table is reachable through
-- the Data API at all.
grant select, insert, update, delete on public.reading_removals to authenticated;

create policy reading_removals_read_own on public.reading_removals
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reading_removals_write_own on public.reading_removals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_removals_update_own on public.reading_removals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reading_removals_delete_own on public.reading_removals
  for delete to authenticated
  using ((select auth.uid()) = user_id);
