/**
 * USFM parsing.
 *
 * USFM is the markup Bible translations are published in. This parser keeps
 * only the parts a reader and a verse id need: chapter and verse numbers, the
 * text itself, and enough paragraph shape to tell prose from poetry. Footnotes,
 * cross references, Strong's numbers, introductions and glossaries are dropped.
 *
 * It is deliberately not a general USFM implementation. It handles what the
 * translations we actually bundle contain, and `validateBook` fails loudly on
 * anything that does not line up with `canon.ts`.
 *
 * This module lives in `src/bible/` so `npm test` covers it. Nothing the app
 * renders imports it, so it never reaches the bundle — only the ingestion
 * script in `scripts/` uses it.
 */

import { getBook } from './canon.ts';
import { toVerseId, type VerseId } from './verse-id.ts';

/**
 * USFM book codes in canon order. The index into this list is the book number
 * every verse id is built from, so it must stay aligned with `BOOKS` in
 * `canon.ts` — renumbering either one invalidates stored progress.
 */
export const USFM_BOOK_CODES: readonly string[] = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT',
  'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

const BOOK_BY_CODE = new Map<string, number>(
  USFM_BOOK_CODES.map((code, index) => [code, index + 1]),
);

/** Book number for a USFM code, or `undefined` for front matter and glossaries. */
export function bookNumberFor(code: string): number | undefined {
  return BOOK_BY_CODE.get(code.trim().toUpperCase());
}

export type ParsedVerse = {
  readonly id: VerseId;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  /**
   * True when the translation numbers this verse but gives it no text — the
   * reason is in a footnote we drop. WEB does this for the verses the Textus
   * Receptus carries and the critical text does not (Acts 8:37, Romans 16:25),
   * which keeps its numbering aligned with the KJV tradition. The id stays
   * reserved either way, so a range still means the same thing everywhere.
   */
  readonly placeholder: boolean;
  /**
   * Slices of `text` the translation marks as spoken by Jesus (`\wj`) — what a
   * red-letter edition prints in red. Offsets are into `text`, so a reader can
   * slice it directly without parsing anything again.
   */
  readonly redLetter: readonly TextSpan[];
  /** Translator notes, each anchored to a character offset in `text`. */
  readonly notes: readonly VerseNote[];
  /** Paragraph marker in force: `p` for prose, `q1`/`q2` for poetry lines. */
  readonly style: string;
  /** True when the verse opens a paragraph rather than continuing one. */
  readonly startsParagraph: boolean;
};

export type ParsedBook = {
  readonly code: string;
  readonly book: number;
  /** The book name as the translation writes it, from `\h`. */
  readonly name: string;
  readonly verses: readonly ParsedVerse[];
  /**
   * Headings that stand before a verse rather than belonging to it: psalm
   * superscriptions, and the acrostic section titles inside Psalm 119. Keyed by
   * the id of the verse each one introduces, because Psalm 119 carries
   * twenty-two of them and a chapter key would keep only the last.
   */
  readonly titles: ReadonlyMap<VerseId, string>;
};

/**
 * Paragraph markers. The marker name is kept verbatim as the verse's `style`
 * so the reader can lay out poetry as poetry. `\b` is handled separately: it is
 * a blank line between stanzas, not a paragraph of its own.
 */
const PARAGRAPH = /^(p|m|mi|nb|pc|pr|cls|pi\d?|ph\d?|li\d?|lim\d?|q\d?|qc|qr|qm\d?)$/;

/**
 * Markers that introduce the verses after them rather than belonging to any one
 * verse: psalm superscriptions (`\d`), the acrostic letters inside Psalm 119
 * (`\qa`), and the section headings translations add as navigation aids
 * (`\s1`, `\ms1`). They are stored against the verse they stand before.
 */
const HEADING = /^(d|qa|s[1-4]?|ms[1-3]?)$/;

/**
 * Markers whose content is not scripture: file headers, book titles,
 * introductions, speaker labels, glossary keywords. Dropped whole.
 */
