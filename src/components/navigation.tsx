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
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tappable } from '@/components/motion';
import { Glass } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { MaxPageWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Wide enough that a bottom bar would look stranded. */
const WIDE = 900;

const DESTINATIONS = [
  { href: '/', label: 'Today' },
  { href: '/progress', label: 'Read' },
  { href: '/marked', label: 'Marked' },
  { href: '/circle', label: 'Circle' },
  { href: '/profile', label: 'You' },
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
        <Tappable
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
        </Tappable>
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
          <Glass style={styles.rail}>{items}</Glass>
          <View style={styles.grow}>{children}</View>
        </View>
      </View>
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // The rail plus a full page. This used to be the rail plus the 680pt prose
  // measure, which made every screen a phone-shaped strip with a few hundred
  // points of dead ground either side of it on a desktop display. The measure
  // still governs paragraphs — it just no longer governs the whole app.
  wideOuter: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  wideInner: { flex: 1, flexDirection: 'row', maxWidth: 176 + MaxPageWidth + Spacing.six },
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
