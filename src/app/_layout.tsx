import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AppNavigation, directionForNextScreen } from '@/components/navigation';
import { Colors } from '@/constants/theme';
import { AuthGate } from '@/auth/gate';
import { AuthProvider } from '@/auth/provider';
import { CircleProvider } from '@/circles/provider';
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
                  <AppNavigation>
                    <Stack
                      // A function, not an object: it is evaluated as each
                      // screen is pushed, which is what lets the tab bar decide
                      // the direction of travel a moment beforehand.
                      screenOptions={() => ({
                        headerShown: false,
                        animation: directionForNextScreen(),
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
