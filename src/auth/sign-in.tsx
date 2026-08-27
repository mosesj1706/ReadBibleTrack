/**
 * Signing in: an email address, then a six-digit code.
 *
 * No password to invent or forget, and no link to tap — which matters, because
 * getting a link to open the right app on the right device is the part that
 * goes wrong for the people this app is for.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAuth } from './provider';

export function SignInScreen() {
  const theme = useTheme();
  const { sendCode, verifyCode, offline } = useAuth();

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  // `autoFocus` is not enough here: the field mounts as the screen swaps, and
  // on iOS it comes up without the keyboard, leaving someone staring at a code
  // they cannot type. Focus it once it has actually mounted.
  const codeField = useRef<TextInput>(null);
  useEffect(() => {
    if (stage !== 'code') return;
    const timer = setTimeout(() => codeField.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [stage]);

  const looksLikeEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  async function attempt(work: () => Promise<void>, onDone?: () => void) {
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
      onDone?.();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const field = {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
    color: theme.text,
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
            ReadBibleTrack
          </ThemedText>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            {stage === 'email' ? 'Read together' : 'Check your email'}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.blurb}>
            {stage === 'email'
              ? 'Your email address is all we need. We’ll send a six-digit code — there’s no password to remember.'
              : `We sent a code to ${email.trim()}. It’s good for an hour.`}
          </ThemedText>
        </View>

        {stage === 'email' ? (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, field]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              inputMode="email"
              keyboardType="email-address"
              editable={!busy}
              autoFocus
              onSubmitEditing={() =>
                looksLikeEmail && attempt(() => sendCode(email), () => setStage('code'))
              }
              returnKeyType="send"
            />
            <Action
              label="Send my code"
              busy={busy}
              disabled={!looksLikeEmail}
              onPress={() => attempt(() => sendCode(email), () => setStage('code'))}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              ref={codeField}
              style={[styles.input, styles.codeInput, field]}
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={theme.textFaint}
              inputMode="numeric"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              editable={!busy}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => code.length === 6 && attempt(() => verifyCode(email, code))}
            />
            <Action
              label="Sign in"
              busy={busy}
              disabled={code.length !== 6}
              onPress={() => attempt(() => verifyCode(email, code))}
            />
            <Pressable
              onPress={() => {
                setStage('email');
                setCode('');
                setProblem(undefined);
              }}
              accessibilityRole="button"
            >
              <ThemedText type="small" themeColor="accent" style={styles.back}>
                Use a different email
              </ThemedText>
            </Pressable>
          </View>
        )}

        {offline && !problem ? (
          <View style={[styles.problem, { borderLeftColor: theme.textFaint }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Can’t reach the server just now. Signing in needs a connection —
              reading does not, once you are in.
            </ThemedText>
          </View>
        ) : null}

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

function Action({
  label,
  busy,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={[
        styles.action,
        { backgroundColor: off ? theme.backgroundSelected : theme.accent },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.background} />
      ) : (
        <ThemedText
          type="smallBold"
          style={{ color: off ? theme.textFaint : theme.background }}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
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
  title: { fontSize: 38, lineHeight: 42, fontWeight: '400' },
  blurb: { maxWidth: 420 },
  form: { gap: Spacing.three },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 17,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
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
