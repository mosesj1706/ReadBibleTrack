-- A plan the circle reads together, and a circle that survives its owner
-- walking out of it.
--
-- `plans/provider.tsx` has said since it was written that "the plan belongs to
-- the circle rather than the person — everyone reading the same passage is
-- what makes 'Anna read this morning' worth saying", and stored it per device
-- only because circles had no screen yet. They do now.
--
-- The other half of this migration is a bug. `delete_me` hands a circle on to
-- the longest-standing member when its owner deletes their account, but simply
-- *leaving* did no such thing: the circle was left with members and no owner,
-- which meant nobody could remove anyone and nothing could be renamed, for
-- ever. Found by leaving a circle by accident, which is also why leaving now
-- asks first.


-- ------------------------------------------------------ a plan to share --

alter table public.circles
  add column plan_id text
    check (plan_id is null or length(trim(plan_id)) between 1 and 60),
  add column plan_started_on date;

-- Both or neither. A plan with no start date has no day one, and a start date
-- with no plan is a date for nothing.
alter table public.circles
  add constraint circles_plan_complete
  check ((plan_id is null) = (plan_started_on is null));

comment on column public.circles.plan_id is
  'An id from the app''s plan catalogue, or null when the circle has not '
  'agreed one and everyone keeps their own.';

-- `circles_owner_updates` already restricts updates to the owner, so choosing
-- the circle's plan is the owner's to do and needs no new policy.


-- ------------------------------------------- a circle outliving its owner --

-- Mirrors the handover in `delete_me`, for the case that migration did not
-- cover: leaving, or being removed. Written defensively because both paths can
-- reach it — deleting an account cascades through `circle_members` too — and
-- doing it twice must be the same as doing it once.
create or replace function private.pass_on_circle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  heir uuid;
begin
  -- Nobody left: the circle is not anything any more.
  if not exists (
    select 1 from public.circle_members m where m.circle_id = old.circle_id
  ) then
    delete from public.circles c where c.id = old.circle_id;
    return old;
  end if;

  -- Somebody is still here. If the circle has an owner among them, nothing to
  -- do — this also makes the second run of a double fire a no-op.
  if exists (
    select 1
    from public.circle_members m
    where m.circle_id = old.circle_id and m.role = 'owner'
  ) then
    return old;
  end if;

  select m.user_id into heir
  from public.circle_members m
  where m.circle_id = old.circle_id
  order by m.joined_at, m.user_id
  limit 1;

  update public.circle_members
     set role = 'owner'
   where circle_id = old.circle_id and user_id = heir;

  update public.circles
     set created_by = heir
   where id = old.circle_id;

  return old;
end;
$$;

create trigger circle_members_hand_over
after delete on public.circle_members
for each row execute function private.pass_on_circle();


-- --------------------------------------------- coming back to your own --

-- Rejoining a circle you started makes you its owner again.
--
-- Without this, leaving your own circle and coming back with the code returned
-- you as an ordinary member of something you made, with no way to ever get it
-- back. The check is against `created_by`, so it can only ever restore the
-- person the circle already records as its author.
create or replace function public.join_circle(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  founder uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select c.id, c.created_by into target, founder
  from public.circles c
  where c.join_code = upper(trim(code));

  if target is null then
    raise exception 'no circle has the code %', upper(trim(code))
      using errcode = 'no_data_found';
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (target, me, case when me = founder then 'owner' else 'member' end)
  on conflict (circle_id, user_id) do nothing;

  -- A circle can end up with no owner at all if this one predates the trigger
  -- above. Coming home fixes it.
  if me = founder then
    update public.circle_members
       set role = 'owner'
     where circle_id = target and user_id = me;
  end if;

  return target;
end;
$$;
