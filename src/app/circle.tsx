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

import { canonSpan, intersectRanges, normaliseRanges, type VerseRange } from '@/bible/verse-id.ts';
import { portionsThrough } from '@/bible/plan.ts';
import { countVerses, progressThrough } from '@/bible/versification.ts';
import { Card, Ground } from '@/components/surfaces';
import { Animated, Rise  } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing, WideBreakpoint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/provider';
import { useCircle } from '@/circles/provider';
import { usePlan } from '@/plans/provider';
import {
  CIRCLE_KINDS,
  createCircle,
  joinByCode,
  leaveCircle,
  removeMember,
  setCirclePlan,
  type CircleKind,
} from '@/circles/store';
import { PLANS } from '@/plans/catalogue';
import { pullCircleReading, pushMine, type MemberReading } from '@/sync/sync';
import { today } from '@/progress/store';


/**
 * Starting a circle: what to call it, what kind it is, and what it will read.
 *
 * One component for both the first circle and every one after it. They were
 * two copies of the same form for about an hour, which is how the second one
 * came to be missing the plan chooser that this whole card exists to offer.
 *
 * The plan is offered here because agreeing what to read is part of starting a
 * circle, not an errand afterwards. Building one from scratch needs the circle
 * to exist first — it is stored on it — so that button makes the circle and
 * then opens the builder.
 */
