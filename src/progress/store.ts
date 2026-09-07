/**
 * What has been read.
 *
 * Progress is a set of `[start, end]` ranges over verse ids, never a list of
 * verses and never a percentage. A percentage is derived on demand by
 * `countVerses`; storing one would rot the moment a plan or a range changed.
 *
 * This is its own database, separate from the bundled translations: those are
 * read-only assets that get replaced wholesale when a translation is
 * re-ingested, and reading history must survive that. It is also the table that
 * will sync to a circle later — one row per span read, which is what makes
 * group progress a single SQL aggregate rather than a row per verse per person.
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { additionsFrom, withoutRemoved } from './merge.ts';

import {
  normaliseRanges,
  subtractRanges,
  type VerseId,
  type VerseRange,
} from '@/bible/verse-id.ts';

const DATABASE_NAME = 'progress.db';

export type LoggedRange = VerseRange & {
  /** The day it was read, as `YYYY-MM-DD`. Kept for streaks and history. */
  readonly readOn: string;
};

let opening: Promise<SQLiteDatabase> | undefined;

/** Opened once and reused; the schema is created on first use. */
export function progressDatabase(): Promise<SQLiteDatabase> {
  opening ??= openDatabaseAsync(DATABASE_NAME).then(async (db) => {
    await db.execAsync(`
      pragma journal_mode = wal;
      create table if not exists reading_log (
        id integer primary key autoincrement,
        start_id integer not null,
        end_id integer not null,
        read_on text not null
      );
      create index if not exists reading_log_span on reading_log (start_id, end_id);

      -- What has been deliberately un-marked.
      --
      -- Merging reading is a union, and a union cannot express taking
      -- something back: nothing distinguishes "never read" from "read, then
      -- un-read", because both are an absence. Without this table the pull put
      -- an un-marked chapter straight back and the push then wrote it out
      -- again, so the device that removed it undid its own removal.
      create table if not exists reading_removals (
        id integer primary key autoincrement,
        start_id integer not null,
        end_id integer not null,
        removed_at text not null
      );
      create index if not exists reading_removals_span on reading_removals (start_id, end_id);

      -- Where reading stopped. One row, always: a person has one place they
      -- are up to, not one per book.
      create table if not exists bookmark (
        id integer primary key check (id = 1),
        verse_id integer not null,
        moved_at text not null
      );
    `);
    return db;
  });
  return opening;
}

export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Every span ever logged, with its date, oldest first. */
export async function loggedRanges(): Promise<LoggedRange[]> {
  const db = await progressDatabase();
  const rows = await db.getAllAsync<{ start_id: number; end_id: number; read_on: string }>(
    'select start_id, end_id, read_on from reading_log order by read_on, start_id',
  );
  return rows.map((row) => ({ start: row.start_id, end: row.end_id, readOn: row.read_on }));
}

/**
 * What has been read, as the smallest equivalent set of ranges. This is the
 * shape everything else measures against.
 */
export async function readRanges(): Promise<VerseRange[]> {
  return normaliseRanges(await loggedRanges());
}

export async function markRead(range: VerseRange, readOn = today()): Promise<void> {
  const db = await progressDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'insert into reading_log (start_id, end_id, read_on) values (?, ?, ?)',
      range.start,
      range.end,
      readOn,
    );
    // Reading it again beats having un-read it, and stops a removal haunting
    // the range for ever.
    await forgetRemovals(range);
  });
}

/**
 * Every range that has been taken back and not since re-read.
 */
export async function removedRanges(): Promise<VerseRange[]> {
  const db = await progressDatabase();
  const rows = await db.getAllAsync<{ start_id: number; end_id: number }>(
    'select start_id, end_id from reading_removals order by start_id',
  );
  return rows.map((row) => ({ start: row.start_id, end: row.end_id }));
}

/**
 * Drop the removals covering a range, and trim the ones that only overlap it.
 *
 * Called when a passage is marked read again. Trimming rather than deleting
 * matters: un-marking a whole book and then re-reading one chapter of it must
 * leave the rest of the book removed.
 */
export async function forgetRemovals(range: VerseRange): Promise<void> {
  const db = await progressDatabase();
  const existing = await db.getAllAsync<{ id: number; start_id: number; end_id: number }>(
    'select id, start_id, end_id from reading_removals where start_id <= ? and end_id >= ?',
    range.end,
    range.start,
  );

  for (const row of existing) {
    await db.runAsync('delete from reading_removals where id = ?', row.id);
    for (const piece of subtractRanges([{ start: row.start_id, end: row.end_id }], [range])) {
      await db.runAsync(
        'insert into reading_removals (start_id, end_id, removed_at) values (?, ?, ?)',
        piece.start,
        piece.end,
        new Date().toISOString(),
      );
    }
  }
}

