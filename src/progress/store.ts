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
  await db.runAsync(
    'insert into reading_log (start_id, end_id, read_on) values (?, ?, ?)',
    range.start,
    range.end,
    readOn,
  );
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
  });
}

/** Wipe the log. Exposed for a settings screen and for tests. */
export async function forgetEverything(): Promise<void> {
  const db = await progressDatabase();
  await db.runAsync('delete from reading_log');
}

/** Where reading stopped, if it ever started. */
export async function readBookmark(): Promise<VerseId | undefined> {
  const db = await progressDatabase();
  const row = await db.getFirstAsync<{ verse_id: number }>(
    'select verse_id from bookmark where id = 1',
  );
  return row?.verse_id;
}

/** Move the bookmark. Called after logging a range, with its last verse. */
export async function moveBookmark(verseId: VerseId): Promise<void> {
  const db = await progressDatabase();
  await db.runAsync(
    `insert into bookmark (id, verse_id, moved_at) values (1, ?, ?)
       on conflict (id) do update set verse_id = excluded.verse_id, moved_at = excluded.moved_at`,
    verseId,
    new Date().toISOString(),
  );
}
