# Maidora Kenya — Worklog

> Append a dated entry for every working session, in the same commit that
> updates `Maidora_kenya_Architecture.md` (see §11 of that file). Newest
> first. Commit hashes make every claim checkable — include them.

---

## 2026-10-29 — Profile completeness for BOTH roles (§7 v4) + email-verify UI + drawer

Owner-directed batch: completeness before verification, employer household
questions, maid salary/about-you fields, full Kenyan languages, 3-step DOB
picker, editable email verification, drawer navigation. **Live E2E: 17/17
passed on the gateway; `expo export` bundle green.**

- **Schema v4** (`sql/migrate_v4.js`, idempotent): new `employer_profiles`
  table — `household_size` (1–30), `num_children` (0–20), `budget_amount`
  (KES/month). Maid side needs no DDL.
- **Role-aware `GET/PUT /api/profile`** (`src/routes/profile.js`): employer →
  household profile (3 completeness checks, partial saves OK); househelp →
  maid profile now **6 checks** (bio added as "About yourself").
  `expectedSalary` = v4 API name for `wage_expectation` (legacy key accepted).
- **`POST /auth/update-email`** (`src/routes/auth.js`): change email before
  verification (EMAIL_RE + disposable blocklist + 409 on duplicates; clears
  `email_verified_at`).
- **App:** `DatePickerModal` (year → month → day popup; 16–80 profile,
  18–100 KYC) used in ProfileScreen + KycPersonalScreen; `AppDrawer`
  (built-in Animated, no new deps) separates Verification / Payments /
  Settings / Log out from Profile; `EmailVerifySheet` (prefilled editable
  email → code → verified) behind the "Email unverified" chip; maid editor
  gains bio + expected-salary (renamed) + full `KENYAN_LANGUAGES` list
  (`src/data/kenya.js`) with Other → specify; employer household editor.
- **HomeScreen:** profile-completeness banner renders FIRST (both roles,
  spec §7 → §8 order), KYC banner now shows for BOTH roles; banner copy
  neutralized (Trust Badge builds trust on both sides).
- **Deployed:** backup `gateway-20261029-121453.tgz` → upload → migrate_v4
  (`employer_profiles` created) → restart → health/db-health OK → 401 gates
  OK → E2E `scripts/profile_v4_e2e.py` 17/17 (employer household incl.
  0-children edge + bad-size 400; maid 6/6 incl. custom language "Sigaw",
  legacy wageExpectation key; update-email + injected email OTP verify +
  duplicate 409).

## 2026-10-29 — Build fix: root-level `babel-preset-expo` (Metro "transformFile" crash)

Metro bundling broke with the misleading `TypeError: Cannot read properties of
undefined (reading 'transformFile')` (`metro/src/Bundler.js:55`) — reproduced
identically on the owner's Windows machine and this workspace, so it was a repo
bug, not a local install problem. Metro's real error line
(`"Failed to construct transformer:"`) appears earlier in the log and the
underlying cause was **`Cannot find module 'babel-preset-expo'`**: the lockfile
only carried a copy nested at `node_modules/expo/node_modules/`, which Babel's
preset resolver (resolving `presets: ['babel-preset-expo']` from
`babel.config.js` at the project root) cannot see. Expo templates list
`babel-preset-expo` as a direct devDependency precisely to guarantee a
root-level copy; this repo never had one.

- **Fix**: added `babel-preset-expo@~58.0.21` (SDK-58 range, same as expo's own
  spec) as a direct devDependency → installed at node_modules root; lockfile
  updated.
- **Verified**: `require.resolve('babel-preset-expo')` from project root OK;
  full `npx expo export --platform android` succeeds (3.9 MB Hermes bundle,
  all 8 KYC screens included).
- Build infrastructure only — no feature, architecture-status, or spec-adoption
  changes. Owner action: `git pull` → `npm install` → `npx expo start -c`.

## 2026-10-29 — KYC submission phase (§8): 8-step app flow + gateway API, deployed

Full vertical slice for identity verification (MPS §33 consolidated by
Amendment v3.2). **KYC E2E smoke: 14/14 passed on the live gateway; auth
e2e regression green.**

- **Schema v3** (`sql/migrate_v3.js`, idempotent — 11 new columns on
  `users`, all guarded): `kyc_full_name`, `kyc_id_number`, `kyc_id_type`,
  `kyc_date_of_birth`, `kyc_gender`, `kyc_id_front_url`, `kyc_id_back_url`,
  `kyc_selfie_url`, `kyc_urgent` + `kyc_urgent_paid_at`,
  `kyc_draft_updated_at`. Draft lives in these columns (Amendment v3.2 §35
  — separate maid_kyc table = future hardening).
