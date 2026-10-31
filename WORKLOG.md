# Maidora Kenya — Worklog

> Append a dated entry for every working session, in the same commit that
> updates `Maidora_kenya_Architecture.md` (see §11 of that file). Newest
> first. Commit hashes make every claim checkable — include them.

---

## 2026-10-31 — Payment UX: staged progress tracker + callback race hardening

Owner logs #30–#34 all healthy: rc=1 (insufficient balance) and rc=1037
(expired) surfaced cleanly with single end-logs, three receipts banked
(`UJV6N0BGAA`, `UJV6N0BJE8`, `UJV6N0BHYH`). Owner asked for two UX changes —
drop the full-screen loader for a button state, and show real processing
stages. Delivered, plus one reliability fix the trace itself exposed.

- **App — no more full-screen veil**: `PaymentScreen` no longer mounts
  `FullScreenLoader` between the tap and the status card; the
  PrimaryButton's own radar + "Sending push…" carries the wait (gateway
  route work is single-digit ms — payment #32's 28 s call was pure mobile
  network, so a full-screen blackout during a hiccup only read as a freeze).
  Amount chips disabled while starting.
- **App — staged progress card**: pending/failed/success cards now share a
  4-step tracker (connector rails, radar on the active step) driven by REAL
  events, not timers: ① Payment accepted by gateway (respond-first row) →
  ② Prompt sent to your phone (row carries `checkout_request_id`, i.e.
  Daraja accepted — `paymentView` already exposes it, seen on the next poll)
  → ③ Enter your M-Pesa PIN (elapsed timer lives here) → ④ Payment
  confirmed (receipt chip). A push rejection (e.g. 4999 existing USSD
  session) fails at ②; PIN timeout/cancel/low balance fails at ③ — the ✗
  lands on the stage that actually died. Card crossfade retained.
