-- A plan a circle makes up for itself.
--
-- The catalogue covers the plans most people want, but "the Gospels and Acts
-- over Lent" is not in it and never will be — the point of a circle agreeing a
-- plan is that it is *their* plan. A preset is named by `plan_id` alone; a
-- custom one has nowhere to be named, so it carries its own definition.
--
-- Kept as columns rather than json. The three facts are a name, some books and
-- a number of days, and a check constraint can hold all three to account. Json
-- would have let a plan with no books through and failed in the reader.

alter table public.circles
  add column plan_name text
    check (plan_name is null or length(trim(plan_name)) between 1 and 60),
  add column plan_books smallint[],
  add column plan_days integer
    check (plan_days is null or plan_days between 1 and 3650);

-- Book numbers are the first component of every verse id, so a plan naming a
-- book that does not exist would compute a portion of nothing and read as an
-- empty day. Written as a literal because a check constraint may not contain a
-- subquery, which rules out generate_series.
alter table public.circles
  add constraint circles_plan_books_in_canon
  check (
    plan_books is null
    or plan_books <@ ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66]::smallint[]
  );

-- `plan_id = 'custom'` is the marker that the definition is in these columns,
-- and it has to be complete: a custom plan with no books or no length is not a
-- plan, it is a name.
alter table public.circles
  add constraint circles_custom_plan_complete
  check (
    plan_id is distinct from 'custom'
    or (
      plan_name is not null
      and plan_days is not null
      and plan_books is not null
      -- coalesce, because `array_length` of an empty array is NULL, and a
      -- check constraint passes when its expression is NULL rather than
      -- failing. Without it, a plan naming no books at all was accepted.
      and coalesce(array_length(plan_books, 1), 0) >= 1
    )
  );

comment on column public.circles.plan_books is
  'Book numbers 1-66 for a custom plan, in canon order. Null for a preset.';
