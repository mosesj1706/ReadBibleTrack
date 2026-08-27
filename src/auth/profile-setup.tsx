/**
 * The one thing we ask for after signing in: what a circle should call you.
 *
 * An email address is not a name. "mum@example.com read Luke 4 this morning"
 * is not the sentence this app exists to show.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAuth } from './provider';

export function ProfileSetupScreen() {
  const theme = useTheme();
  const { saveName, signOut, session } = useAuth();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  const usable = name.trim().length > 0 && name.trim().length <= 60;

  async function save() {
    setBusy(true);
    setProblem(undefined);
    try {
      await saveName(name);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that name.');
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
            Signed in as {session?.user.email}
          </ThemedText>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            What should we call you?
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.blurb}>
            This is the name your circle sees next to what you’ve read. First
            names are usually right.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                color: theme.text,
                fontFamily: Fonts.serif,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="Anna"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={60}
            editable={!busy}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => usable && save()}
          />

          <Pressable
            onPress={save}
            disabled={!usable || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !usable || busy, busy }}
            style={[
              styles.action,
              { backgroundColor: !usable || busy ? theme.backgroundSelected : theme.accent },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText
                type="smallBold"
                style={{ color: !usable ? theme.textFaint : theme.background }}
              >
                Continue
              </ThemedText>
            )}
          </Pressable>

          <Pressable onPress={() => void signOut()} accessibilityRole="button">
            <ThemedText type="small" themeColor="textFaint" style={styles.back}>
              Sign out
            </ThemedText>
          </Pressable>
        </View>

        {problem ? (
          <View style={[styles.problem, { borderLeftColor: theme.redLetter }]}>
            <ThemedText type="small" style={{ color: theme.redLetter }}>
              {problem}
            </ThemedText>
          </View>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  header: { gap: Spacing.two },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  blurb: { maxWidth: 420 },
  form: { gap: Spacing.three },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 22,
  },
  action: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  back: { textAlign: 'center' },
  problem: { borderLeftWidth: 2, paddingLeft: Spacing.three },
});
