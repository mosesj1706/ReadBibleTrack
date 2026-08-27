-- Contact details on a profile, so a circle can actually reach each other.

-- Email is copied here rather than read from auth.users, which is not
-- reachable through the API for anyone but yourself. Without a copy, a circle
-- could see each other's names and nothing else.
alter table public.profiles
  add column email text,
  add column phone text;

-- Loose on purpose: numbers are written every imaginable way, and refusing a
-- valid one because of a format guess is worse than storing it as typed.
-- Digits, spaces, brackets, dashes and a leading plus, between 6 and 24
-- characters — enough to reject a mistake, not enough to argue with anyone.
alter table public.profiles
  add constraint profiles_phone_shape
    check (phone is null or phone ~ '^\+?[0-9 ()\-]{6,24}$');

alter table public.profiles
  add constraint profiles_email_shape
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

comment on column public.profiles.phone is
  'Visible to circle-mates through the existing select policy, which is the
   point: a family should be able to ring each other. Nothing here is used for
   authentication — SMS sign-in, if it is ever switched on, verifies its own
   number through auth.users rather than trusting this.';

-- The existing profiles_read policy already scopes rows to yourself and to
-- people you share a circle with, and it covers every column, so these two
-- need no policy of their own. Nobody outside a circle can read either.
