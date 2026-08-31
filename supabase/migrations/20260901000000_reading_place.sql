-- Where each person stopped reading.
--
-- One row per person, not a log: this is a pointer, and the only question
-- ever asked of it is "where was I?". Keeping a history of it would be
-- keeping a record of every time someone put the book down.
--
-- Deliberately not shared with the circle, unlike marks and notes, which
-- carry a `shared` flag. What a circle is for is reading the same thing
-- together and seeing what each other made of it. Where someone's eyes
-- stopped last night is not that, and having it visible would turn a shared
-- plan into a race.

create table public.reading_place (
  -- The person is the key. An upsert on conflict is the whole write path.
  user_id uuid primary key references auth.users (id) on delete cascade,
  verse_id integer not null,
  moved_at timestamptz not null default now(),
  constraint reading_place_in_canon check (verse_id >= 1001001 and verse_id <= 66022999)
);

alter table public.reading_place enable row level security;

-- RLS decides which rows; this decides whether the table is reachable through
-- the Data API at all. Without it the table does not exist as far as a client
-- is concerned.
grant select, insert, update, delete on public.reading_place to authenticated;

create policy reading_place_read_own on public.reading_place
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reading_place_write_own on public.reading_place
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_place_update_own on public.reading_place
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reading_place_delete_own on public.reading_place
  for delete to authenticated
  using ((select auth.uid()) = user_id);
