/**
 * What a person sees before they are ready to read.
 *
 * A gate rather than redirects to `/sign-in`: the URL is left alone, so someone
 * who opens an invite link, signs in, and picks a name lands back on the invite
 * rather than being bounced to the home screen having forgotten why they came.
 */

import type { ReactNode } from 'react';

import { ProfileSetupScreen } from './profile-setup';
import { useAuth } from './provider';
import { SignInScreen } from './sign-in';

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  // Reading the stored session is quick; flashing the sign-in screen at
  // someone who is already signed in is not worth a spinner.
  if (loading) return null;
  if (!session) return <SignInScreen />;
  if (!profile) return <ProfileSetupScreen />;
  return <>{children}</>;
}
