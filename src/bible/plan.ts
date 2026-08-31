/**
 * Reading plans, and where you are in one.
 *
 * A plan is a set of ranges plus a pace. "The whole Bible in a year" is the
 * canon over 365 days; "Luke in a month" is one book over 30. A custom plan is
 * the same thing with ranges someone chose, so it needs no separate machinery.
 *
 * Portions are split by **verse count**, not by chapter. That is the whole
 * reason `verseIdAtOrdinal` exists: chapters vary from 2 verses to 176, so
 * splitting by chapter gives wildly uneven days, and splitting by verse gives
 * even ones. Because ordinals are dense, any range is a contiguous interval of
 * them, which turns "the 40th to the 125th verse of this plan" into arithmetic.
 *
 * Published plans (M'Cheyne, chronological) cannot be computed — they are a
 * fixed table someone compiled — so they are carried as data instead.
 *
 * One thing this file is careful about: a plan keeps **its own reading order**.
 * `normaliseRanges` sorts by verse id, which is right for measuring and wrong
 * for "Gospel first, then Psalm". Portions are never sorted here.
 */

import {
  canonSpan,
  subtractRanges,
  type VerseId,
  type VerseRange,
} from './verse-id.ts';
import {
  chapterRange,
  firstVerseFrom,
  lastVerseUpTo,
  verseIdAtOrdinal,
  verseOrdinal,
} from './versification.ts';
import { fromVerseId } from './verse-id.ts';

/** A plan that splits what it covers evenly by verse count. */
export type ComputedPlan = {
  readonly kind: 'computed';
  readonly id: string;
  readonly name: string;
  /** What the plan covers, in the order it should be read. Never sorted. */
  readonly portions: readonly VerseRange[];
  readonly days: number;
};

/** A published plan: a compiled table, one entry per day. */
export type FixedPlan = {
  readonly kind: 'fixed';
  readonly id: string;
  readonly name: string;
  readonly schedule: readonly (readonly VerseRange[])[];
};

/** No plan. Read what you like; the bookmark and progress still follow you. */
export type OpenPlan = {
  readonly kind: 'open';
  readonly id: string;
  readonly name: string;
};

export type Plan = ComputedPlan | FixedPlan | OpenPlan;

/** An interval of canon ordinals — a range, measured. */
type Span = { readonly from: number; readonly to: number };

/**
 * The plan's ranges as ordinal intervals, in reading order. Ranges that hold no
 * real verses drop out, so a padded tail cannot contribute a phantom day.
 */
function spansOf(portions: readonly VerseRange[]): Span[] {
  const spans: Span[] = [];
  for (const portion of portions) {
    const first = firstVerseFrom(portion.start);
    const last = lastVerseUpTo(portion.end);
    if (first === undefined || last === undefined) continue;

    const from = verseOrdinal(first);
    const to = verseOrdinal(last);
    if (from >= 0 && to >= from) spans.push({ from, to });
  }
  return spans;
}

function lengthOf(spans: readonly Span[]): number {
  return spans.reduce((total, span) => total + span.to - span.from + 1, 0);
}

/** The ranges covering plan-verses `[from, upto)`, in reading order. */
function take(spans: readonly Span[], from: number, upto: number): VerseRange[] {
  const out: VerseRange[] = [];
  let passed = 0;

  for (const span of spans) {
    const length = span.to - span.from + 1;
    const begins = passed;
    const ends = passed + length;
    passed = ends;

    const a = Math.max(from, begins);
    const b = Math.min(upto, ends);
    if (a >= b) continue;

    const start = verseIdAtOrdinal(span.from + (a - begins));
    const end = verseIdAtOrdinal(span.from + (b - 1 - begins));
    if (start !== undefined && end !== undefined) out.push({ start, end });
  }
  return out;
}

/** How many days the plan runs for. An open plan never ends. */
export function planDays(plan: Plan): number {
  if (plan.kind === 'computed') return plan.days;
  if (plan.kind === 'fixed') return plan.schedule.length;
  return 0;
}

/** Every verse the plan covers. */
export function planVerses(plan: Plan): number {
  if (plan.kind === 'computed') return lengthOf(spansOf(plan.portions));
  if (plan.kind === 'fixed') return lengthOf(spansOf(plan.schedule.flat()));
  return 0;
}