/** Record removals arriving from another device. */
export async function mergeRemovals(incoming: readonly VerseRange[]): Promise<number> {
  if (incoming.length === 0) return 0;
  const db = await progressDatabase();
  const now = new Date().toISOString();
  const additions = subtractRanges(incoming as VerseRange[], await removedRanges());

  await db.withTransactionAsync(async () => {
    for (const addition of additions) {
      await db.runAsync(
        'insert into reading_removals (start_id, end_id, removed_at) values (?, ?, ?)',
        addition.start,
        addition.end,
        now,
      );
    }
  });
  return additions.length;
}

/**
 * Take a range back out of the log.
 *
 * Rows are rewritten rather than deleted, because a logged span may only
 * partly overlap what is being unmarked — reading Genesis 1-3 and then
 * unmarking Genesis 2 has to leave two rows behind, each keeping the date it
 * was originally read on.
 */
export async function markUnread(range: VerseRange): Promise<void> {
  const db = await progressDatabase();
  const existing = await loggedRanges();

  const survivors: LoggedRange[] = [];
  for (const logged of existing) {
    for (const piece of subtractRanges([logged], [range])) {
      survivors.push({ ...piece, readOn: logged.readOn });
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from reading_log');
    for (const survivor of survivors) {
      await db.runAsync(
        'insert into reading_log (start_id, end_id, read_on) values (?, ?, ?)',
        survivor.start,
        survivor.end,
        survivor.readOn,
      );
    }
    // Written down rather than left as an absence, or the next pull unions it
    // back in and the push that follows writes it out again.
    await db.runAsync(
      'insert into reading_removals (start_id, end_id, removed_at) values (?, ?, ?)',
      range.start,
      range.end,
      new Date().toISOString(),
    );
  });
}

/**
 * Fold someone else's copy of *your own* log into this device's.
 *
 * A union, not a replace. Reading is something you did, and two devices each
 * know part of the truth: a phone read on the train and a browser read at
 * home are both real, and neither should erase the other. Only the parts the
 * device does not already cover are inserted, so syncing twice adds nothing
 * the second time.
 *
 * The limitation is unmarking. If a chapter is unmarked here and the other
 * device still has it, the next merge brings it back — a union cannot tell
 * "never read" from "read, then taken back". Fixing that needs the log to
 * record removals rather than only additions, which is a different design.
 */
export async function mergeIn(incoming: readonly LoggedRange[]): Promise<number> {
  const db = await progressDatabase();
  // The arithmetic lives in `merge.ts`, where it is tested without a database.
  // The union first, then whatever has been taken back is held out of it —
  // otherwise a pull puts an un-marked passage straight back, and the push
  // that follows writes it to the server as though it had never been removed.
  const additions = withoutRemoved(
    additionsFrom(await loggedRanges(), incoming),
    await removedRanges(),
  );

  if (additions.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const addition of additions) {
        await db.runAsync(
          'insert into reading_log (start_id, end_id, read_on) values (?, ?, ?)',
          addition.start,
          addition.end,
          addition.readOn,
        );
      }
    });
  }
  return additions.length;
}

/**
 * Wipe the log and the bookmark. Exposed for a settings screen, for deleting
 * an account, and for tests.
 *
 * The bookmark goes too. It is a verse someone was reading, which is the same
 * kind of thing as the reading itself, and leaving it behind after "delete
 * everything" would be a small lie told by a feature whose whole value is
 * being believed.
 */
export async function forgetEverything(): Promise<void> {
  const db = await progressDatabase();
  await db.runAsync('delete from reading_log');
  await db.runAsync('delete from reading_removals');
  await db.runAsync('delete from bookmark');
}

/** Where reading stopped, if it ever started. */
export async function readBookmark(): Promise<VerseId | undefined> {
  const db = await progressDatabase();
  const row = await db.getFirstAsync<{ verse_id: number }>(
    'select verse_id from bookmark where id = 1',
  );
  return row?.verse_id;
}

/**
 * The bookmark and when it was last moved.
 *
 * The time matters only to the sync. A bookmark is a pointer rather than a
 * set, so two devices cannot be merged into a union the way their reading can;
 * the one that moved most recently is the one that is right.
 */
export async function readBookmarkMoved(): Promise<
  { verseId: VerseId; movedAt: string } | undefined
> {
  const db = await progressDatabase();
  const row = await db.getFirstAsync<{ verse_id: number; moved_at: string }>(
    'select verse_id, moved_at from bookmark where id = 1',
  );
  return row ? { verseId: row.verse_id, movedAt: row.moved_at } : undefined;
}

/**
 * Move the bookmark. Called after logging a range, with its last verse, and
 * as someone reads.
 *
 * `movedAt` is passed only when applying another device's bookmark, so that it
 * keeps the time it was made rather than claiming to have happened now — which
 * would make it beat anything this device does next.
 */
export async function moveBookmark(
  verseId: VerseId,
  movedAt = new Date().toISOString(),
): Promise<void> {
  const db = await progressDatabase();
  await db.runAsync(
    `insert into bookmark (id, verse_id, moved_at) values (1, ?, ?)
       on conflict (id) do update set verse_id = excluded.verse_id, moved_at = excluded.moved_at`,
    verseId,
    movedAt,
  );
}
