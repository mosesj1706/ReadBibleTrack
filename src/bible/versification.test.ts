import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BOOKS, FIRST_BOOK, LAST_BOOK } from './canon.ts';
import { formatReference, parseReference } from './reference.ts';
import {
  TOTAL_VERSES,
  bookRange,
  bookVerseTotal,
  canonRange,
  chapterRange,
  clampVerseId,
  countVerses,
  lastVerse,
  lastVerseId,
  nextChapter,
  previousChapter,
  progressThrough,
  verseCounts,
  verseIdAtOrdinal,
  verseOrdinal,
  versificationProblems,
} from './versification.ts';
import {
  bookSpan,
  canonSpan,
  chapterSpan,
  intersectRanges,
  normaliseRanges,
  subtractRanges,
  toVerseId,
  type VerseRange,
} from './verse-id.ts';

/** Parse a reference in a test, where a typo should fail loudly. */
const ref = (input: string): VerseRange => {
  const range = parseReference(input);
  assert.ok(range, `could not parse "${input}"`);
  return range;
};

describe('the versification table', () => {
  test('agrees with canon.ts', () => {
    assert.deepEqual(versificationProblems(), []);
  });

  test('covers every chapter of every book', () => {
    let chapters = 0;
    for (const book of BOOKS) {
      assert.equal(verseCounts(book.number).length, book.chapters, book.name);
      chapters += book.chapters;
    }
    assert.equal(chapters, 1189, 'the whole canon');
  });

  test('matches the counts everyone knows', () => {
    assert.equal(lastVerse(1, 1), 31, 'Genesis 1');
    assert.equal(lastVerse(19, 119), 176, 'Psalm 119 — the longest chapter');
    assert.equal(lastVerse(19, 117), 2, 'Psalm 117 — the shortest');
    assert.equal(lastVerse(43, 3), 36, 'John 3');
    assert.equal(lastVerse(66, 22), 21, 'Revelation 22');
  });

  test('reports nothing for chapters that do not exist', () => {
    assert.equal(lastVerse(1, 51), 0, 'Genesis has 50 chapters');
    assert.equal(lastVerse(0, 1), 0);
    assert.equal(lastVerse(67, 1), 0);
    assert.equal(lastVerseId(1, 51), undefined);
  });

  test('totals to the whole canon', () => {
    const summed = BOOKS.reduce((sum, b) => sum + bookVerseTotal(b.number), 0);
    assert.equal(summed, TOTAL_VERSES);
    // The table is the union of every bundled translation, so it runs slightly
    // past any one of them. The KJV and BSB put the Romans doxology at the end
    // of chapter 16 (16:27); the WEB puts it at the end of 14 (14:26). Both are
    // reserved, which is why this is three more than the KJV's 31,102.
    assert.equal(TOTAL_VERSES, 31_105);
  });

  test('reserves the numbering of every bundled translation', () => {
    // A range a KJV reader stores must be measurable, and so must a WEB one.
    assert.equal(lastVerse(45, 14), 26, 'Romans 14 — the WEB runs to 26');
    assert.equal(lastVerse(45, 16), 27, 'Romans 16 — the KJV and BSB run to 27');
  });
});

describe('ordinals', () => {
  test('run from Genesis 1:1 to the end of Revelation', () => {
    assert.equal(verseOrdinal(toVerseId(1, 1, 1)), 0);
    assert.equal(verseOrdinal(toVerseId(66, 22, 21)), TOTAL_VERSES - 1);
    assert.equal(verseIdAtOrdinal(0), toVerseId(1, 1, 1));
    assert.equal(verseIdAtOrdinal(TOTAL_VERSES - 1), toVerseId(66, 22, 21));
  });

  test('round-trip through every chapter of the canon', () => {
    for (const book of BOOKS) {
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        for (const verse of [1, Math.ceil(lastVerse(book.number, chapter) / 2), lastVerse(book.number, chapter)]) {
          const id = toVerseId(book.number, chapter, verse);
          assert.equal(verseIdAtOrdinal(verseOrdinal(id)), id, `${book.name} ${chapter}:${verse}`);
        }
      }
    }
  });

  test('tile the canon with no gap and no overlap', () => {
    let expected = 0;
    for (const book of BOOKS) {
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        const range = chapterRange(book.number, chapter);
        assert.ok(range, `${book.name} ${chapter}`);
        assert.equal(verseOrdinal(range.start), expected, `${book.name} ${chapter} starts where the last ended`);
        expected += lastVerse(book.number, chapter);
        assert.equal(verseOrdinal(range.end), expected - 1, `${book.name} ${chapter} ends`);
      }
    }
    assert.equal(expected, TOTAL_VERSES);
  });

  test('refuse an ordinal outside the canon', () => {
    assert.equal(verseIdAtOrdinal(-1), undefined);
    assert.equal(verseIdAtOrdinal(TOTAL_VERSES), undefined);
    assert.equal(verseIdAtOrdinal(1.5), undefined);
  });
});

