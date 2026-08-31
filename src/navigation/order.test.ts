import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TAB_ORDER,
  animationForRoute,
  exitBelow,
  routeNamesOf,
  slideDirection,
  tabIndex,
} from './order.ts';

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

test('leaving the reader returns to the screen the run of chapters sits on', () => {
  const exit = exitBelow(['progress', 'read/[reference]', 'read/[reference]']);
  assert.deepEqual(exit, { href: '/progress', label: 'Read' });
});

test('one chapter deep still names what is underneath', () => {
  assert.deepEqual(exitBelow(['index', 'read/[reference]']), { href: '/', label: 'Today' });
});

test('a chapter opened cold has nothing to go back to', () => {
  assert.equal(exitBelow(['read/[reference]']), undefined);
});

test('a screen that is not a tab is still somewhere to return to', () => {
  const exit = exitBelow(['plan', 'read/[reference]']);
  assert.equal(exit?.href, '/plan');
  assert.equal(exit?.label, 'Back', 'no tab to borrow a name from');
});

test('the stack that matters is the innermost one, not the container', () => {
  // What `useRootNavigationState` actually hands back: a container holding a
  // single `__root` route, with the real stack nested inside it.
  const names = routeNamesOf({
    index: 0,
    routes: [
      {
        name: '__root',
        state: {
          index: 1,
          routes: [{ name: 'progress' }, { name: 'read/[reference]' }],
        },
      },
    ],
  });
  assert.deepEqual(names, ['progress', 'read/[reference]']);
});

test('a stack with nothing nested is returned as it stands', () => {
  assert.deepEqual(routeNamesOf({ index: 0, routes: [{ name: 'index' }] }), ['index']);
});

test('no state at all is no screens, not a crash', () => {
  assert.deepEqual(routeNamesOf(undefined), []);
});

test('the container alone still finds the book list underneath a chapter', () => {
  const state = {
    index: 0,
    routes: [
      {
        name: '__root',
        state: { index: 1, routes: [{ name: 'progress' }, { name: 'read/[reference]' }] },
      },
    ],
  };
  assert.deepEqual(exitBelow(routeNamesOf(state)), { href: '/progress', label: 'Read' });
});

test('a chapter reached by the back arrow arrives from the left', () => {
  assert.equal(
    animationForRoute('read/[reference]', { travel: 'back' }, 'slide_from_right'),
    'slide_from_left',
  );
});

test('a chapter with no direction of its own arrives from the right', () => {
  // Not the fallback: a screen already on the stack must not have its
  // animation rewritten by wherever the tabs happen to be pointing.
  assert.equal(
    animationForRoute('read/[reference]', undefined, 'slide_from_left'),
    'slide_from_right',
  );
});

test('a tab still follows the direction the bar decided', () => {
  assert.equal(animationForRoute('marked', undefined, 'slide_from_left'), 'slide_from_left');
  assert.equal(animationForRoute('index', undefined, 'slide_from_right'), 'slide_from_right');
});
