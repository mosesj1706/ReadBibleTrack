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
import {
  blockPerson,
  blockedPeople,
  membersOf,
  myCircles,
  reportContent,
  unblockPerson,
  type ReportedContent,
} from './store';
import { pullCircleMarks, pullCircleNotes, type CircleMark, type CircleNote } from '@/sync/sync';

type CircleValue = {
  /** Marks other people have chosen to show, touching a range. */
  readonly marksIn: (range: VerseRange) => readonly CircleMark[];
  readonly notesIn: (range: VerseRange) => readonly CircleNote[];
  /** Who someone is, or undefined if they are not in a circle with you. */
  readonly nameOf: (userId: string) => string | undefined;
  readonly refresh: () => void;
  readonly inACircle: boolean;
  /** People whose shared marks and notes you have chosen not to see. */
  readonly isBlocked: (userId: string) => boolean;
  readonly block: (userId: string) => Promise<void>;
  readonly unblock: (userId: string) => Promise<void>;
  readonly report: (item: ReportedContent) => Promise<void>;
};

const CircleContext = createContext<CircleValue | undefined>(undefined);

const touches = (range: VerseRange, item: { start: number; end: number }) =>
  item.start <= range.end && item.end >= range.start;

export function CircleProvider({ children }: { readonly children: ReactNode }) {
  const [marks, setMarks] = useState<readonly CircleMark[]>([]);
  const [notes, setNotes] = useState<readonly CircleNote[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [inACircle, setInACircle] = useState(false);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());

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
          setBlocked(new Set());
          return;
        }
        setInACircle(true);
        // The server already withholds a blocked person's marks and notes —
        // this list is only so the circle screen can show who is blocked and
        // offer to undo it.
        const [people, theirMarks, theirNotes, blocks] = await Promise.all([
          membersOf(first.id),
          pullCircleMarks(),
          pullCircleNotes(),
          blockedPeople(),
        ]);
        setNames(new Map(people.map((person) => [person.userId, person.displayName])));
        setMarks(theirMarks);
        setNotes(theirNotes);
        setBlocked(new Set(blocks));
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
  const isBlocked = useCallback((userId: string) => blocked.has(userId), [blocked]);

  // Each of these refreshes afterwards rather than editing state in place: the
  // block is what decides whether their notes come back at all, and the server
  // is the one that decides that.
  const block = useCallback(
    async (userId: string) => {
      await blockPerson(userId);
      refresh();
    },
    [refresh],
  );

  const unblock = useCallback(
    async (userId: string) => {
      await unblockPerson(userId);
      refresh();
    },
    [refresh],
  );

  const report = useCallback(async (item: ReportedContent) => {
    await reportContent(item);
  }, []);

  const value = useMemo(
    () => ({ marksIn, notesIn, nameOf, refresh, inACircle, isBlocked, block, unblock, report }),
    [marksIn, notesIn, nameOf, refresh, inACircle, isBlocked, block, unblock, report],
  );

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useCircle(): CircleValue {
  const value = useContext(CircleContext);
  if (!value) throw new Error('useCircle must be used inside <CircleProvider>');
  return value;
}
