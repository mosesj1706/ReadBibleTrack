/**
 * Getting around.
 *
 * One component, one breakpoint. On a phone it is a bar along the bottom; on a
 * wide screen it becomes a rail down the side, because bottom tabs on a 1440px
 * display are a phone app wearing a costume.
 *
 * The reader is deliberately excluded. Reading is the one thing in this app
 * that deserves the whole screen, and a chapter is left with "‹ Today" rather
 * than a persistent bar competing with the text.
 */

import { router, usePathname } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canonSpan } from '@/bible/verse-id.ts';
import { countVerses, progressThrough } from '@/bible/versification.ts';
import { Animated, Tappable, useFill } from '@/components/motion';
import { TABS, slideDirection, type Slide } from '@/navigation/order.ts';
import { Glass, Ground } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProgress } from '@/progress/provider';

/** Wide enough that a bottom bar would look stranded. */
const WIDE = 900;

/**
 * Which way the next screen should travel.
 *
 * Every screen used to arrive from the right, whichever tab you came from, so
 * moving from "You" back to "Today" felt like going further forward. The tabs
 * are laid out in a row and the movement should agree with them.
 *
 * A module-level value rather than state: the navigator reads it while
 * pushing, which happens after the tap handler has run and before any
 * re-render could deliver it. The decision itself lives in `navigation/order`,
 * where it can be tested.
 */
let pendingDirection: Slide = 'slide_from_right';

export function directionForNextScreen(): Slide {
  return pendingDirection;
}

/** Screens that own the whole window. */
function isImmersive(pathname: string): boolean {
  return pathname.startsWith('/read');
}

export function AppNavigation({ children }: { readonly children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();

  const wide = width >= WIDE;
  const hidden = isImmersive(pathname);

  const items = TABS.map((destination) => {
    // "/" would otherwise match everything.
    const active =
      destination.href === '/' ? pathname === '/' : pathname.startsWith(destination.href);

    return (
        <Tappable
          key={destination.href}
          accessibilityRole="link"
          accessibilityState={{ selected: active }}
          onPress={() => {
            if (active) return;
            // Set before navigating: the navigator reads it as it pushes.
            pendingDirection = slideDirection(pathname, destination.href);
            router.navigate(destination.href);
          }}
          style={StyleSheet.flatten([
            wide ? styles.railItem : styles.barItem,
            active && wide
              ? { backgroundColor: theme.accentSoft, borderRadius: Spacing.two }
              : undefined,
          ])}
        >
          <View
            style={[
              styles.marker,
              {
                backgroundColor: active && !wide ? theme.accent : 'transparent',
              },
            ]}
          />
          <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'accent' : 'textSecondary'}>
            {destination.label}
          </ThemedText>
        </Tappable>
    );
  });

  if (hidden) return <>{children}</>;

  if (wide) {
    // The rail and the page are one object, centred together. Pinning the rail
    // to the far edge and centring the column in whatever is left makes them
    // read as two unrelated things with a void between them.
    return (
      // The ground is painted across the whole window rather than only inside
      // the centred column: the screens paint their own, but that one is
      // bounded by this layout, so everything either side of it had no
      // background at all and showed the browser's white through.
      //
      // It wraps the centring row rather than being it. Ground puts its
      // children inside a flex:1 view of its own, which swallows a
      // justifyContent set on the outside and leaves the rail against the
      // left edge.
      <Ground>
        <View style={styles.wideOuter}>
        <View style={styles.wideInner}>
          <Glass style={styles.rail}>
            {items}
            <RailSummary />
          </Glass>
          <View style={styles.grow}>{children}</View>
        </View>
        </View>
      </Ground>
    );
  }

  return (
    <View style={styles.grow}>
      <View style={styles.grow}>{children}</View>
      <Glass
        floating
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, Spacing.two) },
        ]}
      >
        {items}
      </Glass>
    </View>
  );
}

/**
 * How far the reading has got, at the foot of the rail.
 *
 * The rail is tall and five items do not fill it. Rather than pad it out with
 * decoration, it carries the one number this whole app exists to move — which
 * also means the number is in front of you on every screen, not only on the
 * one you go to for it.
 */
function RailSummary() {
  const theme = useTheme();
  const pathname = usePathname();
  const { ranges } = useProgress();
  const read = countVerses(ranges);
  const share = progressThrough([canonSpan()], ranges);
  const fill = useFill(share);

  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={`${read} verses read, ${(share * 100).toFixed(1)} per cent of the Bible`}
      onPress={() => {
        pendingDirection = slideDirection(pathname, '/progress');
        router.navigate('/progress');
      }}
      style={styles.summary}
    >
      <ThemedText type="small" themeColor="textFaint" style={styles.summaryEyebrow}>
        Read so far
      </ThemedText>
      <ThemedText type="subtitle" style={[styles.summaryCount, { fontFamily: Fonts.serif }]}>
        {read.toLocaleString()}
      </ThemedText>
      <View style={[styles.summaryTrack, { backgroundColor: theme.backgroundSelected }]}>
        <Animated.View
          style={[styles.summaryFill, { backgroundColor: theme.accent }, fill]}
        />
      </View>
      <ThemedText type="small" themeColor="textFaint">
        {share > 0 ? `${(share * 100).toFixed(1)}% of the Bible` : 'of the whole Bible'}
      </ThemedText>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // The rail plus a full page. This used to be the rail plus the 680pt prose
  // measure, which made every screen a phone-shaped strip with a few hundred
  // points of dead ground either side of it on a desktop display. The measure
  // still governs paragraphs — it just no longer governs the whole app.
  wideOuter: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  wideInner: { flex: 1, flexDirection: 'row', maxWidth: 176 + MaxPageWidth + Spacing.six },
  // `auto` on top pushes the summary to the foot of the rail, so the nav items
  // stay together at the head of it rather than being spread down the whole
  // height.
  summary: { marginTop: 'auto', paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.half },
  summaryEyebrow: { textTransform: 'uppercase', letterSpacing: 1.2 },
  summaryCount: { fontSize: 26, lineHeight: 32, fontWeight: '400' },
  summaryTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.one },
  summaryFill: { height: '100%', borderRadius: 3 },
  rail: {
    width: 176,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
    marginVertical: Spacing.three,
    marginLeft: Spacing.three,
  },
  railItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: Spacing.one,
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  barItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  // A dot above the label on phones; on the rail the pill does the work.
  marker: { width: 4, height: 4, borderRadius: 2 },
});
