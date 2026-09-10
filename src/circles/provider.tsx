/**
 * The circles you are in, which one you are looking at, and what they shared.
 *
 * Kept apart from `MarksProvider`, which owns what is on this device. These
 * are other people's marks: they arrive over the network, they can fail to
 * arrive, and nothing here is ever written back. Keeping the two separate
 * means a network problem can never look like your own highlights vanishing.
 *
 * Silence is the failure mode on purpose. Someone reading on a train with no
 * signal should see their own chapter exactly as usual, not an error where
 * their circle would have been.
 *
 * A person can be in more than one — a couple and a house group are not the
 * same circle and should not have to be. One of them is "active": the one the
 * Circle screen shows and the one whose plan, if it has agreed one, everybody
 * in it reads. Names are gathered across all of them, because a shared note
 * arriving from the house group still needs a name against it while you are
 * looking at the couple.
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

import type { VerseRange } from '@/bible/verse-id.ts';
import {
  blockPerson,
  blockedPeople,
  membersOf,
  myCircles,
  reportContent,
  unblockPerson,
  type Circle,
  type Member,
  type ReportedContent,
} from './store';
import { pullCircleMarks, pullCircleNotes, type CircleMark, type CircleNote } from '@/sync/sync';

/** Which circle was last being looked at, so the app opens where you left it. */
const ACTIVE_KEY = 'circle.active';

type CircleValue = {
  /** Every circle you belong to, oldest first. */
  readonly circles: readonly Circle[];
  /** The one being looked at, or undefined when you are in none. */
  readonly circle: Circle | undefined;
  readonly choose: (circleId: string) => void;
  /** Who is in the active circle. */
  readonly members: readonly Member[];
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
  const [circles, setCircles] = useState<readonly Circle[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [marks, setMarks] = useState<readonly CircleMark[]>([]);
  const [notes, setNotes] = useState<readonly CircleNote[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const mine = await myCircles();
        setCircles(mine);
        if (mine.length === 0) {
          setMembers([]);
          setMarks([]);
          setNotes([]);
          setNames(new Map());
          setBlocked(new Set());
          return;
        }

        // A remembered choice that is no longer one of your circles — you left
        // it, or were removed — falls back to the first rather than showing an
        // empty screen for a circle that is not there.
        const remembered = await Storage.getItem(ACTIVE_KEY);
        const chosen =
          mine.find((c) => c.id === remembered) ?? mine.find((c) => c.id === activeId) ?? mine[0];
        setActiveId(chosen.id);

        const [everyone, theirMarks, theirNotes, blocks] = await Promise.all([
          Promise.all(mine.map((circle) => membersOf(circle.id))),
          pullCircleMarks(),
          pullCircleNotes(),
          blockedPeople(),
        ]);

        // Names from every circle; membership only from the active one.
        const named = new Map<string, string>();
        for (const list of everyone) {
          for (const person of list) named.set(person.userId, person.displayName);
        }
        setNames(named);
        setMembers(everyone[mine.indexOf(chosen)] ?? []);
        setMarks(theirMarks);
        setNotes(theirNotes);
        setBlocked(new Set(blocks));
      } catch {
        // Offline, signed out, or the server is unwell. The reader carries on
        // with this person's own marks, which is the important half.
      }
    })();
    // `activeId` is read as a fallback only; depending on it would refetch
    // everything each time the choice changed, which `choose` already does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const choose = useCallback(
    (circleId: string) => {
      setActiveId(circleId);
      void Storage.setItem(ACTIVE_KEY, circleId);
      const found = circles.find((c) => c.id === circleId);
      if (found) void membersOf(found.id).then(setMembers, () => {});
    },
    [circles],
  );

  const circle = circles.find((c) => c.id === activeId) ?? circles[0];

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
    () => ({
      circles,
      circle,
      choose,
      members,
      marksIn,
      notesIn,
      nameOf,
      refresh,
      inACircle: circles.length > 0,
      isBlocked,
      block,
      unblock,
      report,
    }),
    [
      circles,
      circle,
      choose,
      members,
      marksIn,
      notesIn,
      nameOf,
      refresh,
      isBlocked,
      block,
      unblock,
      report,
    ],
  );

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useCircle(): CircleValue {
  const value = useContext(CircleContext);
  if (!value) throw new Error('useCircle must be used inside <CircleProvider>');
  return value;
}
