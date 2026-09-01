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

## Lint

`npm run lint` is `expo lint`, with the React Compiler's rules switched on —
`app.json` sets `experiments.reactCompiler`, so a manual `useCallback` or
`useMemo` the compiler cannot prove equivalent makes it decline to optimise
the *whole component*. It reports that as "Compilation Skipped". Prefer plain
functions and let the compiler memoise; reach for a manual memo only when
there is a measured reason.

The same rules reject setting state synchronously inside an effect. Where the
value can be derived instead, derive it — `usePassage` works out "still
loading" by comparing the bounds it holds against the bounds it was asked
for, rather than storing a flag.

## Supabase

`npm run test:rls` needs a local stack (`npx supabase start`) and is deliberately
not part of `npm test`, which stays free of infrastructure. Run it after any
change to a policy, a grant, or a table in `supabase/migrations/`.

### Sending mail

Supabase's built-in mailer is capped at two emails an hour, which is why
`[auth.rate_limit] email_sent` cannot be raised until `[auth.email.smtp]` is
enabled. Both live in `supabase/config.toml` and reach the hosted project
through `supabase config push`, not through the dashboard — the dashboard and
this file will fight over the same settings if you use both.

The credentials come from the environment. Keep them in `.smtp.local` —
git-ignored, and deliberately not named `.env`-anything, because Expo pulls
every `.env*` at the project root into the bundler graph and then fails trying
to parse it as JavaScript. They must not go in `.env.local` either, which Expo
loads into the app bundle; an SMTP key shipped to clients is the ability to
send mail as you.

`config push` sends the whole file, so read the diff before running it against
production.

Mail is sent as `noreply@readbibletrack.com`, and the domain is why it arrives
at all. Sending as a `@gmail.com` address through SES fails SPF — Google's SPF
lists Google's servers, not Amazon's — and cannot be DKIM-signed, because only
Google holds keys for `gmail.com`. Both checks fail, DMARC fails with them, and
a sign-in code lands in spam. There is no password to fall back on, so a code
in spam is a person who cannot get into the app at all. No SES setting fixes
this; only a domain you own.

`readbibletrack.com` is registered through Route 53 in the same AWS account, so
DNS and the sending identity live together. It carries three DKIM CNAMEs, an
SPF record of `v=spf1 include:amazonses.com -all`, and DMARC at `p=none` with
reports going to `readbibletrack@gmail.com`. The policy starts at `none` on
purpose: tighten to `quarantine` once the reports show nothing legitimate
failing, because going straight to `reject` silently kills your own mail if
anything is misconfigured.

Nothing *receives* mail at that domain — `noreply@` is a sending identity only,
and a reply to a sign-in code goes nowhere. The address published in the
privacy policy is `readbibletrack@gmail.com` for that reason, and it has to
keep working: it is where someone exercises a right to have their data deleted.

Two traps this schema has already hit, both worth remembering:

- A `RETURNING` clause is evaluated before `AFTER INSERT` triggers fire. A
  select policy that depends on a row the trigger creates will hide the new row
  from the person who just inserted it, and Postgres reports that as a
  row-level security violation on the insert.
- Since 2026-04-28 a new table in `public` is not reachable through the Data API
  until its roles are granted access. RLS decides which rows; `grant` decides
  whether the table exists at all.

## Building for a phone

`scripts/build-ios-release.sh` makes the build that runs away from this
machine: Release, so the JavaScript is embedded, and pointed at the hosted
project. A debug build fetches its JavaScript from Metro on every launch and
is useless off the network.

`ios/` and `android/` are generated and git-ignored: `app.json` is the only
place the bundle identifier lives. It is `com.readbibletrack.app`, on both
platforms, and it is permanent — the App Store, Play, push certificates and
crash reports are all keyed to it.

`expo prebuild` writes a fresh Xcode project with no `DEVELOPMENT_TEAM`, and a
Release build for a device cannot sign without one. `plugins/with-apple-team.js`
puts it back as part of the same prebuild that loses it, so setting it by hand
in Xcode is never the fix.

Changing the identifier needs an App ID registered with Apple and a profile to
match, and `expo run:ios` cannot create either — it fails with "No profiles for
'…' were found". Only `xcodebuild -allowProvisioningUpdates` may register one,
so a new identifier takes one build through `xcodebuild` directly before the
ordinary script works again:

    xcodebuild -workspace ios/ReadBibleTrack.xcworkspace -scheme ReadBibleTrack \
      -configuration Release -destination "id=<device>" -allowProvisioningUpdates build

Move `.env.local` aside for it, exactly as `scripts/build-ios-release.sh` does,
or the embedded bundle points at a LAN address the phone cannot reach.

`expo-modules-jsi` does not compile under Swift 6.2 / Xcode 26, and the fixes
live in `node_modules`, so `npm install` throws them away and the next iOS
build fails with seventeen errors. `scripts/patch-expo-swift.mjs` puts them
back and runs from `postinstall`. It is idempotent and silent when there is
nothing to do, so when Expo ships a version that builds on its own, it simply
stops applying and can be deleted along with the hook.

A safety check written as `strings file | grep -q pattern` is inverted under
`set -o pipefail`, which every script here uses. `grep -q` exits the moment it
matches, that closes the pipe, `strings` dies of SIGPIPE, and the pipeline
reports failure — so a match reads as a miss. It cost a refused upload once and
would have cost more: the same check looking for a *local* address would have
gone quiet exactly when it found one. Count with `grep -c`, which reads to the
end.

CocoaPods needs `LANG` set to a UTF-8 locale or `pod install` dies inside
`unicode_normalize` on a perfectly ordinary path.

## Syncing

The push replaces this person's rows on the server, so **a device must pull
before it pushes** — `syncNow` does the two in that order and reversing them
destroys data: a second device would send its empty log up and wipe the
first's.

Merging is a union, and only ever adds. The arithmetic is in
`progress/merge.ts`, kept apart from the store so `node --test` can cover it
without a database — that file imports relatively with a `.ts` extension for
the same reason `src/bible/` does.

What a union cannot do is unmarking. Take a chapter back on one device and
the next merge brings it back from the other, because nothing distinguishes
"never read" from "read, then undone". Fixing that means recording removals,
not just additions.

Marks merge on the range they cover, not on their id: a mark's id is local to
the device that made it and the server assigns its own, so there is nothing
else stable to match on.

## Things that must not change casually

- Book numbering in `src/bible/canon.ts` is baked into every stored verse id.
- Verse ids are `book * 1e6 + chapter * 1e3 + verse`. Progress is stored as
  ranges over these, never as a mutable percentage.
- `src/bible/versification-data.ts`, `src/bible/translations.ts`,
  `src/scripture/assets.ts` and `assets/bibles/*.db` are generated by
  `npm run ingest`. Do not hand-edit them. The verse counts are what every
  stored range is measured against. The table is the union of every bundled
  translation and may only grow — never lower a count, it would strand ranges
  that are already stored.
- `USFM_BOOK_CODES` in `src/bible/usfm.ts` is indexed by book number and has to
  stay aligned with `BOOKS` in `canon.ts`.
- Ranges are measured with `countVerses`, which snaps a range's start forward
  and its end backward onto verses that exist. Never measure with `verseOrdinal`
  alone: it pulls both ends into the chapter it was given, so an empty tail like
  `Psalm 1:7-999` counts as one verse instead of none.
- Red-letter spans are character offsets into the stored verse text. They are
  computed as that text is assembled, so anything that changes how a verse is
  cleaned invalidates every offset — re-ingest, never patch the text in place.
