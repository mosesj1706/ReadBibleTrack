/**
 * Reading scripture out of a bundled translation.
 *
 * Every query is a range scan over the primary key, because verse ids sort in
 * reading order — "give me John 3" is `where id between ? and ?` and nothing
 * more. The database is opened read-only and never written to.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { VerseId, VerseRange } from '@/bible/verse-id.ts';

/**
 * A slice of a verse's text, as `[start, end)` character offsets.
 *
 * Declared here rather than imported from the USFM parser: that module belongs
 * to ingestion and should never be reachable from anything the app renders.
 */
export type TextSpan = readonly [start: number, end: number];

export type ScriptureVerse = {
  readonly id: VerseId;
  readonly text: string;
  /** `p` for prose, `q1`/`q2` for lines of poetry. */
  readonly style: string;
  readonly startsParagraph: boolean;
  /** Slices of `text` spoken by Jesus. Empty unless the translation marks them. */
  readonly redLetter: readonly TextSpan[];
};

export type ScriptureNote = {
  readonly verseId: VerseId;
  /** Character offset into the verse's text that the note hangs off. */
  readonly position: number;
  readonly text: string;
};

type VerseRow = {
  id: number;
  text: string;
  style: string;
  starts_para: number;
  red_letter: string;
};

/** Offsets are stored as "12-45,60-90" — compact, and cheap to read back. */
function parseSpans(encoded: string): TextSpan[] {
  if (!encoded) return [];
  const spans: TextSpan[] = [];
  for (const pair of encoded.split(',')) {
    const dash = pair.indexOf('-');
    if (dash < 1) continue;
    const start = Number(pair.slice(0, dash));
    const end = Number(pair.slice(dash + 1));
    if (Number.isInteger(start) && Number.isInteger(end) && start < end) {
      spans.push([start, end]);
    }
  }
  return spans;
}

export async function readRange(
  db: SQLiteDatabase,
  range: VerseRange,
): Promise<ScriptureVerse[]> {
  const rows = await db.getAllAsync<VerseRow>(
    'select id, text, style, starts_para, red_letter from verses where id between ? and ? order by id',
    range.start,
    range.end,
  );
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    style: row.style,
    startsParagraph: row.starts_para === 1,
    redLetter: parseSpans(row.red_letter),
  }));
}

/** Headings that stand before a verse: psalm titles, Psalm 119's acrostics. */
export async function readHeadings(
  db: SQLiteDatabase,
  range: VerseRange,
): Promise<Map<VerseId, string>> {
  const rows = await db.getAllAsync<{ verse_id: number; text: string }>(
    'select verse_id, text from titles where verse_id between ? and ? order by verse_id',
    range.start,
    range.end,
  );
  return new Map(rows.map((row) => [row.verse_id, row.text]));
}

/**
 * Translator notes over a range. The handful of verses a translation numbers
 * but does not carry have empty text and a note saying why, so a reader can
 * explain the gap instead of showing a blank line.
 */
export async function readNotes(
  db: SQLiteDatabase,
  range: VerseRange,
): Promise<ScriptureNote[]> {
  const rows = await db.getAllAsync<{ verse_id: number; position: number; text: string }>(
    'select verse_id, position, text from notes where verse_id between ? and ? order by verse_id, position',
    range.start,
    range.end,
  );
  return rows.map((row) => ({ verseId: row.verse_id, position: row.position, text: row.text }));
}
