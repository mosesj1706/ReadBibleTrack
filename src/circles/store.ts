/**
 * Circles: creating one, joining one, and who is in it.
 *
 * Every query here is scoped by row-level security rather than by a `where`
 * clause. Asking for all circles returns only the ones you belong to, so the
 * client never carries the rules — the database does, and `npm run test:rls`
 * proves it.
 */

import { supabase } from '@/supabase/client';

export type CircleKind = 'couple' | 'family' | 'friends';

export const CIRCLE_KINDS: readonly { id: CircleKind; name: string; blurb: string }[] = [
  { id: 'couple', name: 'A couple', blurb: 'The two of you, reading the same thing.' },
  { id: 'family', name: 'A family', blurb: 'A household, whatever shape it is.' },
  { id: 'friends', name: 'A small circle', blurb: 'Friends who want to keep each other going.' },
];

export type Circle = {
  readonly id: string;
  readonly name: string;
  readonly kind: CircleKind;
  readonly joinCode: string;
  readonly createdBy: string;
};

export type Member = {
  readonly userId: string;
  readonly displayName: string;
  readonly role: 'owner' | 'member';
};

type CircleRow = {
  id: string;
  name: string;
  kind: string;
  join_code: string;
  created_by: string;
};

const toCircle = (row: CircleRow): Circle => ({
  id: row.id,
  name: row.name,
  kind: row.kind as CircleKind,
  joinCode: row.join_code,
  createdBy: row.created_by,
});

/** The circles you belong to. RLS makes the filter unnecessary. */
export async function myCircles(): Promise<Circle[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('id, name, kind, join_code, created_by')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCircle);
}

export async function createCircle(name: string, kind: CircleKind): Promise<Circle> {
  const { data: session } = await supabase.auth.getUser();
  const id = session.user?.id;
  if (!id) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('circles')
    .insert({ name: name.trim(), kind, created_by: id })
    .select('id, name, kind, join_code, created_by')
    .single();
  if (error) throw new Error(error.message);
  return toCircle(data);
}

/**
 * Join by code. This goes through a database function rather than an insert:
 * a circle is invisible until you belong to it, so a newcomer holding a code
 * could never find the row to join it.
 */
export async function joinByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_circle', { code });
  if (error) {
    throw new Error(
      /no circle/i.test(error.message)
        ? `No circle has the code ${code.trim().toUpperCase()}.`
        : error.message,
    );
  }
  return data as string;
}

/**
 * Who is in a circle, with their names.
 *
 * Two queries rather than one embed. `circle_members` and `profiles` both point
 * at `auth.users` but not at each other, so PostgREST has no relationship to
 * follow — it answers "could not find a relationship". A foreign key would fix
 * that, at the cost of making a join fail outright for anyone who has not
 * written a profile yet, which is a worse error than a second round trip.
 */
export async function membersOf(circleId: string): Promise<Member[]> {
  const { data: rows, error } = await supabase
    .from('circle_members')
    .select('user_id, role')
    .eq('circle_id', circleId)
    .order('joined_at');
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((row) => row.user_id as string);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);

  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));

  return rows.map((row) => ({
    userId: row.user_id as string,
    displayName: names.get(row.user_id as string) ?? 'Someone',
    role: (row.role as 'owner' | 'member') ?? 'member',
  }));
}

export async function leaveCircle(circleId: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const id = session.user?.id;
  if (!id) return;
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', id);
  if (error) throw new Error(error.message);
}