const NOT_SCRIPTURE =
  /^(ide|toc\d?|mt\d?|mte\d?|mr|sr|sp|r|d\d|is\d?|ip|ipi|im|iot|io\d?|imt\d?|ili\d?|ie|cl|cp|ca|k|rem|periph|usfm)$/;

/** A slice of a verse's text, as `[start, end)` character offsets. */
export type TextSpan = readonly [start: number, end: number];

/** A translator's note, and the point in the verse it hangs off. */
export type VerseNote = {
  /** Character offset into the verse's text. */
  readonly position: number;
  readonly text: string;
};

export type VerseContent = {
  readonly text: string;
  readonly redLetter: readonly TextSpan[];
  readonly notes: readonly VerseNote[];
};

/** Markup removal for a run of text with no structural markers left in it. */
function cleanSegment(segment: string): string {
  return segment
    .replace(/\\\+?w\s+([^\\|]*)(?:\|[^\\]*?)?\\\+?w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d*\*/g, '')
    .replace(/\\\+?[a-z]+\d*\s?/g, '')
    .replace(/\s+/g, ' ');
}

/** A footnote's body, without its caller or the reference it repeats back. */
function noteText(body: string): string {
  return cleanSegment(
    body.replace(/^\s*[+\-?]\s*/, '').replace(/\\fr\s+\S+\s*/g, ''),
  ).trim();
}

/** Trim the assembled text and pull the offsets along with it. */
function settle(assembled: string, spans: TextSpan[], notes: VerseNote[]): VerseContent {
  const shift = assembled.length - assembled.trimStart().length;
  const text = assembled.trim();

  const tidy: TextSpan[] = [];
  for (const [rawStart, rawEnd] of spans) {
    let start = Math.max(0, rawStart - shift);
    let end = Math.min(text.length, rawEnd - shift);
    // A span should cover the words, not the spaces around them.
    while (start < end && text[start] === ' ') start++;
    while (end > start && text[end - 1] === ' ') end--;
    if (start >= end) continue;

    const last = tidy.at(-1);
    if (last && start <= last[1]) tidy[tidy.length - 1] = [last[0], Math.max(last[1], end)];
    else tidy.push([start, end]);
  }

  return {
    text,
    redLetter: tidy,
    notes: notes.map((note) => ({
      position: Math.min(Math.max(0, note.position - shift), text.length),
      text: note.text,
    })),
  };
}

/**
 * Read everything a verse carries: its words, which of them the translation
 * marks as spoken by Jesus, and the notes that hang off them.
 *
 * This has to be one pass. `\wj` wraps text that still contains `\w` tags, so
 * the span "Jesus is speaking here" only lines up with the finished text once
 * the markup inside it has been removed — the offsets are computed as the
 * cleaned text is assembled, never against the raw source.
 *
 * Cross references (`\x`) are dropped: they are a navigation feature and need a
 * UI that does not exist yet. Strong's numbers are dropped too — 683,868 of
 * them would near enough double the size of a bundled translation.
 */
export function readVerseContent(raw: string): VerseContent {
  // A footnote or cross reference (consumed whole), or a red-letter boundary.
  const EVENT = /\\(f|x)\b([\s\S]*?)\\\1\*|\\wj(\*)?/g;

  let assembled = '';
  const spans: TextSpan[] = [];
  const notes: VerseNote[] = [];
  let spokenFrom: number | undefined;
  let cursor = 0;

  function append(segment: string): void {
    let cleaned = cleanSegment(segment);
    if (!cleaned) return;
    if (cleaned.startsWith(' ') && (assembled === '' || assembled.endsWith(' '))) {
      cleaned = cleaned.slice(1);
    }
    assembled += cleaned;
  }

  let match: RegExpExecArray | null;
  while ((match = EVENT.exec(raw)) !== null) {
    append(raw.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[1] === 'f') {
      const body = noteText(match[2]);
      if (body) notes.push({ position: assembled.trimEnd().length, text: body });
    } else if (match[1] === 'x') {
      // A cross reference. Dropped on purpose — see above.
    } else if (match[3]) {
      if (spokenFrom !== undefined) {
        spans.push([spokenFrom, assembled.length]);
        spokenFrom = undefined;
      }
    } else {
      spokenFrom = assembled.length;
    }
  }
  append(raw.slice(cursor));
  if (spokenFrom !== undefined) spans.push([spokenFrom, assembled.length]);

  return settle(assembled, spans, notes);
}

