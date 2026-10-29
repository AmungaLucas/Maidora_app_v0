# Maidora Kenya — mobile app

Expo / React Native app for the Maidora Kenya two-sided marketplace
("Trusted help for your household"), connecting households with house helps
across Kenya. Brand palette (`src/theme.js`): brand `#214E3B` (forest),
brandSoft `#7BC08B` (fresh green), cream `#F7F3E9`, gold `#D6A64F`
(hearts/highlights/footer), goldDark `#9A742D` (eyebrows & inline links).

## Stack decisions (do not violate)

- **Navigation: React Navigation** (`@react-navigation/native` + `@react-navigation/native-stack` + bottom-tabs + drawer).
  We do NOT use expo-router file-based routing. Screens live in `src/screens/`
  organized by domain: `auth/ home/ maid/ employer/ chat/ profile/ payments/
  settings/ verification/`. The root navigator + auth/onboarding gate live in
  `App.js`; the Profile tab is a real drawer navigator (`src/navigation/ProfileDrawer.js`).
- Expo SDK 58, React Native 0.88, React 19.3. No `ios/`/`android/` folders
  (Continuous Native Generation) — never create or edit them by hand; configure
  via `app.json` and config plugins.
- State: React Context (`src/context/AppContext.js`) + AsyncStorage
  (`src/storage.js`). No Redux/Zustand unless the team agrees first.
- API: `src/api.js` talks to `https://gateway.maidora.co.ke/api` (the Node.js
  gateway deployed on cPanel; see below).

## Commands

```bash
npx expo install <package>   # ALWAYS use instead of npm add — resolves SDK-compatible versions
npx expo start               # start the dev server (Expo Go on your phone)
npx expo lint                # lint
npx expo-doctor              # diagnose dependency/config issues
npx expo install --fix       # fix incompatible package versions
```

Expo changes every SDK release — do not trust memory over the versioned docs:
https://docs.expo.dev/versions/v58.0.0/

## App flow (implemented)

First install: Splash → Welcome → Signup (NO role) → OTP (SMS, 6 digits) →
RoleSelect (onboarding — role chosen here, immutable once set) → role-based
bottom tabs.

Later launches: Splash → gate on stored state — signed in with role → tabs;
signed in without role → RoleSelect (onboarding); not signed in → Login;
onboarding seen → Welcome skipped; pending OTP registration → OTP.

### Bottom tabs (role-based)

- Househelp: Home | Find Jobs | Applications | Chat | Profile
- Employer: Home | My Jobs | Maids | Chats | Profile
- Defined in `src/navigation/Tabs.js` (one `createBottomTabNavigator` per
  role). `tabsRouteFor(user)` gives the root-stack route name.

### Rules baked into the code — keep them true

- **Role is chosen at ONBOARDING, after phone verification (spec §3.2) —
  and is immutable once set.** No endpoint accepts a role change; the only
  client surface is Settings → "Change my role" → explainer sheet → manual
  review by the team. Signup never sends a role; the server ignores one.
- Signup validation mirrors the server exactly (see `src/validation.js` vs
  gateway `src/utils/validate.js`): password ≥ 8 chars, valid email
  (disposable domains blocked), Kenyan phone (`07…`, `01…`, `+2547…`,
  `+2541…` → normalized to `+2547…`/`+2541…`).
- The pending `userId` from `POST /auth/register` is persisted
  (`@maidora/pendingRegistration`) so the OTP screen survives app restarts.
- Primary buttons stay disabled until the form is valid — no dead-end API errors.
- Referral entry is a collapsed text link ("Have a referral code?").
- Terms/Privacy links sit directly above the Create Account button.
- Verification gate (spec §5): service endpoints (STK push today; job
  apply/post/chat-start later) require phone OR email verification —
  `requireVerified` on the gateway; browsing stays open.

## Backend (gateway)

Deployed at `https://gateway.maidora.co.ke` (Node.js 24 on cPanel/LiteSpeed,
app root `/home/maidorac/maidora_app` on server19.tela-host.com). The gateway
source is version-controlled in this repo under `backend/` (mirrored to the
server root; `.env` lives only on the server — see `backend/.env.example`).

Layout (restructured):

```
app.js                  entry — mounts routers
src/config/index.js     env loading (dotenv) + typed config sections
src/config/db.js        MySQL pool
src/routes/health.js    /api/health (stable contract), /api/db-health
src/routes/auth.js      /api/auth/register|verify-otp|resend-otp|login|onboarding|me|email verification
src/routes/profile.js   /api/profile (GET/PUT maid profile + §7 completeness)
src/routes/payments.js  /api/payments/stk-push|:id|callback, /api/payments
src/services/otp.js     hashed OTP storage (phone + email), cooldowns/caps, SMS template
src/services/sms.js     TalkSasa client
src/services/email.js   nodemailer SMTP (optional email verification, fails soft)
src/services/mpesa.js   Safaricom Daraja: OAuth cache, STK Push, STK Query
src/middleware/auth.js  requireAuth (JWT + last_active_at) + requireVerified (§5 gate)
src/utils/validate.js   validation + disposable-email blocklist (mirrors src/validation.js on mobile)
sql/schema.sql          v2 canonical DDL (idempotent, IF NOT EXISTS)
sql/migrate_v2.js       live-DB migration v1→v2 (guarded ALTERs)
```

