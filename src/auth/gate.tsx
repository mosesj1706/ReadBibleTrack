/**
 * What a person sees before they are ready to read.
 *
 * A gate rather than redirects to `/sign-in`: the URL is left alone, so someone
 * who opens an invite link, signs in, and picks a name lands back on the invite
 * rather than being bounced to the home screen having forgotten why they came.
 */

import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';

import { ProfileSetupScreen } from './profile-setup';
import { isPublicRoute } from './public.ts';
import { useAuth } from './provider';
import { SignInScreen } from './sign-in';

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const { session, profile, loading, profileReady } = useAuth();

  // Before the session is even looked at, and before the loading pause below.
  // A privacy policy has to be readable by someone with no account — that is
  // what it is for — and the static export renders every page with no session
  // at all, so a gated one comes out of the build as a picture of the sign-in
  // screen.
  if (isPublicRoute(pathname)) return <>{children}</>;

  // Reading the stored session is quick; flashing the sign-in screen at
  // someone who is already signed in is not worth a spinner.
  if (loading) return null;
  if (!session) return <SignInScreen />;
  // Signing in sets the session at once and fetches the profile after. Asking
  // "do they have a profile?" before the answer is back showed the name screen
  // to someone who already had a name — briefly, and long enough to type over
  // it.
  if (!profileReady) return null;
  if (!profile) return <ProfileSetupScreen />;
  return <>{children}</>;
}