/** Just the words of a verse, with every marker stripped. */
export function stripInlineMarkup(text: string): string {
  return readVerseContent(text).text;
}

/** Peek at a file's `\id` without parsing it, to tell scripture from front matter. */
export function readBookCode(source: string): string | undefined {
  const match = /^\\id\s+(\S+)/m.exec(source);
  return match ? match[1].toUpperCase() : undefined;
}

const MARKER_LINE = /^\\(\+?[a-z]+\d*)\s?([\s\S]*)$/;

/**
 * Parse one USFM book file. Throws when the file is not a book of the canon —
 * callers should screen with `readBookCode` first.
 */
export function parseUsfm(source: string): ParsedBook {
  const code = readBookCode(source);
  const book = code ? bookNumberFor(code) : undefined;
  if (!code || book === undefined) {
    throw new Error(`not a book of the canon: \\id ${code ?? '(missing)'}`);
  }
  // Narrowing does not survive into `flush` below, so pin it once here.
  const bookNumber: number = book;

  const verses: ParsedVerse[] = [];
  const titles = new Map<VerseId, string>();

  let name = '';
  let chapter = 0;
  let style = 'p';
  let startsParagraph = true;

  // What the buffer is currently collecting. Unmarked lines continue it, so a
  // verse can run over several lines and a `\p` mid-verse just changes style.
  let mode: 'idle' | 'verse' | 'title' = 'idle';
  let buffer: string[] = [];
  let pending:
    | Omit<ParsedVerse, 'id' | 'text' | 'placeholder' | 'redLetter' | 'notes'>
    | undefined;
  // A heading is read before the verse it introduces exists, so it waits here.
  let pendingTitle = '';

  function flush(): void {
    const raw = buffer.join(' ');
    buffer = [];
    if (mode === 'verse' && pending) {
      const content = readVerseContent(raw);
      verses.push({
        ...pending,
        id: toVerseId(bookNumber, pending.chapter, pending.verse),
        text: content.text,
        // Raw content that strips to nothing was a footnote standing in for the
        // verse. Nothing at all is a broken source.
        placeholder: content.text === '' && raw.trim() !== '',
        redLetter: content.redLetter,
        notes: content.notes,
      });
    } else if (mode === 'title') {
      const text = stripInlineMarkup(raw);
      if (text) pendingTitle = text;
    }
    pending = undefined;
    mode = 'idle';
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const match = MARKER_LINE.exec(line);

    // No marker: a continuation of whatever is being collected.
    if (!match) {
      const text = line.trim();
      if (text && mode !== 'idle') buffer.push(text);
      continue;
    }

    const marker = match[1];
    const rest = match[2];

    if (marker === 'id') continue;

    if (marker === 'h') {
      flush();
      name = rest.trim();
      continue;
    }

    if (marker === 'c') {
      flush();
      chapter = Number.parseInt(rest.trim(), 10);
      style = 'p';
      startsParagraph = true;
      // A heading with no verse after it in its own chapter introduces nothing.
      pendingTitle = '';
      continue;
    }

    if (marker === 'v') {
      flush();
      const verse = /^\s*(\d+)\s*([\s\S]*)$/.exec(rest);
      if (!verse) continue;
      const number = Number.parseInt(verse[1], 10);
      if (pendingTitle) {
        titles.set(toVerseId(bookNumber, chapter, number), pendingTitle);
        pendingTitle = '';
      }
      pending = { chapter, verse: number, style, startsParagraph };
      startsParagraph = false;
      mode = 'verse';
      if (verse[2].trim()) buffer.push(verse[2]);
      continue;
    }

    // A heading before a verse: "A Psalm by David", "BETH" in Psalm 119, or a
    // section title. The last one wins when several stack up, which keeps the
    // more specific of a major section and its subsection.
    if (HEADING.test(marker)) {
      flush();
      mode = 'title';
      if (rest.trim()) buffer.push(rest);
      continue;
    }

    // A blank line between stanzas. It breaks the paragraph but is not one.
    if (marker === 'b') {
      startsParagraph = true;
      continue;
    }

    if (PARAGRAPH.test(marker)) {
      style = marker;
      startsParagraph = true;
      // "\p Peace be to you." — text on the marker line continues the verse.
      if (mode === 'verse' && rest.trim()) buffer.push(rest);
      continue;
    }

    if (NOT_SCRIPTURE.test(marker)) {
      flush();
      continue;
    }

    // An unrecognised marker is assumed to be character markup that wrapped
    // onto its own line, so it stays with the text and is stripped later.
    if (mode !== 'idle') buffer.push(line.trim());
  }

  flush();
  return {
    code,
    book: bookNumber,
    name: name || (getBook(bookNumber)?.name ?? ''),
    verses,
    titles,
  };
}