- **Gateway** (`src/routes/kyc.js`, mounted in `app.js` with its own 12 MB
  JSON parser for base64 image bodies): `GET /kyc` (state), `PUT /kyc/draft`
  (autosave, not_started→draft, under-18 rejected, writes lock at
  submitted/under_review → 409 `kyc_locked`), `POST /kyc/images`
  (base64 JPEG/PNG/WEBP ≤5 MB, magic-byte sniffed, stored under private
  `kyc_uploads/` with .htaccess deny-all + random names), `POST /kyc/submit`
  (requireVerified + completeness per id_type; back required for national_id;
  clears rejection on resubmit), `GET /kyc/images/:field` (owner-only stream,
  basename-guarded). `app.js` error handler now passes `field`/`code`
  through so the app can highlight the exact missing item.
- **Urgent KSh 150** (`payments.js`): a settled `kyc_urgent` STK push —
  via callback OR query-path settlement — grants `kyc_urgent` +
  `kyc_urgent_paid_at` on the payer. Speed only, never refunded (§33.3).
- **App** (`src/screens/kyc/`): KycIntro (status-aware + urgent upsell with
  inline STK + polling), KycPersonal (1.5 s debounced autosave, DD-MM-YYYY
  DOB, optional gender chips), KycDocType (national_id default),
  DocCaptureScreen ×3 wrappers (front/back/selfie — crop via
  allowsEditing, ≤1400 px JPEG via expo-image-manipulator, selfie camera-
  only + front lens), KycReview (retake-per-item with returnTo), KycDone.
  HomeScreen gains the §8 non-blocking banner (not_started/draft/rejected/
  in-review states). expo-image-picker + expo-image-manipulator added;
  app.json carries the camera/photos permission strings.
- **Deliberate deferrals (documented):** blur/glare ML detection and real
  liveness/face-match need native modules → EAS dev build (same pattern as
  SMS Retriever). v1 ships capture + crop + size/type validation +
  server-side completeness; review is manual (tooling = next roadmap item).
- **Deploy evidence:** migrate_v3 live (11 columns added), health +
  db-health OK, unauth 401s on all KYC routes, callback ACK intact,
  14/14 KYC E2E (register→draft→under-18 reject→premature-submit reject→
  3 uploads→garbage reject→submit→locked 409→image stream→cleanup).
  Probe scripts: `scripts/kyc_e2e.py`, `scripts/deploy_kyc.py` (agent-side).

---

## 2026-10-29 — MPS deliberations doc consolidated (Amendment v3.2) + spec §15 register closed

The owner's "initial deliberations doc" landed on GitHub as
`Initial_app_deliberations.md` (MPS-AMD-1, Amendment v3.1 to MPS v3.0).
Read end-to-end and consolidated per the owner's precedence rule:
**built-and-live first, deliberated login/verification flow second, product
decisions recorded, nothing assumed.**

- **Amendment v3.2 (MPS-AMD-2) appended to the deliberations doc.** Conflicts
  with built reality corrected at source, each citing its section:
  merge-flow rule → built 409 duplicate-contact block (§4.3) · OTP params →
  built policy 6-digit/10-min/60s/5-att/5-hr (§31.2) · onboarding spine →
  built flow with role at onboarding AFTER OTP, consents+job-types tagged
  future (§31) · profile fields → built `job_type` enum + `wage_expectation`
  retained, `availability_*` tagged not-built (§34.4) · data model → schema
  v2 governs (BIGINT, bcryptjs, kyc on users, in-code blocklist); uuid/
  Argon2id/encryption/separate-table re-classified future hardening (§35).
- **Decisions register added** — six of seven Unified Spec §15 open items
  CLOSED: §15.1 read-only scope, §15.2 OTP params, §15.3 phone-first,
  §15.4 VoIP out of scope v1.0, §15.5 pricing (NEW: PAYG 50 / Basic 99 /
  Gold 199 + boosts — was deferred), §15.7 urgent fee never refunded.
  §15.6 multi-device sessions still open. Registered in
  `docs/UNIFIED_BUILD_SPEC.md` operative defaults + architecture §10.
- **Flagged for owner (7 items)** — most notably: MPS v3.0 base text is not
  in the repo (amendment cites it by reference); subscriptions-before/after-
  applications sequencing; under-18 legal.
- Verified backend sources before amending: `auth.js` (register 409s),
  `otp.js` (caps), `schema.sql` (types/enums), `email.js` (SMTP shape).

---

## 2026-10-29 — Email path activated (SMTP_PASS installed + verified)

Completes spec §2 / adoption map "wired, pass pending" → **live**.

- **Server `.env`**: appended `SMTP_PASS` (owner-supplied rotated
  credential; value only ever lives in the server `.env`, chmod 600).
  Pre-change backup: `/home/maidorac/backups/.env.bak-smtp-20261029-100952`.
  All other `SMTP_*` vars were already correct (host `mail.maidora.co.ke`,
  port 465, secure, user `verification@maidora.co.ke`).
