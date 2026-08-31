import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AppNavigation, directionForNextScreen } from '@/components/navigation';
import { animationForRoute } from '@/navigation/order.ts';
import { Colors } from '@/constants/theme';
import { AuthGate } from '@/auth/gate';
import { AuthProvider } from '@/auth/provider';
import { CircleProvider } from '@/circles/provider';
import { SyncOnStart } from '@/sync/on-start';
import { MarksProvider } from '@/marks/provider';
import { PlanProvider } from '@/plans/provider';
import { ProgressProvider } from '@/progress/provider';
import { ScriptureProvider } from '@/scripture/provider';

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <AuthGate>
          <ScriptureProvider>
            <ProgressProvider>
              <PlanProvider>
                <MarksProvider>
                  <CircleProvider>
                  <SyncOnStart />
                  <AppNavigation>
                    <Stack
                      // A function, not an object: it is evaluated as each
                      // screen is pushed, which is what lets the tab bar
                      // decide the direction of travel a moment beforehand.
                      screenOptions={({ route }) => ({
                        headerShown: false,
                        animation: animationForRoute(
                          route.name,
                          route.params,
                          directionForNextScreen(),
                        ),
                        // iOS drops the interactive back gesture on a screen
                        // that arrives with anything but the default
                        // animation, unless the gesture is told to use that
                        // animation too. Without this, every chapter opened
                        // by the back arrow could not be swiped out of.
                        animationMatchesGesture: true,
                        contentStyle: { backgroundColor: theme.background },
                      })}
                    />
                  </AppNavigation>
                  </CircleProvider>
                </MarksProvider>
              </PlanProvider>
            </ProgressProvider>
          </ScriptureProvider>
        </AuthGate>
      </AuthProvider>
    </>
  );
}
