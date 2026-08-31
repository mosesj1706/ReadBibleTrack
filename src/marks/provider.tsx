/**
 * Highlights, favourites and notes, shared across the app.
 *
 * Held here rather than fetched per screen because two very different screens
 * want them: the reader, to paint a chapter, and the journal, to list
 * everything ever marked.
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
  listMarks,
  listNotes,
  removeMark,
  removeNote,
  saveNote,
  setMark,
  setMarkShared,
  setNoteShared,
  type Mark,
  type MarkColour,
  type Note,
} from './store';

type MarksValue = {
  readonly marks: readonly Mark[];
  readonly notes: readonly Note[];
  readonly ready: boolean;
  readonly highlight: (range: VerseRange, colour: MarkColour | undefined) => void;
  readonly star: (range: VerseRange, starred: boolean) => void;
  readonly write: (range: VerseRange, body: string) => void;
  readonly forgetMark: (id: string) => void;
  readonly forgetNote: (id: string) => void;
  /** Show a mark or a note to the circle, or take it back. */
  readonly share: (id: string, shared: boolean) => void;
  readonly shareNote: (id: string, shared: boolean) => void;
  /** What is marked on a range, if anything. */
  readonly markOn: (range: VerseRange) => Mark | undefined;
  readonly noteOn: (range: VerseRange) => Note | undefined;
};

const MarksContext = createContext<MarksValue | undefined>(undefined);

export function MarksProvider({ children }: { readonly children: ReactNode }) {
  const [marks, setMarks] = useState<readonly Mark[]>([]);
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, n] = await Promise.all([listMarks(), listNotes()]);
      setMarks(m);
      setNotes(n);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const highlight = useCallback(
    (range: VerseRange, colour: MarkColour | undefined) => {
      void setMark(range, { colour }).then(refresh);
    },
    [refresh],
  );

  const star = useCallback(
    (range: VerseRange, starred: boolean) => {
      void setMark(range, { starred }).then(refresh);
    },
    [refresh],
  );

  const write = useCallback(
    (range: VerseRange, body: string) => {
      void saveNote(range, body).then(refresh);
    },
    [refresh],
  );

  const share = useCallback(
    (id: string, shared: boolean) => {
      void setMarkShared(id, shared).then(refresh);
    },
    [refresh],
  );

  const shareNote = useCallback(
    (id: string, shared: boolean) => {
      void setNoteShared(id, shared).then(refresh);
    },
    [refresh],
  );

  const forgetMark = useCallback(
    (id: string) => {
      void removeMark(id).then(refresh);
    },
    [refresh],
  );

  const forgetNote = useCallback(
    (id: string) => {
      void removeNote(id).then(refresh);
    },
    [refresh],
  );

  const markOn = useCallback(
    (range: VerseRange) =>
      marks.find((mark) => mark.start === range.start && mark.end === range.end),
    [marks],
  );

  const noteOn = useCallback(
    (range: VerseRange) =>
      notes.find((note) => note.start === range.start && note.end === range.end),
    [notes],
  );

  const value = useMemo(
    () => ({
      marks, notes, ready,
      highlight, star, write, share, shareNote,
      forgetMark, forgetNote, markOn, noteOn,
    }),
    [marks, notes, ready, highlight, star, write, share, shareNote, forgetMark, forgetNote, markOn, noteOn],
  );

  return <MarksContext.Provider value={value}>{children}</MarksContext.Provider>;
}

export function useMarks(): MarksValue {
  const value = useContext(MarksContext);
  if (!value) throw new Error('useMarks must be used inside <MarksProvider>');
  return value;
}

/** The tint a highlight paints behind a verse, per theme. */
export const MARK_TINTS: Record<MarkColour, { light: string; dark: string }> = {
  yellow: { light: '#F6E6A8', dark: '#4A421F' },
  green: { light: '#CFE7D2', dark: '#22402C' },
  blue: { light: '#CFDFF0', dark: '#1E3448' },
  pink: { light: '#F2D3DF', dark: '#42222F' },
  orange: { light: '#F5DCC2', dark: '#4A3320' },
};
