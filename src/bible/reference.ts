/**
 * Turning human references into verse ranges and back.
 *
 *   "John 3:16"        single verse
 *   "John 3:16-18"     verses within a chapter
 *   "John 3:16-4:2"    across a chapter boundary
 *   "John 3"           a whole chapter
 *   "John 3-5"         a run of chapters
 *   "Jude"             a whole book
 *
 * Parsing is forgiving about spacing, punctuation and abbreviations ("1cor.13",
 * "Phil 2", "psalm 23") because people type references from memory.
 */

import { getBook, findBook, type Book } from './canon.ts';
import {
  MAX_VERSE,
  type VerseRange,
  bookSpan,
  chapterSpan,
  fromVerseId,
  toVerseId,
} from './verse-id.ts';
import { lastVerse } from './versification.ts';

const REFERENCE = new RegExp(
  [
    '^\\s*',
    '(?<book>(?:[1-3]|i{1,3})?\\s*[a-z][a-z\\s.]*?)', // "1 Cor", "Song of Solomon"
    '(?:\\s*',
    '(?<c1>\\d{1,3})', // opening chapter
    '(?:\\s*[:.]\\s*(?<v1>\\d{1,3}))?', // opening verse
    '(?:\\s*[-–—]\\s*', // dash of any flavour
    '(?<c2>\\d{1,3})',
    '(?:\\s*[:.]\\s*(?<v2>\\d{1,3}))?',
    ')?',
    ')?\\s*$',
  ].join(''),
  'i',
);

/** Roman numeral prefixes, since "II Timothy" is a common way to write it. */
function expandRomanPrefix(book: string): string {
  return book.replace(/^\s*(i{1,3})\s+/i, (_, roman: string) => `${roman.length} `);
}

/**
 * Parse a reference into an inclusive verse range.
 * Returns `undefined` rather than throwing — callers are usually parsing input
 * a person is still typing.
 */
export function parseReference(input: string): VerseRange | undefined {
  const match = REFERENCE.exec(input);
  if (!match?.groups) return undefined;

  const book = findBook(expandRomanPrefix(match.groups.book));
  if (!book) return undefined;

  const { c1, v1, c2, v2 } = match.groups;

  // "Jude" — the whole book.
  if (!c1) return bookSpan(book.number);

  const startChapter = Number(c1);
  if (startChapter < 1 || startChapter > book.chapters) return undefined;

  // "John 3" or "John 3-5" — whole chapters.
  if (!v1) {
    const endChapter = c2 ? Number(c2) : startChapter;
    if (endChapter < startChapter || endChapter > book.chapters) return undefined;
    return {
      start: chapterSpan(book.number, startChapter).start,
      end: chapterSpan(book.number, endChapter).end,
    };
  }

  const start = toVerseId(book.number, startChapter, Number(v1));

  // "John 3:16"
  if (!c2) return { start, end: start };

  // "John 3:16-18" — the second number is a verse in the same chapter.
  // "John 3:16-4:2" — the second number is a chapter.
  const endChapter = v2 ? Number(c2) : startChapter;
  const endVerse = v2 ? Number(v2) : Number(c2);
  if (endChapter > book.chapters) return undefined;

  const end = toVerseId(book.number, endChapter, endVerse);
  return end >= start ? { start, end } : undefined;
}

const PSALMS = 19;

/**
 * Book name as it reads in this particular citation. Only Psalms varies:
 * one psalm is "Psalm 23", several are "Psalms 23-24".
 */
function bookLabel(book: Book, fromChapter: number, toChapter: number): string {
  if (book.number === PSALMS && fromChapter === toChapter) return 'Psalm';
  return book.name;
}

export type FormatOptions = {
  /** Use short book names: "1 Cor 13:4" rather than "1 Corinthians 13:4". */
  readonly abbreviate?: boolean;
};

/**
 * Render a range the way it would be written by hand, collapsing whatever the
 * range makes redundant.
 */
export function formatReference(range: VerseRange, options: FormatOptions = {}): string {
  const from = fromVerseId(range.start);
  const to = fromVerseId(range.end);

  const startBook = getBook(from.book);
  const endBook = getBook(to.book);
  if (!startBook || !endBook) return '';

  const name = options.abbreviate
    ? startBook.abbr
    : bookLabel(startBook, from.chapter, to.chapter);

  // Spans more than one book: "Genesis 1:1 - Exodus 2:3".
  if (from.book !== to.book) {
    const tail = options.abbreviate ? endBook.abbr : endBook.name;
    return `${name} ${from.chapter}:${from.verse} - ${tail} ${to.chapter}:${to.verse}`;
  }

  // A range ends a chapter either by running to the open upper bound that
  // `chapterSpan` builds, or by reaching the chapter's real last verse. Both
  // mean "all of it", and both should read as "John 3" rather than "John 3:1-36".
  const chapterEnd = lastVerse(to.book, to.chapter);
  const wholeStart = from.verse === 1;
  const wholeEnd = to.verse >= MAX_VERSE || (chapterEnd > 0 && to.verse >= chapterEnd);

  // Whole book: "Jude", "Genesis".
  if (wholeStart && wholeEnd && from.chapter === 1 && to.chapter === startBook.chapters) {
    return name;
  }

  // Whole chapters: "John 3", "John 3-5".
  if (wholeStart && wholeEnd) {
    return from.chapter === to.chapter
      ? `${name} ${from.chapter}`
      : `${name} ${from.chapter}-${to.chapter}`;
  }

  // Single verse: "John 3:16".
  if (range.start === range.end) return `${name} ${from.chapter}:${from.verse}`;

  // Within one chapter: "John 3:16-18".
  if (from.chapter === to.chapter) {
    return `${name} ${from.chapter}:${from.verse}-${to.verse}`;
  }

  // Across chapters: "John 3:16-4:2".
  return `${name} ${from.chapter}:${from.verse}-${to.chapter}:${to.verse}`;
}

/** Render a set of ranges as a single readable line. */
export function formatRanges(
  ranges: readonly VerseRange[],
  options: FormatOptions = {},
): string {
  return ranges.map((r) => formatReference(r, options)).join('; ');
}
