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

import {
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/**
 * The open database.
 *
 * This is ours rather than expo-sqlite's `SQLiteProvider` for one reason:
 * that provider renders `null` while it opens a file, which unmounts every
 * child. The router is one of those children, and a navigator that unmounts
 * loses its history — on the web it is rebuilt from the URL and nobody
 * notices, but on a phone there is no URL to rebuild from, so changing
 * translation mid-chapter threw the reader back to Today.
 *
 * Here the previous database stays open and mounted until the next one is
 * ready, so a switch never blanks the tree.
 *
 * The cost is `importDatabaseFromAssetAsync`, which expo-sqlite exports but
 * documents as "exposed only for testing purposes". It is the only way to do
 * the asset copy that `SQLiteProvider` does internally, and the two steps here
 * are exactly what `openDatabaseWithInitAsync` does in that file. If an
 * expo-sqlite upgrade ever removes it, the fix is to vendor the same two calls
 * — not to go back to wrapping the router in a provider that unmounts it.
 */
const DatabaseContext = createContext<SQLiteDatabase | undefined>(undefined);

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

  const [database, setDatabase] = useState<SQLiteDatabase | undefined>(undefined);
  // The handle currently handed out, tracked outside state so closing the one
  // it replaces is not done inside a state updater — React may call an updater
  // more than once, and closing a database twice is not free of consequence.
  const open = useRef<SQLiteDatabase | undefined>(undefined);

  useEffect(() => {
    if (!opening) return;
    let cancelled = false;

    void (async () => {
      const name = `${opening.id}.db`;
      try {
        await importDatabaseFromAssetAsync(name, {
          assetId: TRANSLATION_ASSETS[opening.id],
          forceOverwrite: opening.forceOverwrite,
        });
        const next = await openDatabaseAsync(name);
        if (cancelled) {
          await next.closeAsync().catch(() => {});
          return;
        }
        // Only record the stamp once the copy is actually in place.
        try {
          await Storage.setItem(stampKey(opening.id), translationOrDefault(opening.id).stamp);
        } catch {
          // A device that cannot remember it just re-extracts next launch.
        }
        // Swap first, then close: a query still in flight against the old
        // handle fails into usePassage's error path and is re-run against the
        // new one, which is far better than an unmounted screen.
        const previous = open.current;
        open.current = next;
        setDatabase(next);
        if (previous) void previous.closeAsync().catch(() => {});
      } catch {
        // Leaves whatever was already open in place rather than blanking the
        // app: the reader keeps working in the previous translation, which is
        // a far better failure than an empty screen.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opening]);

  // Only before the very first database is open. After that a switch is
  // invisible to everything below.
  if (!database) return null;

  return (
    <ScriptureContext.Provider value={value}>
      <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>
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
  const db = useContext(DatabaseContext);
  const start = range?.start;
  const end = range?.end;

  // What was last read, and what it was read for. Keeping the bounds beside
  // the result is what lets "still loading" be derived rather than stored: if
  // the answer on hand was fetched for different bounds, it is stale by
  // definition. Setting a loading flag from inside the effect instead would
  // be a synchronous render-triggering write, which is both a cascading
  // render and something the React Compiler will not optimise around.
  const [result, setResult] = useState<{
    readonly db?: SQLiteDatabase;
    readonly start?: number;
    readonly end?: number;
    readonly passage: Passage;
  }>({ passage: EMPTY });

  useEffect(() => {
    if (!db || start === undefined || end === undefined) return;
    let cancelled = false;

    const bounds = { start, end };
    Promise.all([readRange(db, bounds), readHeadings(db, bounds), readNotes(db, bounds)]).then(
      ([verses, headings, notes]) => {
        if (!cancelled) {
          setResult({ db, start, end, passage: { verses, headings, notes, loading: false } });
        }
      },
      () => {
        if (!cancelled) setResult({ db, start, end, passage: EMPTY });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [db, start, end]);

  if (!db || start === undefined || end === undefined) return EMPTY;

  const fresh = result.db === db && result.start === start && result.end === end;
  // Until the new bounds arrive, the previous passage stays on screen marked
  // loading — the same as before. Blanking the page between two chapters
  // reads as a fault rather than as work in progress.
  return fresh ? result.passage : { ...result.passage, loading: true };
}
