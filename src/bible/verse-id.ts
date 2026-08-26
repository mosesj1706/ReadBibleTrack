/**
 * Verse ids and range algebra.
 *
 * Every verse in the canon is one sortable integer:
 *
 *     book * 1_000_000  +  chapter * 1_000  +  verse
 *
 *     Genesis 1:1      ->  1_001_001
 *     John 3:16        -> 43_003_016
 *     Revelation 22:21 -> 66_022_021
 *
 * Two consequences the whole app leans on:
 *
 *  1. Reading progress is a set of [start, end] ranges, so "has this been
 *     read?" is an integer comparison and a circle's progress is one SQL
 *     aggregate rather than a row per verse.
 *
 *  2. The id says nothing about translation. Reading Genesis in Malayalam
 *     writes exactly the same rows as reading it in English, so a family can
 *     read in different languages and still share one progress bar.
 *
 * Nothing in this file needs versification data. Because no chapter has more
 * than 176 verses (Psalm 119), 999 is a safe open upper bound for a chapter,
 * which lets us build spans for books and chapters without knowing how many
 * verses they actually contain. Counting real verses does need that data and
 * lives in `versification.ts`.
 */

import { FIRST_BOOK, LAST_BOOK, getBook } from './canon.ts';

export const BOOK_FACTOR = 1_000_000;
export const CHAPTER_FACTOR = 1_000;

/** Highest verse number any chapter may hold. Psalm 119 has 176. */
export const MAX_VERSE = 999;
/** Highest chapter number any book may hold. Psalms has 150. */
export const MAX_CHAPTER = 999;

export type VerseId = number;

/** An inclusive span of verse ids. `start` is always <= `end`. */
export type VerseRange = { readonly start: VerseId; readonly end: VerseId };

export type VerseParts = {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
};

export function toVerseId(book: number, chapter: number, verse: number): VerseId {
  if (!Number.isInteger(book) || book < FIRST_BOOK || book > LAST_BOOK) {
    throw new RangeError(`book out of range: ${book}`);
  }
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > MAX_CHAPTER) {
    throw new RangeError(`chapter out of range: ${chapter}`);
  }
  if (!Number.isInteger(verse) || verse < 1 || verse > MAX_VERSE) {
    throw new RangeError(`verse out of range: ${verse}`);
  }
  return book * BOOK_FACTOR + chapter * CHAPTER_FACTOR + verse;
}

export function fromVerseId(id: VerseId): VerseParts {
  return {
    book: Math.floor(id / BOOK_FACTOR),
    chapter: Math.floor(id / CHAPTER_FACTOR) % CHAPTER_FACTOR,
    verse: id % CHAPTER_FACTOR,
  };
}

/** The full span of a chapter, without needing to know its verse count. */
export function chapterSpan(book: number, chapter: number): VerseRange {
  return {
    start: toVerseId(book, chapter, 1),
    end: toVerseId(book, chapter, MAX_VERSE),
  };
}

/** The full span of a book, first chapter to last. */
export function bookSpan(book: number): VerseRange {
  const meta = getBook(book);
  if (!meta) throw new RangeError(`no such book: ${book}`);
  return {
    start: toVerseId(book, 1, 1),
    end: toVerseId(book, meta.chapters, MAX_VERSE),
  };
}

/** The whole canon, Genesis 1:1 through the end of Revelation. */
export function canonSpan(): VerseRange {
  return { start: bookSpan(FIRST_BOOK).start, end: bookSpan(LAST_BOOK).end };
}

export function makeRange(start: VerseId, end: VerseId): VerseRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

export function rangeContains(range: VerseRange, id: VerseId): boolean {
  return id >= range.start && id <= range.end;
}

export function rangesOverlap(a: VerseRange, b: VerseRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** True when `a` and `b` touch or overlap, and so can be merged into one. */
function adjacentOrOverlapping(a: VerseRange, b: VerseRange): boolean {
  return b.start <= a.end + 1;
}

/**
 * Sort and merge a set of ranges into the smallest equivalent set.
 * This is what turns a pile of raw reading-log rows into "what has been read".
 */
export function normaliseRanges(ranges: readonly VerseRange[]): VerseRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges]
    .map((r) => makeRange(r.start, r.end))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: VerseRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (adjacentOrOverlapping(last, current)) {
      if (current.end > last.end) {
        merged[merged.length - 1] = { start: last.start, end: current.end };
      }
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/**
 * Everything in `target` that `covered` does not already include — in other
 * words, what is still left to read. Both inputs may be unsorted or overlapping.
 */
export function subtractRanges(
  target: readonly VerseRange[],
  covered: readonly VerseRange[],
): VerseRange[] {
  const cover = normaliseRanges(covered);
  const remaining: VerseRange[] = [];

  for (const range of normaliseRanges(target)) {
    let cursor = range.start;
    for (const block of cover) {
      if (block.end < cursor) continue;
      if (block.start > range.end) break;
      if (block.start > cursor) {
        remaining.push({ start: cursor, end: Math.min(block.start - 1, range.end) });
      }
      cursor = Math.max(cursor, block.end + 1);
      if (cursor > range.end) break;
    }
    if (cursor <= range.end) {
      remaining.push({ start: cursor, end: range.end });
    }
  }
  return remaining;
}

/** The overlap between two sets of ranges. */
export function intersectRanges(
  a: readonly VerseRange[],
  b: readonly VerseRange[],
): VerseRange[] {
  const left = normaliseRanges(a);
  const right = normaliseRanges(b);
  const out: VerseRange[] = [];

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (start <= end) out.push({ start, end });
    if (left[i].end < right[j].end) i++;
    else j++;
  }
  return out;
}

/** Split a range at book boundaries, so each piece belongs to one book. */
export function splitByBook(range: VerseRange): VerseRange[] {
  const first = fromVerseId(range.start).book;
  const last = fromVerseId(range.end).book;
  if (first === last) return [range];

  const parts: VerseRange[] = [];
  for (let book = first; book <= last; book++) {
    const span = bookSpan(book);
    const start = Math.max(range.start, span.start);
    const end = Math.min(range.end, span.end);
    if (start <= end) parts.push({ start, end });
  }
  return parts;
}
