/**
 * The order the tabs sit in, and which way a screen should travel.
 *
 * Kept apart from the component so it can be tested without a bundler: this is
 * arithmetic over a list, and arithmetic over a list is exactly the sort of
 * thing that quietly gets an edge case wrong.
 */

export type Slide = 'slide_from_left' | 'slide_from_right';

/**
 * Left to right, as they appear in the bar and down the rail.
 *
 * The labels live here beside the order rather than in the component, so there
 * is one list rather than two that must agree. Two lists is how the direction
 * of travel comes adrift from the thing it describes.
 */
export const TABS = [
  { href: '/', label: 'Today' },
  { href: '/progress', label: 'Read' },
  { href: '/marked', label: 'Marked' },
  { href: '/circle', label: 'Circle' },
  { href: '/profile', label: 'You' },
] as const;

export const TAB_ORDER = TABS.map((tab) => tab.href);

/**
 * Where a path sits in the bar, or -1 for somewhere that is not a tab at all —
 * the reader, most often, which is reached from Today and has no tab of its own.
 */
export function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex((href) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href),
  );
}

/**
 * Which way the incoming screen should slide.
 *
 * A destination to the left of where you are arrives from the left. Anything
 * else — including arriving from somewhere that is not a tab — keeps the
 * ordinary forward motion, because there is no leftward relationship to honour.
 */
export function slideDirection(fromPath: string, toHref: string): Slide {
  const from = tabIndex(fromPath);
  const to = tabIndex(toHref);
  if (from === -1 || to === -1) return 'slide_from_right';
  return to < from ? 'slide_from_left' : 'slide_from_right';
}

/** The href a router route name stands for. `index` is the root. */
export function hrefForRoute(name: string): string {
  return name === 'index' ? '/' : `/${name}`;
}

/**
 * Where leaving a run of reader screens should land.
 *
 * Stepping to the next chapter pushes rather than replaces, so the reader can
 * be many screens deep. Leaving should return to whatever sat below the whole
 * run — the book list you opened it from — not one chapter back, and not the
 * home screen.
 *
 * This exists because `router.canDismiss()` looked like the test for "is there
 * anything beneath me" and is not: it reported false with the book list
 * directly below, which sent the reader's close button to Today and lost the
 * page you had come from.
 *
 * Returns undefined when the reader is all there is — a cold start straight
 * onto a chapter link — and the caller has to choose somewhere.
 */
export function exitBelow(
  routeNames: readonly string[],
): { readonly href: string; readonly label: string } | undefined {
  let index = routeNames.length - 1;
  while (index >= 0 && routeNames[index].startsWith('read/')) index -= 1;
  if (index < 0) return undefined;

  const href = hrefForRoute(routeNames[index]);
  return { href, label: TABS.find((tab) => tab.href === href)?.label ?? 'Back' };
}

/**
 * A navigation state, pared down to the part this file reads.
 *
 * Declared here rather than imported so this module stays free of the router
 * and can go on being tested under `node --test`.
 */
export type NavState = {
  readonly index?: number;
  readonly routes: readonly { readonly name: string; readonly state?: NavState }[];
};

/**
 * The names of the screens in the innermost stack — the one you are actually
 * standing in.
 *
 * `useRootNavigationState` hands back the container, whose single route is
 * `__root`; the stack holding the chapters is nested below it. Reading the top
 * level instead gives you `['__root']`, which looks like a stack of one and
 * makes every screen think it has nowhere to go back to.
 */
export function routeNamesOf(state: NavState | undefined): readonly string[] {
  let node = state;
  while (node && node.routes.length > 0) {
    const focused = node.routes[node.index ?? node.routes.length - 1];
    if (!focused?.state) break;
    node = focused.state;
  }
  return node?.routes.map((route) => route.name) ?? [];
}
