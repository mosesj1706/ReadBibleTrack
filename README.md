# ReadBibleTrack

A shared Bible reading tracker for couples, families and small circles of friends.
One Expo codebase serving iOS, Android and the web.

The point of the app is not the reader — it is the circle. If a feature works
just as well alone, it is not a priority.

## Running it

```sh
npm install
npm start          # then press i, a, or w
npm run web        # web only
npm test           # unit tests, no test framework needed
npm run typecheck
```

`npm start` prints a QR code. Scan it with Expo Go to run on a real phone —
that works today without Xcode. iOS *simulator* builds need the full Xcode
install, not just the Command Line Tools.

## Layout

```
src/
  app/          Expo Router routes — these become both screens and web URLs
  bible/        canon, verse ids, range algebra, reference parsing
  components/   themed primitives
  constants/    design tokens (theme.ts)
  hooks/
types/          ambient declarations
```

## Verse ids

Every verse in the canon is one sortable integer:

```
book * 1_000_000  +  chapter * 1_000  +  verse

Genesis 1:1      ->  1_001_001
John 3:16        -> 43_003_016
Revelation 22:21 -> 66_022_021
```

Reading progress is stored as `[start, end]` ranges over these ids, never as a
list of verses and never as a mutable percentage. Two things follow:

- **Progress is translation-independent.** Reading Genesis in Malayalam writes
  exactly the same rows as reading it in English, so a family reading in
  different languages still shares one progress bar.
- **Group progress is one SQL aggregate**, not a row per verse per person.

Because no chapter has more than 176 verses (Psalm 119), `999` is a safe open
upper bound for a chapter. That is why `chapterSpan` and `bookSpan` work without
any versification data. Counting *actual* verses does need that data, and will
come from the ingestion script — versification differs between translations.

`src/bible/verse-id.ts` is the load-bearing file. The book numbering in
`canon.ts` is baked into every id ever stored, so it must never be renumbered.

## Scripture text

Text is **bundled in the app** as a read-only SQLite file per translation, not
served from our backend. It works offline, costs nothing per read, and keeps
the database free of scripture entirely.

Only translations that are public domain or CC BY-SA get bundled. Every shipped
translation must be listed in `LICENSES.md` with its source URL, licence and
download date. Copyrighted versions (NIV, ESV) can only come from an API under
licence and cannot be bundled offline.

## Status

Phase 0. The canon, verse ids, range algebra and reference parsing are in place
and tested. Next: the USFM ingestion script, then the reader.
