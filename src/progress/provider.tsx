/**
 * Reading progress, shared across the app.
 *
 * The ranges live here rather than being re-read per screen, because almost
 * every screen wants them: Today measures the day's passages against them, the
 * reader decides whether to offer "mark read" or "mark unread", and the circle
 * view will aggregate them.
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

import { subtractRanges, type VerseId, type VerseRange } from '@/bible/verse-id.ts';

import { markRead, markUnread, moveBookmark, readBookmark, readRanges } from './store';

type ProgressValue = {
  /** Everything read, merged into the smallest equivalent set of ranges. */
  readonly ranges: readonly VerseRange[];
  /** Where reading stopped, so it can be picked up again. */
  readonly bookmark: VerseId | undefined;
  readonly ready: boolean;
  /** Re-read from the device, after a sync has written to it. */
  readonly refresh: () => void;
  readonly mark: (range: VerseRange) => void;
  readonly unmark: (range: VerseRange) => void;
};

const ProgressContext = createContext<ProgressValue | undefined>(undefined);

export function ProgressProvider({ children }: { readonly children: ReactNode }) {
  const [ranges, setRanges] = useState<readonly VerseRange[]>([]);
  const [bookmark, setBookmark] = useState<VerseId | undefined>();
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [read, mark] = await Promise.all([readRanges(), readBookmark()]);
      setRanges(read);
      setBookmark(mark);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mark = useCallback(
    (range: VerseRange) => {
      // Reading a passage leaves you at the end of it, which is where picking
      // it up again should start from.
      void markRead(range)
        .then(() => moveBookmark(range.end))
        .then(refresh);
    },
    [refresh],
  );

  const unmark = useCallback(
    (range: VerseRange) => {
      void markUnread(range).then(refresh);
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ ranges, bookmark, ready, mark, unmark, refresh: () => void refresh() }),
    [ranges, bookmark, ready, mark, unmark, refresh],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress must be used inside <ProgressProvider>');
  return value;
}

/** True when nothing of `range` is left unread. */
export function isFullyRead(
  range: VerseRange | undefined,
  covered: readonly VerseRange[],
): boolean {
  if (!range) return false;
  return subtractRanges([range], covered).length === 0;
}
