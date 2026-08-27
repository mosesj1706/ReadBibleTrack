/**
 * The Supabase client.
 *
 * Sessions are kept in AsyncStorage so a person stays signed in between
 * launches. `detectSessionInUrl` is off because we never sign in through a
 * link: the flow is an emailed six-digit code, which needs no deep-link
 * handling and behaves the same on every platform.
 *
 * The storage adapter is handed over only where there is somewhere to store
 * things. `web.output` is "static", so every route is prerendered in Node
 * first, and on web AsyncStorage is localStorage — which needs `window`.
 * supabase-js reads stored sessions as soon as the client is constructed, so
 * without this guard the prerender dies with "window is not defined" before a
 * single page renders. React Native defines `window`, so devices keep storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. Copy .env.example to .env.local — `npx supabase status` prints both for a local stack.',
  );
}

const canStore = typeof window !== 'undefined';

export const supabase = createClient(url, key, {
  auth: {
    storage: canStore ? AsyncStorage : undefined,
    persistSession: canStore,
    autoRefreshToken: canStore,
    detectSessionInUrl: false,
  },
});

// A backgrounded app should not keep refreshing tokens; a foregrounded one
// must, or the first request after a long sleep fails on an expired token.
if (canStore && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
