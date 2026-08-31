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

import { loggedRanges, mergeIn, moveBookmark, readBookmarkMoved } from '@/progress/store';
import { listMarks, listNotes, mergeMarks, mergeNotes } from '@/marks/store';
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
        // Whatever the owner chose. Off unless they said otherwise, and the
        // read policy only lets a circle-mate see the ones that are on.
        shared: mark.shared,
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
        shared: note.shared,
      })),
    );
    if (error) throw new Error(`Could not send notes: ${error.message}`);
  }

  // Upserted rather than cleared and re-inserted like the rest: this is one
  // row that is a pointer, and deleting it first would leave a moment in which
  // another device pulling would find no place at all. The pull above has
  // already taken the server's copy if it was the newer one, so what goes up
  // here is the later of the two.
  const place = await readBookmarkMoved();
  if (place) {
    const { error } = await supabase
      .from('reading_place')
      .upsert(
        { user_id: userId, verse_id: place.verseId, moved_at: place.movedAt },
        { onConflict: 'user_id' },
      );
    if (error) throw new Error(`Could not send your place: ${error.message}`);
  }

  return { reading: ranges.length, marks: marks.length, notes: notes.length };
}

/**
 * Everything of yours that is on the server, folded into this device.
 *
 * This is what makes a second device possible. The push is a replace, so
 * without a pull first, opening the app on a phone would send its empty log
 * up and wipe what the browser had recorded. Pulling and merging before
 * pushing means the server ends up holding the union, and the next device to
 * sync receives it.
 *
 * Hence the order in `syncNow`, which is not an implementation detail: pull,
 * merge, then push. Reversed, it destroys data.
 */
export async function pullMine(): Promise<{
  reading: number;
  marks: number;
  notes: number;
  place: boolean;
}> {
  const userId = await currentUser();

  const [reading, marks, notes, place] = await Promise.all([
    supabase.from('reading_log').select('start_id, end_id, read_on').eq('user_id', userId),
    supabase.from('marks').select('start_id, end_id, colour, starred, shared').eq('user_id', userId),
    supabase.from('notes').select('start_id, end_id, body, shared').eq('user_id', userId),
    supabase.from('reading_place').select('verse_id, moved_at').eq('user_id', userId).maybeSingle(),
  ]);
  for (const result of [reading, marks, notes, place]) {
    if (result.error) throw new Error(`Could not read your own copy: ${result.error.message}`);
  }

  const addedReading = await mergeIn(
    (reading.data ?? []).map((row) => ({
      start: row.start_id as number,
      end: row.end_id as number,
      readOn: row.read_on as string,
    })),
  );
  const addedMarks = await mergeMarks(
    (marks.data ?? []).map((row) => ({
      start: row.start_id as number,
      end: row.end_id as number,
      colour: (row.colour as string | null) ?? null,
      starred: Boolean(row.starred),
      shared: Boolean(row.shared),
    })),
  );
  const addedNotes = await mergeNotes(
    (notes.data ?? []).map((row) => ({
      start: row.start_id as number,
      end: row.end_id as number,
      body: row.body as string,
      shared: Boolean(row.shared),
    })),
  );

  // Not a merge. Reading is a union of everything every device knows; a place
  // is one pointer, and two devices holding different ones are not both right.
  // The later one is, so a device that has been read on since is not dragged
  // backwards by one that has been sitting in a drawer.
  const theirs = place.data as { verse_id: number; moved_at: string } | null;
  const mine = await readBookmarkMoved();
  const takePlace = theirs !== null && (mine === undefined || theirs.moved_at > mine.movedAt);
  if (takePlace) await moveBookmark(theirs.verse_id, theirs.moved_at);

  return { reading: addedReading, marks: addedMarks, notes: addedNotes, place: takePlace };
}

/**
 * Bring this device level with the server, in that order.
 *
 * Pull first so the push that follows sends the union rather than whatever
 * this device happened to know on its own.
 */
export async function syncNow(): Promise<{ pulled: Awaited<ReturnType<typeof pullMine>>; pushed: SyncResult }> {
  const pulled = await pullMine();
  const pushed = await pushMine();
  return { pulled, pushed };
}

export type CircleMark = {
  readonly userId: string;
  readonly start: number;
  readonly end: number;
  readonly colour: string | undefined;
  readonly starred: boolean;
};

export type CircleNote = {
  readonly userId: string;
  readonly start: number;
  readonly end: number;
  readonly body: string;
};

/**
 * The marks and notes the circle has chosen to show each other.
 *
 * There is no `shared` filter in these queries and there must not be one:
 * `marks_read` already says a row is visible only if it is yours or shared by
 * someone you share a circle with. Filtering here as well would look like the
 * safeguard when it is only a convenience, and the day the two disagreed it
 * would be the policy that was right.
 *
 * Your own rows come back too, and are dropped by the caller — the server
 * cannot tell "mine" from "theirs" without being told who is asking, and it
 * already knows.
 */
export async function pullCircleMarks(): Promise<CircleMark[]> {
  const userId = await currentUser();
  const { data, error } = await supabase
    .from('marks')
    .select('user_id, start_id, end_id, colour, starred')
    .neq('user_id', userId);
  if (error) throw new Error(`Could not read the circle's highlights: ${error.message}`);

  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    start: row.start_id as number,
    end: row.end_id as number,
    colour: (row.colour as string | null) ?? undefined,
    starred: Boolean(row.starred),
  }));
}

export async function pullCircleNotes(): Promise<CircleNote[]> {
  const userId = await currentUser();
  const { data, error } = await supabase
    .from('notes')
    .select('user_id, start_id, end_id, body')
    .neq('user_id', userId);
  if (error) throw new Error(`Could not read the circle's notes: ${error.message}`);

  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    start: row.start_id as number,
    end: row.end_id as number,
    body: row.body as string,
  }));
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
