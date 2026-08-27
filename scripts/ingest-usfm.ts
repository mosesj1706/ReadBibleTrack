/**
 * Turn a USFM translation into the read-only SQLite file the app bundles.
 *
 *   npm run ingest                        the default translation (WEB)
 *   npm run ingest -- --translation web   pick one from TRANSLATIONS below
 *   npm run ingest -- --source ./some/dir use a local folder or zip instead
 *   npm run ingest -- --refresh           ignore the download cache
 *   npm run ingest -- --versification     rewrite the versification table
 *
 * The script writes three things:
 *
 *   assets/bibles/<id>.db            verses, psalm titles, translation metadata
 *   src/bible/versification-data.ts  verse counts per chapter (see below)
 *   LICENSES.md                      rebuilt from the metadata in every db
 *
 * Versification is deliberately awkward to overwrite. Verse counts are a
 * property of the canon as this app numbers it, not of any one translation, and
 * every stored reading range is measured against them. So the table is written
 * the first time and afterwards only compared: ingesting a second translation
 * reports where it disagrees rather than silently shifting everyone's progress.
 * Pass --versification to overwrite on purpose.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { BOOKS, getBook } from '../src/bible/canon.ts';
import {
  parseUsfm,
  readBookCode,
  bookNumberFor,
  validateBook,
  type ParsedBook,
} from '../src/bible/usfm.ts';

type Translation = {
  /** Short id, used for the database file name. */
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly licence: string;
  /** Where the USFM was downloaded from. */
  readonly sourceUrl: string;
  /** Where a reader can find out more about the translation. */
  readonly homepage: string;
};

/**
 * Only public domain or CC BY-SA translations may be bundled. Anything under a
 * restrictive licence (NIV, ESV) has to come from an API and cannot live here.
 */
const TRANSLATIONS: Record<string, Translation> = {
  web: {
    id: 'web',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'English',
    licence: 'Public Domain',
    sourceUrl: 'https://ebible.org/Scriptures/engwebp_usfm.zip',
    homepage: 'https://ebible.org/web/',
  },
  bsb: {
    id: 'bsb',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    language: 'English',
    licence: 'Public Domain',
    sourceUrl: 'https://ebible.org/Scriptures/engbsb_usfm.zip',
    homepage: 'https://berean.bible/',
  },
  kjv: {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'English',
    licence: 'Public Domain',
    sourceUrl: 'https://ebible.org/Scriptures/eng-kjv_usfm.zip',
    homepage: 'https://ebible.org/kjv/',
  },
};

const ROOT = path.resolve(import.meta.dirname, '..');
const DB_DIR = path.join(ROOT, 'assets', 'bibles');
const VERSIFICATION = path.join(ROOT, 'src', 'bible', 'versification-data.ts');
const LICENSES = path.join(ROOT, 'LICENSES.md');
const TRANSLATIONS_FILE = path.join(ROOT, 'src', 'bible', 'translations.ts');
const ASSETS_FILE = path.join(ROOT, 'src', 'scripture', 'assets.ts');
const SCHEMA_VERSION = 2;

type Options = {
  readonly translation: string;
  readonly source?: string;
  readonly refresh: boolean;
  readonly writeVersification: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  let translation = 'web';
  let source: string | undefined;
  let refresh = false;
  let writeVersification = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--translation' || arg === '-t') translation = argv[++i];
    else if (arg === '--source' || arg === '-s') source = argv[++i];
    else if (arg === '--refresh') refresh = true;
    else if (arg === '--versification') writeVersification = true;
    else die(`unknown argument: ${arg}`);
  }

  if (!TRANSLATIONS[translation]) {
    die(`unknown translation "${translation}". Known: ${Object.keys(TRANSLATIONS).join(', ')}`);
  }
  return { translation, source, refresh, writeVersification };
}

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function step(message: string): void {
  console.log(`  · ${message}`);
}

