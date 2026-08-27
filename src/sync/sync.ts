/**
 * Getting what is on this device onto the server, and the circle's back.
 *
 * The push is a **replace**: delete my rows, insert my current local state.
 * That is deliberately blunt, and it is honest about what it can do. Reading
 * progress is a set of ranges that gets rewritten wholesale when something is
 * unmarked, so an incremental "push what is new" would drift out of step the
 * first time someone unmarked a chapter. Replacing keeps the server exactly
 * equal to the device, and the volumes are small — a few hundred rows.
 *
 * The cost is real and worth stating: **one device per person**. Two devices
 * for the same account would each replace the other's rows, and the last to
 * sync would win. Fixing that needs per-row identity and a merge, which is a
 * different piece of work.
 *
 * Nothing here filters by circle. Row-level security decides what comes back,
 * so a bug in this file cannot leak someone else's reading.
 */

import { loggedRanges } from '@/progress/store';
import { listMarks, listNotes } from '@/marks/store';
import { supabase } from '@/supabase/client';

export type SyncResult = {
  readonly reading: number;
  readonly marks: number;
  readonly notes: number;
};

async function currentUser(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Not signed in.');
  return id;
}

/** Send everything on this device up, replacing what was there before. */
export async function pushMine(): Promise<SyncResult> {
  const userId = await currentUser();
  const [ranges, marks, notes] = await Promise.all([loggedRanges(), listMarks(), listNotes()]);

  // Delete then insert. RLS scopes both to this person, so `eq` is belt and
  // braces rather than the actual guard.
  for (const table of ['reading_log', 'marks', 'notes']) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  }

  if (ranges.length > 0) {
    const { error } = await supabase.from('reading_log').insert(
      ranges.map((range) => ({
        user_id: userId,
        start_id: range.start,
        end_id: range.end,
        read_on: range.readOn,
      })),
    );
    if (error) throw new Error(`Could not send reading: ${error.message}`);
  }

  if (marks.length > 0) {
    const { error } = await supabase.from('marks').insert(
      marks.map((mark) => ({
        user_id: userId,
        start_id: mark.start,
        end_id: mark.end,
        colour: mark.colour ?? null,
        starred: mark.starred,
        // Sharing is opt-in and not yet exposed in the app, so nothing in a
        // margin reaches the circle by accident.
        shared: false,
      })),
    );
    if (error) throw new Error(`Could not send highlights: ${error.message}`);
  }

  if (notes.length > 0) {
    const { error } = await supabase.from('notes').insert(
      notes.map((note) => ({
        user_id: userId,
        start_id: note.start,
        end_id: note.end,
        body: note.body,
        shared: false,
      })),
    );
    if (error) throw new Error(`Could not send notes: ${error.message}`);
  }

  return { reading: ranges.length, marks: marks.length, notes: notes.length };
}

export type MemberReading = {
  readonly userId: string;
  readonly ranges: readonly { readonly start: number; readonly end: number }[];
  /** The most recent day this person logged anything, as `YYYY-MM-DD`. */
  readonly lastReadOn: string | undefined;
};

/**
 * What the circle has read. Comes back for every member including you,
 * because a circle's progress is the union of everyone's.
 */
export async function pullCircleReading(): Promise<MemberReading[]> {
  const { data, error } = await supabase
    .from('reading_log')
    .select('user_id, start_id, end_id, read_on')
    .order('user_id');
  if (error) throw new Error(error.message);

  const byUser = new Map<string, { start: number; end: number }[]>();
  const lastSeen = new Map<string, string>();

  for (const row of data ?? []) {
    const id = row.user_id as string;
    const list = byUser.get(id);
    const range = { start: row.start_id as number, end: row.end_id as number };
    if (list) list.push(range);
    else byUser.set(id, [range]);

    const on = row.read_on as string;
    const previous = lastSeen.get(id);
    if (!previous || on > previous) lastSeen.set(id, on);
  }

  return [...byUser].map(([userId, ranges]) => ({
    userId,
    ranges,
    lastReadOn: lastSeen.get(userId),
  }));
}
