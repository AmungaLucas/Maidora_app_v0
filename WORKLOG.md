# Maidora Kenya — Worklog

> Append a dated entry for every working session, in the same commit that
> updates `Maidora_kenya_Architecture.md` (see §11 of that file). Newest
> first. Commit hashes make every claim checkable — include them.

---

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
