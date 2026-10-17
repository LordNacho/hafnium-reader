# Feeds — a personal, offline RSS reader

An ad-free RSS/Atom reader for iOS and Android built with Expo (SDK 58). Import your subscriptions from The Old Reader (or any OPML export), and articles are downloaded and stored on the device so you can read them offline.

## Features

- **OPML import/export** — folders are preserved; re-importing skips feeds you already have.
- **Offline reading** — feed content is saved in SQLite. Articles open in a clean, dark-mode-aware reader with no network needed.
- **Limits you control** — keep the newest 25–500 articles per feed and/or up to 7–365 days. Starred articles are never pruned.
- **Auto-refresh** — on app open (if stale for 15+ min), plus periodic background refresh (Android WorkManager / iOS BGTaskScheduler), optionally Wi-Fi only.
- **Appearance** — System / Light / Dark / Sepia theme, text size (85–150%, on top of the phone's own setting), sans or serif reading font, line spacing, and an images on/off switch, with a live preview in Settings.
- RSS 2.0, RSS 1.0 (RDF) and Atom; conditional GET (ETag / Last-Modified) to save data.
- Add a feed by URL or by a site's homepage (feed autodiscovery).
- Unread/all filter, mark all read, star, prev/next, share, open original in an in-app browser.
- Long-press a feed to refresh, mark read or unsubscribe.

## Getting your feeds out of The Old Reader

Settings → Import/Export → **Export** (OPML). Put the `.opml` file somewhere your phone can reach (iCloud Drive / Google Drive / email it to yourself), then in the app: **Settings → Import OPML…**

## Develop

Requires Node ≥ 22.13 (Expo SDK 58 tooling).

```bash
npm install
npm test            # parser unit tests
npm run typecheck
npx expo lint
npx expo start      # scan the QR code with Expo Go for quick UI work
```

Expo Go runs everything except background refresh. For that, use a development build (below) on a **physical** device — iOS background tasks don't run in the simulator.

## Code map

| Path | What |
|---|---|
| `src/lib/feed.ts` | RSS/Atom parser, date parsing |
| `src/lib/opml.ts` | OPML import/export |
| `src/lib/html.ts` | entity decoding, previews, URL absolutizing, feed autodiscovery |
| `src/db/index.ts` | SQLite schema, migrations, queries |
| `src/sync.ts` | fetching, storing, pruning, add/import feeds |
| `src/background.ts` | background refresh task |
| `src/settings.ts` | user settings (stored in SQLite) |
| `src/app/` | screens (Expo Router) |

## Publishing to the App Store and Google Play

Builds happen in the cloud with EAS — no Mac or Android Studio needed.

### 0. One-time accounts

- **Apple Developer Program** — $99/year, https://developer.apple.com/programs/
- **Google Play Console** — $25 one-off, https://play.google.com/console
- **Expo account** (free) — https://expo.dev/signup

### 1. Choose your identifiers

In `app.json`, `ios.bundleIdentifier` and `android.package` are set to `com.charlesphan1980.feeds`. These are permanent once published; change them now if you want something else. Also replace the icons in `assets/` (1024×1024 `icon.png`, plus the Android adaptive-icon layers) and pick a final `name`.

### 2. Link the project to EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init        # writes extra.eas.projectId into app.json
```

### 3. Try it on your own phones

```bash
# Development build (hot reload, background tasks work)
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios   # registers your iPhone via a link EAS gives you
npx expo start --dev-client

# Or a standalone build to install and use day-to-day
npx eas-cli@latest build --profile preview --platform android   # produces an .apk you can sideload
```

### 4. Store builds and submission

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios       # uploads to App Store Connect / TestFlight
npx eas-cli@latest submit --platform android   # uploads to Google Play
```

EAS will offer to generate and manage the signing credentials for both platforms — say yes.

**Apple notes**
- Create the app record in App Store Connect (or let `eas submit` do it), then test via TestFlight before submitting for review.
- App Privacy: the app collects no data, so you can declare "Data Not Collected".
- A privacy policy URL is required even for apps that collect nothing — a one-paragraph page is fine.
- Encryption export compliance is pre-answered (`ITSAppUsesNonExemptEncryption: false`).

**Google notes**
- The first Android upload must be done by hand: download the `.aab` from the EAS build page and upload it in Play Console. After that, `eas submit` works. Automated submission needs a Google service-account key; see https://docs.expo.dev/submit/android/
- New *personal* developer accounts must run a closed test with at least 12 testers for 14 days before production access is granted.
- Fill in the Data safety form ("No data collected") and the content rating questionnaire, and add a privacy policy URL.

### Icon and store graphics

The icon is the Round Tower (Rundetårn) in Copenhagen; its observatory dome is the feed dot. Sources are SVGs in `design/icon/`. `npm run icons` renders the iOS icon, the Android adaptive layers (foreground, background, monochrome), the splash image and favicon into `assets/`, and the App Store icon, Play icon and Play feature graphic into `store/assets/`. The feature graphic's text is already converted to outlines, so editing it means regenerating `design/icon/feature-graphic.svg`.

### Store text and website

Listing text, the privacy policy and the support pages are templates in `store/templates/`, filled in from `store/config.json`. `npm run store` renders them into `store/out/` (paste into App Store Connect and Play Console) and `docs/` (the website), and checks every store character limit.

The website is served by GitHub Pages from the `docs/` folder:

1. Repository → Settings → Pages → Source: *Deploy from a branch*, branch `main` (or `master`), folder `/docs`. A private repository needs GitHub Pro (personal) or Team (organization) for Pages; the site itself is public.
2. DNS for `hafnium.ltd`: add a `CNAME` record `reader` → `<github-account>.github.io`. `docs/CNAME` already names `reader.hafnium.ltd`.
3. Back in Settings → Pages, wait for the domain check, then tick *Enforce HTTPS*.

### 5. Shipping updates

- JS-only changes: `npx eas-cli@latest update` (over-the-air, after adding `expo-updates`), or
- Bump nothing — `autoIncrement` + remote versioning handle build numbers — and repeat step 4.

## Ideas for later

- Cache images for fully offline reading (currently text is offline; images load when online).
- Full-text extraction for feeds that only publish summaries.
- Search across saved articles (SQLite FTS).
- Sync read state with The Old Reader's API.