/** Download the USFM zip, reusing a cached copy unless --refresh was passed. */
async function fetchSource(translation: Translation, refresh: boolean): Promise<string> {
  const cache = path.join(os.tmpdir(), 'readbibletrack-usfm');
  fs.mkdirSync(cache, { recursive: true });
  const zip = path.join(cache, `${translation.id}.zip`);

  if (refresh || !fs.existsSync(zip)) {
    step(`downloading ${translation.sourceUrl}`);
    const response = await fetch(translation.sourceUrl);
    if (!response.ok) die(`download failed: ${response.status} ${response.statusText}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 100_000) die(`download looks truncated: ${body.length} bytes`);
    fs.writeFileSync(zip, body);
  } else {
    step(`using cached download (--refresh to re-fetch)`);
  }
  return zip;
}

/** Unpack a zip next to itself and return the directory holding the .usfm files. */
function extract(zip: string): string {
  const target = path.join(path.dirname(zip), path.basename(zip, '.zip'));
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  try {
    execFileSync('unzip', ['-qo', zip, '-d', target], { stdio: 'pipe' });
  } catch {
    // bsdtar reads zips too, and ships where unzip sometimes does not.
    try {
      execFileSync('tar', ['-xf', zip, '-C', target], { stdio: 'pipe' });
    } catch {
      die(`could not unpack ${zip} — neither unzip nor tar could read it`);
    }
  }
  return target;
}

/** Every .usfm file under a directory, one level deep is enough for ebible zips. */
function usfmFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...usfmFiles(full));
    else if (entry.name.toLowerCase().endsWith('.usfm')) found.push(full);
  }
  return found.sort();
}

/** Parse every book of the canon out of a directory of USFM files. */
function readBooks(dir: string): ParsedBook[] {
  const byNumber = new Map<number, ParsedBook>();
  let skipped = 0;

  for (const file of usfmFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    const code = readBookCode(source);
    if (!code || bookNumberFor(code) === undefined) {
      skipped++;
      continue;
    }
    const parsed = parseUsfm(source);
    if (byNumber.has(parsed.book)) {
      die(`two files claim to be ${getBook(parsed.book)?.name}: ${path.basename(file)}`);
    }
    byNumber.set(parsed.book, parsed);
  }

  step(`read ${byNumber.size} books, skipped ${skipped} non-scripture files`);

  const missing = BOOKS.filter((b) => !byNumber.has(b.number)).map((b) => b.name);
  if (missing.length > 0) die(`missing from the source: ${missing.join(', ')}`);

  return BOOKS.map((b) => byNumber.get(b.number)!);
}

/**
 * Report anything that does not line up with canon.ts. Structural problems stop
 * the run; a translation numbering verses differently is only worth a note.
 */
function check(books: readonly ParsedBook[]): void {
  const problems = books.flatMap((book) => validateBook(book));
  const notes = problems.filter((p) => p.severity === 'note');
  const errors = problems.filter((p) => p.severity === 'error');

  if (notes.length > 0) {
    step(`${notes.length} place${notes.length === 1 ? '' : 's'} where this translation differs from the canon numbering:`);
    for (const problem of notes) console.log(`      ${problem.message}`);
  }
  if (errors.length > 0) {
    console.error('\n  ✗ the source does not agree with canon.ts:\n');
    for (const problem of errors.slice(0, 40)) console.error(`      ${problem.message}`);
    if (errors.length > 40) console.error(`      ... and ${errors.length - 40} more`);
    process.exit(1);
  }
}

function writeDatabase(translation: Translation, books: readonly ParsedBook[]): string {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const file = path.join(DB_DIR, `${translation.id}.db`);
  fs.rmSync(file, { force: true });

  const db = new DatabaseSync(file);
  // A bundled database is read at runtime and never written, so no WAL sidecar.
  db.exec('pragma page_size = 4096');
  db.exec('pragma journal_mode = delete');
  db.exec(`pragma user_version = ${SCHEMA_VERSION}`);
  db.exec(`
    create table verses (
      id integer primary key,
      text text not null,
      style text not null,
      starts_para integer not null,
      -- Slices of the verse text spoken by Jesus, for a red-letter reading:
      -- comma separated start-end character offsets, empty for most verses.
      red_letter text not null
    );
    create table titles (
      verse_id integer primary key,
      text text not null
    );
    -- Translator notes, anchored to a character offset in the verse's text.
    -- The five verses this translation numbers but does not carry (Acts 8:37,
    -- Romans 16:25 and friends) have empty text and a note saying why.
    create table notes (
      verse_id integer not null,
      position integer not null,
      text text not null
    );
    create index notes_by_verse on notes (verse_id, position);

    create table meta (
      key text primary key,
      value text not null
    );
  `);

  const insertVerse = db.prepare(
    'insert into verses (id, text, style, starts_para, red_letter) values (?, ?, ?, ?, ?)',
  );
  const insertNote = db.prepare('insert into notes (verse_id, position, text) values (?, ?, ?)');
  const insertTitle = db.prepare('insert into titles (verse_id, text) values (?, ?)');
  const insertMeta = db.prepare('insert into meta (key, value) values (?, ?)');

  let verses = 0;
  let titles = 0;
  let notes = 0;
  let redLetter = 0;
  db.exec('begin');
  for (const book of books) {
    for (const verse of book.verses) {
      insertVerse.run(
        verse.id,
        verse.text,
        verse.style,
        verse.startsParagraph ? 1 : 0,
        verse.redLetter.map(([start, end]) => `${start}-${end}`).join(','),
      );
      verses++;
      if (verse.redLetter.length > 0) redLetter++;
      for (const note of verse.notes) {
        insertNote.run(verse.id, note.position, note.text);
        notes++;
      }
    }
    for (const [verseId, text] of book.titles) {
      insertTitle.run(verseId, text);
      titles++;
    }
  }
  for (const [key, value] of Object.entries({
    schema_version: String(SCHEMA_VERSION),
    translation_id: translation.id,
    name: translation.name,
    abbreviation: translation.abbreviation,
    language: translation.language,
    licence: translation.licence,
    source_url: translation.sourceUrl,
    homepage: translation.homepage,
    downloaded: new Date().toISOString().slice(0, 10),
    verse_count: String(verses),
    note_count: String(notes),
    red_letter_verses: String(redLetter),
  })) {
    insertMeta.run(key, value);
  }
  db.exec('commit');
  db.exec('vacuum');
  db.close();

  const size = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  step(
    `wrote ${path.relative(ROOT, file)} — ${verses} verses, ${titles} titles, ` +
      `${notes} notes, ${redLetter} red-letter verses, ${size} MB`,
  );
  return file;
}

/**
 * The highest verse number per chapter, read back out of a bundled database.
 * Indexed by book number, so index 0 is unused.
 */
function countsFromDatabase(file: string): number[][] {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db
    .prepare(
      `select id / 1000000 as book, (id / 1000) % 1000 as chapter, max(id % 1000) as last
         from verses group by book, chapter`,
    )
    .all() as { book: number; chapter: number; last: number }[];
  db.close();

  const counts: number[][] = [];
  for (const row of rows) {
    (counts[row.book] ??= [])[row.chapter - 1] = row.last;
  }
  return counts;
}

/** Widen `into` so it holds the highest verse number either table knows about. */
function widen(into: number[][], from: readonly (readonly number[])[]): string[] {
  const grew: string[] = [];
  from.forEach((chapters, book) => {
    if (!chapters) return;
    chapters.forEach((last, index) => {
      const known = (into[book] ??= [])[index] ?? 0;
      if (last > known) {
        into[book][index] = last;
        const name = getBook(book)?.name ?? `book ${book}`;
        grew.push(`${name} ${index + 1}: ${known || '—'} -> ${last}`);
      }
    });
  });
  return grew;
}

/** Wrap a row of numbers so the generated file stays readable in a diff. */
function wrapNumbers(numbers: readonly number[], indent: string, width = 92): string {
  const lines: string[] = [];
  let line = indent;
  for (let i = 0; i < numbers.length; i++) {
    const piece = `${numbers[i]}${i === numbers.length - 1 ? '' : ','}`;
    if (line.length + piece.length + 1 > width && line !== indent) {
      lines.push(line);
      line = indent;
    }
    line += line === indent ? piece : ` ${piece}`;
  }
  lines.push(line);
  return lines.join('\n');
}

function renderVersification(
  sources: readonly string[],
  counts: readonly (readonly number[])[],
): string {
  const total = counts.flat().reduce((sum, n) => sum + n, 0);
  const rows = BOOKS.map((book) => {
    const chapters = counts[book.number] ?? [];
    return [
      `  // ${book.number} ${book.name} — ${book.chapters} chapters`,
      '  [',
      wrapNumbers(chapters, '    '),
      '  ],',
    ].join('\n');
  }).join('\n');

  return `/**
 * Verse counts per chapter — GENERATED by \`npm run ingest\`, do not edit.
 *
 * The union of every bundled translation (${sources.join(', ')}), rebuilt on
 * ${new Date().toISOString().slice(0, 10)}.
 *
 * Each entry is the *highest verse number* in a chapter, not the number of
 * verses present. Translations disagree about numbering, so this is the highest
 * any of them carries — that way every translation's verses can be measured,
 * and the table only ever grows. Where one leaves a verse out, the id space
 * still reserves it, so a range means the same thing in all of them.
 */

export const VERSIFICATION_SOURCE = '${sources.join(' + ')}';

/** Total verses in the canon under this versification. */
export const VERSIFICATION_TOTAL = ${total};

/**
 * Highest verse number per chapter, indexed by book number. Index 0 is empty so
 * books stay 1-based, exactly as they are inside a verse id.
 */
export const LAST_VERSE: readonly (readonly number[])[] = [
  [],
${rows}
];
`;
}

