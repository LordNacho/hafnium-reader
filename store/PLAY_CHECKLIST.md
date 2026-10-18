# Google Play: step-by-step for Hafnium Reader

Everything Play Console asks for, in the order it asks, with our answers. Store text is in `store/out/google.md`
(regenerate with `npm run store`); images are in `store/assets/`.

## 0. Before you start

- [ ] **Merge `feature/rss-reader` into `master`** so the live privacy policy at
      https://reader.hafnium.ltd/privacy.html describes full-article downloads, the page viewer and Wikidata search.
      Google reviews the app against it.
- [ ] **Developer account.** https://play.google.com/console — $25 once.
  - *Organisation* account (publishing as Hafnium Research): needs a D-U-N-S number for the company and takes a few
    days to verify. Reported to be exempt from the testing rule below.
  - *Personal* account created after Nov 2023: must run a **closed test with at least 12 testers for 14 continuous
    days** before Production unlocks.

## 1. Create the app

Play Console → **Create app**

| Field | Answer |
|---|---|
| App name | Hafnium Reader: RSS Feeds |
| Default language | English (United Kingdom) — or US, your choice |
| App or game | App |
| Free or paid | Free (cannot change to paid later) |
| Declarations | Tick Developer Program Policies and US export laws |

## 2. Set up your app (Dashboard → "Set up your app")

| Section | Answer |
|---|---|
| **Privacy policy** | https://reader.hafnium.ltd/privacy.html |
| **App access** | All functionality is available without special access |
| **Ads** | No, my app does not contain ads |
| **Content rating** | Questionnaire. Category: *Reference, News, or Educational*. Answer **No** to violence, sexual content, profanity, drugs, gambling, user-to-user interaction, sharing location, digital purchases. Unrestricted web access: **No** (articles open in a built-in viewer; no general browsing). |
| **Target audience** | 13 and over (not designed for children) |
| **News app** | Hafnium Reader shows articles from feeds the user chooses, with the publisher's name and a link to the original on every article. If Play asks whether it is a news app, answer as a *news aggregator* — the source attribution requirement is met. |
| **Data safety** | Collects or shares user data: **No**. Everything stays on the device; no analytics, ads or accounts. Requests go directly to the sites the user adds, and web search words go to Wikidata only when the user taps "Search the web". Encryption in transit: HTTPS wherever the site supports it. |
| **Advertising ID** | No (the app does not use it; the permission isn't in the build) |
| **Government app / Financial features / Health** | No / None / None |

## 3. Store listing (Grow → Store presence → Main store listing)

| Field | Where |
|---|---|
| App name | `store/out/google.md` → App Name (25/30) |
| Short description | `store/out/google.md` → Short Description (68/80) |
| Full description | `store/out/google.md` → Full Description |
| App icon (512×512) | `store/assets/play-icon-512.png` |
| Feature graphic (1024×500) | `store/assets/play-feature-graphic-1024x500.png` |
| Phone screenshots (2–8) | `store/assets/screenshots/1-feeds.png` … `4-settings.png` (1080×1920, in this order). Raw 20:9 phone screenshots are too tall for Play (long side at most 2× the short side). |
| Category | News & Magazines |
| Contact email | info@hafnium.ltd |
| Website | https://reader.hafnium.ltd |

Suggested screenshots: Feeds list (folders, unread counts) · an article in the reader (light) · the same in Dark or
Sepia · Add feeds with search results · Settings → Appearance · Settings → Offline storage.

## 4. First release (Testing → Internal testing)

1. **Testers**: create an email list (yourself first). Copy the opt-in link and open it on your phone.
2. **Create new release** → Play App Signing: accept *Google-generated key* (EAS keeps the upload key).
3. **Upload the App Bundle** (`.aab`) from the EAS production build. The first upload must be done by hand in Play
   Console; later ones can use `npx eas-cli@latest submit --platform android`.
4. Release name: `1.0.0 (2)`. Release notes: from `store/out/apple.md` → What's New.
5. Review → **Start rollout to Internal testing**. Internal testing needs no review and is available within minutes.

## 5. Towards everyone

- Personal account: promote to **Closed testing**, add ≥12 testers, wait 14 days, then **Apply for production**.
- Organisation account: create a **Production** release (or promote the internal one). First review typically takes
  a few days.

## Later releases

```bash
npx eas-cli@latest build --platform android --profile production   # versionCode increments automatically
npx eas-cli@latest submit --platform android                        # needs a Play service-account key (once)
```
