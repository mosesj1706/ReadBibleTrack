# App Review notes

Answers to Apple's "Guideline 2.1 – Information Needed – New App Submission"
request of 8 September 2026, which is the standard one sent to a developer
account with no review history. Kept here because Apple asked for the same
text in the **Notes** field of App Review Information, where it stays for
every future submission — and because writing it once beats writing it again
each time.

The numbering is Apple's.

---

## 1. Screen recording

*Not text — see "Recording the video" at the foot of this file.*

## 2. What the app is for, and who for

ReadBibleTrack is for people who read the Bible alongside someone else: a
couple, a household, or a few friends who have agreed to read the same thing.

The problem it solves is small and specific. Reading together in practice means
chasing each other — "where have you got to?", "are you still on Exodus?" — and
that nagging is what usually kills it. This app answers the question quietly
and continuously, so nobody has to ask.

The audience is ordinary readers, not scholars. There is no study apparatus, no
commentary and no lexicon. The whole Bible ships inside the app in three
translations, so it works on a plane or in a room with no signal.

The design rule the app is built to: if a feature works just as well alone, it
is not a priority. The circle is the point.

## 3. Setting up and reaching the main features

**Signing in.** There is no password. Entering an email address sends a
six-digit code to it, and that code is the only way in.

Demo account, also entered in the Sign-In Information fields:

- Email: `readbibletrackreview@gmail.com`
- Password: `Freshone@1` — this is the password for that **Gmail account**, so
  the code can be read. Sign in at gmail.com with the same address and
  password, and the code is in the inbox.
- Codes last one hour. Requesting a second invalidates the first, so please use
  the newest message in the inbox.

**Where things are.** Five tabs along the bottom.

- **Today** — what to read next, and the opening of the passage.
- **Read** — every book with how much of it has been read, and a checkbox per
  chapter for marking off reading done in a paper Bible.
- **A chapter** — tap any verse for: highlight, favourite, write a note, or
  "Read to here" if you stopped part way.
- **Circle** — the demo account is in a circle called "The kitchen table" with
  two other readers, Hannah and Sam, all three at different points. This screen
  shows their progress, the invite code, and — because the demo account owns
  this circle — the control to remove a member. A person can be in more than
  one circle; pills at the top switch between them. Tapping a member's name
  opens their reading book by book, and a book opens into its chapters.
- **A circle's plan** — whoever starts a circle can choose what it reads
  together, either from the presets or by building a plan of their own (any
  books, over any number of days). Everyone in the circle then reads that
  plan, and the circle's progress is measured against it. The Plan tab shows
  whose plan is in force.
- **You** — the account, and "Delete my account" at the foot, which is
  immediate and permanent.

**User-generated content, and the controls over it.** A note written against a
verse can be shared with the circle using the "Share with circle" toggle.
Nothing is shared unless that is switched on, and there is no public feed, no
discovery, and no way to see anyone who did not give you an invite code.

Every shared highlight and note carries a **⚑** control, in the ✎ panel of the
chapter it belongs to. It offers:

- **Report it** — files a report, including a copy of what was written, so the
  evidence survives the author deleting the note. Reports are read by the
  developer; the address for chasing one is published on the support page.
- **Block [name]** — hides everything that person shares, in both directions,
  immediately. Their reading progress stays visible, because that is the shared
  purpose of the circle and one unpleasant note should not cost someone that.

Whoever created a circle can additionally **remove a member** from it, on the
Circle tab. Any member can leave at any time.

## 4. External services used to deliver core functionality

- **Supabase** — hosts the Postgres database and handles sign-in. This is where
  reading progress, circles, shared notes, reports and blocks live.
- **Resend** — delivers the six-digit sign-in email. Nothing else.
- **Amazon CloudFront and S3** — serve the website at readbibletrack.com,
  which hosts the privacy policy and the support page.
- **Amazon Route 53** — DNS for that domain.

There is nothing else. No analytics, no crash reporting, no advertising
network, no AI service, no payment processor, and no third-party tracking SDK
of any kind. The Bible text is not fetched from a data provider — it ships
inside the app as SQLite databases, so opening a chapter makes no network
request at all.

## 5. Regional differences

There are none. Every feature and all content is identical in every country
where the app is available. The interface and all three translations are
English. Nothing is region-gated, and no functionality varies by locale.

## 6. Regulated industry, and third-party material

The app is not in a regulated industry. It takes no money, offers no purchases,
gives no medical, legal or financial advice, and handles no health data.

The three bundled Bible translations are all public domain and are distributed
for free use:

- **Berean Standard Bible (BSB)** — released into the public domain by its
  publisher for unrestricted use.
- **King James Version (KJV)** — public domain.
- **World English Bible (WEB)** — placed in the public domain by its editors.

No licence fee, permission or credential is required to distribute any of them,
and the app carries no third-party copyrighted text beyond these.

---

## Recording the video

Apple wants a screen recording made **on a physical device**, beginning with
the app launching, showing the typical flow. On an iPhone: Settings → Control
Centre → add Screen Recording, then swipe down and tap the record button.

A run that covers everything they listed, in order:

1. Launch the app from the home screen — start recording *before* tapping it.
2. The sign-in screen. Type the demo email, tap "Send my code".
3. Show the code arriving and being entered. (If filming the Gmail inbox is
   awkward, say so in the reply — the credentials are in the Notes either way.)
4. **Today** — the passage and "Start reading".
5. Open a chapter. Scroll. Tap a verse: highlight it, star it, write a note.
6. Turn on **"Share with circle"** for that note — this is the user-generated
   content Apple asked to see.
7. Open the **✎ panel**. Show a shared note from Hannah or Sam, tap the **⚑**,
   and show both **Report it** and **Block**. Report one, so the confirmation
   is on camera.
8. **Circle** tab — the members, their progress, the invite code, and the
   **Remove from circle** control on a member. Tap **Hannah** to show her
   reading book by book, tap a book to open its chapters, then come back.
9. *(Optional, ten seconds.)* Scroll to **Start another**, type a name, and
   show the **"What will you read?"** plan pills. No need to create it.
10. **You** tab — scroll to the foot, tap **"Delete my account"**, and show the
    confirmation panel that explains what it does. *Do not confirm it* — the
    demo account is needed for review. Showing the flow and the warning is what
    they are asking for.
11. Stop recording.

Upload it somewhere with a plain link — Apple accepts a link in the Resolution
Center reply.