- **Verified**: gateway restarted via `tmp/restart.txt`; `/api/health` +
  `/api/db-health` OK; on-server probe loaded the gateway's own
  `src/config` and ran nodemailer `verify()` → connection + auth OK
  (probe script kept at agent-side `scripts/smtp_verify.js`, never
  committed with any secret).
- **Post-verification email path is now fully usable end-to-end**
  (`POST /auth/request-email-verification` → `/auth/verify-email`); no UI
  for it yet (deferred — see roadmap).
- **Hygiene flag:** the SMTP value was shared in chat in plain text AND
  equals the SSH key passphrase. Recommend rotating it (cPanel mail
  account) at the next rotation window and keeping SSH/SMTP secrets
  distinct. Added to architecture §10 security hygiene.

---

## 2026-10-29 — Identity & verification foundation (unified spec Phase 1)

Implements spec priorities #1 (verification gate) and #2 (profile
completeness) per `docs/UNIFIED_BUILD_SPEC.md` (new file — the adopted
unified build spec, with an adoption map + operative §15 defaults).

- **Schema v2** (`sql/schema.sql` + `sql/migrate_v2.js`, idempotent): users
  gains `account_status` (pending_verification→active→suspended/deactivated/
  deleted), `phone_verified_at`/`email_verified_at` (timestamps replace the
  boolean), `kyc_*` columns, `last_login_at`/`last_active_at`,
  `location_area`/`location_county`/`location_source`, `role` becomes NULL-able
  (onboarding sets it), `referral_code` renamed `referred_by_code`. New tables:
  `maid_profiles` (§7), `login_attempts` (§11), `email_otps`. Old `status` and
  `phone_verified` columns migrated + dropped.
- **Role moved to onboarding** (spec §3.2): register no longer takes a role;
  new `POST /api/auth/onboarding` (JWT) sets it once, immutably. App flow:
  Welcome → Signup (no role) → OTP → RoleSelect (onboarding mode) → Tabs.
  Existing accounts keep their role — no re-onboarding.
- **Verification gate** (§5): `requireVerified` middleware (phone OR email
  verified + active account), wired on `POST /payments/stk-push`; job
  apply/post/chat-start will attach it when those endpoints exist.
- **Login rules** (§11): 5 failures/account/15min → 15-min cooldown; per-IP
  20/hour; both backed by `login_attempts`. `/auth/me` now returns a
  REFRESHED 30d token (sliding session) + current user shape.
- **Activity tracking** (§4.3): `last_login_at` on auth; `last_active_at` on
  every authenticated request, write-throttled to 1h in `requireAuth`.
- **Location at login** (§6): app sends a best-effort GPS fix (6s cap, silent
  failure); server updates coords + reverse-geocoded name, keeps last known
  location on failure.
- **Disposable email block** (§12): 38-domain blocklist checked at signup and
  re-checked at email verification.
- **Email path** (§2/§5): `services/email.js` (nodemailer) +
  `POST /auth/request-email-verification` + `/auth/verify-email` (OTP in
  `email_otps`). Fails soft until `SMTP_PASS` is set in the server `.env`
  (rotated credential — owner to supply). No UI for email verify yet.
- **Profile completeness** (§7): `GET/PUT /api/profile` (househelp),
  completeness derived at read (5 fields); ProfileScreen gains a
  non-blocking "Profile strength" card + inline editor (DOB, languages chips,
  job type, years, wage, next of kin). Photo deliberately deferred to KYC
  phase (upload pipeline).
- App boot gate: signed-in user with unset role lands on RoleSelect
  (onboarding). `/auth/me` refresh stored once per cold start (loop guard).

## 2026-10-29 — Documentation system + full status audit

- Created `Maidora_kenya_Architecture.md` (app + gateway + infra + M-Pesa
  settlement policy + traps + roadmap) and this worklog.
- Added the mandatory docs-sync rule to `AGENTS.md`.
- Audited live DB: real user transactions confirmed — KES 1 success
  (receipt `UJS6N01T1A`) and a `1032` row that exposed the premature-failure
  bug (see next entry).

## 2026-10-29 — M-Pesa settlement rework: callback is the source of truth

Commit `b4eeba8` · deployed + probed (ALL PASS).

- **Root cause found** for "app says *Payment not completed* before the STK
  prompt even appears": at t+12 s the gateway's first Daraja STK **query**
  returned a spurious `1032 Request Cancelled by user` while the prompt was
  still travelling to the phone; the row was marked `failed` and the UI
  believed it.
- New staged policy (`backend/src/routes/payments.js`): 0–45 s never query ·
  45–150 s query may only confirm success · >150 s definitive codes
  (1/1032/1037) settle as `failed`; callbacks always override, guarded
  success updates (`AND status='pending'`).
