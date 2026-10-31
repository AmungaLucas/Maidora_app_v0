# Maidora Kenya — Architecture & Project Documentation

> **Living document.** Every working session must keep this file and
> `WORKLOG.md` in sync with reality (in the same commit). Section 11 defines
> the rule. Last updated: **2026-10-31**.

Maidora Kenya ("Trusted help for your household") is a two-sided marketplace
connecting households (employers) with house helps across Kenya. This repo
contains the **mobile app** (Expo/React Native) and the **API gateway**
(`backend/`, Express + MySQL) deployed at `https://gateway.maidora.co.ke`.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| cPanel hosting + Node 24 gateway | ✅ LIVE | LiteSpeed Node selector, restart via `tmp/restart.txt` |
| MySQL schema v2 (users + maid_profiles, login_attempts, email_otps, phone_otps, payments) | ✅ LIVE | `sql/schema.sql` + `sql/migrate_v2.js`, both idempotent |
| Auth: signup → SMS OTP (TalkSasa) → JWT | ✅ LIVE | Role NOT at signup — chosen at onboarding (spec §3.2) |
| Onboarding: role selection post-verification | ✅ LIVE | `POST /api/auth/onboarding`, immutable once set |
| Status model v2 (account_status + *_verified_at + kyc_*) | ✅ LIVE | Spec §4.2 split model; single `status` column dropped |
| Verification gate (§5) | ✅ LIVE | `requireVerified` middleware, wired on STK push; services stay gated |
| Login throttle (§11): 5 fails/15min + 20/IP/hour | ✅ LIVE | `login_attempts` table + `POST /auth/login` guards |
| Activity tracking: last_login_at / last_active_at (§4.3) | ✅ LIVE | 1h write-throttle in `requireAuth` |
| Location auto-update at login (§6) | ✅ LIVE | GPS fix best-effort from app; last known stands on failure |
| Disposable email block (§12) | ✅ LIVE | signup + email-verification re-check |
| Email verification path (§2/§5, nodemailer SMTP) | ✅ LIVE | `SMTP_PASS` installed + SMTP auth verified (2026-10-29); Profile email sheet live: `POST /auth/update-email` + code entry (2026-10-29) |
| Profile completeness §7 — BOTH roles (schema v4) | ✅ LIVE | maid: `maid_profiles` 6 checks (bio added); employer: `employer_profiles` (size/children/budget); role-aware `GET/PUT /api/profile` — **partial per-step saves both roles**; MULTISTEP wizard rebuilt as a FULL-SCREEN modal (progress header with % + tappable step chips, keyboard-safe, sticky save bar); HomeScreen banner FIRST then KYC (both roles) and updates instantly via shared AppContext snapshot; 3-step DOB picker |
| M-Pesa STK Push → callback → receipt | ✅ LIVE | Real KES 1 txn succeeded (receipt `UJS6N01T1A`); callback round-trip proven; **respond-first since 2026-10-30** — stk-push answers in <1 s (row → paymentId → background Daraja push), killing the "fetch has been cancelled / prompt arrives anyway" race; every stage traced with `[MPESA]` lines in `stderr.log`; app polls + adopts pending rows on client timeout. **Per-purpose STK labels 2026-10-30** — `PURPOSE_STK` map (§6.1) sends AccountReference/TransactionDesc per purpose (`app_test`→TEST/"Test payment", `kyc_urgent`→KYCURGENT/"Urgent KYC", §9 product slots pre-mapped); BuyGoods (till) prompts show only the business name — the reference lands on the confirmation SMS + statement. **Hardening round 2 2026-10-30** — OAuth in-flight dedupe (one shared token fetch — two concurrent pushes used to race); app poll-overlap guard (no double end-logs on slow networks); global `req.t0` middleware + `t+Xms after request start` in the push log so client-vs-server latency attribution is provable (9.4 s push call = mobile network, server route work 5 ms). **Callback race hardening 2026-10-31** — the background `checkout_request_id` write can lag on the shared host (observed 13.4 s on #32 while Daraja accepted at t+2.2 s); an unmatched callback is now retried in the background (2.5 s × 24) while the ACK returns immediately — receipt can no longer be lost (§6.3; E2E 11/11 incl. race proof) |
| App: Welcome → Signup → OTP → Onboarding → Tabs | ✅ LIVE in Expo Go | React Navigation v7 |
| App: role-based bottom tabs | ✅ LIVE | Employer & Househelp tab sets |
| App: Profile DRAWER navigation | ✅ LIVE | `@react-navigation/drawer` 7.14 + RNGH 3.3: ProfileMain · Verification · Payments · Settings inside the drawer; hamburger + swipe. **Drawer-width bug fixed 2026-10-30** (was `Math.min(320, 0.82)` → 0.82 px panel, drawer appeared dead; now `window.width*0.82` capped 320, rotation-aware, safe-area padded). Profile screen rebuilt: hamburger LEFT, Account-status rows (email → §5 sheet), §7 % bar, Trust Badge upsell when complete; screens reorganized under `src/screens/{auth,home,maid,employer,chat,profile,payments,settings,verification}/`; Home header = avatar → Profile (settings icon removed) |
| App: M-Pesa payment screen + polling | ✅ LIVE | 3.5-min patient polling, receipt chase, friendly failures; **staged progress tracker 2026-10-31** — the pending card shows a 4-step tracker driven by real events (gateway accepted → prompt sent [`checkout_request_id` set] → enter PIN → confirmed), a **countdown** ("3:28 remaining") and a "Didn't get a prompt?" tips toggle; **payment PURPOSE selector 2026-10-31** — chip row of §9 product slots (STK push test = any amount; KYC expedite K150 owner-confirmed; Profile boost K100 / Maid Basic K200 / Maid Gold K500 / Employer Gold K500 **provisional until the products launch**), fixed-price purposes lock the amount and hide the chips, purpose lands on the payments row (E2E-proven) — entitlements still §10; **success/failure screens with BRAND ANIMATIONS** — SuccessMark (the mark draws itself: radar lock-on ping → house strokes draw in → gold seam finishes with a spark + one restrained brand spark burst; no generic checkmark, no confetti) and FailMark (radar rings collapse onto a ghost of the mark + gentle shake; calm code-specific failure card, Try Again + Back to Home); receipt, amount, paid-at EAT, never on the synchronous ResponseCode 0; **resume banner** offers to reattach a ≤10-min-old pending row on mount; no full-screen veil — the button's radar carries the push call; card crossfade retained |
| Animated splash + brand loaders | ✅ LIVE | Reanimated 4.7.1 (Expo Go — clear cache if crash, see §9.3) |
| Offline / no-data UX | ✅ LIVE | NetInfo banner + human error mapping in `src/api.js` |
| Job listings / applications / matching | ⏳ PENDING | Screens are placeholders; no backend yet |
| KYC flow (§8) | 🟡 SUBMISSION LIVE | **4-step flow 2026-10-31**: personal → doc type → photos checklist → review (was 8 separate screens). Draft/images/submit API + urgent KSh 150 STK grant unchanged; review tooling + blur/glare ML deferred (see §10). **Personal step fixes 2026-10-31 (owner live report)**: DOB now prefills from the §7 profile when the KYC draft is empty (same lowercase gender enum, 1:1); DOB state is ISO-only (the display string was being round-tripped through a DD-MM-YYYY parser — EVERY picker-picked DOB failed Continue with an error that was never rendered, i.e. the dead-Continue bug); `errors.dob` now renders (red text + field border); gender pills rebuilt (icon + label, forest fill + cream text + check when selected — the old SecondaryButton chips were forest-on-forest when selected) |
| KYC capture REBUILD — one checklist + guided in-app camera (owner request 2026-10-31) | ✅ LIVE | **One screen** (`KycCaptureScreen`, route `KycCapture`) lists ID front + ID back (per doc type) + live selfie as cards with thumbnails and per-item status (Needed / Uploading / Upload failed→retry / Added) — the old KycDocFront / KycDocBack / KycSelfie / DocCaptureScreen are DELETED. **GuidedCapture** (in-app `expo-camera` CameraView modal, SDK 58) draws a scrim + guide frame — rounded **rect for documents (16:10)**, **oval for the selfie (3:4)**, circle for the avatar — and **crops the shot to that exact frame** (cover-fit preview→photo mapping `frameCropForPhoto`, center-crop fallback for gallery picks, WebP via `cropToWebp`). **Fixes the "app restarts after OK" bug**: the old `launchCameraAsync` + `allowsEditing` pipeline handed control to a foreign camera activity + OS crop editor, which reloads Expo Go — the in-app CameraView never leaves the app. Gallery path (documents + avatar) center-crops to the same frame and passes the same confirm stage (Retake / Use photo); selfies are live-only (§33.1). Torch toggle on the document camera; permission denial renders an inline explainer with Open-settings (no OS popup). Review retakes jump into the focused item's capture (`{ focus: 'id_front'|'id_back'|'selfie', returnTo: 'KycReview' }`). Smoke test `scripts/smoke_kyc_capture.js`: 34/34 (imports, crop-math units, route integrity, 12 screen renders via React-19 hook dispatcher) |
| Pricing table `payment_purposes` (§9) | ✅ LIVE | migrate_v5 (2026-10-31): purpose catalog moved OUT of the app into the DB — label, description, `amount_kes` (NULL = any), audience, STK labels, `is_active`, `sort_order`. `GET /api/payments/purposes` feeds the app picker (owner changes prices with NO app release); stk-push validates (unknown→400, inactive→409) and **enforces fixed prices server-side**; purpose label joined onto payment views so the success screen shows "Maid Gold · KES 500". Seeded: app_test any · kyc_urgent 150 (owner-confirmed) · profile_boost 100 · maid_basic 200 · maid_gold 500 · employer_gold 500 (provisional); application/application_boost seeded INACTIVE. E2E 22/22 |
| Media pipeline `media.maidora.co.ke` (§5.5) | ✅ LIVE | Owner-created subdomain; `POST /media/avatar` (public, unguessable names, immutable cache) + `POST /media/kyc/:field` (web-DENIED dir, authenticated stream only). Base64 JSON ≤5 MB, magic-byte sniff (WebP/JPEG/PNG), sha256, `media_assets` audit rows, old-file replace. Client converts captures to **WebP** before upload (≤1400 px docs / ≤900 px selfie / ≤600 px avatar). Avatar upload wired into ProfileScreen (camera-badge button) + drawer identity header. LiteSpeed uid trap solved (avatars 0644, KYC 0600). E2E 22/22 incl. deny + magic checks |
| Brand action sheet + edge-to-edge layout fix (owner request 2026-10-31) | ✅ LIVE | **ActionSheet** (`src/components/common/ActionSheet.js`) — brand-styled bottom sheet (handle, icon rows, cancel, nav-bar inset) replaces OS Alert choosers: document "Add photo" (take photo / gallery), profile-photo chooser, and gallery-permission guidance. **Root layout**: the KYC screens rendered raw ScrollViews and sat **edge-to-edge under the status bar AND the Android nav bar** (`edgeToEdgeEnabled: true`) — all four now render inside the safe-area `Screen` wrapper (top/left/right/bottom insets). Rule added to §4.5: every screen roots in `Screen`, never a bare ScrollView |
| Paywall after 2 applications (§9) | ⏳ PENDING | Needs applications first |
| Visibility decay ranking (§10) | ⏳ PENDING | `last_active_at` collected; ranking ships with search |
| Real chat backend | ⏳ PENDING | Chats tab is a placeholder |
| Admin dashboard (§13 control panel) | 📐 SPEC READY | `docs/Admin_Dashboard_Spec.md` (2026-10-31): RBAC admin_users, KYC review queue (admin-scoped media reader), users/transactions/pricing-editor modules, analytics, reports & disputes, event_log monitoring; 4 build phases (M1 read-spine → M4 trust ops). Not started — build later |
| SMS Retriever OTP autofill | ⏸️ DEFERRED | Needs EAS dev build; zero-native layers ship today (§5.7) |
| Push notifications | ⏳ PENDING | |

---

## 2. System architecture

```
┌──────────────────────────────────────┐
│  Mobile app — Expo Go / Expo SDK 58  │
│  RN 0.88 · React 19.3 · RN v7 nav    │
└───────────────┬──────────────────────┘
                │ HTTPS + JSON, Bearer JWT (30d)
                ▼
   https://gateway.maidora.co.ke/api
   Express (Node 24) on cPanel + LiteSpeed
   app root: /home/maidorac/maidora_app
     │             │                │
     ▼             ▼                ▼
  MySQL        TalkSasa SMS     Safaricom Daraja
  maidorac_db  (OTP send)       (OAuth + STK Push)
                                     │
                                     ▼ POST /api/payments/callback
                          Daraja calls us back with the result
```

---

## 3. Environments, hosts & access

| Thing | Value | Where the credential lives |
|---|---|---|
| cPanel host | `server19.tela-host.com` (86.107.77.86), user `maidorac` | SSH key `/home/z/my-project/.ssh/maidora_id_rsa` (passphrase in the agent's secret store — never in the repo) |
| App root on server | `/home/maidorac/maidora_app` | — |
| Node on server | v24 via `/home/maidorac/nodevenv/maidora_app/24/bin/` | — |
| Restart mechanism | `touch /home/maidorac/maidora_app/tmp/restart.txt` | — |
| Server `.env` | `/home/maidorac/maidora_app/.env` (chmod 600, never committed) | values only on server |
| Backups | `/home/maidorac/backups/gateway-*.tgz` + `payments-*.js` | — |
| GitHub | `github.com/AmungaLucas/Maidora_app_v0`, branch `main` | PAT in secret store — never in repo/docs |
| Sandbox (agent) checkout | `/home/z/my-project/workspace/Maidora_app_v0` | deploy scripts in `/home/z/my-project/scripts/` |

**Secrets policy:** consumer key/secret, passkey, PAT, SSH passphrase, DB
password, SMS token never appear in this repo or its docs — only their
*names* and locations.

**Timezone trap:** the server runs **UTC**. Daraja timestamps must be Kenya
time — `backend/src/services/mpesa.js → timestamp()` pins
`Intl.DateTimeFormat` to `Africa/Nairobi`. Never "simplify" this to local
time.

Business identifiers (not secrets — they appear on customer receipts):
M-Pesa shortcode **5511376**, PartyB **9393975**, transaction type
`CustomerBuyGoodsOnline`, callback `https://gateway.maidora.co.ke/api/payments/callback`.

---

## 4. Mobile app

### 4.1 Stack & hard rules

- Expo **SDK 58**, RN 0.88, React 19.3. Continuous Native Generation — never
  create/edit `ios/`/`android/` by hand.
- **React Navigation v7** (`native-stack` for auth/onboarding, `bottom-tabs`
  for role homes). **Never** expo-router / react-router.
- State: `src/context/AppContext.js` + AsyncStorage (`src/storage.js`).
- API client: `src/api.js` → `API_BASE_URL` from `src/theme.js`.
- `babel.config.js` = `babel-preset-expo` (committed). With Reanimated 4
  installed, the preset auto-applies the **worklets plugin** — this file must
  stay, or stale bundles crash (`[runtime not ready] 'bytecode'`).
- Always `npx expo install <pkg>` (not `npm install`) for RN/Expo packages.

### 4.2 Navigation map

Boot gate (`AppContext`, holds splash ≥ **2.6 s**):
`pendingRegistration → Otp` · `token+user+role → Tabs` · `token+user, role
unset → RoleSelect (onboarding)` · `onboardingComplete → Login` · else
`Welcome`.

- **native-stack:** Welcome, Signup, Otp, Login, RoleSelect (onboarding mode
  when the signed-in user has no role), ForgotPassword, Payment,
  KycIntro, KycPersonal, KycDocType, **KycCapture** (the ONE photos screen),
  KycReview, KycDone.
- **Employer tabs:** Home · My Jobs · Maids · Chats · Profile.
- **Househelp tabs:** Home · Find Jobs · Applications · Chats · Profile.
- **Flow change (2026-10-29, spec §3.2):** role is chosen AFTER verification —
  Welcome → Signup (no role) → OTP → RoleSelect (onboarding, immutable once
  set) → Tabs. `/auth/onboarding` sets it server-side.

### 4.3 Screens inventory

| Screen | File | State |
|---|---|---|
| Animated splash "Ping Letters" | `src/screens/SplashScreen.js` | ✅ live |
| Welcome | `WelcomeScreen.js` | ✅ live (Get Started → Signup) |
| Signup (location + referral, NO role) | `SignupScreen.js` | ✅ live |
| OTP (6-digit, zero-native autofill) | `OtpScreen.js` | ✅ live |
| RoleSelect / onboarding | `RoleSelectScreen.js` | ✅ live (dual mode) |
| Login / ForgotPassword | `LoginScreen.js`, `ForgotPasswordScreen.js` | ✅ live (login updates location) |
| Profile + §7 completeness editor | `ProfileScreen.js` | ✅ live (househelp) |
| M-Pesa payment test | `PaymentScreen.js` | ✅ live (real money — test KES 1) |
| Home (per role) | `HomeScreen.js` | ✅ hub + M-Pesa entry |
| My Jobs / Maids / Find Jobs / Applications | respective files | ⏳ placeholders |
| Chats | `ChatsScreen.js` | ⏳ placeholder |
| Settings | `SettingsScreen.js` | ✅ live |
| KYC intro / personal / doc type | `verification/KycIntroScreen.js`, `KycPersonalScreen.js`, `KycDocTypeScreen.js` | ✅ live (draft autosave, DOB picker, gender pills) |
| KYC photos checklist (front + back + selfie) | `verification/KycCaptureScreen.js` + `GuidedCapture.js` | ✅ live (guided frames, exact crop, WebP upload per item) |
| KYC review / done | `verification/KycReviewScreen.js`, `KycDoneScreen.js` | ✅ live (per-item retake → focused capture) |

### 4.4 Brand system

- Palette (`src/theme.js`): brand `#214E3B`, brandSoft `#7BC08B`, cream
  `#F7F3E9`, gold `#D6A64F`, goldDark `#9A742D`; `splashThemes`, `loaderTrack`.
- Components (`src/components/brand/`): `BrandMark`, `BrandLockup`,
  `BrandLoader` (**twinArcs / comet / radar / sweep** variants, SVG geometry
  viewBox 200×200 r=86/70), `LoadingButton`, `FullScreenLoader`.
- All animation is **Reanimated 4.7.1** (`react-native-worklets` runtime).

### 4.5 Layout / safe-area rules (hard-won)

- `Screen` (in `src/ui.js`) **always** applies 24 px horizontal padding and
  bottom padding; accepts `edges` for SafeAreaView (tab screens pass
  `['top','left','right']`).
- The tab bar must **not** set fixed height or `position:'absolute'` — React
  Navigation v7 auto-pads above the system nav bar (`src/navigation/Tabs.js`).
- **Every screen roots in `Screen` — never a bare ScrollView/View at the top
  of a screen component.** (Owner report 2026-10-31: the KYC screens used raw
  ScrollViews and rendered edge-to-edge under the status bar and the Android
  navigation bar because `edgeToEdgeEnabled: true`. All four now use
  `Screen`; keep it that way.)
- Bottom sheets (`ActionSheet`, `BottomSheetModal`) pad themselves with
  `useSafeAreaInsets().bottom` + `statusBarTranslucent`, so they work over
  edge-to-edge content untouched.

### 4.6 Networking & offline UX

- `ApiError {status, code, field}`; 20 s timeout (30 s for STK push).
- Network failures → *"You seem to be offline. Check your Wi-Fi or mobile
  data, then try again."*; timeout → *"This is taking longer than usual…"*
  (never raw developer text).
- `ui.js` renders a NetInfo-driven offline note on every screen.

### 4.7 Storage keys

`@maidora/token`, `@maidora/user`, `@maidora/onboardingComplete`,
`@maidora/pendingRegistration`.

### 4.8 OTP autofill (zero-native layers shipped)

1. iOS `textContentType="oneTimeCode"`, 2. Android
`autoComplete="sms-otp"`, 3. clipboard "Paste code" (`expo-clipboard`).
SMS Retriever (`expo-otp-autofill`) is **deferred to the EAS dev build**;
re-enable steps live in `AGENTS.md`.

---

## 5. Gateway

### 5.1 Layout (mirror to app root on deploy)

```
app.js                  entry — routers, 404 + error handler
src/config/index.js     dotenv (path resolved relative to module!) + typed config
src/config/db.js        MySQL pool (lazy)
src/routes/health.js    /api/health, /api/db-health
src/routes/auth.js      register | verify-otp | resend-otp | login | onboarding | me | email verification
src/routes/profile.js   GET/PUT maid profile + derived completeness (§7)
src/routes/kyc.js       KYC state | draft autosave | legacy image upload | submit | private image stream (§8)
src/routes/media.js     media pipeline: avatar (public) + KYC docs (private) → media.maidora.co.ke (§5.5)
src/routes/payments.js  purposes (pricing table) | stk-push (§5 gated) | list | :id status | callback (grants kyc_urgent)
src/services/otp.js     hashed OTPs (phone + email), cooldown/hourly/attempt caps
src/services/sms.js     TalkSasa API v3 client
src/services/email.js   nodemailer SMTP (optional email verification, fails soft)
src/services/mpesa.js   Daraja OAuth cache (~1 h), stkPush, stkQuery, Kenya-time timestamps
src/middleware/auth.js  requireAuth (JWT 30d + last_active_at 1h-throttled), requireVerified (§5 gate)
src/utils/validate.js   shared validation + disposable-email blocklist (mirrors app's src/validation.js)
sql/schema.sql          v2 canonical (idempotent)
sql/migrate_v2.js       live-DB migration v1→v2 (guarded ALTERs, run once per release)
sql/migrate_v5.js       v5: payment_purposes + media_assets + users.avatar_url (idempotent)
```

### 5.1b Media subdomain

`media.maidora.co.ke` (owner-created cPanel subdomain) — docroot
`/home/maidorac/media.maidora.co.ke`, served by LiteSpeed, NOT the Node app:
`avatars/` (public) and `kyc/` (web-DENIED) with managed `.htaccess` files
(the media route re-writes them idempotently on boot). See §5.5.

### 5.2 Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| GET `/api/health` | public | liveness (stable external contract) |
| GET `/api/db-health` | public | DB round-trip |
| POST `/api/auth/register` | public | create account (role NULL) + send 6-digit SMS OTP; disposable email blocked |
| POST `/api/auth/verify-otp` | public | `{userId, code}` → `{token, user}`; stamps `phone_verified_at`, activates |
| POST `/api/auth/resend-otp` | public | cooldown-enforced resend |
| POST `/api/auth/login` | public | identifier + password; §11 throttle; §6 location update; unverified → `requiresVerification` |
| POST `/api/auth/onboarding` | JWT | `{role}` chosen post-verification; immutable once set |
| GET `/api/auth/me` | JWT | validate stored token; returns REFRESHED 30d token + user |
| POST `/api/auth/request-email-verification` | JWT | SMTP 6-digit code (fails soft if `SMTP_PASS` unset) |
| POST `/api/auth/verify-email` | JWT | `{code}` → stamps `email_verified_at`; re-checks disposable list |
| GET `/api/profile` | JWT | maid profile + derived §7 completeness |
| PUT `/api/profile` | JWT | upsert §7 fields (househelp) |
| GET `/api/kyc` | JWT | KYC state: status, rejection reason, urgent flag, draft fields, image flags |
| PUT `/api/kyc/draft` | JWT | autosave personal/doc-type fields (client debounces ~1.5 s); `not_started` → `draft` |
| POST `/api/kyc/images` | JWT | one image per call (base64 JSON, ≤5 MB, magic-sniffed) → private `kyc_uploads/` |
| POST `/api/kyc/submit` | JWT + **verified** | completeness check → `kyc_status='submitted'` + `kyc_submitted_at`; writes lock (409) |
| GET `/api/kyc/images/:field` | JWT | streams the caller's own stored image (private dir; admin review access later) |
| POST `/api/payments/stk-push` | JWT + **verified** | `{amount, phone?, purpose?}` → STK prompt (§5 gate); purpose validated against `payment_purposes` (unknown→400, inactive→409) and **fixed prices enforced server-side** (client cannot underpay a plan); purpose `kyc_urgent` = KSh 150 expedite |
| GET `/api/payments/purposes` | JWT | the §9 pricing catalog from the `payment_purposes` TABLE (label/description/amount/audience, `is_active=1` only) — the app renders this instead of a hardcoded list; legacy-map fallback when the table is absent |
| GET `/api/payments` | JWT | user's last 20 payments (purpose label joined) |
| GET `/api/payments/:id?refresh=1` | JWT | status (purpose label joined); `refresh=1` may live-query Daraja (§6.2) |
| POST `/api/payments/callback` | **public** | Daraja result receiver — ACKs fast |
| POST `/api/media/avatar` | JWT | profile photo (base64 WebP/JPEG/PNG, ≤5 MB, magic-sniffed) → public `media.maidora.co.ke/avatars/…` URL on `users.avatar_url` + `media_assets` row; replaces (deletes) the previous file |
| POST `/api/media/kyc/:field` | JWT | KYC doc `id_front\|id_back\|selfie` (same validation) → web-DENIED `kyc/` dir, basename on `users.kyc_*_url`, `media_assets` audit row; same `{ok, field}` contract as the legacy `/kyc/images` (which stays for compatibility) |

### 5.3 Environment variables (names only — values in server `.env`)

`JWT_SECRET` · `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT/DB_POOL` ·
`SMS_API_URL` · `SMS_API_TOKEN` · `SMS_SENDER_ID` (TALK-SASA) ·
`OTP_TTL_MINUTES` · `OTP_APP_HASH` (empty until dev build) ·
`SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM` (email path;
`SMTP_PASS` rotated secret, server-only) ·
`LOGIN_MAX_FAILS/LOGIN_FAIL_WINDOW_MIN/LOGIN_COOLDOWN_MIN/LOGIN_MAX_PER_IP_HOUR` (§11 defaults 5/15/15/20) ·
`MPESA_BASE_URL` (prod `https://api.safaricom.co.ke`) ·
`MPESA_PROD_CONSUMER_KEY` / `_CONSUMER_SECRET` / `_BUSINESS_SHORTCODE` /
`_TRANSACTION_TYPE` / `_PARTY_B` / `_PASSKEY` · `MPESA_CALLBACK_URL` ·
`MPESA_ACCOUNT_REFERENCE` (Maidora, ≤12 — fallback only; the per-purpose `PURPOSE_STK` map in `routes/payments.js` overrides) · `MPESA_TRANSACTION_DESC` (≤13, fallback only) ·
`MEDIA_DIR` (docroot `/home/maidorac/media.maidora.co.ke`) · `MEDIA_BASE_URL` (`https://media.maidora.co.ke`) ·
`NODE_ENV=production`.

### 5.4 Database

- **users (v3)** — identity; `role` NULL until onboarding (immutable after);
  §4.2 split status model: `account_status` enum, `phone_verified_at`,
  `email_verified_at`, `kyc_status` + reason/submitted/reviewed **+ §8
  submission columns** (`kyc_full_name`, `kyc_id_number`, `kyc_id_type`,
  `kyc_date_of_birth`, `kyc_gender`, `kyc_id_front/back/selfie_url`,
  `kyc_urgent` + `kyc_urgent_paid_at`, `kyc_draft_updated_at` — migrate_v3,
  idempotent); `last_login_at`, `last_active_at` (1h write-throttled); location
  (`location_name`/`location_area`/`location_county` + `location_source`
  gps\|manual + lat/lng); referrals (`my_referral_code` own,
  `referred_by_code` entered at signup). Old single `status` and
  `phone_verified` columns were migrated and dropped.
- **maid_profiles** — §7 fields: `date_of_birth`, `gender`, `languages`
  (JSON array), `job_type` (live_in\|live_out\|day_burg), `years_experience`,
  `wage_expectation`, `bio`, `photo_url` (pipeline ships with KYC),
  `next_of_kin_*`. Completeness derived at read — never stored.
- **login_attempts** — §11 throttle data (identifier, ip, success, ts).
- **phone_otps** — SHA-256 `code_hash`, attempts, `expires_at`, `consumed_at`.
- **email_otps** — same policy for the optional email path.
- **payments** — `purpose` (incl. `kyc_urgent` — a settled push grants
  `kyc_urgent` on the payer), `amount`, `phone`, `merchant_request_id`,
  `checkout_request_id` (indexed), `mpesa_receipt`, `result_code`,
  `result_desc`, `status` enum(`pending`,`success`,`failed`),
  `raw_callback` (full Daraja JSON), timestamps. MySQL typed the JSON column
  as `longtext` — harmless.
- **payment_purposes (v5)** — the §9 PRICING TABLE, source of truth for what
  can be paid for and what it costs: `code` PK, `label`, `description`,
  `amount_kes` (NULL = caller picks), `audience` enum(`system`,`both`,
  `househelp`,`employer`), `stk_ref`/`stk_desc` (STK labels), `is_active`,
  `sort_order`. Owner edits rows (dashboard later, §13) — no app release.
  stk-push: unknown→400 `bad_purpose`, inactive→409 `purpose_inactive`,
  fixed price **enforced** (client amount overridden + logged). Seeded:
  app_test(any) · kyc_urgent 150 · profile_boost 100 · maid_basic 200 ·
  maid_gold 500 · employer_gold 500 (active); application 20 ·
  application_boost 50 (INACTIVE until those products ship). Prices marked
  provisional except kyc_urgent.
- **media_assets (v5)** — upload audit trail: `user_id`, `kind`
  enum(`avatar`,`id_front`,`id_back`,`selfie`), `storage_path` (relative to
  the media root), `public_url` (avatars), `bytes`, `mime` (SNIFFED),
  `sha256`. Feeds the admin dashboard (§13) audit + cleanup.
- **users.avatar_url (v5)** — public avatar URL; exposed as `avatarUrl` in
  every `publicUser` shape (`/auth/me`, login, verify-otp).

**Schema migrations:** `schema.sql` is the canonical fresh-install DDL
(idempotent `IF NOT EXISTS`). For the LIVE DB, run
`nodevenv/…/bin/node sql/migrate_vN.js` — every ALTER is guarded by an
`INFORMATION_SCHEMA` check, so it is safe to re-run.

### 5.5 Media pipeline (media.maidora.co.ke, 2026-10-31)

All uploads are base64 JSON (same shape as the KYC legacy route), capped at
5 MB decoded, magic-byte SNIFFED (WebP/JPEG/PNG — never the declared mime),
sha256-hashed, logged to `media_assets`, filenames `<ts>_<96-bit random>`.
The client converts to WebP before upload (expo-image-manipulator
`SaveFormat.WEBP`, ≤1400 px docs / ≤900 px selfie / ≤600 px avatar).

| Class | Location | Exposure |
|---|---|---|
| avatars | `media.maidora.co.ke/avatars/` | **public** via the subdomain; privacy = unguessable 128-bit name; immutable-cache headers; 0644 |
| KYC docs | `media.maidora.co.ke/kyc/` | web-DENIED (`Require all denied`); readable ONLY through authenticated `GET /api/kyc/images/:field` (streams the caller's OWN file, basename-resolved, legacy `kyc_uploads/` still honoured); 0600 |

`.htaccess` hardening (written by the media route + deploys): root —
`Options -Indexes`, script execution removed/denied, dotfiles denied,
`nosniff`; `avatars/` — public cache; `kyc/` — deny-all.

**LiteSpeed permission trap (E2E-proven):** LiteSpeed reads files under a
DIFFERENT uid than the app owner — avatars written 0600 returned 403 while
0644 serves `image/webp` 200. Avatars are 0644 (privacy from the random
name); KYC files stay 0600 because only the API (running as the owner uid)
ever reads them.

---

## 6. M-Pesa end-to-end (read before touching payments)

### 6.1 Push sequence

App `POST /payments/stk-push` → validate amount/phone → **persist `pending`
row first** → `mpesa.stkPush` (OAuth cached, password =
base64(shortcode+passkey+**Kenya-time** timestamp), **AccountReference +
TransactionDesc from the `PURPOSE_STK` map — purpose → ≤12-char alnum ref /
≤13-char desc, e.g. `app_test`→TEST/"Test payment", `kyc_urgent`→KYCURGENT/
"Urgent KYC", `employer_gold`→EMPLOYERGOLD/"Employer Gold" (added 2026-10-31
with the app's purpose selector; row round-trip E2E-proven)**) → persist
`checkout_request_id` → app starts polling. Daraja
refuses → row marked `failed` with the reason (4999 "existing USSD Session"
observed live 2026-10-31 when two pushes hit the same MSISDN 2 s apart —
the second row correctly settles `failed` from the callback).

The row's `checkout_request_id` doubles as the client's **stage-2 signal**:
`paymentView` always exposes it, `null` until Daraja accepts (the background
write can lag seconds on the loaded host — that is exactly what the
§6.3 retry covers). The app's staged tracker ticks "Prompt sent to your
phone" only when it becomes non-null, so no stage is cosmetic.

### 6.2 Settlement policy — **the callback is the single source of truth**

The STK **query** API returns misleading results for in-flight prompts
(observed live 2026-10-28: `1032 Request Cancelled by user` at **t+12 s**,
before the prompt reached the phone → the old code showed "Payment not
completed" prematurely). Therefore:

| Age of payment | Query behaviour |
|---|---|
| 0 – 45 s (`GRACE_MS`) | never query — prompt may still be travelling |
| 45 s – 150 s | query may only **confirm success** (`ResultCode 0`); failure codes are reported as `live` info, row stays `pending` |
| > 150 s (`SETTLE_MS`) | definitive codes **1** (insufficient funds), **1032** (cancelled), **1037** (expired) finally close the row as `failed` so nothing hangs forever |

- A callback **always overrides** stored state (unconditional
  `UPDATE … WHERE checkout_request_id = ?`) — success included.
- Success via query sets `result_code=0` guarded by `AND status='pending'`
  so a just-landed callback is never clobbered; the callback later fills
  `mpesa_receipt` from `CallbackMetadata`.

### 6.3 ACK to Daraja

`POST /api/payments/callback` always answers HTTP 200 with **both documented
conventions**: `{"ResponseCode":"0","ResponseDescription":"Accepted",
"ResultCode":0,"ResultDesc":"Accepted"}` — whichever parser Safaricom runs
finds its expected pair, so it never retries. Unknown checkout IDs and
malformed payloads are logged, still ACKed.

**Unmatched ≠ lost (2026-10-31).** The settlement is extracted into
`settleByCheckoutId`; the first attempt runs inline before the ACK, and if
it matches 0 rows (callback raced the lagging background write — observed
13.4 s on #32) the **same settlement is retried in the background every
2.5 s for up to 24 attempts (~60 s)**. Residual risk: a gateway restart
inside the retry window — the §6.2 150 s query path still settles the row
(without the receipt number). E2E-proven live: `scripts/deploy_mpesa_staged_ui.py`
inserts a row without `checkout_request_id`, fires the callback (warn +
retries), simulates the late write → `late row write matched on retry #2`
→ row settled with receipt.

### 6.4 Client polling (`PaymentScreen.js`)

- Every **4 s for 52 polls (~3.5 min)**, always `refresh=1` (server decides
  when to actually query).
- Pending past cap → "We stopped auto-checking…" (neutral gold, **never
  failed**) + *Keep Checking*.
- Success without receipt → keeps polling up to **8 extra polls (~30 s)** so
  the callback's receipt replaces *"Confirming…"*.
- Failure → human sentences keyed by `result_code`: 1 insufficient balance ·
  1032 cancelled · 1037 expired · 2001 wrong PIN.
- **Staged progress card (2026-10-31)**: the PENDING card shows a
  4-step tracker — ① Payment accepted by gateway (row exists) ② Prompt sent
  to your phone (`checkoutRequestId` non-null) ③ Enter your M-Pesa PIN
  (countdown mirroring the polling window) ④ Payment confirmed — plus a
  "Didn't get a prompt?" tips toggle. No full-screen veil between the button
  and the card — the PrimaryButton's radar loading state carries the push
  call; ticks skip while one is in flight and `doneRef` swallows stray
  ticks (one end-log, always).
- **Separate outcome screens (2026-10-31 UX round)**: SUCCESS gets its own
  celebration (receipt, amount, paid-at EAT — deterministic UTC+3
  formatting) and FAILURE a calm code-specific card — the tracker is
  progress-only and never appears on outcome screens. Celebration fires
  only on a backend-confirmed ResultCode 0 (callback or authoritative
  query), never on the synchronous push ResponseCode.
- **Brand terminal animations (2026-10-31, replaces the generic
  checkmark)**: `components/brand/SuccessMark.js` — the exact BrandMark
  paths (single source: `MARK_PATHS`) draw themselves stroke-by-stroke via
  clamped `strokeDashoffset` windows on a JS master clock (dash lengths
  measured from real path data, ×1.02 headroom): radar lock-on ring → p3
  house → p2 inner stroke → p1 pillar fade (28%) → p4 gold seam → gold
  spark at the seam end (stays, echoing BrandLoader's comet head) + 8
  particle one-shot burst in gold/brandSoft/goldDark. View layers (ring,
  spark, particles, badge spring) ride a parallel NATIVE-driven clock —
  smooth on low-end Android while the JS clock paints the strokes.
  `components/brand/FailMark.js` — the inverse: three radar rings collapse
  INWARD (staggered, full fade-out) onto a ghost BrandMark rendered in
  `colors.line`, a danger dot pops with slight overshoot, one soft danger
  pulse breathes out, keyframed shake (0→−9→+8→−6→+4→0 px) — every layer
  transform/opacity, fully native-driven. Both replay automatically (card
  branch remounts on status flip) and both rest on a clean final frame.
- **Resume on mount**: pending rows younger than 10 min trigger a
  "Resume watching / Dismiss" banner — covers the app-closed-mid-payment
  edge case (the gateway + M-Pesa SMS settle regardless).

### 6.5 Test practices

- **No-money STK smoke:** MSISDN `+254000000000` (unallocated) — push
  accepted, nothing can complete.
- **Callback round-trip:** insert synthetic row `purpose='smoke_e2e'`, POST a
  Daraja-shaped success callback with `CallbackMetadata`, assert
  `success|0|SMK…` + receipt stored, then flip with a failure callback to
  prove override, then DELETE. Automated in
  `scripts/deploy_mpesa_settlement.py` (all probes PASS).
- Real verified transaction: KES 1, receipt `UJS6N01T1A` (2026-10-28).

---

## 7. Deployment & operations

1. Backup: `tar czf /home/maidorac/backups/gateway-<stamp>.tgz -C app-root app.js .env sql src`.
2. Upload `backend/` tree via SFTP (scripts in
   `/home/z/my-project/scripts/deploy_backend_v2.py`,
   `deploy_mpesa_settlement.py`).
3. `touch tmp/restart.txt` + sleep (LiteSpeed Node selector).
4. Probes: `/api/health`, `/api/db-health`, unauth `/api/payments` → 401,
   callback ACK shape, (when relevant) synthetic callback round-trip.
5. App releases = git push; the developer machine pulls, `npm install`,
   `npx expo start -c` after babel/plugin-affecting changes.

`node --check` for gateway files; @babel parse for JSX files before deploy.
DB schema changes: `schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`);
new columns need explicit `ALTER TABLE` verification.

---

## 8. Verification checklist (must pass before calling anything "done")

- [ ] `/api/health` → `{"status":"ok"}`; `/api/db-health` → database ok
- [ ] `POST /api/payments/callback` (unknown id) → dual-convention ACK
- [ ] Synthetic success callback settles row + stores receipt; failure callback overrides
- [ ] `GET /api/payments` unauthenticated → 401
- [ ] `scripts/e2e_test.py` → 9/9 (auth + OTP flow)
- [ ] App boots in Expo Go: `git pull && npm install && npx expo start -c`

---

## 9. Known traps (do not relearn these the hard way)

1. **Server runs UTC** — pin Daraja timestamps to `Africa/Nairobi`.
2. **dotenv cwd pitfall** — `.env` path resolves relative to
   `src/config/index.js`, so scripts/workers run from any cwd.
3. **Reanimated on Expo Go** — a stale transform cache crashes with
   `[runtime not ready] 'bytecode'`; fix is `npx expo start -c`. If it ever
   persists, a built-in-Animated fallback of all three animated components
   exists at commit `3368b74`.
4. **Expo Go = no custom native modules** — crash pattern
   `[runtime not ready] … cannot find native module 'X'` ⇒ defer to the EAS
   build (see OTP autofill history).
5. **STK query lies in-flight** — never settle failures from it before
   `SETTLE_MS` (§6.2).
6. **Tab bar** — no fixed height / absolute positioning (§4.5).
7. **Gateway stdout is lost** — cPanel Passenger drops `console.log`; only
   stderr persists in `~/maidora_app/stderr.log`. Any server-side line that
   matters (payment tracing, settlement) MUST use `console.error`.
8. **Client abort ≠ failed push** — a cancelled/timeout fetch on stk-push
   means the APP gave up, not Safaricom. The gateway now answers stk-push
   instantly (respond-first: row → 200 → background Daraja), so this race
   is closed; never reintroduce a synchronous wait on Daraja inside a
   request handler.

---

## 10. Pending work / roadmap

**Next up (spec §14 order):** KYC **review tooling** — admin screen to view
submissions (own-image streaming route exists; media pipeline now stores the
documents under `media.maidora.co.ke/kyc/` web-denied — the admin reader
from `docs/Admin_Dashboard_Spec.md` M2 plugs straight in) · blur/glare ML
detection + real liveness/face-
match deferred to the EAS dev build (zero-native layers ship today) · jobs
listings CRUD + Find Jobs feed · applications + §9 welcome bonus (2
lifetime) + paywall (tiers DECIDED via MPS Amendment v3.2 — PAYG KSh 50 /
Basic KSh 99 / Gold KSh 199 + boosts; only multi-device session policy
§15.6 still open) · search/matching with location + §10 decay ranking ·
real chat backend · §13 suggestion cards (day-based, dismissible) · push
notifications.

**Admin dashboard (§13):** spec approved 2026-10-31 —
`docs/Admin_Dashboard_Spec.md`. Build later, M1 read-spine first (admin
login/RBAC, KPIs, users, payments). The `payment_purposes` pricing editor
(M3) completes the "prices change without an app release" loop started by
migrate_v5.

**Gateway hardening:** cron to expire stale `pending` payments (e.g. > 24 h)
· log rotation/monitoring · optional IP filtering on the callback route ·
email-change endpoint (blocklist re-check included) · per-phone OTP abuse
metrics.

**Production build (EAS):** dev build to re-enable `expo-otp-autofill`
(then set `OTP_APP_HASH` — gateway already appends it) · store builds ·
privacy policy & store assets.

**Security hygiene:** rotate SSH passphrase + GitHub PAT (due) · SMTP
credential activated 2026-10-29; because the value also transited chat in
plain text (and matches the SSH passphrase), rotate it at the cPanel mail
account at the next rotation window — server `.env` is the only place it
ever lives.

---

## 11. Documentation rule (mandatory workflow)

1. Finish a unit of work → append a dated entry to **`WORKLOG.md`** (what
   changed, commit hashes, server state, gotchas discovered).
2. In the **same commit**, update the relevant sections of **this file**
   (status snapshot §1, flows §4–§7, traps §9, roadmap §10).
3. Order (worklog-first or architecture-first) does not matter — what
   matters is that neither is left behind by a push.
