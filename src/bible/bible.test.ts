import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BOOKS, findBook, getBook } from './canon.ts';
import { formatReference, parseReference } from './reference.ts';
import {
  bookSpan,
  canonSpan,
  chapterSpan,
  fromVerseId,
  intersectRanges,
  normaliseRanges,
  splitByBook,
  subtractRanges,
  toVerseId,
  type VerseRange,
} from './verse-id.ts';

const r = (start: number, end: number): VerseRange => ({ start, end });

describe('canon', () => {
  test('holds 66 books numbered 1..66', () => {
    assert.equal(BOOKS.length, 66);
    BOOKS.forEach((book, i) => assert.equal(book.number, i + 1));
  });

  test('chapter counts match the known totals', () => {
    const total = (t: string) =>
      BOOKS.filter((b) => b.testament === t).reduce((n, b) => n + b.chapters, 0);
    assert.equal(total('old'), 929, 'Old Testament chapters');
    assert.equal(total('new'), 260, 'New Testament chapters');
    assert.equal(total('old') + total('new'), 1189, 'whole canon');
  });

  test('names and abbreviations are unique', () => {
    assert.equal(new Set(BOOKS.map((b) => b.name)).size, 66);
    assert.equal(new Set(BOOKS.map((b) => b.abbr)).size, 66);
  });

  test('resolves names, abbreviations, aliases and prefixes', () => {
    assert.equal(findBook('Genesis')?.number, 1);
    assert.equal(findBook('1 Cor')?.number, 46);
    assert.equal(findBook('1cor.')?.number, 46);
    assert.equal(findBook('  1 CORINTHIANS ')?.number, 46);
    assert.equal(findBook('psalm')?.number, 19, 'singular Psalm is common');
    assert.equal(findBook('Revelations')?.number, 66, 'the popular mistake');
    assert.equal(findBook('Song of Songs')?.number, 22);
    assert.equal(findBook('Philipp')?.number, 50, 'unique prefix resolves');
  });

  test('refuses ambiguous or unknown input', () => {
    assert.equal(findBook('J'), undefined, 'Job, Joel, John, Jonah, Jude...');
    assert.equal(findBook('Enoch'), undefined);
    assert.equal(findBook(''), undefined);
  });
});

describe('verse ids', () => {
  test('encodes the reference points', () => {
    assert.equal(toVerseId(1, 1, 1), 1_001_001, 'Genesis 1:1');
    assert.equal(toVerseId(43, 3, 16), 43_003_016, 'John 3:16');
    assert.equal(toVerseId(66, 22, 21), 66_022_021, 'Revelation 22:21');
    assert.equal(toVerseId(19, 119, 176), 19_119_176, 'Psalm 119:176');
  });

  test('round-trips every book, chapter and a spread of verses', () => {
    for (const book of BOOKS) {
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        for (const verse of [1, 7, 99, 176]) {
          const parts = fromVerseId(toVerseId(book.number, chapter, verse));
          assert.deepEqual(parts, { book: book.number, chapter, verse });
        }
      }
    }
  });

  test('sorts in canonical reading order', () => {
    const ids = [
      toVerseId(66, 22, 21),
      toVerseId(1, 1, 1),
      toVerseId(43, 3, 16),
      toVerseId(1, 1, 2),
      toVerseId(1, 2, 1),
    ];
    assert.deepEqual(
      [...ids].sort((a, b) => a - b),
      [
        toVerseId(1, 1, 1),
        toVerseId(1, 1, 2),
        toVerseId(1, 2, 1),
        toVerseId(43, 3, 16),
        toVerseId(66, 22, 21),
      ],
    );
  });

  test('rejects out-of-range components', () => {
    assert.throws(() => toVerseId(0, 1, 1), RangeError);
    assert.throws(() => toVerseId(67, 1, 1), RangeError);
    assert.throws(() => toVerseId(1, 0, 1), RangeError);
    assert.throws(() => toVerseId(1, 1, 0), RangeError);
    assert.throws(() => toVerseId(1, 1, 1000), RangeError);
    assert.throws(() => toVerseId(1.5, 1, 1), RangeError);
  });

  test('spans cover chapters, books and the whole canon', () => {
    assert.deepEqual(chapterSpan(43, 3), r(43_003_001, 43_003_999));
    assert.deepEqual(bookSpan(65), r(65_001_001, 65_001_999), 'Jude has one chapter');
    assert.deepEqual(canonSpan(), r(1_001_001, 66_022_999));
  });

  test('a chapter span contains its verses and nothing beyond', () => {
    const span = chapterSpan(43, 3);
    assert.ok(toVerseId(43, 3, 16) >= span.start && toVerseId(43, 3, 16) <= span.end);
    assert.ok(toVerseId(43, 4, 1) > span.end);
    assert.ok(toVerseId(43, 2, 25) < span.start);
  });
});

