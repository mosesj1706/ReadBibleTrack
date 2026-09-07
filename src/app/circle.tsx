/**
 * The circle: who you read with, and how far you have got together.
 *
 * This is the screen the whole project exists for. Everything before it works
 * just as well alone.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canonSpan, normaliseRanges, type VerseRange } from '@/bible/verse-id.ts';
import { TOTAL_VERSES, countVerses, progressThrough } from '@/bible/versification.ts';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise  } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/provider';
import {
  CIRCLE_KINDS,
  createCircle,
  joinByCode,
  leaveCircle,
  membersOf,
  myCircles,
  type Circle,
  type CircleKind,
  type Member,
} from '@/circles/store';
import { pullCircleReading, pushMine, type MemberReading } from '@/sync/sync';
import { today } from '@/progress/store';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function CircleScreen() {
  const theme = useTheme();
  // The ground drifts against this, so scrolling reads as a near plane moving
  // over a far one rather than content sliding on a flat colour.
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });
  const { width } = useWindowDimensions();
  const wide = width >= WideBreakpoint;
  const { session } = useAuth();
  const me = session?.user.id;

  const [circle, setCircle] = useState<Circle | undefined>();
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [reading, setReading] = useState<readonly MemberReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CircleKind>('family');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      const circles = await myCircles();
      const first = circles[0];
      setCircle(first);
      if (first) {
        const [people, read] = await Promise.all([membersOf(first.id), pullCircleReading()]);
        setMembers(people);
        setReading(read);
      } else {
        setMembers([]);
        setReading([]);
      }
      // Cleared once the load has actually worked, not on the way in. Blanking
      // it first meant a failing reload flashed the old error away and then
      // put it straight back, and made this a synchronous state write inside
      // the mount effect that calls it.
      setProblem(undefined);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load your circle.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `load` awaits before it touches any state, so nothing here is a
    // synchronous render-triggering write — the rule cannot see past the call
    // boundary. Fetching on mount is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setProblem(undefined);
    try {
      await work();
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(undefined);
    }
  }

  // The circle's progress is the union of everyone's ranges — one set, not a
  // sum, so reading the same chapter as someone else does not count twice.
  const together = normaliseRanges(reading.flatMap((person) => person.ranges as VerseRange[]));
  const share = progressThrough([canonSpan()], together);
  const todayIso = today();

  if (loading) {
    return (
      <Ground style={styles.screen} scroll={scrolled}>
        <SafeAreaView style={[styles.container, styles.middle]}>
          <ActivityIndicator color={theme.accent} />
        </SafeAreaView>
      </Ground>
    );
  }

  return (
    <Ground style={styles.screen} scroll={scrolled}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={leave} accessibilityRole="button" style={styles.leaveBtn}>
            <ThemedText type="small" themeColor="accent">
              ‹ Today
            </ThemedText>
          </Pressable>
        </View>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {circle ? (
            <>
              <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
                {circle.name}
              </ThemedText>

              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Together
                </ThemedText>
                <ThemedText type="subtitle" style={{ fontFamily: Fonts.serif, fontSize: 30 }}>
                  {countVerses(together).toLocaleString()}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  of {TOTAL_VERSES.toLocaleString()} verses · {(share * 100).toFixed(1)}%
                </ThemedText>
                <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={{
                      width: `${Math.min(100, share * 100)}%`,
                      height: '100%',
                      backgroundColor: theme.accent,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>

              <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                {members.length === 1 ? 'Just you so far' : `${members.length} reading`}
              </ThemedText>

              {members.map((member) => {
                const theirs = reading.find((r) => r.userId === member.userId);
                const readToday = theirs?.lastReadOn === todayIso;
                return (
                  <View
                    key={member.userId}
                    style={[
                      styles.member,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: readToday ? theme.accent : theme.backgroundSelected },
                      ]}
                    />
                    <View style={styles.grow}>
                      <ThemedText type="smallBold">
                        {member.displayName}
                        {member.userId === me ? ' (you)' : ''}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {readToday
                          ? 'Read today'
                          : theirs?.lastReadOn
                            ? `Last read ${theirs.lastReadOn}`
                            : 'Not started'}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textFaint">
                      {theirs ? `${countVerses(theirs.ranges as VerseRange[])}` : '0'}
                    </ThemedText>
                  </View>
                );
              })}

              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Invite code
                </ThemedText>
                <ThemedText style={[styles.code, { fontFamily: Fonts.mono, color: theme.accent }]}>
                  {circle.joinCode}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Read it out, or send the link. Either gets them in.
                </ThemedText>
                <Pressable
                  onPress={() =>
                    void Share.share({
                      message: `Read with us on ReadBibleTrack — join “${circle.name}” with the code ${circle.joinCode}.`,
                    })
                  }
                  accessibilityRole="button"
                  style={[styles.action, { backgroundColor: theme.accent }]}
                >
                  <ThemedText type="smallBold" style={{ color: theme.background }}>
                    Share the invite
                  </ThemedText>
                </Pressable>
              </View>

              <Pressable
                onPress={() => run('sync', pushMine)}
                accessibilityRole="button"
                style={[styles.outline, { borderColor: theme.accent }]}
              >
                {busy === 'sync' ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <ThemedText type="smallBold" themeColor="accent">
                    Send my reading to the circle
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                onPress={() => run('leave', () => leaveCircle(circle.id))}
                accessibilityRole="button"
                style={styles.quiet}
              >
                <ThemedText type="small" themeColor="textFaint">
                  Leave this circle
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText type="title" style={[styles.title, { fontFamily: Fonts.serif }]}>
                Read with someone
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                A circle is the point of this app. Everything else works just as
                well on your own.
              </ThemedText>

              <View style={wide ? styles.choices : undefined}>
              <Rise style={wide ? styles.choice : undefined}>
              <Card style={styles.card}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Start one
                </ThemedText>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="The Hendersons"
                  placeholderTextColor={theme.textFaint}
                  maxLength={60}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, fontFamily: Fonts.serif },
                  ]}
                />
                <View style={styles.kinds}>
                  {CIRCLE_KINDS.map((option) => {
                    const on = kind === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setKind(option.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.kind,
                          {
                            backgroundColor: on ? theme.accentSoft : theme.background,
                            borderColor: on ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>
                          {option.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                <ThemedText type="small" themeColor="textFaint">
                  {CIRCLE_KINDS.find((k) => k.id === kind)?.blurb}
                </ThemedText>
                <Pressable
                  onPress={() => run('create', () => createCircle(name, kind))}
                  disabled={!name.trim() || busy !== undefined}
                  accessibilityRole="button"
                  style={[
                    styles.action,
                    {
                      backgroundColor: name.trim() ? theme.accent : theme.backgroundSelected,
                    },
                  ]}
                >
                  {busy === 'create' ? (
                    <ActivityIndicator color={theme.background} />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={{ color: name.trim() ? theme.background : theme.textFaint }}
                    >
                      Create the circle
                    </ThemedText>
                  )}
                </Pressable>
              </Card>
              </Rise>

              <Rise delay={80} style={wide ? styles.choice : undefined}>
              <Card style={styles.card}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Or join one
                </ThemedText>
                <TextInput
                  value={code}
                  onChangeText={(next) => setCode(next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="HOUSE7"
                  placeholderTextColor={theme.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    styles.codeInput,
                    { color: theme.text, borderColor: theme.border, fontFamily: Fonts.mono },
                  ]}
                />
                <Pressable
                  onPress={() => run('join', () => joinByCode(code))}
                  disabled={code.length < 4 || busy !== undefined}
                  accessibilityRole="button"
                  style={[
                    styles.action,
                    {
                      backgroundColor: code.length >= 4 ? theme.accent : theme.backgroundSelected,
                    },
                  ]}
                >
                  {busy === 'join' ? (
                    <ActivityIndicator color={theme.background} />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={{ color: code.length >= 4 ? theme.background : theme.textFaint }}
                    >
                      Join
                    </ThemedText>
                  )}
                </Pressable>
              </Card>
              </Rise>
              </View>
            </>
          )}

          {problem ? (
            <View style={[styles.problem, { borderLeftColor: theme.redLetter }]}>
              <ThemedText type="small" style={{ color: theme.redLetter }}>
                {problem}
              </ThemedText>
            </View>
          ) : null}
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  container: { flex: 1, width: '100%', maxWidth: MaxPageWidth },
  middle: { alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  leaveBtn: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  // Starting a circle and joining one are the same decision seen from two
  // sides, so on a display they sit beside each other rather than one under
  // the other with the room to the right left empty.
  choices: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  choice: { flex: 1 },
  card: { padding: Spacing.three, gap: Spacing.two },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.one },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    minHeight: 56,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grow: { flexGrow: 1, flexShrink: 1, gap: Spacing.half },
  code: {
    fontSize: 34,
    // ThemedText's default type is 16/24, and overriding only the size leaves
    // a 34px glyph in a 24px line box — the tops and tails of the letters were
    // sliced off. A code you cannot read is the one thing this card is for.
    lineHeight: 44,
    letterSpacing: 6,
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    fontSize: 18,
  },
  codeInput: { fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  kinds: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  kind: {
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    minHeight: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: {
    minHeight: 48,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  problem: { borderLeftWidth: 2, paddingLeft: Spacing.three, paddingVertical: Spacing.two },
});
