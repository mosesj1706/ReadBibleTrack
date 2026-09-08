/**
 * The privacy policy.
 *
 * A route rather than a page uploaded beside the site, so it ships with the
 * app as well as the website and cannot drift from it. The App Store wants a
 * URL; a reader wants it in front of them without leaving what they are doing.
 *
 * Everything here is checked against the schema in `supabase/migrations` and
 * the queries in `src/sync`. A privacy policy that describes a different app
 * than the one that was written is worse than none, because it is believed.
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Animated } from '@/components/motion';
import { Card, Ground } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

/** Changed only when the policy itself changes, not when this file is edited. */
const UPDATED = '8 September 2026';

/**
 * Deliberately not a personal address, and deliberately one that works today.
 * A privacy policy naming a mailbox that bounces is worse than one naming
 * none: it is where someone exercises a right, and they are owed a reply.
 * When readbibletrack.com is registered this can become privacy@ there, with
 * a policy update saying so.
 */
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

export default function PrivacyScreen() {
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
              Privacy
            </ThemedText>
            <ThemedText type="small" themeColor="textFaint">
              Last updated {UPDATED}
            </ThemedText>

            <Card style={styles.lede}>
              <P>
                ReadBibleTrack is for reading the Bible with the people you read it with. It keeps
                what it needs for that and nothing else. There is no advertising, no analytics, no
                tracking, and nothing about you is sold or shared with anyone for their own
                purposes.
              </P>
            </Card>

            <Section title="What is kept">
              <P>
                <ThemedText type="smallBold">Your email address.</ThemedText> Signing in sends a
                one-time code to it. There is no password to store, and none is stored.
              </P>
              <P>
                <ThemedText type="smallBold">A display name you choose.</ThemedText> It is shown to
                the people in your circle so they know whose reading is whose.
              </P>
              <P>
                <ThemedText type="smallBold">What you have read.</ThemedText> Which verses, and the
                date you marked them.
              </P>
              <P>
                <ThemedText type="smallBold">Your highlights, favourites and notes.</ThemedText>{' '}
                Private unless you deliberately share one with your circle.
              </P>
              <P>
                <ThemedText type="smallBold">Where you stopped reading.</ThemedText> A single verse,
                so the app can offer to carry on. It is never shown to anyone else, including your
                circle.
              </P>
              <P>
                <ThemedText type="smallBold">Which circles you are in.</ThemedText>
              </P>
              <P>
                <ThemedText type="smallBold">Anything you report, and anyone you block.</ThemedText>{' '}
                Reporting something keeps a copy of what was written, who wrote it and who reported
                it, so it can be judged after the original is deleted. A block records only the two
                people involved, and is never shown to the person blocked.
              </P>
            </Section>

            <Section title="What is not">
              <P>
                No location, contacts, photos, camera, microphone, calendar or health data. The app
                does not ask for any of them.
              </P>
              <P>
                No analytics or crash-reporting service, no advertising identifier, no third-party
                tracking of any kind. There is no code in this app that reports what you do to
                anyone.
              </P>
              <P>
                No payment details. The app does not take money.
              </P>
            </Section>

            <Section title="Who can see it">
              <P>
                You can see everything of yours. Someone in a circle with you can see your display
                name, how much of the Bible you have read, and any highlight or note you have
                explicitly chosen to share. Nothing else.
              </P>
              <P>
                They cannot see where you stopped reading, or any highlight or note you have not
                shared. This is enforced by the database itself rather than by the app asking
                nicely: every table has row-level security policies, and there are tests that try to
                read another person&rsquo;s rows and check that it fails.
              </P>
              <P>
                Nobody outside your circles can see anything of yours.
              </P>
            </Section>

            <Section title="Where it lives">
              <P>
                On your device, so the app works without a signal, and on a server so it can reach
                your other devices and your circle. The server is Supabase, which hosts the database
                and handles sign-in. Sign-in emails are sent through Resend. The website
                is served by Amazon CloudFront. Those are suppliers doing this work for
                ReadBibleTrack; none of them is given your data for their own purposes.
              </P>
              <P>
                The Bible text itself ships inside the app. Opening a chapter asks nobody for
                anything, so what you read is not a request anyone can see.
              </P>
            </Section>

            <Section title="Deleting it">
              <P>
                You can ask for your account and everything in it to be deleted, and it will be —
                the reading history, the highlights, the notes, the circles, the account itself.
                Deletion is permanent and cannot be undone.
              </P>
              <P>
                In the app: the You tab, at the foot, &ldquo;Delete my account&rdquo;. Or write to{' '}
                {CONTACT} from the address you signed up with, if you cannot get in to do it
                yourself.
              </P>
              <P>
                Reading you have shared with a circle is removed along with everything else. A note
                you shared is deleted too; it is yours. A circle you started stays with the people
                still in it, and passes to whoever has been in it longest — leaving should not
                dissolve everyone else&rsquo;s reading.
              </P>
            </Section>

            <Section title="Children">
              <P>
                The app is not directed at children under 13 and is not intended for them to sign up
                on their own.
              </P>
            </Section>

            <Section title="Changes">
              <P>
                If this policy changes in a way that affects what is kept or who can see it, the
                date at the top changes and the app will say so rather than quietly updating.
              </P>
            </Section>

            <Section title="Asking">
              <P>
                Questions, or a request for a copy of everything held about you: {CONTACT}.
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
  // Legal text is still text: it gets the same reading measure as scripture,
  // because an unbroken line the width of a desktop is how a policy goes
  // unread.
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  lede: { gap: Spacing.two },
  section: { gap: Spacing.two },
  para: { lineHeight: 24 },
});
