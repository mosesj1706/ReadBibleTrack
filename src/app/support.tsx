/**
 * The support page.
 *
 * The App Store requires a support URL, and a person who cannot get into the
 * app needs somewhere to write to that is not inside the app. So this is a
 * route like the privacy policy: readable without an account, because the
 * people most likely to need it are the ones who cannot sign in.
 */

import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Animated } from '@/components/motion';
import { Card, Ground } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

const CONTACT = 'readbibletrack@gmail.com';

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" style={{ fontFamily: Fonts.serif }}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function P({ children }: { readonly children: React.ReactNode }) {
  return (
    <ThemedText themeColor="textSecondary" style={styles.para}>
      {children}
    </ThemedText>
  );
}

export default function SupportScreen() {
  const scrolled = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y;
  });

  return (
    <Ground scroll={scrolled}>
      <SafeAreaView style={styles.frame}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button"
            style={styles.leave}
          >
            <ThemedText type="small" themeColor="accent">
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <ThemedText type="title" style={{ fontFamily: Fonts.serif }}>
              Support
            </ThemedText>

            <Card style={styles.lede}>
              <P>
                Write to {CONTACT}. It is read by the person who made the app, which at present is
                one person, so an answer may take a day or two rather than a minute.
              </P>
            </Card>

            <Section title="The code never arrived">
              <P>
                Signing in sends a six-digit code by email. If it has not come, look in your spam
                folder first — and tell us if you find it there, because that is worth knowing
                about and worth fixing.
              </P>
              <P>
                A code lasts an hour. Asking for a second one makes the first stop working, so
                use the newest email in the list rather than the first.
              </P>
            </Section>

            <Section title="Reading and marking">
              <P>
                A chapter is marked read from the control at the foot of it, or by tapping a verse
                and choosing &ldquo;Read to here&rdquo; if you stopped part way. Reading from a
                paper Bible is the same: the Read tab lets you tick chapters off without opening
                them.
              </P>
              <P>
                Taking a mark back sticks, on every device. If you unmark a chapter on one and mark
                the same one on another before they have synced, whichever synced last is the one
                that counts.
              </P>
            </Section>

            <Section title="Circles">
              <P>
                A circle is joined with a code from whoever made it. Everyone in it sees how far
                the others have read, and any highlight or note that person chose to share — and
                nothing else. Where you stopped reading is never shown to anyone.
              </P>
              <P>
                Leaving a circle removes you from it and takes nothing of your own reading with
                you.
              </P>
            </Section>

            <Section title="Deleting your account">
              <P>
                In the app: the You tab, at the foot, &ldquo;Delete my account&rdquo;. It removes
                your reading, your highlights, your notes and the account itself, on every device,
                and cannot be undone. A circle you started stays with the people still in it.
              </P>
              <P>
                If you cannot get into the app to do it, write to {CONTACT} from the address you
                signed up with and it will be done for you.
              </P>
            </Section>

            <Section title="What is kept about you">
              <P>
                Little, and none of it sold or shared.{' '}
                <Link href="/privacy" style={styles.link}>
                  <ThemedText type="smallBold" themeColor="accent">
                    The privacy policy
                  </ThemedText>
                </Link>{' '}
                says exactly what and who can see it.
              </P>
            </Section>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  leave: { minHeight: 44, justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  lede: { gap: Spacing.two },
  section: { gap: Spacing.two },
  para: { lineHeight: 24 },
  link: { textDecorationLine: 'none' },
});
