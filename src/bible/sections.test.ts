import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOOKS, getBook } from './canon.ts';
import { SECTIONS, booksInSection, sectionOf, sectionSpan } from './sections.ts';

test('every book in the canon lands in exactly one section', () => {
  const seen = new Map<number, string[]>();
  for (const span of SECTIONS) {
    for (let book = span.first; book <= span.last; book++) {
      seen.set(book, [...(seen.get(book) ?? []), span.key]);
    }
  }

  for (const book of BOOKS) {
    const sections = seen.get(book.number) ?? [];
    assert.equal(
      sections.length,
      1,
      `${book.name} (${book.number}) is in ${sections.length} sections: ${sections.join(', ')}`,
    );
  }
});

test('the sections cover the canon and nothing beyond it', () => {
  const covered = SECTIONS.reduce((total, span) => total + (span.last - span.first + 1), 0);
  assert.equal(covered, BOOKS.length);
  assert.equal(Math.min(...SECTIONS.map((s) => s.first)), 1);
  assert.equal(Math.max(...SECTIONS.map((s) => s.last)), 66);
});

test('the spans are contiguous, with no gap between one and the next', () => {
  const ordered = [...SECTIONS].sort((a, b) => a.first - b.first);
  for (let i = 1; i < ordered.length; i++) {
    assert.equal(
      ordered[i].first,
      ordered[i - 1].last + 1,
      `gap or overlap between ${ordered[i - 1].key} and ${ordered[i].key}`,
    );
  }
});

test('the named edges are the books people expect', () => {
  // If canon.ts is ever reordered these break loudly, which is the point:
  // "the Torah" must not silently come to mean Genesis through Joshua.
  const edges: readonly [string, string, string][] = [
    ['law', 'Genesis', 'Deuteronomy'],
    ['history', 'Joshua', 'Esther'],
    ['wisdom', 'Job', 'Song of Solomon'],
    ['majorProphets', 'Isaiah', 'Daniel'],
    ['minorProphets', 'Hosea', 'Malachi'],
    ['gospels', 'Matthew', 'John'],
    ['acts', 'Acts', 'Acts'],
    ['letters', 'Romans', 'Jude'],
    ['revelation', 'Revelation', 'Revelation'],
  ];

  for (const [key, first, last] of edges) {
    const span = sectionSpan(key as never);
    assert.equal(getBook(span.first)?.name, first, `${key} should start at ${first}`);
    assert.equal(getBook(span.last)?.name, last, `${key} should end at ${last}`);
  }
});

test('sectionOf agrees with the spans for every book', () => {
  for (const span of SECTIONS) {
    for (let book = span.first; book <= span.last; book++) {
      assert.equal(sectionOf(book), span.key);
    }
  }
});

test('booksInSection returns the books of that division in canon order', () => {
  const gospels = booksInSection('gospels');
  assert.deepEqual(
    gospels.map((book) => book.name),
    ['Matthew', 'Mark', 'Luke', 'John'],
  );

  const torah = booksInSection('law');
  assert.equal(torah.length, 5);
  assert.equal(torah[0].name, 'Genesis');
});
