/**
 * Which verse someone is looking at.
 *
 * The reader knows where every verse was laid out and how far the page has
 * been scrolled; this turns the two into "the verse at the top of the screen",
 * which is the closest thing to where a person has got to.
 *
 * Pure, and apart from the reader, because it is the sort of arithmetic that
 * is wrong at exactly one end and never in the middle.
 */

/**
 * The last verse to have reached the top of the view, or the first verse when
 * the page has not been scrolled that far yet.
 *
 * `slack` allows for the verse being a little under the chapter bar rather
 * than flush with the top of the scroll: without it, the verse you are reading
 * counts as the one before it for the height of that bar.
 */
export function verseAtTop(
  offsets: ReadonlyMap<number, number>,
  y: number,
  slack = 72,
): number | undefined {
  let best: number | undefined;
  let bestY = -Infinity;
  let first: number | undefined;
  let firstY = Infinity;

  for (const [verse, at] of offsets) {
    if (at < firstY) {
      firstY = at;
      first = verse;
    }
    // The furthest one that has gone past, not merely one that has.
    if (at <= y + slack && at > bestY) {
      bestY = at;
      best = verse;
    }
  }

  return best ?? first;
}
