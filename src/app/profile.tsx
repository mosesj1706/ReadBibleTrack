/**
 * Who you are, as your circle sees you.
 *
 * Email comes from the account and cannot be edited here — changing it is an
 * authentication matter, not a profile one, and pretending otherwise would let
 * someone write an address they had never proved they owned.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Animated } from '@/components/motion';
import { Card, Ground } from '@/components/surfaces';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/provider';


export default function ProfileScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const { session, profile, saveProfile, signOut, deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  // Adjusted during render rather than in an effect. An effect would paint
  // the old profile's values once and then correct them, and React re-runs
  // this immediately without showing the intermediate state.
  const [lastProfile, setLastProfile] = useState(profile);
  if (profile !== lastProfile) {
    setLastProfile(profile);
    setName(profile?.displayName ?? '');
    setPhone(profile?.phone ?? '');
  }

  const email = session?.user.email ?? '';
  const nameOk = name.trim().length > 0 && name.trim().length <= 60;
  // Loose on purpose: numbers are written every imaginable way.
  const phoneOk = phone.trim() === '' || /^\+?[0-9 ()\-]{6,24}$/.test(phone.trim());
  const changed = name.trim() !== (profile?.displayName ?? '') || phone.trim() !== (profile?.phone ?? '');

  async function save() {
    setBusy(true);
    setProblem(undefined);
    setSaved(false);
    try {
      await saveProfile({ displayName: name, phone: phone.trim() || null });
      setSaved(true);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const field = {
    backgroundColor: theme.background,
    borderColor: theme.border,
    color: theme.text,
  };

  return (
    <Ground scroll={scrolled}>
      <SafeAreaView style={styles.frame}>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
            Your details
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your circle sees these, and nobody else. They are how a family
            reaches each other, not how you sign in.
          </ThemedText>

          <Card style={styles.card}>
            <ThemedText type="small" themeColor="textFaint" style={styles.label}>
              Name
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Anna"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={60}
              style={[styles.input, field, { fontFamily: Fonts.serif, fontSize: 20 }]}
            />

            <ThemedText type="small" themeColor="textFaint" style={styles.label}>
              Phone
            </ThemedText>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={theme.textFaint}
              inputMode="tel"
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={24}
              style={[
                styles.input,
                field,
                !phoneOk ? { borderColor: theme.redLetter } : undefined,
              ]}
            />
            {!phoneOk ? (
              <ThemedText type="small" style={{ color: theme.redLetter }}>
                That does not look like a number. Digits, spaces and brackets are
                all fine, and a leading + if you want the country code.
              </ThemedText>
            ) : null}

            <ThemedText type="small" themeColor="textFaint" style={styles.label}>
              Email
            </ThemedText>
            <View style={[styles.input, styles.readOnly, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {email}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textFaint">
              This is the address you sign in with, so it is not editable here.
            </ThemedText>
          </Card>

          <Pressable
            onPress={save}
            disabled={!nameOk || !phoneOk || !changed || busy}
            accessibilityRole="button"
            style={[
              styles.action,
              {
                backgroundColor:
                  nameOk && phoneOk && changed && !busy ? theme.accent : theme.backgroundSelected,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText
                type="smallBold"
                style={{
                  color: nameOk && phoneOk && changed ? theme.background : theme.textFaint,
                }}
              >
                {saved && !changed ? 'Saved' : 'Save'}
              </ThemedText>
            )}
          </Pressable>

          {problem ? (
            <View style={[styles.problem, { borderLeftColor: theme.redLetter }]}>
              <ThemedText type="small" style={{ color: theme.redLetter }}>
                {problem}
              </ThemedText>
            </View>
          ) : null}

          <Pressable onPress={() => void signOut()} accessibilityRole="button" style={styles.quiet}>
            <ThemedText type="small" themeColor="textFaint">
              Sign out
            </ThemedText>
          </Pressable>

          {/* Two taps, not one, and the second one says what it does rather
              than "Confirm". Deletion cannot be undone, and this sits at the
              foot of a screen someone scrolls to change their name. */}
          {!confirming ? (
            <Pressable
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
              style={styles.quiet}
            >
              <ThemedText type="small" themeColor="textFaint">
                Delete my account
              </ThemedText>
            </Pressable>
          ) : (
            <Card style={styles.danger}>
              <ThemedText type="smallBold">Delete your account?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your reading, your highlights, your notes and this account go
                for good, on every device. It cannot be undone. A circle you
                started stays with the people still in it.
              </ThemedText>
              <View style={styles.dangerRow}>
                <Pressable
                  onPress={() => setConfirming(false)}
                  accessibilityRole="button"
                  disabled={deleting}
                  style={styles.quiet}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    Keep it
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDeleting(true);
                    setProblem(undefined);
                    void deleteAccount()
                      .catch((error: unknown) => {
                        setProblem(error instanceof Error ? error.message : 'Could not delete it.');
                        setConfirming(false);
                      })
                      .finally(() => setDeleting(false));
                  }}
                  accessibilityRole="button"
                  disabled={deleting}
                  style={[styles.destroy, { borderColor: theme.redLetter }]}
                >
                  {deleting ? (
                    <ActivityIndicator color={theme.redLetter} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: theme.redLetter }}>
                      Delete everything
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </Card>
          )}
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%' },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  card: { gap: Spacing.two },
  label: { textTransform: 'uppercase', letterSpacing: 1.2, marginTop: Spacing.one },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    fontSize: 17,
  },
  readOnly: { justifyContent: 'center' },
  action: {
    minHeight: 48,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  danger: { gap: Spacing.two, marginTop: Spacing.two },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  destroy: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  problem: { borderLeftWidth: 2, paddingLeft: Spacing.three, paddingVertical: Spacing.two },
});