/**
 * Rebuild the versification table as the union of every bundled translation.
 *
 * Translations disagree: the WEB puts the Romans doxology at the end of chapter
 * 14, the Textus Receptus tradition (KJV, BSB) puts it at the end of 16. If the
 * table followed only one of them, the others would have verses that no range
 * could measure, because ordinals stop at the last verse the table knows about.
 *
 * Taking the highest verse number any bundled translation carries fixes that,
 * and is safe in a way that picking one translation is not: the table can only
 * ever grow. Growing reserves more ids; it never moves or invalidates a range
 * that has already been stored. Shrinking would, which is why nothing here ever
 * lowers a count.
 */
async function reconcileVersification(force: boolean): Promise<void> {
  const files = fs.existsSync(DB_DIR)
    ? fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.db')).sort()
    : [];

  const union: number[][] = [];
  const sources: string[] = [];
  for (const file of files) {
    widen(union, countsFromDatabase(path.join(DB_DIR, file)));
    sources.push(path.basename(file, '.db'));
  }

  const exists = fs.existsSync(VERSIFICATION);
  let grew: string[] = [];
  if (exists && !force) {
    const existing = (await import(pathToFileURL(VERSIFICATION).href)) as {
      LAST_VERSE: readonly (readonly number[])[];
    };
    // Keep anything the table already reserves, then report what this run adds
    // on top of it. `widen` returns exactly the entries it raised.
    const previous = existing.LAST_VERSE.map((chapters) => [...(chapters ?? [])]);
    widen(union, previous);
    grew = widen(previous, union);
  }

  const total = union.flat().reduce((sum, n) => sum + n, 0);
  fs.writeFileSync(VERSIFICATION, renderVersification(sources, union));

  if (grew.length > 0) {
    step(`versification widened in ${grew.length} place(s):`);
    for (const line of grew.slice(0, 20)) console.log(`      ${line}`);
    if (grew.length > 20) console.log(`      ... and ${grew.length - 20} more`);
  }
  step(
    `versification: ${total} verses across ${union.flat().length} chapters, ` +
      `union of ${sources.join(', ')}`,
  );
}

