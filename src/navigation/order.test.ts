import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TAB_ORDER, slideDirection, tabIndex } from './order.ts';

test('a tab to the right arrives from the right', () => {
  assert.equal(slideDirection('/', '/progress'), 'slide_from_right');
  assert.equal(slideDirection('/progress', '/circle'), 'slide_from_right');
  assert.equal(slideDirection('/', '/profile'), 'slide_from_right');
});

test('a tab to the left arrives from the left', () => {
  assert.equal(slideDirection('/profile', '/'), 'slide_from_left');
  assert.equal(slideDirection('/circle', '/marked'), 'slide_from_left');
  assert.equal(slideDirection('/progress', '/'), 'slide_from_left');
});

test('every neighbouring pair moves the way the bar is laid out', () => {
  for (let i = 0; i < TAB_ORDER.length - 1; i++) {
    assert.equal(slideDirection(TAB_ORDER[i], TAB_ORDER[i + 1]), 'slide_from_right');
    assert.equal(slideDirection(TAB_ORDER[i + 1], TAB_ORDER[i]), 'slide_from_left');
  }
});

test('"/" does not match every path', () => {
  // The home route is a prefix of everything, so it has to be compared whole.
  assert.equal(tabIndex('/'), 0);
  assert.equal(tabIndex('/progress'), 1);
  assert.notEqual(tabIndex('/marked'), 0);
});

test('a nested path still belongs to its tab', () => {
  assert.equal(tabIndex('/circle/invite'), 3);
  assert.equal(slideDirection('/circle/invite', '/'), 'slide_from_left');
});

test('somewhere that is not a tab keeps the ordinary forward motion', () => {
  // The reader has no tab: leaving it for Today should not slide backwards,
  // because there is no left-or-right relationship to honour.
  assert.equal(tabIndex('/read/John 14'), -1);
  assert.equal(slideDirection('/read/John 14', '/'), 'slide_from_right');
  assert.equal(slideDirection('/', '/read/John 14'), 'slide_from_right');
});

test('going nowhere is still forward, not a reversal', () => {
  assert.equal(slideDirection('/marked', '/marked'), 'slide_from_right');
});
