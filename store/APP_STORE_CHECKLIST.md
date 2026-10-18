# App Store: step-by-step for Hafnium Reader

Store text is in `store/out/apple.md` (regenerate with `npm run store`). The app is iPhone-only for now
(`supportsTablet: false`), so no iPad screenshots are needed; it still runs on iPads in iPhone mode.

## 0. Before you start

- [x] Apple Developer Program membership for Hafnium Research (organisation, D-U-N-S verified).
- [ ] **Team ID**: developer.apple.com → Account → Membership details (10 characters, e.g. `AB12CD34EF`).
- [ ] **App Store Connect API key** so EAS can create signing certificates and upload builds without an
      Apple ID login or two-factor code: App Store Connect → Users and Access → Integrations →
      App Store Connect API → **Team Keys** → + → name `EAS`, access **Admin**. Note the **Key ID** and the
      **Issuer ID** (top of the page), and download the `.p8` file (Apple only lets you download it once).

## 1. Build and TestFlight (done from the project with EAS)

```bash
npx eas-cli@latest build --platform ios --profile production     # creates certificate + profile, registers ltd.hafnium.reader
npx eas-cli@latest submit --platform ios                          # uploads to App Store Connect / TestFlight
```

The first upload creates the processing build; TestFlight internal testers (members of your App Store Connect
team) can install it as soon as Apple finishes processing, usually within 30 minutes.

## 2. App record (App Store Connect → Apps → +)

| Field | Answer |
|---|---|
| Platform | iOS |
| Name | Hafnium Reader: RSS Feeds |
| Primary language | English (U.K.) — or U.S. |
| Bundle ID | ltd.hafnium.reader (appears once EAS has registered it) |
| SKU | hafnium-reader-ios |
| User access | Full access |

## 3. App Information

| Field | Answer |
|---|---|
| Subtitle | `store/out/apple.md` → Subtitle |
| Category | Primary **News**, secondary **Productivity** |
| Content rights | Yes, it shows third-party content: articles from the public feeds each user chooses, always credited to the publisher and linked to the original. |
| Age rating | Answer **None/No** to every content question; Unrestricted Web Access: **No** (articles open in a built-in viewer; there is no address bar or general browsing). |

## 4. Pricing and availability

Free; all countries (or as you prefer).

## 5. App Privacy

- Privacy policy URL: https://reader.hafnium.ltd/privacy.html
- Data collection: **Data Not Collected**. Everything stays on the device; the app contacts only the sites the
  user adds and, when the user taps "Search the web", Wikidata — neither is the developer or its partner.

## 6. Version 1.0

| Field | Where |
|---|---|
| iPhone screenshots (6.9", 1320×2868 or 1290×2796) | Take on an iPhone running the TestFlight build. Android screenshots show Android UI and risk rejection. |
| Promotional text, Description, Keywords | `store/out/apple.md` |
| Support URL | https://reader.hafnium.ltd/support.html |
| Marketing URL | https://reader.hafnium.ltd |
| Copyright | 2026 Hafnium Research |
| Build | Pick the TestFlight build |
| Sign-in required | No |
| Review notes | `store/out/apple.md` → Review Notes |
| Release | Manually release this version (or automatically after approval) |

Then **Add for Review → Submit**. First reviews typically take one to three days.
