-- Deleting your own account, from inside the app.
--
-- The App Store requires an account that can be created in an app to be
-- deletable in it, and a privacy policy that promises deletion has to be able
-- to keep the promise without a person emailing someone and waiting.
--
-- Every table referencing auth.users cascades, so removing that one row takes
-- the reading log, the marks, the notes, the place and the profile with it.
-- What cascading gets wrong is circles.

-- `circles.created_by` cascades as well, which means the person who started a
-- circle taking their account away would delete the circle — and
-- `circle_members` cascades from circles, so everyone else in it would lose it
-- too. In an app whose whole point is the circle, one person leaving must not
-- dissolve a family's shared reading.
--
-- So a circle with anyone still in it is handed on rather than destroyed: the
-- longest-standing remaining member becomes its owner. A circle with nobody
-- left in it is deleted, because it is not anything any more.
--
-- Security definer because deleting from auth.users needs more than the caller
-- has, and because the caller is only ever allowed to delete themselves — the
-- id comes from the token, never from an argument. There is no way to spell
-- "somebody else" here.
create or replace function public.delete_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  circle record;
  heir uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  for circle in select id from public.circles where created_by = me loop
    select cm.user_id
      into heir
      from public.circle_members cm
      where cm.circle_id = circle.id
        and cm.user_id <> me
      order by cm.joined_at
      limit 1;

    if heir is null then
      delete from public.circles where id = circle.id;
    else
      update public.circles set created_by = heir where id = circle.id;
      update public.circle_members
        set role = 'owner'
        where circle_id = circle.id and user_id = heir;
    end if;
  end loop;

  -- Everything else goes with this, by cascade.
  delete from auth.users where id = me;
end;
$$;

-- Not to anonymous callers: there is nothing for them to delete, and an
-- unauthenticated route into auth.users is not worth leaving open even when it
-- can only fail.
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
