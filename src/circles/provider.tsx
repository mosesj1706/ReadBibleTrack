/**
 * What the circle has shared, and who shared it.
 *
 * Kept apart from `MarksProvider`, which owns what is on this device. These
 * are other people's marks: they arrive over the network, they can fail to
 * arrive, and nothing here is ever written back. Keeping the two separate
 * means a network problem can never look like your own highlights vanishing.
 *
 * Silence is the failure mode on purpose. Someone reading on a train with no
 * signal should see their own chapter exactly as usual, not an error where
 * their circle would have been.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { VerseRange } from '@/bible/verse-id.ts';
import { membersOf, myCircles } from './store';
import { pullCircleMarks, pullCircleNotes, type CircleMark, type CircleNote } from '@/sync/sync';

type CircleValue = {
  /** Marks other people have chosen to show, touching a range. */
  readonly marksIn: (range: VerseRange) => readonly CircleMark[];
  readonly notesIn: (range: VerseRange) => readonly CircleNote[];
  /** Who someone is, or undefined if they are not in a circle with you. */
  readonly nameOf: (userId: string) => string | undefined;
  readonly refresh: () => void;
  readonly inACircle: boolean;
};

const CircleContext = createContext<CircleValue | undefined>(undefined);

const touches = (range: VerseRange, item: { start: number; end: number }) =>
  item.start <= range.end && item.end >= range.start;

export function CircleProvider({ children }: { readonly children: ReactNode }) {
  const [marks, setMarks] = useState<readonly CircleMark[]>([]);
  const [notes, setNotes] = useState<readonly CircleNote[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [inACircle, setInACircle] = useState(false);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const circles = await myCircles();
        const first = circles[0];
        if (!first) {
          setInACircle(false);
          setMarks([]);
          setNotes([]);
          setNames(new Map());
          return;
        }
        setInACircle(true);
        const [people, theirMarks, theirNotes] = await Promise.all([
          membersOf(first.id),
          pullCircleMarks(),
          pullCircleNotes(),
        ]);
        setNames(new Map(people.map((person) => [person.userId, person.displayName])));
        setMarks(theirMarks);
        setNotes(theirNotes);
      } catch {
        // Offline, signed out, or the server is unwell. The reader carries on
        // with this person's own marks, which is the important half.
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const marksIn = useCallback(
    (range: VerseRange) => marks.filter((mark) => touches(range, mark)),
    [marks],
  );
  const notesIn = useCallback(
    (range: VerseRange) => notes.filter((note) => touches(range, note)),
    [notes],
  );
  const nameOf = useCallback((userId: string) => names.get(userId), [names]);

  const value = useMemo(
    () => ({ marksIn, notesIn, nameOf, refresh, inACircle }),
    [marksIn, notesIn, nameOf, refresh, inACircle],
  );

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useCircle(): CircleValue {
  const value = useContext(CircleContext);
  if (!value) throw new Error('useCircle must be used inside <CircleProvider>');
  return value;
}
