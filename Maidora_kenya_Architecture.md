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
| MySQL schema v2 (users + maid_profiles, login_attempts, email_otps, phone_otps, payments) | ✅ LIVE | `sql/schema.sql` + `sql/migrate_v2.js`, both idempotent |
| Auth: signup → SMS OTP (TalkSasa) → JWT | ✅ LIVE | Role NOT at signup — chosen at onboarding (spec §3.2) |
| Onboarding: role selection post-verification | ✅ LIVE | `POST /api/auth/onboarding`, immutable once set |
| Status model v2 (account_status + *_verified_at + kyc_*) | ✅ LIVE | Spec §4.2 split model; single `status` column dropped |
| Verification gate (§5) | ✅ LIVE | `requireVerified` middleware, wired on STK push; services stay gated |
| Login throttle (§11): 5 fails/15min + 20/IP/hour | ✅ LIVE | `login_attempts` table + `POST /auth/login` guards |
| Activity tracking: last_login_at / last_active_at (§4.3) | ✅ LIVE | 1h write-throttle in `requireAuth` |
| Location auto-update at login (§6) | ✅ LIVE | GPS fix best-effort from app; last known stands on failure |
| Disposable email block (§12) | ✅ LIVE | signup + email-verification re-check |
| Email verification path (§2/§5, nodemailer SMTP) | ✅ LIVE | `SMTP_PASS` installed + SMTP auth verified (2026-10-29); `verify()` passes on `mail.maidora.co.ke:465` |
| Profile completeness §7 (maid_profiles + banner + editor) | ✅ LIVE | `GET/PUT /api/profile` + ProfileScreen card |
| M-Pesa STK Push → callback → receipt | ✅ LIVE | Real KES 1 txn succeeded (receipt `UJS6N01T1A`); callback round-trip proven |
| App: Welcome → Signup → OTP → Onboarding → Tabs | ✅ LIVE in Expo Go | React Navigation v7 |
| App: role-based bottom tabs | ✅ LIVE | Employer & Househelp tab sets |
| App: M-Pesa payment screen + polling | ✅ LIVE | 3.5-min patient polling, receipt chase, friendly failures |
| Animated splash + brand loaders | ✅ LIVE | Reanimated 4.7.1 (Expo Go — clear cache if crash, see §9.3) |
| Offline / no-data UX | ✅ LIVE | NetInfo banner + human error mapping in `src/api.js` |
| Job listings / applications / matching | ⏳ PENDING | Screens are placeholders; no backend yet |
| KYC flow (§8) | ⏳ PENDING | Columns + gate live; flow/images/review not built |
| Paywall after 2 applications (§9) | ⏳ PENDING | Needs applications first |
| Visibility decay ranking (§10) | ⏳ PENDING | `last_active_at` collected; ranking ships with search |
| Real chat backend | ⏳ PENDING | Chats tab is a placeholder |
| Post-onboarding suggestion cards (§13) | ⏳ PENDING | |
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
  when the signed-in user has no role), ForgotPassword, Payment.
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
src/routes/auth.js      register | verify-otp | resend-otp | login | onboarding | me | email verification
src/routes/profile.js   GET/PUT maid profile + derived completeness (§7)
src/routes/payments.js  stk-push (§5 gated) | list | :id status | callback
src/services/otp.js     hashed OTPs (phone + email), cooldown/hourly/attempt caps
src/services/sms.js     TalkSasa API v3 client
src/services/email.js   nodemailer SMTP (optional email verification, fails soft)
src/services/mpesa.js   Daraja OAuth cache (~1 h), stkPush, stkQuery, Kenya-time timestamps
src/middleware/auth.js  requireAuth (JWT 30d + last_active_at 1h-throttled), requireVerified (§5 gate)
src/utils/validate.js   shared validation + disposable-email blocklist (mirrors app's src/validation.js)
sql/schema.sql          v2 canonical (idempotent)
sql/migrate_v2.js       live-DB migration v1→v2 (guarded ALTERs, run once per release)
```

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
| POST `/api/payments/stk-push` | JWT + **verified** | `{amount, phone?, purpose?}` → STK prompt (§5 gate) |
| GET `/api/payments` | JWT | user's last 20 payments |
| GET `/api/payments/:id?refresh=1` | JWT | status; `refresh=1` may live-query Daraja (§6.2) |
| POST `/api/payments/callback` | **public** | Daraja result receiver — ACKs fast |

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
`MPESA_ACCOUNT_REFERENCE` (Maidora, ≤12) · `MPESA_TRANSACTION_DESC` (≤13) ·
`NODE_ENV=production`.

### 5.4 Database

- **users (v2)** — identity; `role` NULL until onboarding (immutable after);
  §4.2 split status model: `account_status` enum, `phone_verified_at`,
  `email_verified_at`, `kyc_status` + reason/submitted/reviewed;
  `last_login_at`, `last_active_at` (1h write-throttled); location
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
- **payments** — `purpose`, `amount`, `phone`, `merchant_request_id`,
  `checkout_request_id` (indexed), `mpesa_receipt`, `result_code`,
  `result_desc`, `status` enum(`pending`,`success`,`failed`),
  `raw_callback` (full Daraja JSON), timestamps. MySQL typed the JSON column
  as `longtext` — harmless.

**Schema migrations:** `schema.sql` is the canonical fresh-install DDL
(idempotent `IF NOT EXISTS`). For the LIVE DB, run
`nodevenv/…/bin/node sql/migrate_v2.js` — every ALTER is guarded by an
`INFORMATION_SCHEMA` check, so it is safe to re-run.

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

**Next up (spec §14 order):** KYC flow (§8) — screens, image pipeline
(capture/crop/blur-glare detection), server-side drafts, review tooling,
KES 150 urgent fee via the live M-Pesa rails · jobs listings CRUD + Find
Jobs feed · applications + §9 welcome bonus (2 lifetime) + paywall (tiers
now DECIDED via MPS Amendment v3.2 — PAYG KSh 50 / Basic KSh 99 / Gold
KSh 199 + boosts; only multi-device session policy §15.6 still open) ·
search/matching with location + §10 decay ranking · real chat backend ·
§13 suggestion cards (day-based, dismissible) · push notifications.

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