- Callback handler: richer logging (affected rows, receipt, result desc),
  dual-convention ACK `ResponseCode/ResponseDescription` +
  `ResultCode/ResultDesc` so Daraja never retries.
- Client (`PaymentScreen.js`): polls 4 s × 52 (~3.5 min), chases the receipt
  for ~30 s after success ("Confirming…"), friendly failure sentences for
  codes 1/1032/1037/2001, neutral "stopped checking" copy.
- Deploy script `scripts/deploy_mpesa_settlement.py`: backup → upload →
  restart → probes incl. **synthetic Daraja success + failure callback
  round-trip** on a `smoke_e2e` row (settled `success|0|SMK…`, override
  proven, cleanup). All probes PASS on `gateway.maidora.co.ke`.

## 2026-10-29 — Reanimated crash: diagnosed, reverted after user-verified fix

Commits `3368b74` (rewrite) → `9081d9a` (revert) → `7f90a4f` (keep config).

- Expo Go boot crash `[runtime not ready] TypeError: Cannot read property
  'bytecode'` — Reanimated 4 / worklets transform mismatch.
- First fix rewrote SplashScreen/BrandLoader/FullScreenLoader on built-in
  `Animated` and uninstalled Reanimated (`3368b74`).
- User verified the simpler fix: `npx expo start -c` (cache clear) makes
  Reanimated 4.7.1 work → per user request the rewrite was **reverted** and
  Reanimated 4.7.1 restored (`9081d9a`).
- Kept the new standard `babel.config.js` (`babel-preset-expo`) so the
  worklets plugin is applied deterministically on every rebuild (`7f90a4f`).
- Built-in-Animated fallback preserved at `3368b74` if the crash returns.

## 2026-10-28 — Brand components, animated splash, polling patience, offline UX

Commit `8612a81`.

- Ported the user's uploaded components (`/upload/*.tsx`) to
  `src/components/brand/`: BrandMark, BrandLockup, BrandLoader (4 variants),
  LoadingButton, FullScreenLoader.
- Animated splash "Ping Letters" (radar rings + letter springs, Reanimated).
- Splash boot gate: minimum **2.6 s** splash display (`AppContext`).
- M-Pesa polling extended (4 s × 45) + pending-never-failed UX.
- `src/api.js`: human offline/timeout messages; NetInfo offline note in
  `ui.js`.

## 2026-10-28 — Live M-Pesa hardening + Expo Go native-module fixes

Commits `6053c32`, `2ddd6da`, `a36cda1`.

- Corrected server `.env`: `MPESA_CALLBACK_URL=https://gateway.maidora.co.ke/api/payments/callback`.
- App margins/safe-area: `Screen` always pads; tab bar no fixed height /
  absolute positioning (system-nav overlap fixed).
- Daraja `timestamp()` pinned to `Africa/Nairobi` (server runs UTC — first
  STK attempts would otherwise be rejected).
- `config/index.js` resolves `.env` relative to the module (scripts/workers
  from any cwd).
- Removed `expo-otp-autofill` (native module missing in Expo Go →
  `[runtime not ready]`): zero-native autofill ships (iOS oneTimeCode,
  Android sms-otp, clipboard paste); SMS Retriever deferred to EAS build,
  re-enable steps in `AGENTS.md`.
- Verified live: Daraja OAuth OK; STK push accepted (ResponseCode 0) with
  unallocated MSISDN `+254000000000`; real KES 1 payment by the owner
  succeeded (receipt `UJS6N01T1A`).

## 2026-10-27 — Gateway reorg + M-Pesa credentials

Commit `bde28e5`.

- Backend reorganized under `backend/` (app.js, src/{config,middleware,
  routes,services,utils}, sql/schema.sql) and deployed to the cPanel app
  root; schema applied; e2e auth/OTP suite green (9/9).
- M-Pesa Daraja production credentials configured (consumer key/secret,
  shortcode 5511376, PartyB 9393975, passkey, CustomerBuyGoodsOnline) —
  secrets only in server `.env`.
- App: OTP autofill v1, M-Pesa payment screen with status polling.

## Earlier sessions — foundation

- `1347d94` repo bootstrap; hosting handoff (cPanel tela-host, Node 24
  selector, restart.txt mechanism, SSH deploy path).
- `456324a` v0.1 app: brand assets, palette, React Navigation auth flow
  (Welcome → RoleSelect → Signup → OTP), OTP screens.
- `05cd8d6` role-based bottom tabs (Employer/Househelp), vector icons fix.

---

### Open items carried forward

See `Maidora_kenya_Architecture.md` §10 (roadmap). Security hygiene due:
rotate SSH passphrase + GitHub PAT. Nodemailer credentials deferred to
"next chat".