describe('clamping the open upper bound', () => {
  test('pulls a 999 verse down onto the real last verse', () => {
    assert.equal(clampVerseId(chapterSpan(43, 3).end), toVerseId(43, 3, 36), 'John 3:999 -> 3:36');
    assert.equal(clampVerseId(bookSpan(65).end), toVerseId(65, 1, 25), 'Jude 1:999 -> 1:25');
    assert.equal(clampVerseId(canonSpan().end), toVerseId(66, 22, 21));
  });

  test('leaves a real verse alone', () => {
    const id = toVerseId(43, 3, 16);
    assert.equal(clampVerseId(id), id);
  });

  test('has nothing to clamp to outside the canon', () => {
    assert.equal(clampVerseId(67_001_001), undefined);
  });
});

describe('counting verses', () => {
  test('counts the whole canon from its padded span', () => {
    // The point of the exercise: verse-id.ts builds spans with a 999 upper
    // bound and no versification data, and they still measure exactly.
    assert.equal(countVerses([canonSpan()]), TOTAL_VERSES);
    assert.deepEqual(canonRange(), { start: toVerseId(1, 1, 1), end: toVerseId(66, 22, 21) });
  });

  test('counts a book and a chapter', () => {
    assert.equal(countVerses([bookSpan(19)]), bookVerseTotal(19), 'Psalms');
    assert.equal(countVerses([chapterSpan(43, 3)]), 36, 'John 3');
    assert.equal(countVerses([bookSpan(65)]), 25, 'Jude');
  });

  test('counts what a reference actually asks for', () => {
    assert.equal(countVerses([ref('John 3:16')]), 1);
    assert.equal(countVerses([ref('John 3:16-18')]), 3);
    assert.equal(countVerses([ref('John 3')]), 36);
    assert.equal(countVerses([ref('Psalm 117')]), 2);
    // John 3:16 to the end of 3 is 21 verses, plus the first two of chapter 4.
    assert.equal(countVerses([ref('John 3:16-4:2')]), 23);
  });

  test('counts a range that crosses a book boundary', () => {
    const range = { start: toVerseId(65, 1, 24), end: toVerseId(66, 1, 3) };
    assert.equal(countVerses([range]), 5, 'Jude 24-25 then Revelation 1:1-3');
  });

  test('counts the union, not the sum', () => {
    assert.equal(countVerses([ref('John 3'), ref('John 3:1-10')]), 36, 'overlap counted once');
    assert.equal(countVerses([ref('John 3:1-10'), ref('John 3:5-20')]), 20, 'merged');
    assert.equal(countVerses([ref('John 3'), ref('John 5')]), 36 + lastVerse(43, 5), 'disjoint');
  });

  test('counts nothing as nothing', () => {
    assert.equal(countVerses([]), 0);
  });

  test('a range past the end of a chapter holds no verses', () => {
    // Psalm 1 ends at verse 6, so this range is empty however it is written.
    assert.equal(countVerses([{ start: toVerseId(19, 1, 7), end: toVerseId(19, 1, 999) }]), 0);
    assert.equal(countVerses([{ start: toVerseId(65, 1, 26), end: toVerseId(65, 1, 999) }]), 0);
  });

  test('what is read and what is left add back up to the whole', () => {
    // The bug this pins: subtracting a chapter that has been read leaves a
    // padded tail like Psalm 1:7-999. Clamping both of its ends onto verse 6
    // counted one verse that does not exist, so the parts came to one more
    // than the whole and progress read 5 of 64 where it should read 6.
    const today = normaliseRanges(
      ['Psalm 1', 'Proverbs 1:1-7', 'John 1'].map((r) => ref(r)),
    );
    const total = countVerses(today);
    assert.equal(total, 64);

    const read = [chapterRange(19, 1)!];
    const left = countVerses(subtractRanges(today, read));
    const done = countVerses(intersectRanges(today, read));

    assert.equal(done, 6, 'Psalm 1 is six verses');
    assert.equal(left, 58);
    assert.equal(done + left, total, 'the parts make the whole');
  });
});

