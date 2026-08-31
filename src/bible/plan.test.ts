import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getBook } from './canon.ts';
import {
  OPEN_PLAN,
  carryOnAt,
  customPlan,
  dayOfPlan,
  planVerses,
  portionFor,
  portionsThrough,
  readUpTo,
  resumeAt,
  wholeBible,
  type FixedPlan,
} from './plan.ts';
import { formatReference, parseReference } from './reference.ts';
import { TOTAL_VERSES, bookRange, chapterRange, countVerses } from './versification.ts';
import { canonSpan, normaliseRanges, toVerseId, type VerseRange } from './verse-id.ts';

const ref = (input: string): VerseRange => {
  const range = parseReference(input);
  assert.ok(range, `could not parse "${input}"`);
  return range;
};

describe('a plan over the whole canon', () => {
  const year = wholeBible(365);

  test('covers every verse, once', () => {
    assert.equal(planVerses(year), TOTAL_VERSES);
    const everything = portionsThrough(year, 365);
    assert.equal(countVerses(everything), TOTAL_VERSES, 'no verse missed');
  });

  test('runs from Genesis 1:1 to the end of Revelation', () => {
    const first = portionFor(year, 1);
    const last = portionFor(year, 365);
    assert.equal(first[0].start, toVerseId(1, 1, 1));
    assert.equal(last.at(-1)?.end, toVerseId(66, 22, 21));
  });

  test('days are even, give or take a verse', () => {
    const sizes = [];
    for (let day = 1; day <= 365; day++) sizes.push(countVerses(portionFor(year, day)));

    const smallest = Math.min(...sizes);
    const largest = Math.max(...sizes);
    assert.ok(largest - smallest <= 1, `days ranged ${smallest}..${largest}`);
    assert.equal(
      sizes.reduce((a, b) => a + b, 0),
      TOTAL_VERSES,
    );
  });

  test('no two days overlap', () => {
    const seen = portionsThrough(year, 365);
    const summed = seen.reduce((total, range) => total + countVerses([range]), 0);
    assert.equal(summed, countVerses(seen), 'the sum equals the union, so nothing repeats');
  });

  test('asks for nothing outside its own length', () => {
    assert.deepEqual(portionFor(year, 0), []);
    assert.deepEqual(portionFor(year, 366), []);
    assert.deepEqual(portionFor(year, 1.5), []);
  });
});

describe('a plan over one book', () => {
  const luke = customPlan('Luke in a month', [bookRange(42)!], 30);

  test('covers the book and nothing else', () => {
    assert.equal(planVerses(luke), countVerses([bookRange(42)!]));
    const all = normaliseRanges(portionsThrough(luke, 30));
    assert.equal(all[0].start, bookRange(42)!.start);
    assert.equal(all.at(-1)!.end, bookRange(42)!.end);
  });

  test('splits by verse, not by chapter', () => {
    // Luke's chapters run from 35 verses to 80. Splitting by chapter would
    // swing wildly; splitting by verse should not.
    const sizes = [];
    for (let day = 1; day <= 30; day++) sizes.push(countVerses(portionFor(luke, day)));
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  });
});

describe('a custom plan keeps the order it was given', () => {
  // The Today screen used to show these sorted by verse id, which quietly
  // turned "Gospel first" into "Psalm first".
  const mixed = customPlan('Gospel, then Psalm', [ref('John 1'), ref('Psalm 1')], 1);

  test('reads in the order chosen, not in canon order', () => {
    const day = portionFor(mixed, 1);
    assert.equal(formatReference(day[0]), 'John 1', 'John comes first because it was listed first');
    assert.equal(formatReference(day[1]), 'Psalm 1');
  });

  test('still measures correctly', () => {
    assert.equal(planVerses(mixed), countVerses([ref('John 1'), ref('Psalm 1')]));
  });

  test('a portion can span several of the plan’s pieces', () => {
    const twoDays = customPlan('Two days', [ref('Psalm 117'), ref('Psalm 23')], 1);
    // Psalm 117 is 2 verses, Psalm 23 is 6. One day takes all eight.
    assert.equal(countVerses(portionFor(twoDays, 1)), 8);
    assert.equal(portionFor(twoDays, 1).length, 2, 'two pieces, kept apart');
  });
});