/**
 * A complaint about a parsed book.
 *
 * `error` means the file disagrees with `canon.ts` or with itself and must not
 * be shipped. `note` means the translation simply differs from the numbering
 * the canon reserves — worth printing, never worth stopping for.
 */
export type BookProblem = {
  readonly severity: 'error' | 'note';
  readonly message: string;
};

/**
 * Check a parsed book against `canon.ts` and against itself.
 *
 * Verse numbers are expected to run 1..n with no gaps. Where a translation
 * leaves a verse out, or numbers it without carrying any text, that is a note:
 * the verse id space still reserves the number, so reading ranges stay
 * comparable across translations.
 */
export function validateBook(parsed: ParsedBook): BookProblem[] {
  const meta = getBook(parsed.book);
  if (!meta) return [{ severity: 'error', message: `unknown book number ${parsed.book}` }];

  const problems: BookProblem[] = [];
  const error = (message: string) => problems.push({ severity: 'error', message });
  const note = (message: string) => problems.push({ severity: 'note', message });

  const byChapter = new Map<number, number[]>();
  for (const verse of parsed.verses) {
    const where = `${meta.name} ${verse.chapter}:${verse.verse}`;
    if (verse.placeholder) note(`${where} is numbered but carries no text here`);
    else if (!verse.text) error(`${where} is empty`);

    const list = byChapter.get(verse.chapter);
    if (list) list.push(verse.verse);
    else byChapter.set(verse.chapter, [verse.verse]);
  }

  if (byChapter.size !== meta.chapters) {
    error(`${meta.name}: canon.ts says ${meta.chapters} chapters, file has ${byChapter.size}`);
  }

  for (let chapter = 1; chapter <= meta.chapters; chapter++) {
    const numbers = byChapter.get(chapter);
    if (!numbers) {
      error(`${meta.name} ${chapter} is missing`);
      continue;
    }
    const seen = new Set<number>();
    for (const verse of numbers) {
      if (seen.has(verse)) error(`${meta.name} ${chapter}:${verse} appears twice`);
      seen.add(verse);
    }
    for (let verse = 1; verse <= Math.max(...numbers); verse++) {
      if (!seen.has(verse)) note(`${meta.name} ${chapter}:${verse} is absent from this translation`);
    }
  }
  return problems;
}

/** The highest verse number in each chapter, indexed from chapter 1. */
export function chapterVerseCounts(parsed: ParsedBook): number[] {
  const counts: number[] = [];
  for (const verse of parsed.verses) {
    const index = verse.chapter - 1;
    counts[index] = Math.max(counts[index] ?? 0, verse.verse);
  }
  for (let i = 0; i < counts.length; i++) counts[i] ??= 0;
  return counts;
}
