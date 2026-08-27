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
