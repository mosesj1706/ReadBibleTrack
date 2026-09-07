/**
 * Working out what a device is missing.
 *
 * Pulled out of the store so it can be tested without a database, because
 * this is the part that can lose or duplicate someone's reading history and
 * it is all arithmetic over ranges.
 *
 * The rule is a union: reading is something you did, and two devices each
 * know part of the truth. Only the portions not already covered are returned,
 * so applying the result twice adds nothing the second time.
 *
 * A union cannot express taking something back, though, because nothing
 * distinguishes "never read" from "read, then un-read" — both are an absence.
 * So removals are recorded rather than inferred, and `withoutRemoved` takes
 * them back out after the union has put everything in.
 */

// Relative, with the extension: this module is covered by `node --test`,
// which runs without a bundler and cannot resolve the `@/` alias.
import { normaliseRanges, subtractRanges, type VerseRange } from '../bible/verse-id.ts';

export type Dated = VerseRange & { readonly readOn: string };

/**
 * The pieces of `incoming` that `existing` does not already cover.
 *
 * Each piece keeps the date of the incoming row it came from — a span read on
 * one day that is half-known here should not claim to have been read today.
 */
export function additionsFrom(
  existing: readonly VerseRange[],
  incoming: readonly Dated[],
): Dated[] {
  // Grows as pieces are accepted, so two overlapping incoming rows do not both
  // get taken whole.
  let covered = normaliseRanges(existing);
  const additions: Dated[] = [];

  for (const row of incoming) {
    for (const piece of subtractRanges([row], covered)) {
      additions.push({ ...piece, readOn: row.readOn });
      covered = normaliseRanges([...covered, piece]);
    }
  }

  return additions;
}

/**
 * The union, minus what has been deliberately taken back.
 *
 * Unmarking used to be undone by the next sync on the same device: the pull
 * unions the server's copy back in, and the push then writes it out again, so
 * a person watched a chapter they had just un-marked reappear for no reason
 * they could see.
 *
 * Marking a passage again removes the removals covering it — see
 * `forgetRemovals` in the store — so re-reading beats having un-read, and a
 * removal cannot haunt a range for ever.
 */
export function withoutRemoved(
  additions: readonly Dated[],
  removals: readonly VerseRange[],
): Dated[] {
  if (removals.length === 0) return [...additions];

  const gone = normaliseRanges(removals);
  const kept: Dated[] = [];

  for (const addition of additions) {
    for (const piece of subtractRanges([addition], gone)) {
      kept.push({ ...piece, readOn: addition.readOn });
    }
  }

  return kept;
}
