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
  /**
   * The plan the circle reads together, or undefined when it has not agreed
   * one and everyone keeps their own. Set by whoever started the circle.
   */
  readonly planId?: string;
  readonly planStartedOn?: string;
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
  plan_id?: string | null;
  plan_started_on?: string | null;
};

const toCircle = (row: CircleRow): Circle => ({
  id: row.id,
  name: row.name,
  kind: row.kind as CircleKind,
  joinCode: row.join_code,
  createdBy: row.created_by,
  planId: row.plan_id ?? undefined,
  planStartedOn: row.plan_started_on ?? undefined,
});

/** The circles you belong to. RLS makes the filter unnecessary. */
export async function myCircles(): Promise<Circle[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('id, name, kind, join_code, created_by, plan_id, plan_started_on')
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
    .select('id, name, kind, join_code, created_by, plan_id, plan_started_on')
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

/**
 * Reporting something a circle-mate shared.
 *
 * The note's text is copied into the report rather than pointed at. Deleting
 * the note is the first thing an author does when challenged, and a report
 * that empties itself at that moment would be no use to anyone judging it.
 *
 * There is no moderation queue in the app: reports are read out of the
 * database by the person who runs it, and the address for chasing one is on
 * the support page. That is proportionate for circles of two to a handful of
 * people who joined with a code the owner gave them by hand.
 */
export type ReportedContent = {
  readonly kind: 'note' | 'mark';
  readonly authorId: string;
  readonly start: number;
  readonly end: number;
  readonly body?: string;
  readonly reason?: string;
};

async function meOrThrow(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Not signed in.');
  return id;
}

export async function reportContent(item: ReportedContent): Promise<void> {
  const me = await meOrThrow();
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: me,
    author_id: item.authorId,
    kind: item.kind,
    start_id: item.start,
    end_id: item.end,
    body: item.body ?? null,
    reason: item.reason ?? null,
  });
  if (error) throw new Error(`Could not send the report: ${error.message}`);
}

/**
 * Blocking hides shared marks and notes both ways round, and nothing else.
 *
 * Reading stays visible: it is the circle's shared purpose, and a block is not
 * meant to make you disappear from a family's progress because one person was
 * unpleasant. Putting someone out of the circle altogether is the owner's
 * remedy — `removeMember` — and is deliberately a different, heavier act.
 */
export async function blockPerson(userId: string): Promise<void> {
  const me = await meOrThrow();
  const { error } = await supabase
    .from('member_blocks')
    .insert({ blocker_id: me, blocked_id: userId });
  if (error) throw new Error(error.message);
}

export async function unblockPerson(userId: string): Promise<void> {
  const me = await meOrThrow();
  const { error } = await supabase
    .from('member_blocks')
    .delete()
    .eq('blocker_id', me)
    .eq('blocked_id', userId);
  if (error) throw new Error(error.message);
}

/** Who you have blocked. RLS means this can only ever be your own list. */
export async function blockedPeople(): Promise<string[]> {
  const { data, error } = await supabase.from('member_blocks').select('blocked_id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.blocked_id as string);
}

/**
 * Put someone out of a circle. Only whoever started it may, and never
 * themselves — leaving is `leaveCircle`, and conflating the two would let an
 * owner delete their own membership while the circle kept pointing at them.
 */
export async function removeMember(circleId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}


/**
 * Agree the circle's plan, or take it away again.
 *
 * Only the owner may: `circles_owner_updates` decides that, not this function.
 * Choosing a plan starts it today for everyone, for the same reason choosing
 * one for yourself does — day one is the day the circle decided, not a date
 * carried over from something abandoned.
 */
export async function setCirclePlan(circleId: string, planId: string | undefined): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('circles')
    .update(
      planId
        ? { plan_id: planId, plan_started_on: today }
        : { plan_id: null, plan_started_on: null },
    )
    .eq('id', circleId);
  if (error) throw new Error(error.message);
}

/** Rename a circle. The owner's to do, again decided by the policy. */
export async function renameCircle(circleId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('circles')
    .update({ name: name.trim() })
    .eq('id', circleId);
  if (error) throw new Error(error.message);
}
