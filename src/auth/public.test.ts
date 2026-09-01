import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPublicRoute } from './public.ts';

test('the privacy policy is readable without an account', () => {
  assert.equal(isPublicRoute('/privacy'), true);
});

test('everything else is behind the gate', () => {
  for (const path of ['/', '/progress', '/marked', '/circle', '/profile']) {
    assert.equal(isPublicRoute(path), false, `${path} should need signing in`);
  }
});

test('a chapter is not public — reading is what the account is for', () => {
  assert.equal(isPublicRoute('/read/Genesis 1'), false);
});

test('a path that merely begins with the same letters is not public', () => {
  // Guards the difference between startsWith('/privacy') and a real segment
  // match, which is how a private page becomes a public one by accident.
  assert.equal(isPublicRoute('/privacy-settings'), false);
});
