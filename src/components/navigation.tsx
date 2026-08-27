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

import { Link, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Wide enough that a bottom bar would look stranded. */
const WIDE = 900;

const DESTINATIONS = [
  { href: '/', label: 'Today' },
  { href: '/progress', label: 'Read' },
  { href: '/marked', label: 'Marked' },
  { href: '/circle', label: 'Circle' },
] as const;

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

  const items = DESTINATIONS.map((destination) => {
    // "/" would otherwise match everything.
    const active =
      destination.href === '/' ? pathname === '/' : pathname.startsWith(destination.href);

    return (
      <Link key={destination.href} href={destination.href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ selected: active }}
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
        </Pressable>
      </Link>
    );
  });

  if (hidden) return <>{children}</>;

  if (wide) {
    // The rail and the page are one object, centred together. Pinning the rail
    // to the far edge and centring the column in whatever is left makes them
    // read as two unrelated things with a void between them.
    return (
      <View style={styles.wideOuter}>
        <View style={styles.wideInner}>
          <View style={[styles.rail, { borderRightColor: theme.border }]}>{items}</View>
          <View style={styles.grow}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.grow}>
      <View style={styles.grow}>{children}</View>
      <View
        style={[
          styles.bar,
          {
            borderTopColor: theme.border,
            backgroundColor: theme.background,
            paddingBottom: Math.max(insets.bottom, Spacing.two),
          },
        ]}
      >
        {items}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // The rail plus a comfortable reading column; wider than this is empty space,
  // because the measure must stay near 680 whatever the display does.
  wideOuter: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  wideInner: { flex: 1, flexDirection: 'row', maxWidth: 176 + MaxContentWidth + Spacing.six },
  rail: {
    width: 176,
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
    borderRightWidth: StyleSheet.hairlineWidth,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one,
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
