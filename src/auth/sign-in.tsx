/**
 * Signing in: an email address, then the code that arrives.
 *
 * The code's length is not ours to decide — it is a server setting, and a
 * hosted project does not have to match whatever the local stack is
 * configured for. Accept a range rather than baking a number into the input,
 * or a project with a different setting produces a field that silently refuses
 * the very code it just issued.
 *
 * No password to invent or forget, and no link to tap — which matters, because
 * getting a link to open the right app on the right device is the part that
 * goes wrong for the people this app is for.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAuth } from './provider';

/** Supabase issues six by default and can be configured longer. */
const CODE_MIN = 6;
const CODE_MAX = 10;

export function SignInScreen() {
  const theme = useTheme();
  const { sendCode, verifyCode, offline } = useAuth();

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  const looksLikeEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  async function attempt(work: () => Promise<void>, onDone?: () => void) {
    // Whichever way this was reached — the return key, or the button — the
    // keyboard has done its job and should get out of the way.
    Keyboard.dismiss();
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
      onDone?.();
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Something went wrong.';
      setProblem(
        /rate limit|too many/i.test(raw)
          ? 'Too many codes requested. Wait a few minutes — or if one already reached you, enter it below.'
          : raw,
      );
      // A code sent earlier is still good, so being unable to send another
      // must not trap someone on this screen with nowhere to type it.
      if (/rate limit|too many/i.test(raw)) setStage('code');
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
      {/* A dismiss layer *behind* the content, not wrapped around it. Wrapping
          was the obvious thing and it was wrong: the outer press handler
          swallowed the tap meant for the field, so the keyboard could never be
          summoned in the first place. Underneath, it only catches the taps
          that miss everything else. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={Keyboard.dismiss}
        accessible={false}
      />
      {/* The content is centred, so without this the keyboard covers exactly
          the things you need next: "Send my code", "I already have a code",
          and "Sign in". Worse on the code step — an iOS number pad has no
          return key, so there is no way to dismiss it from the keyboard at
          all, and the button underneath it was the only way forward. */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
                ? 'Your email address is all we need. We’ll send a short code — there’s no password to remember.'
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
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (looksLikeEmail) attempt(() => sendCode(email), () => setStage('code'));
                }}
                returnKeyType="send"
              />
              <Action
                label="Send my code"
                busy={busy}
                disabled={!looksLikeEmail}
                onPress={() => attempt(() => sendCode(email), () => setStage('code'))}
              />
              <Pressable
                onPress={() => {
                  setProblem(undefined);
                  setStage('code');
                }}
                disabled={!looksLikeEmail}
                accessibilityRole="button"
                style={styles.already}
              >
                <ThemedText type="small" themeColor={looksLikeEmail ? 'accent' : 'textFaint'}>
                  I already have a code
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                style={[styles.input, styles.codeInput, field]}
                value={code}
                onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_MAX))}
                placeholder="––––––"
                placeholderTextColor={theme.textFaint}
                inputMode="numeric"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (code.length >= CODE_MIN) attempt(() => verifyCode(email, code));
                }}
              />
              <Action
                label="Sign in"
                busy={busy}
                disabled={code.length < CODE_MIN}
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
      </KeyboardAvoidingView>
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
  avoider: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  container: {
    flex: 1,
    width: '100%',
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
  already: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  problem: { borderLeftWidth: 2, paddingLeft: Spacing.three },
});
