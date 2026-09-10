/**
 * Which plan is being read, and what day of it today is.
 *
 * The plan belongs to the circle rather than the person — everyone reading the
 * same passage is what makes "Anna read this morning" worth saying. When the
 * circle you are looking at has agreed one, that is the plan, and the day
 * counts from the day the circle started it rather than the day you joined:
 * arriving late to a plan means arriving where everyone else is, not starting
 * again on your own.
 *
 * With no circle, or a circle that has agreed nothing, it falls back to the
 * per-device plan it used to be. Same shape, just not shared.
 */

import Storage from 'expo-sqlite/kv-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { customPlan, dayOfPlan, type Plan } from '@/bible/plan.ts';
import { bookRange } from '@/bible/versification.ts';
import type { VerseRange } from '@/bible/verse-id.ts';
import { useAuth } from '@/auth/provider';
import { useCircle } from '@/circles/provider';
import { setCirclePlan } from '@/circles/store';

import { DEFAULT_PLAN_ID, getPlan } from './catalogue';

const PLAN_KEY = 'plan.id';
const STARTED_KEY = 'plan.startedOn';

type PlanValue = {
  readonly plan: Plan;
  /** Which day of the plan today is. 1 on the day it was chosen. */
  readonly day: number;
  readonly startedOn: Date;
  readonly choose: (id: string) => void;
  /** The circle this plan came from, when it came from one. */
  readonly sharedWith: string | undefined;
  /** False when the plan is the circle's and the circle is not yours. */
  readonly canChoose: boolean;
};

const PlanContext = createContext<PlanValue | undefined>(undefined);

function parseDate(stored: string | null): Date {
  const parsed = stored ? new Date(stored) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function PlanProvider({ children }: { readonly children: ReactNode }) {
  const [id, setId] = useState<string | undefined>(undefined);
  const [startedOn, setStartedOn] = useState<Date>(() => new Date());
  const { circle, refresh } = useCircle();
  const { session } = useAuth();
  const mine = circle !== undefined && circle.createdBy === session?.user.id;
  const shared = circle?.planId !== undefined && circle.planStartedOn !== undefined;

  useEffect(() => {
    let cancelled = false;
    Promise.all([Storage.getItem(PLAN_KEY), Storage.getItem(STARTED_KEY)]).then(
      ([storedId, storedStart]) => {
        if (cancelled) return;
        setId(storedId ?? DEFAULT_PLAN_ID);
        setStartedOn(parseDate(storedStart));
      },
      () => {
        if (!cancelled) setId(DEFAULT_PLAN_ID);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(
    (next: string) => {
      // Choosing a plan starts it today: day 1 is the day you decided to read
      // it, not some date the app remembers from a plan you abandoned.
      const now = new Date();

      // A circle you own is choosing for everyone in it, so it is written to
      // the circle rather than to this device. Members of someone else's
      // circle cannot get here — the screen does not offer it.
      if (circle && mine) {
        void setCirclePlan(circle.id, next).then(
          () => refresh(),
          () => {},
        );
        return;
      }

      setId(next);
      setStartedOn(now);
      void Storage.setItem(PLAN_KEY, next);
      void Storage.setItem(STARTED_KEY, now.toISOString());
    },
    [circle, mine, refresh],
  );

  // 'custom' is the marker that the circle wrote its own: the definition is in
  // the columns beside it rather than in the catalogue.
  const plan = !shared
    ? getPlan(id)
    : circle.planId === 'custom'
      ? customPlan(
          circle.planName ?? 'Our plan',
          (circle.planBooks ?? [])
            .map((book) => bookRange(book))
            .filter((range): range is VerseRange => range !== undefined),
          circle.planDays ?? 1,
        )
      : getPlan(circle.planId);
  const from = shared ? parseDate(circle.planStartedOn ?? null) : startedOn;
  const day = Math.max(1, dayOfPlan(from, new Date()));

  const value = useMemo(
    () => ({
      plan,
      day,
      startedOn: from,
      choose,
      sharedWith: shared ? circle?.name : undefined,
      canChoose: !shared || mine,
    }),
    [plan, day, from, choose, shared, circle?.name, mine],
  );

  if (id === undefined) return null;
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanValue {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside <PlanProvider>');
  return value;
}
