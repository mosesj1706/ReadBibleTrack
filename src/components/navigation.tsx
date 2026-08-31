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
import { useEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canonSpan } from '@/bible/verse-id.ts';
import { countVerses, progressThrough } from '@/bible/versification.ts';
import { Animated, Settle, Tappable, useFill } from '@/components/motion';
import { TABS, slideDirection, type Slide } from '@/navigation/order.ts';
import { Glass, Ground } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxPageWidth, Radius, Spacing } from '@/constants/theme';
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

/**
 * For anywhere outside the tab bar that knows which way it is travelling —
 * the reader's chapter arrows, which move backwards as often as forwards.
 */
export function setNextDirection(slide: Slide): void {
  pendingDirection = slide;
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

  // Where each tab ended up, and where the selection currently is. The
  // selection is a single shape that travels rather than one that blinks off
  // here and on over there — which is the whole of what makes an island feel
  // like one object rather than five.
  const spots = useRef<Record<string, { x: number; width: number }>>({});
  const slideX = useSharedValue(0);
  const slideW = useSharedValue(0);
  const settled = useRef(false);

  const moveTo = (href: string, immediate = false) => {
    const spot = spots.current[href];
    if (!spot) return;
    if (immediate || !settled.current) {
      slideX.value = spot.x;
      slideW.value = spot.width;
      settled.current = true;
      return;
    }
    slideX.value = withSpring(spot.x, Settle);
    slideW.value = withSpring(spot.width, Settle);
  };

  const here = TABS.find((t) => (t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)));
  useEffect(() => {
    if (here) moveTo(here.href);
    // moveTo reads refs and shared values, neither of which are reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here?.href]);

  const island = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    width: slideW.value,
  }));

  const items = TABS.map((destination) => {
    // "/" would otherwise match everything.
    const active =
      destination.href === '/' ? pathname === '/' : pathname.startsWith(destination.href);

    return (
        <Tappable
          key={destination.href}
          onLayout={(event) => {
            const { x, width: w } = event.nativeEvent.layout;
            spots.current[destination.href] = { x, width: w };
            if (active) moveTo(destination.href);
          }}
          accessibilityRole="link"
          accessibilityState={{ selected: active }}
          onPress={() => {
            if (active) return;
            // Set before navigating: the navigator reads it as it pushes.
            pendingDirection = slideDirection(pathname, destination.href);
            // Replace, not push. Tabs are five doors in one room, not a
            // journey — pushing meant a back gesture retraced whichever order
            // you had happened to visit them in, so backing out of Today led
            // to You, then Circle, then Marked, apparently forever.
            router.replace(destination.href);
          }}
          style={StyleSheet.flatten([
            wide ? styles.railItem : styles.barItem,
            // On a phone the travelling capsule marks the selection; the rail
            // has no such thing, so it keeps a tinted pill of its own.
            active && wide
              ? { backgroundColor: theme.accentSoft, borderRadius: Spacing.two }
              : undefined,
          ])}
        >
          <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'accent' : 'textSecondary'}>
            {destination.label}
          </ThemedText>
        </Tappable>
    );
  });

  // Deliberately not an early `return <>{children}</>` when the bar is hidden.
  // That put `children` under a Fragment on the reader and under two Views
  // everywhere else, and React tears down a subtree whose element type changes
  // beneath it — so entering or leaving a chapter unmounted and rebuilt the
  // whole navigator. The native stack went with it, and the interactive back
  // gesture belongs to the native stack: the swipe worked or did not depending
  // on how the rebuild had landed. The bar is hidden by not rendering the bar.
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
        <View style={hidden ? styles.wideFull : styles.wideInner}>
          {hidden ? null : (
            <Glass style={styles.rail}>
              {items}
              <RailSummary />
            </Glass>
          )}
          <View style={styles.grow}>{children}</View>
        </View>
        </View>
      </Ground>
    );
  }

  return (
    <View style={styles.grow}>
      <View style={styles.grow}>{children}</View>
      {hidden ? null : (
        <Glass
          floating
          style={[styles.bar, { marginBottom: Math.max(insets.bottom, Spacing.three) }]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.island, { backgroundColor: theme.accentSoft }, island]}
          />
          {items}
        </Glass>
      )}
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
        router.replace('/progress');
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
  // With the rail gone the reader owns the window, as it did when this branch
  // returned the children bare. A style swap rather than a different tree:
  // changing the shape here is what was rebuilding the navigator.
  wideFull: { flex: 1, flexDirection: 'row' },
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
  // A capsule that floats clear of the edges rather than a bar bolted to the
  // bottom of the screen: inset on every side, fully rounded, and lifted off
  // the home indicator instead of swallowing it.
  bar: {
    flexDirection: 'row',
    padding: Spacing.one,
    marginHorizontal: Spacing.four,
    borderRadius: Radius.pill,
  },
  // The travelling selection, behind the labels. Its position and width are
  // animated, so moving between two tabs of different widths stretches rather
  // than jumps.
  island: {
    position: 'absolute',
    left: 0,
    top: Spacing.one,
    bottom: Spacing.one,
    borderRadius: Radius.pill,
  },
  barItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
});
