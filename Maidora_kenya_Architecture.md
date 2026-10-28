# Maidora Kenya — Architecture & Project Documentation

> **Living document.** Every working session must keep this file and
> `WORKLOG.md` in sync with reality (in the same commit). Section 11 defines
> the rule. Last updated: **2026-10-29**.

Maidora Kenya ("Trusted help for your household") is a two-sided marketplace
connecting households (employers) with house helps across Kenya. This repo
contains the **mobile app** (Expo/React Native) and the **API gateway**
(`backend/`, Express + MySQL) deployed at `https://gateway.maidora.co.ke`.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| cPanel hosting + Node 24 gateway | ✅ LIVE | LiteSpeed Node selector, restart via `tmp/restart.txt` |
| MySQL schema (users, phone_otps, payments) | ✅ LIVE | `backend/sql/schema.sql`, idempotent |
| Auth: signup → SMS OTP (TalkSasa) → JWT | ✅ LIVE | Role (employer/househelp) immutable after signup |
| M-Pesa STK Push → callback → receipt | ✅ LIVE | Real KES 1 txn succeeded (receipt `UJS6N01T1A`); callback round-trip proven with synthetic rows |
| App: Welcome → Role → Signup → OTP → Login | ✅ LIVE in Expo Go | React Navigation v7 |
| App: role-based bottom tabs | ✅ LIVE | Employer & Househelp tab sets |
| App: M-Pesa payment screen + polling | ✅ LIVE | 3.5-min patient polling, receipt chase, friendly failures |
| Animated splash + brand loaders | ✅ LIVE | Reanimated 4.7.1 (Expo Go — clear cache if crash, see §9.3) |
| Offline / no-data UX | ✅ LIVE | NetInfo banner + human error mapping in `src/api.js` |
| Job listings / applications / matching | ⏳ PENDING | Screens are placeholders; no backend yet |
| Real chat backend | ⏳ PENDING | Chats tab is a placeholder |
| Profiles, verification, ratings | ⏳ PENDING | |
| SMS Retriever OTP autofill | ⏸️ DEFERRED | Needs EAS dev build; zero-native layers ship today (§5.7) |
| Email notifications (nodemailer) | ⏳ PENDING | Credentials not yet supplied |
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
`pendingRegistration → Otp` · `token+user → Tabs` · `onboardingComplete →
Login` · else `Welcome`.

- **native-stack:** Welcome, RoleSelect, Signup, Otp, Login, ForgotPassword, Payment.
- **Employer tabs:** Home · My Jobs · Maids · Chats · Profile.
- **Househelp tabs:** Home · Find Jobs · Applications · Chats · Profile.

### 4.3 Screens inventory

