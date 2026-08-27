import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AppNavigation } from '@/components/navigation';
import { Colors } from '@/constants/theme';
import { AuthGate } from '@/auth/gate';
import { AuthProvider } from '@/auth/provider';
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
                  <AppNavigation>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: theme.background },
                      }}
                    />
                  </AppNavigation>
                </MarksProvider>
              </PlanProvider>
            </ProgressProvider>
          </ScriptureProvider>
        </AuthGate>
      </AuthProvider>
    </>
  );
}
