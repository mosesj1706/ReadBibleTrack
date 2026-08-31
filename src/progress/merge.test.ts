import assert from 'node:assert/strict';
import { test } from 'node:test';

import { additionsFrom, type Dated } from './merge.ts';

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
