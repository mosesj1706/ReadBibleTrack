/**
 * Which translation is open, and the database behind it.
 *
 * Each translation is its own bundled file, never merged. Switching closes one
 * database and opens another; nothing about stored progress changes, because
 * progress is verse ids and those mean the same thing in every translation.
 *
 * The choice is remembered with `expo-sqlite/kv-store`, which ships with
 * expo-sqlite and so costs no extra dependency.
 */

import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
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

import {
  DEFAULT_TRANSLATION_ID,
  translationOrDefault,
  type BundledTranslation,
} from '@/bible/translations.ts';
import type { VerseRange } from '@/bible/verse-id.ts';

import { TRANSLATION_ASSETS } from './assets';
import {
  readHeadings,
  readNotes,
  readRange,
  type ScriptureNote,
  type ScriptureVerse,
} from './queries';

const STORAGE_KEY = 'reader.translation';
const stampKey = (id: string) => `reader.stamp.${id}`;

type ScriptureValue = {
  readonly translation: BundledTranslation;
  readonly choose: (id: string) => void;
};

const ScriptureContext = createContext<ScriptureValue | undefined>(undefined);

type Opening = { readonly id: string; readonly forceOverwrite: boolean };

export function ScriptureProvider({ children }: { readonly children: ReactNode }) {
  // `undefined` while we are still reading the last choice off disk.
  const [opening, setOpening] = useState<Opening | undefined>(undefined);

  /**
   * Decide how to open a translation: normally the cached copy, but a fresh
   * extract when the bundled file's stamp differs from the one we last
   * extracted. Without that, a device would keep an old ingest forever.
   */
  const resolve = useCallback(async (wanted: string | null): Promise<Opening> => {
    const chosen = translationOrDefault(wanted);
    let extracted: string | null = null;
    try {
      extracted = await Storage.getItem(stampKey(chosen.id));
    } catch {
      extracted = null;
    }
    return { id: chosen.id, forceOverwrite: extracted !== chosen.stamp };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Storage.getItem(STORAGE_KEY)
      .then(resolve, () => resolve(DEFAULT_TRANSLATION_ID))
      .then((next) => {
        if (!cancelled) setOpening(next);
      });
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  const choose = useCallback(
    (next: string) => {
      const chosen = translationOrDefault(next);
      void Storage.setItem(STORAGE_KEY, chosen.id);
      void resolve(chosen.id).then(setOpening);
    },
    [resolve],
  );

  const id = opening?.id;

  const translation = translationOrDefault(id);
  const value = useMemo(() => ({ translation, choose }), [translation, choose]);

  // Opening the wrong database first would only make the reader flicker.
  if (!opening) return null;

  return (
    <ScriptureContext.Provider value={value}>
      <SQLiteProvider
        key={`${opening.id}:${opening.forceOverwrite}`}
        databaseName={`${opening.id}.db`}
        assetSource={{
          assetId: TRANSLATION_ASSETS[opening.id],
          forceOverwrite: opening.forceOverwrite,
        }}
        onInit={async () => {
          // Only record the stamp once the copy is actually in place.
          try {
            await Storage.setItem(stampKey(opening.id), translation.stamp);
          } catch {
            // A device that cannot remember it just re-extracts next launch.
          }
        }}
      >
        {children}
      </SQLiteProvider>
    </ScriptureContext.Provider>
  );
}

export function useTranslation(): ScriptureValue {
  const value = useContext(ScriptureContext);
  if (!value) throw new Error('useTranslation must be used inside <ScriptureProvider>');
  return value;
}

export type Passage = {
  readonly verses: readonly ScriptureVerse[];
  /** Headings that stand before a verse, keyed by that verse's id. */
  readonly headings: ReadonlyMap<number, string>;
  readonly notes: readonly ScriptureNote[];
  readonly loading: boolean;
};

const EMPTY: Passage = { verses: [], headings: new Map(), notes: [], loading: false };

/**
 * Everything needed to render a range, re-read whenever the range or the
 * selected translation changes. All three queries are range scans over the
 * same bounds, so they go out together.
 */
export function usePassage(range: VerseRange | undefined): Passage {
  const db = useSQLiteContext();
  const [passage, setPassage] = useState<Passage>(EMPTY);
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    if (start === undefined || end === undefined) {
      setPassage(EMPTY);
      return;
    }
    let cancelled = false;
    setPassage((current) => ({ ...current, loading: true }));

    const bounds = { start, end };
    Promise.all([readRange(db, bounds), readHeadings(db, bounds), readNotes(db, bounds)]).then(
      ([verses, headings, notes]) => {
        if (!cancelled) setPassage({ verses, headings, notes, loading: false });
      },
      () => {
        if (!cancelled) setPassage(EMPTY);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [db, start, end]);

  return passage;
}
