/**
 * Highlights, favourites and notes, kept on the device.
 *
 * The tables mirror `marks` and `notes` in Postgres column for column, minus
 * `user_id` — locally there is only one reader. That is deliberate: when sync
 * lands it is a copy, not a translation.
 *
 * A mark is a colour, a star, or both, over a range. One row either way; two
 * tables would mean two rows describing the same verses.
 */

import { randomUUID } from 'expo-crypto';

import type { VerseRange } from '@/bible/verse-id.ts';
import { progressDatabase } from '@/progress/store';

export type MarkColour = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export const MARK_COLOURS: readonly MarkColour[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
];

export type Mark = VerseRange & {
  readonly id: string;
  readonly colour: MarkColour | undefined;
  readonly starred: boolean;
  /**
   * Whether the circle can see this. Off by default and never set by
   * accident: a margin is a private place until its owner decides otherwise.
   */
  readonly shared: boolean;
  readonly createdAt: string;
};

export type Note = VerseRange & {
  readonly id: string;
  readonly body: string;
  readonly shared: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

async function ensure() {
  const db = await progressDatabase();
  await db.execAsync(`
    create table if not exists marks (
      id text primary key,
      start_id integer not null,
      end_id integer not null,
      colour text,
      starred integer not null default 0,
      shared integer not null default 0,
      created_at text not null
    );
    create index if not exists marks_span on marks (start_id, end_id);

    create table if not exists notes (
      id text primary key,
      start_id integer not null,
      end_id integer not null,
      body text not null,
      shared integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists notes_span on notes (start_id, end_id);
  `);
  return db;
}

type MarkRow = {
  id: string;
  start_id: number;
  end_id: number;
  colour: string | null;
  starred: number;
  shared: number;
  created_at: string;
};

const toMark = (row: MarkRow): Mark => ({
  id: row.id,
  start: row.start_id,
  end: row.end_id,
  colour: (row.colour as MarkColour | null) ?? undefined,
  starred: row.starred === 1,
  shared: row.shared === 1,
  createdAt: row.created_at,
});

/** Every mark, newest first. */
export async function listMarks(): Promise<Mark[]> {
  const db = await ensure();
  const rows = await db.getAllAsync<MarkRow>(
    'select id, start_id, end_id, colour, starred, shared, created_at from marks order by created_at desc',
  );
  return rows.map(toMark);
}

/** The marks touching a range — what the reader needs to paint a chapter. */
export async function marksIn(range: VerseRange): Promise<Mark[]> {
  const db = await ensure();
  const rows = await db.getAllAsync<MarkRow>(
    `select id, start_id, end_id, colour, starred, shared, created_at from marks
       where start_id <= ? and end_id >= ? order by start_id`,
    range.end,
    range.start,
  );
  return rows.map(toMark);
}

/**
 * Set how a range is marked. Passing neither a colour nor a star clears it,
 * because a mark that does nothing should not exist — the same rule the
 * database enforces server-side.
 */
export async function setMark(
  range: VerseRange,
  next: { colour?: MarkColour | undefined; starred?: boolean },
): Promise<void> {
  const db = await ensure();
  const existing = await db.getFirstAsync<MarkRow>(
    'select id, start_id, end_id, colour, starred, shared, created_at from marks where start_id = ? and end_id = ?',
    range.start,
    range.end,
  );

  const colour = next.colour !== undefined ? next.colour : (existing?.colour as MarkColour | null) ?? undefined;
  const starred = next.starred !== undefined ? next.starred : existing?.starred === 1;

  if (!colour && !starred) {
    if (existing) await db.runAsync('delete from marks where id = ?', existing.id);
    return;
  }

  if (existing) {
    await db.runAsync(
      'update marks set colour = ?, starred = ? where id = ?',
      colour ?? null,
      starred ? 1 : 0,
      existing.id,
    );
    return;
  }

  await db.runAsync(
    'insert into marks (id, start_id, end_id, colour, starred, created_at) values (?, ?, ?, ?, ?, ?)',
    randomUUID(),
    range.start,
    range.end,
    colour ?? null,
    starred ? 1 : 0,
    new Date().toISOString(),
  );
}

/**
 * Show a mark to the circle, or take it back.
 *
 * Separate from `setMark` on purpose: colour and star are what a mark *is*,
 * sharing is who may see it, and conflating the two is how a highlight ends
 * up shared because someone changed its colour.
 */
export async function setMarkShared(id: string, shared: boolean): Promise<void> {
  const db = await ensure();
  await db.runAsync('update marks set shared = ? where id = ?', shared ? 1 : 0, id);
}

export async function setNoteShared(id: string, shared: boolean): Promise<void> {
  const db = await ensure();
  await db.runAsync('update notes set shared = ? where id = ?', shared ? 1 : 0, id);
}

/**
 * Fold your own marks from another device into this one.
 *
 * Identified by the range they cover, because a mark's id is local to the
 * device that made it — the server assigns its own — so there is nothing
 * stable to match on but the verses. A range this device already marks is
 * left exactly as it is: whatever colour it has here wins, rather than the
 * two devices taking turns to recolour each other.
 */
export async function mergeMarks(
  incoming: readonly { start: number; end: number; colour: string | null; starred: boolean; shared: boolean }[],
): Promise<number> {
  const db = await ensure();
  const mine = await listMarks();
  const known = new Set(mine.map((mark) => `${mark.start}-${mark.end}`));
  let added = 0;

  for (const mark of incoming) {
    if (known.has(`${mark.start}-${mark.end}`)) continue;
    if (!mark.colour && !mark.starred) continue;
    await db.runAsync(
      'insert into marks (id, start_id, end_id, colour, starred, shared, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      mark.start,
      mark.end,
      mark.colour,
      mark.starred ? 1 : 0,
      mark.shared ? 1 : 0,
      new Date().toISOString(),
    );
    known.add(`${mark.start}-${mark.end}`);
    added += 1;
  }
  return added;
}

export async function mergeNotes(
  incoming: readonly { start: number; end: number; body: string; shared: boolean }[],
): Promise<number> {
  const db = await ensure();
  const mine = await listNotes();
  const known = new Set(mine.map((note) => `${note.start}-${note.end}`));
  let added = 0;

  for (const note of incoming) {
    if (known.has(`${note.start}-${note.end}`)) continue;
    const now = new Date().toISOString();
    await db.runAsync(
      'insert into notes (id, start_id, end_id, body, shared, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      note.start,
      note.end,
      note.body,
      note.shared ? 1 : 0,
      now,
      now,
    );
    known.add(`${note.start}-${note.end}`);
    added += 1;
  }
  return added;
}

export async function removeMark(id: string): Promise<void> {
  const db = await ensure();
  await db.runAsync('delete from marks where id = ?', id);
}

type NoteRow = {
  id: string;
  start_id: number;
  end_id: number;
  body: string;
  shared: number;
  created_at: string;
  updated_at: string;
};

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  start: row.start_id,
  end: row.end_id,
  body: row.body,
  shared: row.shared === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Every note, most recently touched first. */
export async function listNotes(): Promise<Note[]> {
  const db = await ensure();
  const rows = await db.getAllAsync<NoteRow>(
    'select id, start_id, end_id, body, shared, created_at, updated_at from notes order by updated_at desc',
  );
  return rows.map(toNote);
}

export async function notesIn(range: VerseRange): Promise<Note[]> {
  const db = await ensure();
  const rows = await db.getAllAsync<NoteRow>(
    `select id, start_id, end_id, body, shared, created_at, updated_at from notes
       where start_id <= ? and end_id >= ? order by start_id`,
    range.end,
    range.start,
  );
  return rows.map(toNote);
}

/** Write or replace the note on a range. An empty body removes it. */
export async function saveNote(range: VerseRange, body: string): Promise<void> {
  const db = await ensure();
  const trimmed = body.trim();
  const existing = await db.getFirstAsync<{ id: string }>(
    'select id from notes where start_id = ? and end_id = ?',
    range.start,
    range.end,
  );

  if (!trimmed) {
    if (existing) await db.runAsync('delete from notes where id = ?', existing.id);
    return;
  }

  const now = new Date().toISOString();
  if (existing) {
    await db.runAsync(
      'update notes set body = ?, updated_at = ? where id = ?',
      trimmed,
      now,
      existing.id,
    );
    return;
  }

  await db.runAsync(
    'insert into notes (id, start_id, end_id, body, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    randomUUID(),
    range.start,
    range.end,
    trimmed,
    now,
    now,
  );
}

export async function removeNote(id: string): Promise<void> {
  const db = await ensure();
  await db.runAsync('delete from notes where id = ?', id);
}

/**
 * Wipe every mark and note on this device.
 *
 * For deleting an account. The push replaces this person's rows on the server
 * from whatever the device holds, so a device that still remembers after the
 * account is gone would put it all back the next time anyone signed in on it —
 * deletion undone by a sync, silently.
 */
export async function forgetMarks(): Promise<void> {
  const db = await ensure();
  await db.runAsync('delete from marks');
  await db.runAsync('delete from notes');
}
