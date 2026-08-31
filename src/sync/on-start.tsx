/**
 * Bringing a device level with the server, once, on the way in.
 *
 * A component rather than something inside a provider because it has to sit
 * below all of them: the sync writes to the device's own tables, and the
 * providers that own those tables have to be told to re-read afterwards.
 *
 * It renders nothing and it never reports failure. Someone opening the app on
 * a train has their own reading, their own marks and the whole Bible already
 * on the device; a sync that cannot reach the server should be invisible, not
 * an error over a chapter.
 */

import { useEffect, useRef } from 'react';

import { useMarks } from '@/marks/provider';
import { useProgress } from '@/progress/provider';
import { syncNow } from './sync';

export function SyncOnStart() {
  const { refresh: refreshProgress, ready: progressReady } = useProgress();
  const { refresh: refreshMarks, ready: marksReady } = useMarks();
  // Once per launch. Without this the effect would run again on every
  // refresh it itself causes.
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !progressReady || !marksReady) return;
    done.current = true;

    void (async () => {
      try {
        const { pulled } = await syncNow();
        // Only disturb the screen if something actually arrived.
        if (pulled.reading > 0 || pulled.marks > 0 || pulled.notes > 0) {
          refreshProgress();
          refreshMarks();
        }
      } catch {
        // Offline, or signed out, or the server is unwell. The device knows
        // its own reading either way, and the next launch will try again.
      }
    })();
  }, [progressReady, marksReady, refreshProgress, refreshMarks]);

  return null;
}
