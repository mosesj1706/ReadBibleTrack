/**
 * What you can do to a verse you have tapped.
 *
 * Highlight it, star it, write on it, or say you have read to it. The last one
 * is not decoration: for anyone reading without a plan, tapping a verse and
 * saying "I got to here" is the whole tracking mechanism.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { readUpTo } from '@/bible/plan.ts';
import { formatReference } from '@/bible/reference.ts';
import type { VerseId, VerseRange } from '@/bible/verse-id.ts';
import { Glass } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMarks, MARK_TINTS } from '@/marks/provider';
import { MARK_COLOURS, type MarkColour } from '@/marks/store';
import { useProgress } from '@/progress/provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function VerseActions({
  verseId,
  onClose,
}: {
  readonly verseId: VerseId;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { markOn, noteOn, highlight, star, write } = useMarks();
  const { bookmark, mark: logRead } = useProgress();

  const range: VerseRange = { start: verseId, end: verseId };
  const existing = markOn(range);
  const note = noteOn(range);

  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? '');

  const toHere = readUpTo(verseId, bookmark);

  return (
    <Glass floating style={styles.sheet}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" style={{ fontFamily: Fonts.serif }}>
          {formatReference(range)}
        </ThemedText>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
          <ThemedText type="small" themeColor="textFaint">
            Done
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.swatches}>
        {MARK_COLOURS.map((colour) => {
          const on = existing?.colour === colour;
          return (
            <Pressable
              key={colour}
              onPress={() => highlight(range, on ? undefined : colour)}
              accessibilityRole="button"
              accessibilityLabel={`Highlight ${colour}`}
              accessibilityState={{ selected: on }}
              style={[
                styles.swatch,
                {
                  backgroundColor: MARK_TINTS[colour][scheme],
                  borderColor: on ? theme.text : 'transparent',
                },
              ]}
            />
          );
        })}
        <Pressable
          onPress={() => highlight(range, undefined)}
          accessibilityRole="button"
          accessibilityLabel="Remove highlight"
          style={[styles.swatch, { borderColor: theme.border }]}
        >
          <ThemedText type="small" themeColor="textFaint">
            ⌀
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Action
          label={existing?.starred ? '★ Favourite' : '☆ Favourite'}
          active={existing?.starred === true}
          onPress={() => star(range, !existing?.starred)}
        />
        <Action
          label={note ? '✎ Edit note' : '✎ Note'}
          active={writing || note !== undefined}
          onPress={() => {
            setDraft(note?.body ?? '');
            setWriting((open) => !open);
          }}
        />
      </View>

      {writing ? (
        <View style={styles.noteBox}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="What do you want to remember about this?"
            placeholderTextColor={theme.textFaint}
            multiline
            autoFocus
            style={[
              styles.noteInput,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
          />
          <Pressable
            onPress={() => {
              write(range, draft);
              setWriting(false);
            }}
            accessibilityRole="button"
            style={[styles.save, { backgroundColor: theme.accent }]}
          >
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {draft.trim() ? 'Save note' : 'Remove note'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          logRead(toHere);
          onClose();
        }}
        accessibilityRole="button"
        style={[styles.readTo, { borderColor: theme.accent }]}
      >
        <ThemedText type="smallBold" themeColor="accent">
          Read to here — {formatReference(toHere)}
        </ThemedText>
      </Pressable>
    </Glass>
  );
}

function Action({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.action,
        {
          backgroundColor: active ? theme.accentSoft : theme.background,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <ThemedText type="small" themeColor={active ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Glass brings the border, the radius and the elevation; this is the room
  // inside it.
  sheet: { padding: Spacing.three, gap: Spacing.two },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { minHeight: 44, justifyContent: 'center', paddingLeft: Spacing.three },
  swatches: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  action: {
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  noteBox: { gap: Spacing.two },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    minHeight: 96,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  save: {
    minHeight: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readTo: {
    minHeight: 44,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
});