| Screen | File | State |
|---|---|---|
| Animated splash "Ping Letters" | `src/screens/SplashScreen.js` | ✅ live |
| Welcome / RoleSelect | `WelcomeScreen.js`, `RoleSelectScreen.js` | ✅ live |
| Signup (location + referral) | `SignupScreen.js` | ✅ live |
| OTP (6-digit, zero-native autofill) | `OtpScreen.js` | ✅ live |
| Login / ForgotPassword | `LoginScreen.js`, `ForgotPasswordScreen.js` | ✅ live |
| M-Pesa payment test | `PaymentScreen.js` | ✅ live (real money — test KES 1) |
| Home (per role) | `HomeScreen.js` | ✅ hub + M-Pesa entry |
| My Jobs / Maids / Find Jobs / Applications | respective files | ⏳ placeholders |
| Chats | `ChatsScreen.js` | ⏳ placeholder |
| Profile / Settings | `ProfileScreen.js`, `SettingsScreen.js` | ✅/⏳ |

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
src/routes/auth.js      register | verify-otp | resend-otp | login | me
src/routes/payments.js  stk-push | list | :id status | callback
src/services/otp.js     hashed OTPs, cooldown/hourly/attempt caps
src/services/sms.js     TalkSasa API v3 client
src/services/mpesa.js   Daraja OAuth cache (~1 h), stkPush, stkQuery, Kenya-time timestamps
src/middleware/auth.js  requireAuth (JWT Bearer, 30 d, {uid, role})
src/utils/validate.js   shared validation (mirrors app's src/validation.js)
sql/schema.sql          users, phone_otps, payments (idempotent)
```

### 5.2 Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| GET `/api/health` | public | liveness (stable external contract) |
| GET `/api/db-health` | public | DB round-trip |
| POST `/api/auth/register` | public | create account + send 6-digit SMS OTP |
| POST `/api/auth/verify-otp` | public | `{userId, code}` → `{token, user}` |
| POST `/api/auth/resend-otp` | public | cooldown-enforced resend |
| POST `/api/auth/login` | public | identifier + password |
| GET `/api/auth/me` | JWT | validate stored token |
| POST `/api/payments/stk-push` | JWT | `{amount, phone?, purpose?}` → STK prompt |
| GET `/api/payments` | JWT | user's last 20 payments |
| GET `/api/payments/:id?refresh=1` | JWT | status; `refresh=1` may live-query Daraja (§6.2) |
| POST `/api/payments/callback` | **public** | Daraja result receiver — ACKs fast |

### 5.3 Environment variables (names only — values in server `.env`)

`JWT_SECRET` · `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT/DB_POOL` ·
`SMS_API_URL` · `SMS_API_TOKEN` · `SMS_SENDER_ID` (TALK-SASA) ·
`OTP_TTL_MINUTES` · `OTP_APP_HASH` (empty until dev build) ·
`MPESA_BASE_URL` (prod `https://api.safaricom.co.ke`) ·
`MPESA_PROD_CONSUMER_KEY` / `_CONSUMER_SECRET` / `_BUSINESS_SHORTCODE` /
`_TRANSACTION_TYPE` / `_PARTY_B` / `_PASSKEY` · `MPESA_CALLBACK_URL` ·
`MPESA_ACCOUNT_REFERENCE` (Maidora, ≤12) · `MPESA_TRANSACTION_DESC` (≤13) ·
`NODE_ENV=production`.

### 5.4 Database

- **users** — identity, role enum (`employer`/`househelp`, immutable after
  signup), phone unique, `status` enum, optional lat/lng + referral codes.
- **phone_otps** — SHA-256 `code_hash`, attempts, `expires_at`, `consumed_at`.
- **payments** — `purpose`, `amount`, `phone`, `merchant_request_id`,
  `checkout_request_id` (indexed), `mpesa_receipt`, `result_code`,
  `result_desc`, `status` enum(`pending`,`success`,`failed`),
  `raw_callback` (full Daraja JSON), timestamps. MySQL typed the JSON column
  as `longtext` — harmless.

---

## 6. M-Pesa end-to-end (read before touching payments)

### 6.1 Push sequence

App `POST /payments/stk-push` → validate amount/phone → **persist `pending`
row first** → `mpesa.stkPush` (OAuth cached, password =
base64(shortcode+passkey+**Kenya-time** timestamp)) → persist
`checkout_request_id` → app starts polling. Daraja refuses → row marked
`failed` with the reason.

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

### 6.4 Client polling (`PaymentScreen.js`)

- Every **4 s for 52 polls (~3.5 min)**, always `refresh=1` (server decides
  when to actually query).
- Pending past cap → "We stopped auto-checking…" (neutral gold, **never
  failed**) + *Keep Checking*.
- Success without receipt → keeps polling up to **8 extra polls (~30 s)** so
  the callback's receipt replaces *"Confirming…"*.
- Failure → human sentences keyed by `result_code`: 1 insufficient balance ·
  1032 cancelled · 1037 expired · 2001 wrong PIN.

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

---

## 10. Pending work / roadmap

**Core marketplace:** job listings CRUD + Find Jobs feed · applications ·
search/matching with location · full profiles + completeness · ID/document
verification · real chat backend (polling or WebSocket) · notifications ·
ratings & reviews · referral activation · payments wired to real purposes
(booking fee, subscription, escrow later) with a ledger.

**Gateway hardening:** cron to expire stale `pending` payments (e.g. > 24 h)
· log rotation/monitoring · optional IP filtering on the callback route ·
rate limiting beyond OTP caps.

**Production build (EAS):** dev build to re-enable `expo-otp-autofill`
(then set `OTP_APP_HASH` — gateway already appends it) · store builds ·
privacy policy & store assets.

**Security hygiene:** rotate SSH passphrase + GitHub PAT (due) · nodemailer
credentials for email notifications (deferred to "next chat").

---

## 11. Documentation rule (mandatory workflow)

1. Finish a unit of work → append a dated entry to **`WORKLOG.md`** (what
   changed, commit hashes, server state, gotchas discovered).
2. In the **same commit**, update the relevant sections of **this file**
   (status snapshot §1, flows §4–§7, traps §9, roadmap §10).
3. Order (worklog-first or architecture-first) does not matter — what
   matters is that neither is left behind by a push.
