import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verseAtTop } from './place.ts';

// Genesis 1:1-5, a verse-height apart — a couple of lines of serif each.
const laidOut = new Map<number, number>([
  [1_001_001, 0],
  [1_001_002, 120],
  [1_001_003, 240],
  [1_001_004, 360],
  [1_001_005, 480],
]);

test('at the top of the chapter, the first verse', () => {
  assert.equal(verseAtTop(laidOut, 0), 1_001_001);
});

test('scrolled down, the verse that has reached the top', () => {
  assert.equal(verseAtTop(laidOut, 360, 0), 1_001_004);
});

test('between two verses, the one above — you have read past it', () => {
  assert.equal(verseAtTop(laidOut, 300, 0), 1_001_003);
});

test('the slack counts a verse just under the bar as the one being read', () => {
  // Verse 4 begins at 360 and the page is at 300, so flush against the top of
  // the scroll this is still verse 3 — but verse 4 has come out from under
  // the chapter bar and is what a person is actually reading.
  assert.equal(verseAtTop(laidOut, 300, 72), 1_001_004);
});

test('scrolled past the end, the last verse rather than nothing', () => {
  assert.equal(verseAtTop(laidOut, 9_000, 0), 1_001_005);
});

test('nothing laid out yet is nothing to report', () => {
  assert.equal(verseAtTop(new Map(), 0), undefined);
});

test('a chapter that begins part way down still answers before it is reached', () => {
  // A heading above verse 1 puts it at 200; the page has not got there.
  const shifted = new Map<number, number>([
    [19_119_001, 200],
    [19_119_002, 320],
  ]);
  assert.equal(verseAtTop(shifted, 0, 0), 19_119_001);
});
