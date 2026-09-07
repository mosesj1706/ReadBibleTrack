import assert from 'node:assert/strict';
import { test } from 'node:test';

import { additionsFrom, withoutRemoved, type Dated } from './merge.ts';

const on = (start: number, end: number, readOn = '2026-01-01'): Dated => ({ start, end, readOn });

test('a device with nothing takes everything', () => {
  const additions = additionsFrom([], [on(1_001_001, 1_001_031)]);
  assert.equal(additions.length, 1);
  assert.deepEqual(
    additions.map((a) => [a.start, a.end]),
    [[1_001_001, 1_001_031]],
  );
});

test('what is already covered is not taken again', () => {
  const existing = [{ start: 1_001_001, end: 1_001_031 }];
  assert.deepEqual(additionsFrom(existing, [on(1_001_001, 1_001_031)]), []);
});

test('only the part that is missing comes across', () => {
  // This device has Genesis 1:1-15; the other has 1:1-31.
  const existing = [{ start: 1_001_001, end: 1_001_015 }];
  const additions = additionsFrom(existing, [on(1_001_001, 1_001_031)]);
  assert.deepEqual(
    additions.map((a) => [a.start, a.end]),
    [[1_001_016, 1_001_031]],
  );
});

test('a gap in the middle is filled without disturbing either side', () => {
  const existing = [
    { start: 1_001_001, end: 1_001_010 },
    { start: 1_001_020, end: 1_001_031 },
  ];
  const additions = additionsFrom(existing, [on(1_001_001, 1_001_031)]);
  assert.deepEqual(
    additions.map((a) => [a.start, a.end]),
    [[1_001_011, 1_001_019]],
  );
});

test('two overlapping incoming rows are not both taken whole', () => {
  // Without accumulating what has been accepted, this would insert the same
  // verses twice and double someone's reading count.
  const additions = additionsFrom([], [on(1_001_001, 1_001_020), on(1_001_010, 1_001_031)]);
  const total = additions.reduce((sum, a) => sum + (a.end - a.start + 1), 0);
  assert.equal(total, 31, 'thirty-one verse ids across the two rows, counted once each');
});

test('merging is idempotent — the second run has nothing to do', () => {
  const incoming = [on(43_003_016, 43_003_016), on(19_023_001, 19_023_006)];
  const first = additionsFrom([], incoming);
  assert.ok(first.length > 0);

  const afterFirst = first.map((a) => ({ start: a.start, end: a.end }));
  assert.deepEqual(additionsFrom(afterFirst, incoming), [], 'nothing left to add');
});

test('each piece keeps the date it was read on, not today', () => {
  const additions = additionsFrom(
    [{ start: 1_001_001, end: 1_001_015 }],
    [on(1_001_001, 1_001_031, '2025-12-25')],
  );
  assert.equal(additions[0].readOn, '2025-12-25');
});

test('an unrelated range is taken in full', () => {
  const existing = [{ start: 1_001_001, end: 1_001_031 }];
  const additions = additionsFrom(existing, [on(43_003_016, 43_003_016)]);
  assert.deepEqual(
    additions.map((a) => [a.start, a.end]),
    [[43_003_016, 43_003_016]],
  );
});

test('a removal keeps the sync from putting back what was un-marked', () => {
  // The bug this exists for: unmark Genesis 3, then sync. The pull unions the
  // server's copy back in and the push writes it out again, so the chapter
  // reappears on the device that just removed it.
  const additions = additionsFrom([], [on(1_003_001, 1_003_024)]);
  const kept = withoutRemoved(additions, [{ start: 1_003_001, end: 1_003_024 }]);
  assert.deepEqual(kept, []);
});

test('only the removed part is held back', () => {
  // The bounds are id arithmetic, not verse counts: ids run
  // book * 1e6 + chapter * 1e3 + verse, so a span across chapters also covers
  // the unused ids between them. Subtracting Genesis 2 from Genesis 1-3 leaves
  // everything below 1_002_001 and everything above 1_002_025, gaps included.
  // `countVerses` is what turns those bounds back into a number of real
  // verses, which is why carrying the gaps costs nothing.
  const additions = additionsFrom([], [on(1_001_001, 1_003_024)]);
  const kept = withoutRemoved(additions, [{ start: 1_002_001, end: 1_002_025 }]);
  assert.deepEqual(
    kept.map((k) => [k.start, k.end]),
    [
      [1_001_001, 1_002_000],
      [1_002_026, 1_003_024],
    ],
    'Genesis 1 and 3 survive; only Genesis 2 is held back',
  );
});

test('a piece held back keeps the date of the row it came from', () => {
  const additions = additionsFrom([], [on(1_001_001, 1_002_025, '2025-12-25')]);
  const kept = withoutRemoved(additions, [{ start: 1_002_001, end: 1_002_025 }]);
  assert.equal(kept[0].readOn, '2025-12-25');
});

test('no removals is the union unchanged', () => {
  const additions = additionsFrom([], [on(1_001_001, 1_001_031)]);
  assert.deepEqual(withoutRemoved(additions, []), additions);
});

test('a removal that touches nothing takes nothing', () => {
  const additions = additionsFrom([], [on(43_003_016, 43_003_016)]);
  const kept = withoutRemoved(additions, [{ start: 1_001_001, end: 1_001_031 }]);
  assert.deepEqual(kept, additions);
});

test('overlapping removals do not double-subtract', () => {
  const additions = additionsFrom([], [on(1_001_001, 1_001_031)]);
  const kept = withoutRemoved(additions, [
    { start: 1_001_001, end: 1_001_020 },
    { start: 1_001_010, end: 1_001_031 },
  ]);
  assert.deepEqual(kept, [], 'the two together cover the whole chapter');
});
