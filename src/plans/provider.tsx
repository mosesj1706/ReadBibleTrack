/**
 * Which plan is being read, and what day of it today is.
 *
 * The plan belongs to the circle rather than the person — everyone reading the
 * same passage is what makes "Anna read this morning" worth saying. Until
 * circles have screens it is stored per device, which is the same shape: one
 * plan and one start date, just not yet shared.
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

import { dayOfPlan, type Plan } from '@/bible/plan.ts';

import { DEFAULT_PLAN_ID, getPlan } from './catalogue';

const PLAN_KEY = 'plan.id';
const STARTED_KEY = 'plan.startedOn';

type PlanValue = {
  readonly plan: Plan;
  /** Which day of the plan today is. 1 on the day it was chosen. */
  readonly day: number;
  readonly startedOn: Date;
  readonly choose: (id: string) => void;
};

const PlanContext = createContext<PlanValue | undefined>(undefined);

function parseDate(stored: string | null): Date {
  const parsed = stored ? new Date(stored) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function PlanProvider({ children }: { readonly children: ReactNode }) {
  const [id, setId] = useState<string | undefined>(undefined);
  const [startedOn, setStartedOn] = useState<Date>(() => new Date());

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

  const choose = useCallback((next: string) => {
    // Choosing a plan starts it today: day 1 is the day you decided to read it,
    // not some date the app remembers from a plan you abandoned.
    const now = new Date();
    setId(next);
    setStartedOn(now);
    void Storage.setItem(PLAN_KEY, next);
    void Storage.setItem(STARTED_KEY, now.toISOString());
  }, []);

  const plan = getPlan(id);
  const day = Math.max(1, dayOfPlan(startedOn, new Date()));

  const value = useMemo(
    () => ({ plan, day, startedOn, choose }),
    [plan, day, startedOn, choose],
  );

  if (id === undefined) return null;
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanValue {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside <PlanProvider>');
  return value;
}
