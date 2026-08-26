# ReadBibleTrack

Expo SDK 57 / React Native 0.86 / React 19. Expo Router, with `src/app` as the
router root. Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/
before writing Expo code — the API has moved a lot.

## Conventions

- Filenames are kebab-case. `@/*` maps to `src/*`.
- Colours come from `src/constants/theme.ts`. Never hard-code a colour in a
  component; both themes have to stay in step.
- Inside `src/bible/`, imports use explicit `.ts` extensions so the modules run
  under `node --test` with no bundler. App code uses the `@/` alias.

## Tests

`npm test` runs Node's built-in test runner over `src/**/*.test.ts`. Node 26
executes TypeScript directly, so there is no Jest, no Babel step and no
transform config. Keep it that way.

## Things that must not change casually

- Book numbering in `src/bible/canon.ts` is baked into every stored verse id.
- Verse ids are `book * 1e6 + chapter * 1e3 + verse`. Progress is stored as
  ranges over these, never as a mutable percentage.
