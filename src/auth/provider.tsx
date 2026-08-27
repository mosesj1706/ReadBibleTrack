/**
 * Who is signed in, and who they are.
 *
 * Two separate things, deliberately. A session says the email was verified; a
 * profile says what to call the person in a circle. Someone can hold the first
 * without the second — that is the gap the name screen fills.
 */

import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/supabase/client';

export type Profile = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

type AuthValue = {
  readonly session: Session | null;
  readonly profile: Profile | null;
  /** True until the stored session has been read back at launch. */
  readonly loading: boolean;
  /** Set when the server could not be reached at launch. */
  readonly offline: boolean;
  readonly sendCode: (email: string) => Promise<void>;
  readonly verifyCode: (email: string, code: string) => Promise<void>;
  readonly saveName: (displayName: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

/** Supabase errors are readable; anything else should not reach a person raw. */
function readable(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(fallback);
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    setProfile(
      data ? { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url } : null,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    // getSession does not merely fail when the server is unreachable — it
    // *hangs*. supabase-js retries an expiring token with backoff, so the
    // promise never settles, and a plain catch never runs. Without a deadline
    // the gate renders nothing for ever: a blank screen, no message, no way
    // out. Reading needs no network at all, so waiting on one is the wrong
    // default.
    const deadline = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 5000),
    );

    Promise.race([supabase.auth.getSession(), deadline])
      .then(async (result) => {
        if (cancelled) return;
        if (result === 'timeout') {
          setOffline(true);
          return;
        }
        setSession(result.data.session);
        await loadProfile(result.data.session?.user.id);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadProfile(next?.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const sendCode = useCallback(async (email: string) => {
    setOffline(false);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) throw readable(error, 'Could not send the code.');
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw readable(error, 'That code did not work.');
  }, []);

  const saveName = useCallback(
    async (displayName: string) => {
      const id = session?.user.id;
      if (!id) throw new Error('Not signed in.');

      const { error } = await supabase
        .from('profiles')
        .upsert({ id, display_name: displayName.trim(), updated_at: new Date().toISOString() });
      if (error) throw readable(error, 'Could not save that name.');
      await loadProfile(id);
    },
    [session, loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, offline, sendCode, verifyCode, saveName, signOut }),
    [session, profile, loading, offline, sendCode, verifyCode, saveName, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