type BundledMeta = Record<string, string>;

/** The metadata of every bundled translation, read back out of the databases. */
function readBundledMeta(): BundledMeta[] {
  const files = fs.existsSync(DB_DIR)
    ? fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.db')).sort()
    : [];

  return files
    .map((file) => {
      const full = path.join(DB_DIR, file);
      const db = new DatabaseSync(full, { readOnly: true });
      const rows = db.prepare('select key, value from meta').all() as {
        key: string;
        value: string;
      }[];
      db.close();

      // A short content hash. The app compares it against the copy it already
      // extracted, so a re-ingested translation actually reaches a device that
      // has an older one cached.
      const stamp = crypto
        .createHash('sha256')
        .update(fs.readFileSync(full))
        .digest('hex')
        .slice(0, 12);
      return { ...Object.fromEntries(rows.map((r) => [r.key, r.value])), stamp } as BundledMeta;
    })
    .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
}

/** Rebuild LICENSES.md from the metadata inside every bundled database. */
function writeLicenses(entries: readonly BundledMeta[]): void {
  const body = entries
    .map((meta) =>
      [
        `## ${meta.name} (${meta.abbreviation})`,
        '',
        `- **Licence:** ${meta.licence}`,
        `- **Language:** ${meta.language}`,
        `- **Source:** ${meta.source_url}`,
        `- **About:** ${meta.homepage}`,
        `- **Downloaded:** ${meta.downloaded}`,
        `- **Bundled as:** \`assets/bibles/${meta.translation_id}.db\` (${meta.verse_count} verses)`,
      ].join('\n'),
    )
    .join('\n\n');

  fs.writeFileSync(
    LICENSES,
    `# Bundled scripture texts

Every translation shipped inside the app is listed here with its source, licence
and the date it was downloaded, as required by the licences and by our own rule
that only public domain or CC BY-SA texts may be bundled.

This file is generated by \`npm run ingest\` from the metadata stored in each
database. Edit the translation entry in \`scripts/ingest-usfm.ts\` instead.

${body}
`,
  );
  step(`wrote ${path.relative(ROOT, LICENSES)} — ${entries.length} translation(s)`);
}