- **Gateway — callback race hardening (found in the #32 trace)**: the
  background write of `checkout_request_id` took **13.4 s** (MySQL stall on
  the shared host; Daraja had accepted at t+2.2 s) and the callback matches
  rows by `checkout_request_id` — a callback inside that window would match
  0 rows, and Safaricom never retries, so the receipt would be lost.
  Settlement extracted into `settleByCheckoutId`; first attempt inline, an
  unmatched callback is retried in the background every 2.5 s × 24 (~60 s)
  while the ACK returns immediately. Residual risk (documented in §6.3): a
  gateway restart inside the retry window — the 150 s query path still
  settles (without receipt).
- **Verification**: gateway E2E 11/11 (`scripts/deploy_mpesa_staged_ui.py`)
  incl. a real race proof — row inserted without `checkout_request_id`,
  callback fired first (warn + retries), late row write simulated →
  "late row write matched on retry #2" → row `success|0|RACE…T` with
  receipt. Latency re-probe after the refactor: responds back to 4–71 ms
  server-side (E2E row #35's one-off 7.8 s respond was a restart-moment
  artifact seconds after `touch restart.txt`, not a regression).

---

## 2026-10-30 — M-Pesa polish: smooth loader crossfade + per-purpose STK labels

Owner logs confirmed the respond-first fix end to end (payment #16 success,
receipt `UJUO50145U`; #17–#20 user-side cancellations surfaced cleanly with
friendly reasons). Two follow-ups from the same session.

- **Smooth transitions (app)**: `FullScreenLoader` now fades OUT *before* its
  Modal unmounts — RN `Modal visible={false}` kills the Android window
  instantly, so the old 220 ms exit fade never played (the hard cut between
  "Sending push" and "Check your phone"). Mount-gated: veil animates to 0
  while still mounted, unmounts 20 ms later, `pointerEvents` disabled during
  exit. `PaymentScreen` status card gained an entrance animation (opacity
  0→1 + 18 px rise, 340 ms, RN `Animated` / native driver) that replays on
  every status flip (pending → success/failed) — loader fade-out and card
  fade-in now overlap into a real crossfade.
- **Per-purpose STK labels (gateway)**: `routes/payments.js` gains a
  `PURPOSE_STK` map — purpose → AccountReference (≤12 alnum) +
  TransactionDesc (≤13): `app_test`→TEST/"Test payment",
  `general`→MAIDORA, `kyc_urgent`→KYCURGENT/"Urgent KYC", plus pre-mapped
  §9 slots (application / maid_basic / maid_gold / profile_boost /
  application_boost); unknown purposes sanitize to a safe fallback.
  `services/mpesa.js` `stkPush` accepts `transactionDesc` and logs the
  exact payload (`[MPESA] STK push payload — accountReference=… desc=…`).
  Note: the server `.env` has no `MPESA_TRANSACTION_DESC`, so the old
  fallback sliced "Maidora payment" → "Maidora payme" — unreachable for
  mapped purposes now.
- **Prompt display reality (documented, not changed)**: the shortcode runs
  `CustomerBuyGoodsOnline` (till), so Safaricom shows only "…pay KSh X to
  BILLUC SOLUTIONS" on the prompt; the AccountReference lands on the
  confirmation SMS + M-Pesa statement. A PayBill-type shortcode would show
  "… for account <ref>" on the prompt itself — flipping
  `MPESA_PROD_TRANSACTION_TYPE` is a one-env experiment if the owner wants it.
- **Verification**: gateway E2E 11/11 (`scripts/deploy_mpesa_stk_label.py`) —
  both labels asserted in `stderr.log`, pushes ACCEPTED, rows list with
  purposes, callback ACK; app parse-check + full expo export green (4.3 MB
  hbc). Bonus live finds: rc=1038 "No response from user" settled one of the
  owner's open rows; rc=4999 "Duplicated MSISDN / existing USSD session"
  fires when a second push races to a phone that still has one open — wait
  for the open prompt to clear before sending another.
- **Live-trace round 2 (payments #25–#28)**: owner tested on two phones — 2
  successes (receipts `UJUO5015LB`, `UJU6N07RQQ`) and 2 × rc=1037 "DS timeout
  user cannot be reached", both settled by the Safaricom callback at ~20–25 s
  (correct: callback is the source of truth; the query path never ran during
  grace). The scary **9.4 s stk-push call was NETWORK, not gateway** — server
  route work measured 5 ms; the same window had trivial GETs at 4.4 s. To
  make that provable forever: global `req.t0` middleware (app.js) + the push
  request log now ends with `t+Xms after request start` (body parse + JWT
  auth + user lookup; live: t+9 ms).
- **OAuth in-flight dedupe (gateway)**: two concurrent background pushes
  raced `getAccessToken` and fetched TWO tokens (live, rows #23/#24); the
  fetch is now a single shared promise (`requestToken` + `tokenFetchPromise`),
  cleared on completion so failures retry fresh.
- **Poll overlap guard (app)**: on the slow network a poll tick outlived the
  4 s interval (4.4 s GET) and the next overlapping tick double-logged
  "ended as failed" (#27); ticks now skip while one is in flight
  ("poll tick skipped — previous check still running") and `doneRef` swallows
  stray queued ticks so the end log fires exactly once.
- **Verification**: gateway E2E 10/10 (`scripts/deploy_mpesa_harden2.py`) —
  exactly ONE OAuth fetch for one push, t+attribution line, label, push
  accepted, callback ACK; backend `node --check` ×3 + app parse-check + full
  expo export green.
- Spec adoption map unchanged — M-Pesa test payments are not a spec
  section; the §9 product slots it pre-maps are still ⏳ pending.

---

## 2026-10-30 — M-Pesa respond-first + end-to-end [MPESA] tracing (cancelled-fetch bug killed)

Owner symptom: *"fetch failed: fetch has been cancelled … after the failure
message I get the prompt on my phone and when I enter PIN it's successful."*
Diagnosis: stk-push used to wait synchronously for Daraja (cold OAuth alone
measured at **3.1 s**, push **1.6 s** — under load well past the app's 30 s
fetch timeout). The client aborted → app showed a hard failure — yet Daraja
accepted anyway → prompt arrived late → PIN → success. **Deployed to the
gateway (11/11 live E2E, `scripts/deploy_mpesa_respond_first.py`); expo
export bundle green.**

- **Gateway: RESPOND-FIRST stk-push** (`src/routes/payments.js`): the
  payments row is created BEFORE Daraja is called; the route answers the app
  immediately (measured **68 ms** E2E) with `{ paymentId, queued: true }`;
  the Daraja push runs in the background and fills `checkout_request_id` on
  the row (or flips it to failed with the reason, which polling surfaces).
  Response shape stays backward compatible. A slow/failed Daraja can no
  longer produce a "cancelled" app error with a prompt still in flight.
- **Gateway: hard timeouts + full tracing** (`src/services/mpesa.js`): every
  Daraja fetch now has `AbortSignal.timeout` (OAuth 15 s, push 25 s, query
  15 s) and undici's bare "fetch failed" becomes a readable message. ALL
  stages log `[MPESA]` lines: push request → row created → app response →
  OAuth (cache hit/miss, ms) → STK push (ACCEPTED/REJECTED, ms, IDs) → STK
  query (rc, decision, age) → callback (SETTLED status, rc, receipt).
- **Gateway logging reality (new trap, see architecture §9)**: on this
  cPanel Passenger setup **console.log (stdout) is lost** — only stderr
  persists in `~/maidora_app/stderr.log`. All payment tracing therefore
  uses `console.error` (also converted the callback settlement line, which
  was previously invisible).
- **App (`src/api.js`)**: cancelled-fetch errors map correctly at last — the
  device's abort surfaces in several shapes (AbortError, "fetch has been
  cancelled", "aborted"); ALL now throw the friendly TIMEOUT ApiError, and
  every `/payments` request logs `[MPESA] method path → status in ms` (plus
  the raw name/msg/status on failure so nothing slips through again).
- **App (`PaymentScreen.js`)**: full journey logging (`[MPESA] start → push
  accepted → poll #n with live status → settled/receipt → stopped/reset`),
  and a new **adopt-on-timeout** safety net: if the push call still times
  out (offline/old gateway), the screen probes `GET /payments` for a recent
  pending row (same amount + last-9 phone, <3 min old) and continues
  polling it instead of dead-ending — the row always exists server-side.
- **Live E2E (gateway, 11/11)**: register+OTP → stk-push 200 in 0.69 s with
  `queued: true` → row pending in list → background push ACCEPTED in 4.77 s
  (CheckoutRequestID stored) → refresh=1 returns grace-window info →
  public callback ACKs. Trace visible in stderr.log. E2E rows #14/#15 left
  in place as the reconciliation trail.
- Verification gate unchanged (`requireVerified`); settlement policy
  unchanged (callback is the source of truth; query only accelerates).
  `MPESA E2E` accounts (phone +254710HHMMSS) accumulate in `users` —
  periodic cleanup optional.

---

## 2026-10-30 — Profile UX overhaul: drawer width bug fix, full-screen §7 wizard, profile layout rebuild

Owner verdict on the previous build: *"I don't like the profile screen and the
profile completeness setup and layout. The drawer isn't working fine… the
multistep too isn't fine."* Full review found ONE root-cause bug + two
layout-design failures. All app-side; **no backend or spec-text change**
(partial per-step PUT /profile stays as deployed; MPS §34 step lists,
fields and validation are unchanged).

- **DRAWER ROOT-CAUSE BUG** — `ProfileDrawer.js` computed the panel width as
  `Math.min(320, 0.82)` → **0.82 px** (the 82% ratio was written where a
  width was expected). The drawer was sub-pixel wide, so the hamburger and
  edge-swipe appeared dead. Now `Math.min(320, window.width * 0.82)`
  recomputed on rotation, safe-area insets for the panel padding, active
  item label highlighted. This alone restores the whole drawer.
- **§7 wizard → FULL-SCREEN modal** (`CompletenessWizard` rewritten): was
  rendered inline inside a card under the identity card — keyboard covered
  fields (`keyboard={false}`), Save fell below the fold. Now a slide-up
  modal with its own SafeArea/KeyboardAvoiding/ScrollView: progress header
  ("Step X of N", % bar via new shared `ProgressBar`, tappable step chips —
  jump freely, ✅ on completed), big step title/hint, sticky footer
  (Back + Save & continue / Save & finish), done screen with what's left.
  Behavior preserved: opens at first incomplete step (step 1 when editing a
  complete profile — previously jumped to the last step), fetches
  GET /profile on open, partial PUT per step, `onSaved` → AppContext →
  instant Home banner, closing mid-way keeps saved steps, identical
  validation (DOB 16–80 picker, ≤8 languages + Other-specify, job type,
  years/salary, bio ≥10 chars, next of kin; employer size/children/budget).
- **Profile screen rebuild** (`ProfileScreen`): hamburger moved LEFT (drawer
  opens left; was top-right), identity card adds location row, "Account
  status" card replaces the awkward wrapped verification pills with two
  rows (Phone status chip; Email row → tap when unverified opens the same
  §5 email sheet), profile-strength card now shows the real % bar + missing
  chips + CTA, and when complete gains a "Next: get your Trust Badge" row
  that navigates to drawer Verification (§7 → §8 tie-in).
- **Shared UI** — `ui.js` gains `ProgressBar` (gold fill, cream track, %);
  `theme.js` gains the `goldSoft` token (was an inline fallback).
- **Verified**: babel parse OK on all touched files; production bundle
  `EXPO_NO_TELEMETRY=1 CI=1 npx expo export --platform android` exit 0
  (4.3 MB hbc, drawer + wizard included). Home banner reactivity untouched
  (shared AppContext + focus refetch).

---

## 2026-10-29 — Wizard + drawer + file restructure: §7 multistep, real drawer nav, screens organized

Owner follow-up batch after using the v4 profile build: banner freshness,
Home header avatar, settings moved into Profile, REAL React Navigation drawer,
proper screen folders, and a multistep completeness flow. **Live E2E 16/16 on
the gateway (`scripts/deploy_profile_wizard.py`); `expo export` bundle green
(4.3 MB hbc, drawer included).**

- **Instant banner (owner bug report)** — §7 completeness moved into
  `AppContext` (`profileCompleteness` + `setProfileCompleteness` +
  `refreshCompleteness`). The wizard pushes the server's fresh completeness
  on EVERY step save → the Home banner updates immediately; no app restart.
  `HomeScreen` additionally refetches via `useFocusEffect` (covers
  cross-device edits).
- **Home header**: settings icon REMOVED; right slot is now the user's
  initials avatar (gold ring) → taps to Profile. Profile photo upload is a
  separate future feature (server `photo_url` already reserved).
- **Real drawer navigation** — new `src/navigation/ProfileDrawer.js`
  (`@react-navigation/drawer` 7.14 + `react-native-gesture-handler` 3.3 via
  `expo install`; reanimated 4 already present; `GestureHandlerRootView` +
  RNGH entry import added). The Profile tab is a drawer navigator with
  screens: ProfileMain · Verification (KycIntro) · Payments · Settings —
  custom branded drawer content (identity header, active highlight, Log out
  via `resetRoot`). The in-house `AppDrawer` modal was deleted. Drawer
  screens use `DrawerMenuButton` (hamburger renders only when inside the
  drawer; root-stack copies keep back headers). Root stack keeps
  Settings/Payment/KycIntro registered for Home-banner deep links.
- **Multistep §7 wizard** — `src/screens/profile/CompletenessWizard.js`:
  househelp 6 steps (DOB · languages · job type · experience & salary ·
  about yourself · next of kin), employer 3 steps (household size ·
  children · monthly budget). Progress dots (✅ per completed step), opens
  at the FIRST incomplete step, per-step partial `PUT /profile`, Save &
  continue / Save & finish, closing mid-way keeps saved steps.
- **Backend (deployed)** — `PUT /api/profile` (househelp) validation is now
  PARTIAL: only keys present in the body are validated/written (mirrors the
  employer side + spec §7 non-blocking principle); empty body → 400
  "Nothing to save". Full-payload saves unchanged (older app builds keep
  working). Backup `profile.js.<ts>.bak` → upload → restart → 16/16 E2E:
  partial languages-only PUT 200 1/6, nextOfKin-only 200 2/6, empty 400,
  bad yearsExperience 400, full 6/6, employer partial 1/3 → 3/3.
- **File-system restructure (owner)** — screens organized under
  `src/screens/`: `auth/` (Splash, Welcome, RoleSelect, Signup, Otp, Login,
  ForgotPassword) · `home/` · `maid/` (FindJobs, Applications) ·
  `employer/` (MyJobs, Maids) · `chat/` (Chats) · `profile/` (Profile +
  CompletenessWizard) · `payments/` · `settings/` · `verification/` (all 9
  former `kyc/` files). All imports updated (`git mv` used to keep history);
  `src/navigation/{Tabs,ProfileDrawer}.js` + `App.js` rewired.

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
