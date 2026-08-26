/**
 * The 66-book Protestant canon.
 *
 * Book numbers are 1-based and follow the traditional ordering, because that
 * ordering is baked into every verse id (see `verse-id.ts`). Never renumber
 * these — a stored reading log is only meaningful against this table.
 */

export type Testament = 'old' | 'new';

export type Book = {
  /** 1..66, and the first component of every verse id. */
  readonly number: number;
  readonly name: string;
  /** Short form used in compact references, e.g. "1 Cor". */
  readonly abbr: string;
  readonly testament: Testament;
  readonly chapters: number;
};

export const BOOKS: readonly Book[] = [
  { number: 1, name: 'Genesis', abbr: 'Gen', testament: 'old', chapters: 50 },
  { number: 2, name: 'Exodus', abbr: 'Exod', testament: 'old', chapters: 40 },
  { number: 3, name: 'Leviticus', abbr: 'Lev', testament: 'old', chapters: 27 },
  { number: 4, name: 'Numbers', abbr: 'Num', testament: 'old', chapters: 36 },
  { number: 5, name: 'Deuteronomy', abbr: 'Deut', testament: 'old', chapters: 34 },
  { number: 6, name: 'Joshua', abbr: 'Josh', testament: 'old', chapters: 24 },
  { number: 7, name: 'Judges', abbr: 'Judg', testament: 'old', chapters: 21 },
  { number: 8, name: 'Ruth', abbr: 'Ruth', testament: 'old', chapters: 4 },
  { number: 9, name: '1 Samuel', abbr: '1 Sam', testament: 'old', chapters: 31 },
  { number: 10, name: '2 Samuel', abbr: '2 Sam', testament: 'old', chapters: 24 },
  { number: 11, name: '1 Kings', abbr: '1 Kgs', testament: 'old', chapters: 22 },
  { number: 12, name: '2 Kings', abbr: '2 Kgs', testament: 'old', chapters: 25 },
  { number: 13, name: '1 Chronicles', abbr: '1 Chr', testament: 'old', chapters: 29 },
  { number: 14, name: '2 Chronicles', abbr: '2 Chr', testament: 'old', chapters: 36 },
  { number: 15, name: 'Ezra', abbr: 'Ezra', testament: 'old', chapters: 10 },
  { number: 16, name: 'Nehemiah', abbr: 'Neh', testament: 'old', chapters: 13 },
  { number: 17, name: 'Esther', abbr: 'Esth', testament: 'old', chapters: 10 },
  { number: 18, name: 'Job', abbr: 'Job', testament: 'old', chapters: 42 },
  { number: 19, name: 'Psalms', abbr: 'Ps', testament: 'old', chapters: 150 },
  { number: 20, name: 'Proverbs', abbr: 'Prov', testament: 'old', chapters: 31 },
  { number: 21, name: 'Ecclesiastes', abbr: 'Eccl', testament: 'old', chapters: 12 },
  { number: 22, name: 'Song of Solomon', abbr: 'Song', testament: 'old', chapters: 8 },
  { number: 23, name: 'Isaiah', abbr: 'Isa', testament: 'old', chapters: 66 },
  { number: 24, name: 'Jeremiah', abbr: 'Jer', testament: 'old', chapters: 52 },
  { number: 25, name: 'Lamentations', abbr: 'Lam', testament: 'old', chapters: 5 },
  { number: 26, name: 'Ezekiel', abbr: 'Ezek', testament: 'old', chapters: 48 },
  { number: 27, name: 'Daniel', abbr: 'Dan', testament: 'old', chapters: 12 },
  { number: 28, name: 'Hosea', abbr: 'Hos', testament: 'old', chapters: 14 },
  { number: 29, name: 'Joel', abbr: 'Joel', testament: 'old', chapters: 3 },
  { number: 30, name: 'Amos', abbr: 'Amos', testament: 'old', chapters: 9 },
  { number: 31, name: 'Obadiah', abbr: 'Obad', testament: 'old', chapters: 1 },
  { number: 32, name: 'Jonah', abbr: 'Jonah', testament: 'old', chapters: 4 },
  { number: 33, name: 'Micah', abbr: 'Mic', testament: 'old', chapters: 7 },
  { number: 34, name: 'Nahum', abbr: 'Nah', testament: 'old', chapters: 3 },
  { number: 35, name: 'Habakkuk', abbr: 'Hab', testament: 'old', chapters: 3 },
  { number: 36, name: 'Zephaniah', abbr: 'Zeph', testament: 'old', chapters: 3 },
  { number: 37, name: 'Haggai', abbr: 'Hag', testament: 'old', chapters: 2 },
  { number: 38, name: 'Zechariah', abbr: 'Zech', testament: 'old', chapters: 14 },
  { number: 39, name: 'Malachi', abbr: 'Mal', testament: 'old', chapters: 4 },
  { number: 40, name: 'Matthew', abbr: 'Matt', testament: 'new', chapters: 28 },
  { number: 41, name: 'Mark', abbr: 'Mark', testament: 'new', chapters: 16 },
  { number: 42, name: 'Luke', abbr: 'Luke', testament: 'new', chapters: 24 },
  { number: 43, name: 'John', abbr: 'John', testament: 'new', chapters: 21 },
  { number: 44, name: 'Acts', abbr: 'Acts', testament: 'new', chapters: 28 },
  { number: 45, name: 'Romans', abbr: 'Rom', testament: 'new', chapters: 16 },
  { number: 46, name: '1 Corinthians', abbr: '1 Cor', testament: 'new', chapters: 16 },
  { number: 47, name: '2 Corinthians', abbr: '2 Cor', testament: 'new', chapters: 13 },
  { number: 48, name: 'Galatians', abbr: 'Gal', testament: 'new', chapters: 6 },
  { number: 49, name: 'Ephesians', abbr: 'Eph', testament: 'new', chapters: 6 },
  { number: 50, name: 'Philippians', abbr: 'Phil', testament: 'new', chapters: 4 },
  { number: 51, name: 'Colossians', abbr: 'Col', testament: 'new', chapters: 4 },
  { number: 52, name: '1 Thessalonians', abbr: '1 Thess', testament: 'new', chapters: 5 },
  { number: 53, name: '2 Thessalonians', abbr: '2 Thess', testament: 'new', chapters: 3 },
  { number: 54, name: '1 Timothy', abbr: '1 Tim', testament: 'new', chapters: 6 },
  { number: 55, name: '2 Timothy', abbr: '2 Tim', testament: 'new', chapters: 4 },
  { number: 56, name: 'Titus', abbr: 'Titus', testament: 'new', chapters: 3 },
  { number: 57, name: 'Philemon', abbr: 'Phlm', testament: 'new', chapters: 1 },
  { number: 58, name: 'Hebrews', abbr: 'Heb', testament: 'new', chapters: 13 },
  { number: 59, name: 'James', abbr: 'Jas', testament: 'new', chapters: 5 },
  { number: 60, name: '1 Peter', abbr: '1 Pet', testament: 'new', chapters: 5 },
  { number: 61, name: '2 Peter', abbr: '2 Pet', testament: 'new', chapters: 3 },
  { number: 62, name: '1 John', abbr: '1 John', testament: 'new', chapters: 5 },
  { number: 63, name: '2 John', abbr: '2 John', testament: 'new', chapters: 1 },
  { number: 64, name: '3 John', abbr: '3 John', testament: 'new', chapters: 1 },
  { number: 65, name: 'Jude', abbr: 'Jude', testament: 'new', chapters: 1 },
  { number: 66, name: 'Revelation', abbr: 'Rev', testament: 'new', chapters: 22 },
];