function StartCircle({
  title,
  busy,
  onCreate,
}: {
  readonly title: string;
  readonly busy: boolean;
  readonly onCreate: (
    name: string,
    kind: CircleKind,
    planId: string | undefined,
    thenBuildYourOwn: boolean,
  ) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CircleKind>('family');
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  const ready = name.trim().length > 0 && !busy;
  const blurb = CIRCLE_KINDS.find((option) => option.id === kind)?.blurb;

  return (
    <Card style={styles.card}>
      <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
        {title}
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
          const on = option.id === kind;
          return (
            <Pressable
              key={option.id}
              onPress={() => setKind(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.kind,
                {
                  backgroundColor: on ? theme.accentSoft : theme.backgroundElement,
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
      {blurb ? (
        <ThemedText type="small" themeColor="textSecondary">
          {blurb}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
        What will you read?
      </ThemedText>
      <View style={styles.kinds}>
        <Pressable
          onPress={() => setPlanId(undefined)}
          accessibilityRole="button"
          accessibilityState={{ selected: planId === undefined }}
          style={[
            styles.kind,
            {
              backgroundColor:
                planId === undefined ? theme.accentSoft : theme.backgroundElement,
              borderColor: planId === undefined ? theme.accent : theme.border,
            },
          ]}
        >
          <ThemedText
            type="small"
            themeColor={planId === undefined ? 'accent' : 'textSecondary'}
          >
            Everyone keeps their own
          </ThemedText>
        </Pressable>
        {PLANS.filter((plan) => plan.kind !== 'open').map((plan) => {
          const on = plan.id === planId;
          return (
            <Pressable
              key={plan.id}
              onPress={() => setPlanId(plan.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.kind,
                {
                  backgroundColor: on ? theme.accentSoft : theme.backgroundElement,
                  borderColor: on ? theme.accent : theme.border,
                },
              ]}
            >
              <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>
                {plan.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => onCreate(name, kind, planId, false)}
        disabled={!ready}
        accessibilityRole="button"
        style={[
          styles.action,
          { backgroundColor: ready ? theme.accent : theme.backgroundSelected },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <ThemedText
            type="smallBold"
            style={{ color: ready ? theme.background : theme.textFaint }}
          >
            Create the circle
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        onPress={() => onCreate(name, kind, undefined, true)}
        disabled={!ready}
        accessibilityRole="button"
        style={styles.quiet}
      >
        <ThemedText type="small" themeColor={ready ? 'accent' : 'textFaint'}>
          Or build a plan of your own
        </ThemedText>
      </Pressable>
    </Card>
  );
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

  // The circles themselves live in the provider: the plan a circle has agreed
  // is read from there too, so which one is active cannot be a private fact of
  // this screen.
  const {
    circles,
    circle,
    choose,
    members,
    refresh: refreshCircles,
    isBlocked,
    unblock,
  } = useCircle();
  const [reading, setReading] = useState<readonly MemberReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  // Removing someone takes two taps, like deleting an account: it ends their
  // place in something shared, and cannot be undone from here.
  const [removing, setRemoving] = useState<string | undefined>();
  const [leaving, setLeaving] = useState(false);

  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      // Reading comes back for every member of every circle you are in; the
      // screen narrows it to the people on show.
      setReading(await pullCircleReading());
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
      refreshCircles();
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(undefined);
    }
  }

  function startCircle(
    name: string,
    kind: CircleKind,
    planId: string | undefined,
    thenBuildYourOwn: boolean,
  ) {
    void run('create', async () => {
      const made = await createCircle(name, kind);
      // The plan is set after the circle exists, because it is stored on it.
      if (planId) await setCirclePlan(made.id, planId);
      choose(made.id);
      // Building one from scratch needs the 66 books and a number of days,
      // which is a screen of its own rather than a third card here.
      if (thenBuildYourOwn) router.push('/plan');
    });
  }

  // The circle's progress is the union of everyone's ranges — one set, not a
  // sum, so reading the same chapter as someone else does not count twice.
  // Only the people on show: reading arrives for every circle you are in.
  const here = new Set(members.map((member) => member.userId));
  const mineToShow = reading.filter((person) => here.has(person.userId));
  const together = normaliseRanges(mineToShow.flatMap((person) => person.ranges as VerseRange[]));

  // Measured against the plan when the circle has agreed one. "412 of 1,189 in
  // the Gospels" is a sentence about what the circle set out to do; "412 of
  // 31,105" is a sentence about the Bible.
  const { plan, day, sharedWith } = usePlan();
  const planned = plan.kind !== 'open' && sharedWith !== undefined;
  const target = planned ? portionsThrough(plan, day) : [canonSpan()];
  const targetVerses = countVerses(target);
  const done = planned ? intersectRanges(together, target) : together;
  const share = progressThrough(target, done);
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

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {circle ? (
            <>
              {/* Only when there is a choice to make. A single circle needs
                  no chooser, and a row of one pill would be furniture. */}
              {circles.length > 1 ? (
                <View style={styles.switcher}>
                  {circles.map((one) => {
                    const on = one.id === circle.id;
                    return (
                      <Pressable
                        key={one.id}
                        onPress={() => choose(one.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.kind,
                          {
                            backgroundColor: on ? theme.accentSoft : theme.backgroundElement,
                            borderColor: on ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        <ThemedText type="small" themeColor={on ? 'accent' : 'textSecondary'}>
                          {one.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

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
                  {countVerses(done).toLocaleString()}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  of {targetVerses.toLocaleString()} verses{planned ? ` in ${plan.name}` : ''} ·{' '}
                  {(share * 100).toFixed(1)}%
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
                const isMe = member.userId === me;
                const blockedHere = isBlocked(member.userId);
                const mine = circle.createdBy === me;
                return (
                  <View
                    key={member.userId}
                    style={[
                      styles.memberBox,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                  >
                    {/* A plain Pressable rather than <Link asChild>: the Slot
                        that Link renders through cannot take an array of
                        styles, and finding that out cost a blank tab once. */}
                    <Pressable
                      onPress={() => router.push({ pathname: '/member/[id]', params: { id: member.userId } })}
                      accessibilityRole="button"
                      accessibilityLabel={`${member.displayName}'s reading`}
                      style={styles.memberTop}
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
                          {isMe ? ' (you)' : ''}
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
                      <ThemedText type="small" themeColor="textFaint">
                        ›
                      </ThemedText>
                    </Pressable>

                    {/* Only shown where there is something to do: a block to
                        undo, or a circle of your own to remove someone from.
                        Reading stays visible either way — a block is about
                        what someone writes, not about erasing them from the
                        thing you are doing together. */}
                    {!isMe && (blockedHere || mine) ? (
                      <View style={styles.memberActions}>
                        {blockedHere ? (
                          <>
                            <ThemedText type="small" themeColor="textFaint">
                              You do not see what they share.
                            </ThemedText>
                            <Pressable
                              onPress={() => run('unblock', () => unblock(member.userId))}
                              accessibilityRole="button"
                              disabled={busy !== undefined}
                              style={styles.quiet}
                            >
                              <ThemedText type="smallBold" themeColor="accent">
                                Unblock
                              </ThemedText>
                            </Pressable>
                          </>
                        ) : null}

                        {mine && removing === member.userId ? (
                          <>
                            <ThemedText type="small" themeColor="textSecondary">
                              Remove {member.displayName} from this circle?
                            </ThemedText>
                            <Pressable
                              onPress={() => setRemoving(undefined)}
                              accessibilityRole="button"
                              style={styles.quiet}
                            >
                              <ThemedText type="smallBold" themeColor="accent">
                                Keep them
                              </ThemedText>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                setRemoving(undefined);
                                void run('remove', () => removeMember(circle.id, member.userId));
                              }}
                              accessibilityRole="button"
                              disabled={busy !== undefined}
                              style={styles.quiet}
                            >
                              <ThemedText type="smallBold" style={{ color: theme.redLetter }}>
                                Remove
                              </ThemedText>
                            </Pressable>
                          </>
                        ) : mine ? (
                          <Pressable
                            onPress={() => setRemoving(member.userId)}
                            accessibilityRole="button"
                            style={styles.quiet}
                          >
                            <ThemedText type="small" themeColor="textFaint">
                              Remove from circle
                            </ThemedText>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
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

              <Card style={styles.card}>
                <ThemedText type="small" themeColor="textFaint" style={styles.eyebrow}>
                  Join another
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  A couple and a house group are not the same circle. You can be in both.
                </ThemedText>
                <TextInput
                  value={code}
                  onChangeText={(next) =>
                    setCode(next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                  }
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
                  onPress={() => run('join', () => joinByCode(code).then(() => setCode('')))}
                  disabled={code.length < 4 || busy !== undefined}
                  accessibilityRole="button"
                  style={[
                    styles.action,
                    {
                      backgroundColor: code.length >= 4 ? theme.accent : theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: code.length >= 4 ? theme.background : theme.textFaint }}
                  >
                    Join
                  </ThemedText>
                </Pressable>
              </Card>

              <StartCircle
                title="Start another"
                busy={busy !== undefined}
                onCreate={startCircle}
              />

              {/* Two taps, like deleting an account. One quiet tap used to be
                  enough to put you out of the circle with no warning, and the
                  circle is invisible to a non-member — so the people and their
                  reading simply vanished, with the code the only way back. */}
              {leaving ? (
                <Card style={styles.leaveConfirm}>
                  <ThemedText type="smallBold">Leave {circle.name}?</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    You stop seeing everyone&rsquo;s reading, and they stop seeing yours. Your own
                    reading stays. Getting back in needs the invite code {circle.joinCode}.
                  </ThemedText>
                  <View style={styles.leaveRow}>
                    <Pressable
                      onPress={() => setLeaving(false)}
                      accessibilityRole="button"
                      style={styles.quiet}
                    >
                      <ThemedText type="smallBold" themeColor="accent">
                        Stay
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setLeaving(false);
                        void run('leave', () => leaveCircle(circle.id));
                      }}
                      accessibilityRole="button"
                      disabled={busy !== undefined}
                      style={styles.quiet}
                    >
                      <ThemedText type="smallBold" style={{ color: theme.redLetter }}>
                        Leave
                      </ThemedText>
                    </Pressable>
                  </View>
                </Card>
              ) : (
                <Pressable
                  onPress={() => setLeaving(true)}
                  accessibilityRole="button"
                  style={styles.quiet}
                >
                  <ThemedText type="small" themeColor="textFaint">
                    Leave this circle
                  </ThemedText>
                </Pressable>
              )}
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
              <StartCircle
                title="Start one"
                busy={busy !== undefined}
                onCreate={startCircle}
              />
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
  memberBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  leaveConfirm: { gap: Spacing.two, padding: Spacing.three },
  leaveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  switcher: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
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