describe('a published plan', () => {
  const mcheyne: FixedPlan = {
    kind: 'fixed',
    id: 'test',
    name: 'A three day plan',
    schedule: [
      [ref('Genesis 1'), ref('Matthew 1')],
      [ref('Genesis 2'), ref('Matthew 2')],
      [ref('Genesis 3'), ref('Matthew 3')],
    ],
  };

  test('hands back the day it was compiled with', () => {
    assert.deepEqual(portionFor(mcheyne, 2).map((r) => formatReference(r)), [
      'Genesis 2',
      'Matthew 2',
    ]);
  });

  test('runs out at the end of its table', () => {
    assert.deepEqual(portionFor(mcheyne, 4), []);
    assert.equal(planVerses(mcheyne), countVerses(mcheyne.schedule.flat()));
  });
});

describe('no plan', () => {
  test('asks for nothing, ever', () => {
    assert.deepEqual(portionFor(OPEN_PLAN, 1), []);
    assert.equal(planVerses(OPEN_PLAN), 0);
  });

  test('but still knows where to carry on', () => {
    const read = [{ start: toVerseId(1, 1, 1), end: toVerseId(1, 3, 24) }];
    assert.equal(resumeAt([canonSpan()], read), toVerseId(1, 4, 1), 'Genesis 4:1 is next');
  });
});

describe('reading up to a verse', () => {
  test('runs from where you left off', () => {
    const range = readUpTo(toVerseId(42, 4, 30), toVerseId(42, 4, 14));
    assert.equal(formatReference(range), 'Luke 4:14-30');
  });

  test('falls back to the start of the chapter when there is no bookmark', () => {
    assert.equal(formatReference(readUpTo(toVerseId(42, 4, 30), undefined)), 'Luke 4:1-30');
  });

  test('falls back when the bookmark is ahead of the verse', () => {
    // Jumped backwards; claiming everything between would be a lie.
    const range = readUpTo(toVerseId(42, 4, 10), toVerseId(43, 3, 16));
    assert.equal(formatReference(range), 'Luke 4:1-10');
  });

  test('a single verse is a legitimate claim', () => {
    const one = toVerseId(43, 11, 35);
    assert.deepEqual(readUpTo(one, one), { start: one, end: one });
  });
});

describe('resuming', () => {
  const day = [ref('Luke 4')];

  test('points at the first unread verse', () => {
    const read = [{ start: toVerseId(42, 4, 1), end: toVerseId(42, 4, 13) }];
    assert.equal(resumeAt(day, read), toVerseId(42, 4, 14));
  });

  test('is undefined once the day is done', () => {
    assert.equal(resumeAt(day, [chapterRange(42, 4)!]), undefined);
  });

  test('points at the beginning when nothing has been read', () => {
    assert.equal(resumeAt(day, []), chapterRange(42, 4)!.start);
  });
});

describe('which day it is', () => {
  test('the day it starts is day one', () => {
    const start = new Date(2026, 0, 1);
    assert.equal(dayOfPlan(start, new Date(2026, 0, 1)), 1);
    assert.equal(dayOfPlan(start, new Date(2026, 0, 2)), 2);
    assert.equal(dayOfPlan(start, new Date(2026, 11, 31)), 365);
  });

  test('crossing a month and a leap year still counts days', () => {
    assert.equal(dayOfPlan(new Date(2028, 1, 28), new Date(2028, 2, 1)), 3, '2028 has a 29 Feb');
  });

  test('a date before the start is not yet day one', () => {
    assert.equal(dayOfPlan(new Date(2026, 0, 10), new Date(2026, 0, 9)), 0);
  });
});

describe('the canon is what plans are measured against', () => {
  test('every book can be planned', () => {
    for (let book = 1; book <= 66; book++) {
      const range = bookRange(book);
      assert.ok(range, `${getBook(book)?.name} has a range`);
      assert.ok(planVerses(customPlan('x', [range], 7)) > 0);
    }
  });
});

test('with a plan, carrying on stays inside today’s portion', () => {
  const portion = [{ start: 43_003_001, end: 43_003_021 }];
  assert.equal(carryOnAt(portion, [], undefined), 43_003_001);
});

test('without a plan, the bookmark wins over the first gap in the canon', () => {
  // Reading John with Genesis unfinished should offer John, not Genesis.
  const read = [{ start: 1_001_001, end: 1_001_010 }];
  assert.equal(carryOnAt([], read, 43_003_016), 43_003_016);
});

test('without a plan or a bookmark, carrying on is the first thing unread', () => {
  const read = [{ start: 1_001_001, end: 1_001_010 }];
  assert.equal(carryOnAt([], read, undefined), 1_001_011);
});
