/**
 * The plans a circle can choose from.
 *
 * Everything here except the open plan is computed — a set of ranges and a
 * pace — so adding "the Gospels in 40 days" costs one line and no data. The
 * published plans (M'Cheyne, chronological) are a compiled table rather than a
 * calculation, and land as `FixedPlan` entries once their data is sourced.
 */

import { bookRange } from '@/bible/versification.ts';
import { OPEN_PLAN, customPlan, wholeBible, type Plan } from '@/bible/plan.ts';

const GENESIS = 1;
const MATTHEW = 40;
const JOHN = 43;
const ACTS = 44;
const JUDE = 65;
const PSALMS = 19;
const PROVERBS = 20;
const REVELATION = 66;

/** Every book from `first` to `last`, in canon order. */
function books(first: number, last: number) {
  const ranges = [];
  for (let book = first; book <= last; book++) {
    const range = bookRange(book);
    if (range) ranges.push(range);
  }
  return ranges;
}

export const PLANS: readonly Plan[] = [
  OPEN_PLAN,
  wholeBible(365),
  {
    ...customPlan('The New Testament in 90 days', books(MATTHEW, REVELATION), 90),
    id: 'nt-90',
  },
  {
    ...customPlan('The Gospels in 40 days', books(MATTHEW, JOHN), 40),
    id: 'gospels-40',
  },
  {
    ...customPlan('Psalms and Proverbs in 90 days', books(PSALMS, PROVERBS), 90),
    id: 'psalms-proverbs-90',
  },
  {
    // Acts through Jude: the story of the early church and every letter it
    // produced. Stopping at Romans would have made the name a lie.
    ...customPlan('Acts and the letters in 60 days', books(ACTS, JUDE), 60),
    id: 'acts-letters-60',
  },
  {
    ...customPlan('Genesis in 25 days', books(GENESIS, GENESIS), 25),
    id: 'genesis-25',
  },
];

export const DEFAULT_PLAN_ID = OPEN_PLAN.id;

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((plan) => plan.id === id) ?? OPEN_PLAN;
}