export const FIRST_BOOK = 1;
export const LAST_BOOK = 66;

const BY_NUMBER = new Map(BOOKS.map((b) => [b.number, b]));

export function getBook(number: number): Book | undefined {
  return BY_NUMBER.get(number);
}

/**
 * Alternate spellings people actually type. Keys are normalised by `normalise`.
 * Extend freely — this list exists to be forgiving, not exhaustive.
 */
const ALIASES: Record<string, number> = {
  psalm: 19,
  pss: 19,
  songofsongs: 22,
  canticles: 22,
  cantico: 22,
  ecclesiast: 21,
  revelations: 66,
  apocalypse: 66,
  phlmn: 57,
  philem: 57,
  jn: 43,
  '1jn': 62,
  '2jn': 63,
  '3jn': 64,
  mt: 40,
  mk: 41,
  lk: 42,
  gn: 1,
  ex: 2,
  lv: 3,
  nm: 4,
  dt: 5,
};

/** Lowercase, strip spaces, periods and other punctuation. "1 Cor." -> "1cor" */
export function normalise(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const BY_NAME = new Map<string, number>();
for (const book of BOOKS) {
  BY_NAME.set(normalise(book.name), book.number);
  BY_NAME.set(normalise(book.abbr), book.number);
}
for (const [alias, number] of Object.entries(ALIASES)) {
  BY_NAME.set(alias, number);
}

/**
 * Resolve a book name, abbreviation or alias to its book number.
 * Falls back to a unique prefix match, so "Philipp" resolves but "Ph" does not.
 */
export function findBook(input: string): Book | undefined {
  const key = normalise(input);
  if (!key) return undefined;

  const exact = BY_NAME.get(key);
  if (exact !== undefined) return BY_NUMBER.get(exact);

  const prefixed = BOOKS.filter(
    (b) => normalise(b.name).startsWith(key) || normalise(b.abbr).startsWith(key),
  );
  return prefixed.length === 1 ? prefixed[0] : undefined;
}