### M-Pesa (LIVE — Daraja production STK Push)

- `POST /api/payments/stk-push` `{amount, phone?, purpose?}` (auth) → creates a
  `payments` row, calls STK Push (`CustomerBuyGoodsOnline`, till `5511376`,
  store `9393975`), returns `{paymentId, checkoutRequestId}`.
- `GET /api/payments/:id?refresh=1` (auth) → status; while `pending` it
  live-queries Daraja only after a 12s grace period, and only acts on
  definitive codes (`0` success; `1`/`1032`/`1037` failed) — everything else
  stays pending and the callback settles it, so the UI can never show
  "failed" while the user is still keying their PIN.
- `POST /api/payments/callback` (public) → Safaricom result receiver; ACKs
  `{ResultCode:0}`. `MPESA_CALLBACK_URL` = `https://gateway.maidora.co.ke/api/payments/callback`.
- Amounts are integers (KES), 1–500000. Testing charges real money — use KES 1.
- Client: `PaymentScreen` (stack route `Payment`, entry card on Home) polls
  every 4s for up to ~3 min (`MAX_POLLS=45`); after that the payment stays
  pending with a "Keep Checking" action — never auto-flips to failed.
  First verified live success: receipt `UJS6N01T1A` (KES 1).

### Brand components (`src/components/brand/`)

- `BrandMark` — exact 720×680 SVG paths (pillar p1, house strokes p2+p3,
  gold seam p4). `react-native-svg`.
- `BrandLoader` — radar / twinArcs / comet / sweep variants
  (`react-native-reanimated`). Radar is the locked button/full-screen loader.
- `BrandLockup` — mark + MAIDORA + tagline (Welcome screen).
- `FullScreenLoader` — dark/light veil Modal with the radar loader
  (used while the STK push is being sent).
- `LoadingButton` — radar-in-button with success state; `PrimaryButton` in
  `ui.js` mirrors it (loading radar + `success`/`loadingLabel` props).
- `SplashScreen` — "Ping Letters" timeline (rings, mark spring, MAIDORA
  letter spring, tagline fade). Presentational; `AppContext` holds booting
  for `SPLASH_MIN_MS = 2600` so it always completes.
- Offline UX: `useIsOffline()` + `OfflineNote` (NetInfo) render automatically
  inside every `Screen`; `api.js` maps network failures to human messages
  (`OFFLINE` / `TIMEOUT` codes).

### OTP autofill

- Shipped today (zero native modules — works in Expo Go):
  - iOS: `textContentType="oneTimeCode"` on the hidden OTP input.
  - Android 10+: `autoComplete="sms-otp"` (Gboard surfaces the incoming code).
  - Universal fallback: clipboard "Paste code" button (`expo-clipboard`).
- DEFERRED to tail-end of production: `expo-otp-autofill` (SMS Retriever API).
  It is a **native module** — requires a custom development build, crashes
  with `cannot find native module 'expootpautofill'` in Expo Go. When we do
  the production build: re-add the package, get the 11-char app hash from
  `getAppHashAsync()`, set `OTP_APP_HASH` in the server `.env` — the gateway
  already appends it to every OTP SMS (`src/services/otp.js`).

SMS OTP via TalkSasa (`bulksms.talksasa.com/api/v3`). Optional email
verification via nodemailer SMTP (`mail.maidora.co.ke`,
`verification@maidora.co.ke`) is wired server-side — it activates when the
rotated `SMTP_PASS` is set in the server `.env`. The Forgot Password screen
is still a placeholder until a reset flow (email or SMS) is designed.

## Conventions

- EAS for builds (`npx eas-cli`); OTA updates via `eas update` later.
- After adding a library with native code, a development build is required:
  `npx expo run:android|ios` or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries.
- Brand tokens live in `src/theme.js` — never hardcode hex values in screens.

## Documentation (mandatory workflow)

- `Maidora_kenya_Architecture.md` — the living architecture document (app +
  gateway + infra + M-Pesa policy + traps + roadmap).
- `WORKLOG.md` — dated per-session log, newest first, with commit hashes.
- **Rule:** every session updates the worklog AND the affected sections of
  the architecture doc, in the same commit/push. Neither may be left behind.