describe('progress', () => {
  test('is nothing before, everything after', () => {
    const target = [ref('John 3')];
    assert.equal(progressThrough(target, []), 0);
    assert.equal(progressThrough(target, target), 1);
  });

  test('measures the part of the target that was read', () => {
    assert.equal(progressThrough([ref('John 3')], [ref('John 3:1-18')]), 18 / 36);
  });

  test('ignores reading outside the target', () => {
    assert.equal(progressThrough([ref('John 3')], [ref('Genesis 1')]), 0);
    assert.equal(progressThrough([ref('John 3')], [ref('John 1-5')]), 1);
  });

  test('an empty target is not progress', () => {
    assert.equal(progressThrough([], [ref('John 3')]), 0);
  });
});

describe('walking chapter to chapter', () => {
  test('steps within a book', () => {
    assert.deepEqual(nextChapter(43, 3), { book: 43, chapter: 4 });
    assert.deepEqual(previousChapter(43, 4), { book: 43, chapter: 3 });
  });

  test('steps over a book boundary', () => {
    assert.deepEqual(nextChapter(1, 50), { book: 2, chapter: 1 }, 'Genesis 50 -> Exodus 1');
    assert.deepEqual(previousChapter(2, 1), { book: 1, chapter: 50 }, 'Exodus 1 -> Genesis 50');
    assert.deepEqual(nextChapter(65, 1), { book: 66, chapter: 1 }, 'Jude -> Revelation 1');
  });

  test('stops at both ends of the canon', () => {
    assert.equal(previousChapter(FIRST_BOOK, 1), undefined, 'nothing before Genesis 1');
    assert.equal(nextChapter(LAST_BOOK, 22), undefined, 'nothing after Revelation 22');
  });

  test('walks the whole canon, chapter by chapter', () => {
    let at: { book: number; chapter: number } | undefined = { book: FIRST_BOOK, chapter: 1 };
    let steps = 0;
    while (at) {
      steps++;
      at = nextChapter(at.book, at.chapter);
    }
    assert.equal(steps, 1189);
  });

  test('refuses a chapter that does not exist', () => {
    assert.equal(nextChapter(1, 51), undefined);
    assert.equal(previousChapter(1, 0), undefined);
  });
});

describe('naming a range that the table knows the shape of', () => {
  test('a chapter reads as a chapter, however its end was built', () => {
    // chapterSpan pads to 999; chapterRange stops at the real last verse.
    // Both are all of John 3, and both should say so.
    assert.equal(formatReference(chapterSpan(43, 3)), 'John 3');
    assert.equal(formatReference(chapterRange(43, 3)!), 'John 3');
    assert.equal(formatReference({ start: toVerseId(43, 3, 1), end: toVerseId(43, 3, 36) }), 'John 3');
  });

  test('a whole book still reads as the book', () => {
    assert.equal(formatReference(bookRange(65)!), 'Jude');
    assert.equal(formatReference(bookRange(1)!), 'Genesis');
  });

  test('one verse short is not the whole chapter', () => {
    assert.equal(
      formatReference({ start: toVerseId(43, 3, 1), end: toVerseId(43, 3, 35) }),
      'John 3:1-35',
    );
  });
});

describe('ranges from the table', () => {
  test('gives a chapter its true bounds', () => {
    assert.deepEqual(chapterRange(43, 3), { start: toVerseId(43, 3, 1), end: toVerseId(43, 3, 36) });
  });

  test('gives a book its true bounds', () => {
    assert.deepEqual(bookRange(1), { start: toVerseId(1, 1, 1), end: toVerseId(1, 50, 26) });
    assert.equal(bookRange(67), undefined);
  });
});