/**
 * What to read on a given day, 1-based, in reading order.
 *
 * The split is proportional rather than a fixed portion size, so the remainder
 * is spread across the plan instead of piling onto the last day.
 */
export function portionFor(plan: Plan, day: number): VerseRange[] {
  if (plan.kind === 'open') return [];
  if (!Number.isInteger(day) || day < 1) return [];

  if (plan.kind === 'fixed') {
    return day <= plan.schedule.length ? [...plan.schedule[day - 1]] : [];
  }

  if (day > plan.days || plan.days < 1) return [];

  const spans = spansOf(plan.portions);
  const total = lengthOf(spans);
  if (total === 0) return [];

  const from = Math.floor(((day - 1) * total) / plan.days);
  const upto = Math.floor((day * total) / plan.days);
  return take(spans, from, upto);
}

/** Everything the plan asks for, from day one through the day given. */
export function portionsThrough(plan: Plan, day: number): VerseRange[] {
  const out: VerseRange[] = [];
  for (let d = 1; d <= day; d++) out.push(...portionFor(plan, d));
  return out;
}

/** Which day of a plan a date falls on, counting the start date as day 1. */
export function dayOfPlan(startedOn: Date, today: Date): number {
  const start = Date.UTC(startedOn.getFullYear(), startedOn.getMonth(), startedOn.getDate());
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - start) / 86_400_000) + 1;
}

/**
 * The range to log when someone taps a verse and says "I have read to here".
 *
 * It runs from where they left off, so reading is marked in the shape it
 * actually happened. With no bookmark — or one that sits after the verse,
 * because they jumped somewhere new — it falls back to the start of the
 * chapter they are in, which is the smallest honest claim.
 */
export function readUpTo(target: VerseId, from: VerseId | undefined): VerseRange {
  if (from !== undefined && from <= target) return { start: from, end: target };

  const { book, chapter } = fromVerseId(target);
  const openings = chapterRange(book, chapter);
  return { start: openings?.start ?? target, end: target };
}

/**
 * Where to carry on: the first verse of `target` that has not been read. For an
 * open plan pass the whole canon and it becomes "continue where you left off".
 */
export function resumeAt(
  target: readonly VerseRange[],
  covered: readonly VerseRange[],
): VerseId | undefined {
  // What is left over is arithmetic on ids, so it can begin one past the end of
  // a chapter — Genesis 3:24 read leaves a range starting at "Genesis 3:25",
  // which is not a verse. And a padded tail like Luke 4:45-999 is left over
  // even when the chapter is finished. Snap forward, and skip what holds
  // nothing, or the reader is sent somewhere that does not exist.
  for (const range of subtractRanges(target, covered)) {
    const first = firstVerseFrom(range.start);
    const last = lastVerseUpTo(range.end);
    if (first !== undefined && last !== undefined && first <= last) return first;
  }
  return undefined;
}

/** The open plan: no schedule, still tracked. */
export const OPEN_PLAN: OpenPlan = {
  kind: 'open',
  id: 'open',
  name: 'No plan — just reading',
};

/** A plan over the whole canon at a chosen pace. */
export function wholeBible(days: number): ComputedPlan {
  return {
    kind: 'computed',
    id: `bible-${days}`,
    name: `The whole Bible in ${days} days`,
    portions: [canonSpan()],
    days,
  };
}

/** A custom plan: whatever ranges someone picked, at whatever pace. */
export function customPlan(
  name: string,
  portions: readonly VerseRange[],
  days: number,
): ComputedPlan {
  return { kind: 'computed', id: 'custom', name, portions, days };
}

/**
 * Where reading should pick up again.
 *
 * With a plan, inside today's portion; without one, from wherever reading
 * actually stopped, anywhere in the canon. The bookmark is preferred to the
 * arithmetic because it knows where you were, not merely where the first gap
 * is — someone reading John while a gap sits in Genesis should be offered
 * John.
 *
 * Shared rather than written out at each call site: Today and the book list
 * both offer to carry on, and two copies of this rule would eventually offer
 * two different verses.
 */
export function carryOnAt(
  portion: readonly VerseRange[],
  read: readonly VerseRange[],
  bookmark: VerseId | undefined,
): VerseId | undefined {
  if (portion.length > 0) return resumeAt(portion, read);
  return bookmark ?? resumeAt([canonSpan()], read);
}