/**
 * Write the registry the app picks translations from, and the asset map that
 * hands each one to Metro.
 *
 * They are two files because they answer to different rules. The registry is
 * plain data and lives in `src/bible/`, so it still runs under `node --test`.
 * The asset map calls `require()` on a `.db`, which only a bundler understands,
 * so it lives outside and is never imported by a test.
 */
function writeTranslationRegistry(entries: readonly BundledMeta[]): void {
  const rows = entries
    .map((meta) =>
      [
        '  {',
        `    id: '${meta.translation_id}',`,
        `    name: '${meta.name.replace(/'/g, "\\'")}',`,
        `    abbreviation: '${meta.abbreviation}',`,
        `    language: '${meta.language}',`,
        `    licence: '${meta.licence}',`,
        `    verseCount: ${meta.verse_count},`,
        `    noteCount: ${meta.note_count ?? 0},`,
        `    redLetter: ${Number(meta.red_letter_verses ?? 0) > 0},`,
        `    stamp: '${meta.stamp}',`,
        '  },',
      ].join('\n'),
    )
    .join('\n');

  fs.writeFileSync(
    TRANSLATIONS_FILE,
    `/**
 * The translations bundled in the app — GENERATED by \`npm run ingest\`.
 *
 * Read back out of the databases themselves, so this cannot drift from what is
 * actually shipped. Each translation is its own file in \`assets/bibles/\`; they
 * are never merged. Progress is stored as verse ids, so which one a person
 * reads is a display preference and nothing more — a circle reading three
 * different translations still shares one progress bar.
 */

export type BundledTranslation = {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly licence: string;
  readonly verseCount: number;
  readonly noteCount: number;
  /** True when this translation marks the words of Jesus for red-letter reading. */
  readonly redLetter: boolean;
  /**
   * Short content hash of the bundled file. expo-sqlite copies an asset into
   * local storage once and reuses that copy forever, so a device holding an
   * older ingest would never see a correction. The app compares this against
   * what it last extracted and forces an overwrite when they differ.
   */
  readonly stamp: string;
};

export const TRANSLATIONS: readonly BundledTranslation[] = [
${rows}
];

/** What a reader gets before they have chosen anything. */
export const DEFAULT_TRANSLATION_ID = 'web';

export function getTranslation(id: string): BundledTranslation | undefined {
  return TRANSLATIONS.find((t) => t.id === id);
}

/** The chosen translation, falling back when a stored id is no longer bundled. */
export function translationOrDefault(id: string | null | undefined): BundledTranslation {
  return (
    (id ? getTranslation(id) : undefined) ??
    getTranslation(DEFAULT_TRANSLATION_ID) ??
    TRANSLATIONS[0]
  );
}
`,
  );

  fs.mkdirSync(path.dirname(ASSETS_FILE), { recursive: true });
  fs.writeFileSync(
    ASSETS_FILE,
    `/**
 * Bundled database assets — GENERATED by \`npm run ingest\`.
 *
 * Metro resolves \`require()\` at build time, so these paths have to be literals;
 * they cannot be built from an id at runtime. That is the only reason this is
 * separate from the registry in \`@/bible/translations.ts\`.
 */

export const TRANSLATION_ASSETS: Readonly<Record<string, number>> = {
${entries.map((m) => `  ${m.translation_id}: require('@/assets/bibles/${m.translation_id}.db'),`).join('\n')}
};
`,
  );

  step(
    `wrote ${path.relative(ROOT, TRANSLATIONS_FILE)} and ${path.relative(ROOT, ASSETS_FILE)} — ` +
      entries.map((m) => m.abbreviation).join(', '),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const translation = TRANSLATIONS[options.translation];
  console.log(`\n  ${translation.name} (${translation.abbreviation})\n`);

  let dir: string;
  if (options.source) {
    const source = path.resolve(options.source);
    if (!fs.existsSync(source)) die(`no such source: ${source}`);
    dir = source.toLowerCase().endsWith('.zip') ? extract(source) : source;
    step(`reading ${path.relative(ROOT, dir) || dir}`);
  } else {
    dir = extract(await fetchSource(translation, options.refresh));
  }

  const books = readBooks(dir);
  check(books);

  writeDatabase(translation, books);
  await reconcileVersification(options.writeVersification);
  const bundled = readBundledMeta();
  writeLicenses(bundled);
  writeTranslationRegistry(bundled);
  console.log('\n  ✓ done\n');
}

await main();