describe('range algebra', () => {
  test('merges overlapping and touching ranges', () => {
    assert.deepEqual(normaliseRanges([r(10, 20), r(15, 25)]), [r(10, 25)]);
    assert.deepEqual(normaliseRanges([r(10, 20), r(21, 30)]), [r(10, 30)], 'adjacent');
    assert.deepEqual(normaliseRanges([r(10, 20), r(22, 30)]), [r(10, 20), r(22, 30)]);
    assert.deepEqual(normaliseRanges([r(10, 30), r(15, 20)]), [r(10, 30)], 'contained');
  });

  test('sorts before merging and survives an empty set', () => {
    assert.deepEqual(normaliseRanges([r(30, 40), r(10, 20), r(19, 31)]), [r(10, 40)]);
    assert.deepEqual(normaliseRanges([]), []);
  });

  test('subtract leaves what is still unread', () => {
    assert.deepEqual(subtractRanges([r(1, 100)], [r(20, 30)]), [r(1, 19), r(31, 100)]);
    assert.deepEqual(subtractRanges([r(1, 100)], [r(1, 100)]), [], 'fully read');
    assert.deepEqual(subtractRanges([r(1, 100)], []), [r(1, 100)], 'nothing read');
    assert.deepEqual(subtractRanges([r(1, 100)], [r(1, 40)]), [r(41, 100)], 'from the front');
    assert.deepEqual(subtractRanges([r(1, 100)], [r(60, 200)]), [r(1, 59)], 'overhanging');
    assert.deepEqual(
      subtractRanges([r(1, 100)], [r(10, 20), r(50, 60)]),
      [r(1, 9), r(21, 49), r(61, 100)],
      'several gaps',
    );
    assert.deepEqual(subtractRanges([r(1, 100)], [r(200, 300)]), [r(1, 100)], 'disjoint');
  });

  test('subtract is idempotent', () => {
    const once = subtractRanges([r(1, 100)], [r(20, 30)]);
    assert.deepEqual(subtractRanges(once, [r(20, 30)]), once);
  });

  test('intersect finds the shared portion', () => {
    assert.deepEqual(intersectRanges([r(1, 100)], [r(50, 150)]), [r(50, 100)]);
    assert.deepEqual(intersectRanges([r(1, 10)], [r(20, 30)]), []);
    assert.deepEqual(
      intersectRanges([r(1, 100), r(200, 300)], [r(50, 250)]),
      [r(50, 100), r(200, 250)],
    );
  });

  test('splits a multi-book range at book boundaries', () => {
    const across = { start: toVerseId(65, 1, 20), end: toVerseId(66, 1, 3) };
    assert.deepEqual(splitByBook(across), [
      r(toVerseId(65, 1, 20), bookSpan(65).end),
      r(bookSpan(66).start, toVerseId(66, 1, 3)),
    ]);
    const within = r(toVerseId(43, 3, 16), toVerseId(43, 3, 18));
    assert.deepEqual(splitByBook(within), [within]);
  });
});

describe('references', () => {
  const cases: [string, string][] = [
    ['John 3:16', 'John 3:16'],
    ['John 3:16-18', 'John 3:16-18'],
    ['John 3:16-4:2', 'John 3:16-4:2'],
    ['John 3', 'John 3'],
    ['John 3-5', 'John 3-5'],
    ['Jude', 'Jude'],
    ['Genesis', 'Genesis'],
    ['1 Corinthians 13:4-7', '1 Corinthians 13:4-7'],
  ];

  for (const [input, expected] of cases) {
    test(`round-trips ${input}`, () => {
      const range = parseReference(input);
      assert.ok(range, `failed to parse ${input}`);
      assert.equal(formatReference(range), expected);
    });
  }

  test('is forgiving about how people type', () => {
    const canonical = parseReference('1 Corinthians 13:4');
    for (const variant of ['1cor 13:4', '1 Cor. 13.4', 'I Corinthians 13:4', '  1CORINTHIANS13:4  ']) {
      assert.deepEqual(parseReference(variant), canonical, variant);
    }
  });

  test('abbreviates on request', () => {
    const range = parseReference('1 Corinthians 13:4-7');
    assert.ok(range);
    assert.equal(formatReference(range, { abbreviate: true }), '1 Cor 13:4-7');
  });

  test('rejects impossible references', () => {
    assert.equal(parseReference('John 99'), undefined, 'John has 21 chapters');
    assert.equal(parseReference('Jude 2'), undefined, 'Jude has one chapter');
    assert.equal(parseReference('John 5-3'), undefined, 'backwards');
    assert.equal(parseReference('Enoch 1:1'), undefined, 'not in the canon');
    assert.equal(parseReference(''), undefined);
  });

  test('says Psalm for one and Psalms for many', () => {
    const one = parseReference('Psalm 23');
    const few = parseReference('Psalms 23-24');
    const all = parseReference('Psalms');
    assert.ok(one && few && all);
    assert.equal(formatReference(one), 'Psalm 23');
    assert.equal(formatReference(few), 'Psalms 23-24');
    assert.equal(formatReference(all), 'Psalms');
    assert.equal(formatReference(one, { abbreviate: true }), 'Ps 23');
  });

  test('a parsed chapter equals its span', () => {
    assert.deepEqual(parseReference('Psalm 23'), chapterSpan(19, 23));
    assert.deepEqual(parseReference('Obadiah'), bookSpan(31));
  });
});
