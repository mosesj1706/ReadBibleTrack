/**
 * The divisions people actually talk about: the Torah, the Gospels, the major
 * and minor prophets, and the rest.
 *
 * These are a reading aid, not a data structure anything is stored against.
 * Progress is verse ids and only verse ids; nothing here is ever written down,
 * so unlike `canon.ts` these boundaries could be argued with and rearranged
 * without stranding a single stored range.
 *
 * They are expressed as spans of book numbers because the canon is in its
 * traditional order and every one of these divisions is contiguous within it.
 * `sections.test.ts` holds that claim to account: every book from 1 to 66 must
 * land in exactly one span, and the named edges must be where they say.
 */

import { BOOKS } from './canon.ts';

export type BookSection =
  | 'law'
  | 'history'
  | 'wisdom'
  | 'majorProphets'
  | 'minorProphets'
  | 'gospels'
  | 'acts'
  | 'letters'
  | 'revelation';

export type SectionSpan = {
  readonly key: BookSection;
  /** What a reader would call it. */
  readonly name: string;
  readonly first: number;
  readonly last: number;
};

export const SECTIONS: readonly SectionSpan[] = [
  { key: 'law', name: 'The Torah', first: 1, last: 5 },
  { key: 'history', name: 'History', first: 6, last: 17 },
  { key: 'wisdom', name: 'Poetry and wisdom', first: 18, last: 22 },
  { key: 'majorProphets', name: 'Major prophets', first: 23, last: 27 },
  { key: 'minorProphets', name: 'Minor prophets', first: 28, last: 39 },
  { key: 'gospels', name: 'The Gospels', first: 40, last: 43 },
  // Acts stands on its own: it is the one narrative in the New Testament, and
  // filing it under either the Gospels or the letters misdescribes it.
  { key: 'acts', name: 'Acts', first: 44, last: 44 },
  { key: 'letters', name: 'The letters', first: 45, last: 65 },
  { key: 'revelation', name: 'Revelation', first: 66, last: 66 },
];

const BY_BOOK: readonly BookSection[] = (() => {
  const table: BookSection[] = [];
  for (const span of SECTIONS) {
    for (let book = span.first; book <= span.last; book++) table[book] = span.key;
  }
  return table;
})();

/** Which division a book belongs to. Falls back to history for an unknown. */
export function sectionOf(book: number): BookSection {
  return BY_BOOK[book] ?? 'history';
}

export function sectionSpan(key: BookSection): SectionSpan {
  const found = SECTIONS.find((span) => span.key === key);
  if (!found) throw new Error(`No such section: ${key}`);
  return found;
}

/** The books of one division, in canon order. */
export function booksInSection(key: BookSection) {
  const span = sectionSpan(key);
  return BOOKS.filter((book) => book.number >= span.first && book.number <= span.last);
}
