# Maidora Kenya — Worklog

> Append a dated entry for every working session, in the same commit that
> updates `Maidora_kenya_Architecture.md` (see §11 of that file). Newest
> first. Commit hashes make every claim checkable — include them.

---

## 2026-11-01 — SPLIT: separate role homescreens — `src/screens/home/EmployerHomeScreen.js` + `MaidHomeScreen.js` (owner request)

Owner: "can we seperate maids homescreen and employers homescreen.... src\screens\home\**".

**What changed.** The one role-conditional `HomeScreen.js` (592 lines: a single
`isEmployer ? … : …` inside one component) is gone. `src/screens/home/` now
holds three files:

- **`EmployerHomeScreen.js`** — the hiring household's hub: hero (Browse
  Maids / Post a Job), Your postings, FEATURED MAIDS · MAIDS NEAR ME ·
  VERIFIED · TOP RATED (one `/maids/rails` call), employer footnote. Stats
  row stays REMOVED.
- **`MaidHomeScreen.js`** — the househelp hub: hero (Find Jobs), §24.1
  credits pill, §15.5 boost strip (featured / activate banked / buy),
  FEATURED JOBS · JOBS NEAR ME · RECENTLY POSTED (one `/jobs/rails` call),
  maid footnote.
- **`shared.js`** — what both hubs share so they can't drift apart silently:
  greeting header (real avatar photo), §7 completeness banner, §8 KYC banner,
  MaidRail/JobRail (skeletons included), hub stylesheet, and the focus
  session re-sync extracted as the `useSessionResync()` hook (loop-guard
  preserved: deps track token + role, never the user snapshot).

**Wiring.** `Tabs.js` mounts `MaidHomeScreen` inside `HousehelpTabs` and
`EmployerHomeScreen` inside `EmployerTabs`; the route name stays `HomeTab` in
both navigators, so `navigate('HomeTab')` (e.g. PaymentScreen's go-home)
keeps working unchanged. Each hub now owns only its role's cached resources
(`enabled: role === '…' && !!token` guard kept as insurance for the session
flip instant) — no more dead `isEmployer` branches evaluating per render.

**Quiet fix riding along.** MaidRail/JobRail used to be defined INSIDE the
render body — a new component identity every render, which remounts the
whole rail subtree and restarts the skeleton pulse on each parent render.
They are module-level components now (navigation passed as a prop).

**Zero behavior change intended**: section copy, order, styles, cache keys,
focus-refresh semantics, boost flows — all carried over verbatim (the maid
hero pill deliberately kept full-width stretch, exactly as before).

**Validation.** Babel-parse green on all four files; zero leftover
`screens/home/HomeScreen` references; full Metro export compiles (4.5 MB
Hermes bundle) and both hubs' content verified inside the bytecode — gotcha
for future greps: strings containing `—` are stored UTF-16 in Hermes, so
`rg` misses them in ASCII mode ("Boosted placement" is there, as UTF-16LE).

---

## 2026-11-01 — v10: JOB BOOST (featured jobs on the maid home) · cached hubs + skeleton loaders · stats row removed · maid-detail stars + distance km (owner request)

Owner: "check the initial deliberations documentation on the logics behind the placement also lets design good uis for the homescreen and the maids details. also have cache and skeletal loaders · remove the stats section from homescreen · lets introduce job boost so it can feature on maids homescreen · for maids homescreen we can have featured jobs., recently posted, etc · for maids detail screen we need to have distance in km, star rating etc".

**Placement logic (from the docs, then built).** `Initial_app_deliberations.md`
§9/§11.1: "placement is not purchasable any other way" — boosts are the ONLY
paid slots (profile boost = 7-day rotating top-of-feed, application boost =
top-3 slot); everything else is earned (verification, freshness, §10 decay).
**Job boost** (owner-introduced this session) mirrors profile boost exactly:
**KES 99 / 7 days** (placement parity; provisional until the owner reprices —
`payment_purposes` is DB-editable without a release), GREATEST stacking, and
it buys exactly one thing: the FEATURED JOBS rail on the househelp home +
boosted-first ordering in the feed.

**Backend v10 (deployed live, health green).** `sql/migrate_v10_job_boost.js`
(idempotent): `jobs.boosted_until` + `idx_job_boost`; `payment_purposes` ←
`job_boost` (99 / employer / active, guarded INSERT that never stomps an
owner-edited price); demo sugar features ≤2 `@demo.maidora.co.ke` postings so
the rail has day-one content. `jobs.js`: **GET /jobs/rails** (featured /
nearby / recent in ONE call — mirror of /maids/rails, nearby falls back
nationwide with a flag), boosted-first ordering in the feed + /mine,
`shapeJob` gains `boosted`/`boostedUntil`. `boosts.js`: **POST
/boosts/jobs/:id** (ownership + open-job guards; 402 `paywall_required`
`{ purpose: 'job_boost' }`; atomic `consumed_at` take), `/status` employer
branch → `{ jobBoostsBanked }`. `maids.js`: **distanceKm** (haversine
computed server-side from users coords — raw lat/lng of BOTH parties never
leaves the gateway; null when either side has no GPS) + **rating** (the §10
quality-score proxy normalized to 5 stars — badge 40 · exp 2/yr cap 30 ·
profile depth 4/field cap 20 · fresh 10 → /20; `ratingBasis: 'proxy'`; null
until there is real signal because freshness alone must not render as
"0.5 stars"). NO reviews table exists in any spec — the star is labelled
"Maidora score", never user reviews.

**Self-caught 500 (logged because it's a lesson).** The first /jobs/rails
build forgot that `baseSelect(uid)` prepends the my-application subselect
placeholder — the demo-maid login probe returned 500 within a minute of
shipping. Fixed (params lead with `req.user.uid`) and redeployed via
`scripts/deploy_rails_fix.py` (SFTP worked even while exec channels were
being dropped).

**Verification over HTTPS (demo logins — SSH-free evidence).** /jobs/rails
200: 2 demo jobs featured (`boosted=true`) + nearby/recent rails populated;
/maids/:id → rating 4.3 basis proxy + distanceKm; /maids/rails → all four
rails with distance+rating (topRated[0] 5.0 · 11.5 km); /payments/purposes
lists `job_boost` (99, employer); /boosts/status (employer) →
`{ jobBoostsBanked }`. The write-path E2E (402 → bank → activate → featured)
is scripted (`scripts/jobs_v10_e2e.py`) but BLOCKED this session by server
SSH throttling (auth OK, exec channels dropped intermittently) — retry when
the window opens; the read-path evidence above is live and green.

**App: cache + skeletons + the two redesigns.** `hooks/useCachedResource.js`
— AsyncStorage stale-while-revalidate (instant paint from cache, silent
revalidate, a failed fetch never evicts the cached copy) +
`components/market/skeletons.js` (pulse-animated Skeleton / MaidCard /
JobCard / RailSkeleton; native driver). **HomeScreen**: stats row REMOVED
(owner); househelp rails = **Featured Jobs / Jobs near me / Recently posted**
(§15.5 job boost placement) with skeleton first-load; employer rails
(Featured / Near me / Verified / Top rated) same treatment; revalidate on
every focus (first focus skipped — mount already fetched); session re-sync
kept (banner + avatar freshness). **MaidProfileScreen**: brand-green hero
(gold-ringed avatar · Trust Badge + Featured chips), StarRating ("Maidora
score") + DistanceLabel + last-active row, skeleton hero while loading.
**MyJobsScreen**: Boost button per open job (banked → activate + reload;
402 → Payment `purpose: 'job_boost'`; "Featured until {date} — boost again
to extend"), skeleton loading state. MaidsScreen + FindJobsScreen: skeleton
grids. `cards.js`: StarRating + DistanceLabel; MaidCard renders score + km;
JobCard carries the Featured chip when boosted. schema.sql synced.

## 2026-11-01 — FIX: "Something went wrong" on every job post — missing employer_id SQL placeholder + marketplace log trail (owner report)

Owner: "trying to create a job i get something went wrong please try again... lets log".

**Root cause (from the server's own trail).** `POST /api/jobs` built its INSERT as
`VALUES (${cols.map(() => '?')…})` — one `?` per payload column but **no
placeholder for `employer_id`**: 7 columns, 6 `?`, 7 params → MySQL
`ER_WRONG_VALUE_COUNT_ON_ROW (1136)` on EVERY post → the gateway's generic 500
("Something went wrong. Please try again."). The central error handler had been
logging the full SQL into `stderr.log` all along — four owner attempts visible,
zero rows inserted. Fix in `jobs.js`: `VALUES (?, ${placeholders})` —
`employer_id` first, the exact pattern the `profile.js` upserts already used
correctly (audited every dynamic INSERT in `src/` — jobs.js was the only
offender). Deployed via `scripts/deploy_jobs_fix.py` (backup → upload →
`node --check` → restart → health; one 503 blip mid-restart, then green).

**"lets log" — the app now carries its own evidence.** Marketplace round trips
joined the log-trail convention in `src/api.js`: `[JOBS]` (jobs + applications),
`[CHAT]`, `[MAIDS]`, `[BOOST]` — one line per call (method · path · status ·
latency; on failure the raw error name/message/status), the same shape as
`[MPESA]`/`[KYC]`/`[AUTH]`, so the next failing marketplace call prints its
evidence in Metro next to the server's stderr trail instead of a bare banner.
Takes an app reload to pick up (no release needed).

**E2E on the live gateway** (`scripts/jobs_fix_e2e.py`): register → OTP inject →
verify → onboarding(employer) → **POST /jobs with salary → 201** (owner's exact
failing shape, job #31) → POST /jobs without salary → 201 (job #32, null
branch) → /jobs/mine lists both → open feed shows both → PATCH close → 200 →
invalid payload → **400 with per-field errors** (never a 500 — the PostJob form
now gets real messages like "Give the job a clear title (5–120 characters)") →
test user DELETE cascades both jobs (`fk_jobs_employer`). Server trail after
deploy: `[JOBS] job #31/#32 posted…`, no new column-count errors.
Gotcha recorded: `/auth/onboarding` returns a **refreshed token carrying the
role claim** — clients/scripts must adopt it, or the old `role:null` token
403s at the employer gate (cost one E2E iteration).

## 2026-11-01 — MARKETPLACE SHIP: search + jobs + applications (§9) + real chat · seed data · home avatar + approved-banner fixes (owner request)

Owner: "fix homescreen avatar · once verification is approved we don't need the
banner · generate seed data of 20 maids and 7 employers · build homescreens for
both, jobs, maids with search and filter, chat, maid profile — all per the docs."

**Home fixes (owner-reported).** (1) The header avatar always showed initials
even with a photo uploaded — it now renders `user.avatarUrl` (shared `Avatar`
in `components/market/cards.js`: photo with initials fallback + onError). (2)
The verification banner survived approval because the context snapshot went
stale — Home now re-syncs the session (`GET /auth/me` → `updateUser`) on every
focus, so the banner disappears the moment the server says `approved`; avatar
URLs stay fresh the same way. The dev-promo "Try an M-Pesa payment" card left
the hub (payments live in the drawer, purpose picker intact).

**Backend v8 (deployed, probes green).** `sql/migrate_v8_marketplace.js` (idempotent
CREATEs, schema.sql synced): `jobs`, `job_applications` (UNIQUE job+maid),
`chat_threads` (ordered-pair UNIQUE), `chat_messages` (read_at bulk-stamp).
Routes: `maids.js` (browse/search: q, county, job_type, verified, min
experience, salary cap + §10 decay — 60d+ archived never listed, 30–59d dormant
only when searching, 14–29d quiet ranked below active; counties meta from real
rows; public profile `:id` without contact details), `jobs.js` (post/browse/
mine/detail-with-applications/patch/apply), `applications.js` (role-aware
lists; §9: every application ever consumes a credit → 2 lifetime free, then
402 `paywall_required`; withdraw keeps the credit consumed per spec; employer
accept/reject), `chat.js` (`/threads` find-or-create, inbox with unread
counts, `?after=<id>` incremental fetch that stamps read_at = "seen on open",
4s-poll friendly; no websockets on cPanel — polling by design). All mounted in
app.js; service routes gate with `requireVerified` (§5), browse is read-only
requireAuth (§15.1 adopted scope). Split lesson: applications handlers needed
their OWN router — two `GET /` on one router shadow silently.

**Seed (owner-specified shape).** `sql/seed_demo.js` — 20 maids + 7 employers
with full §7 profiles (languages, job types, wages 9k–22k, bios, next of kin),
Kenya-wide locations, kyc approved×16/submitted×4 (maids) and 5/2 (employers),
last_active spread 0–46 days to exercise all §10 tiers; +10 open jobs, 8
applications (every status), 2 chat threads with messages. Marker
`@demo.maidora.co.ke`, re-run = purge + re-insert (children CASCADE; real
accounts untouched). Demo login: any seeded phone/email + `Demo#1234` (owner
knowledge; documented here + §5.4). E2E on live: login ✓, /maids default 17
(dormant hidden) + q finds 20 ✓, county+verified filter ✓, jobs ✓, apply
consumes 1→0 + duplicate 409 + 3rd → 402 paywall ✓, withdraw keeps credit
consumed ✓, employer accept ✓, chat find-or-create + incremental fetch ✓.

**App screens (13 files).** Shared `components/market/cards.js` (Avatar,
TrustBadge, MaidCard, JobCard, ChipRow, StatusChip, formatKes, timeAgo).
`HomeScreen` rebuilt per role (stats row, quick actions, live previews);
`MaidsScreen` (search + county chips from meta + job-type chips + verified
toggle + pagination); `MaidProfileScreen` (public profile + gated Message →
thread); `FindJobsScreen` (feed + applied-state chips); `JobDetailScreen`
(maid: apply/paywall-sheet/withdraw; owner: applicant list with Accept/Reject
+ Message); `PostJobScreen` (create); `MyJobsScreen` (postings + open/close);
`ApplicationsScreen` (status chips + credits card + withdraw);
`ChatsScreen` (inbox, 12s quiet refresh) + `ChatThreadScreen` (history +
4s incremental poll, Seen receipts, composer). New root-stack routes:
MaidProfile · JobDetail · PostJob · ChatThread (back button free from the
navigator). api.js grew the client methods. @babel parse 13/13.

---

## 2026-11-01 — §15.5 BOOSTS SHIP (profile + application) · employer-home rails (owner's section list) · chat FlatList crash fix (deployed, E2E 26/26)

Owner: "Property 'FlatList' doesn't exist navigating to chat · employer home =
maids near me, verified, top rated, featured (profile-boost paid) per docs ·
boosted application at the top of the application list, per docs."

**Chat crash (owner-reported, crash class).** `ChatThreadScreen` rendered
`<FlatList>` without importing it — Hermes: `ReferenceError: Property 'FlatList'
doesn't exist` the moment a conversation opened. Import added; a repo-wide
JSX-identifier scan (`scripts/check_missing_imports.js`) found no other missing
import anywhere (all remaining flags are member-expression tails / hoisted
exports — verified by hand). Lesson: `[[`-sequences in shell output get
visually collapsed in this console — trust `node --check` + char-code dumps
over a rendered diff line (a suspected `const [e]]` "syntax error" in maids.js
turned out to be `const [[me]]`, byte-verified).

**Backend v9 (deployed, probes 26/26 — `scripts/deploy_boosts_v9.py`).**
`sql/migrate_v9_boosts.js` (idempotent, schema.sql synced): `maid_profiles.boosted_until`
(+idx), `job_applications.boosted_at` (+idx), `payments.consumed_at` (+entitlement
idx) — **a paid payment row IS the entitlement**, `consumed_at` marks it spent so
it can never replay. The migration also lands the §15.5 FINAL pricing:
profile_boost 100→**99**, application_boost 50→**30** + `is_active=1` — guarded
UPDATEs that only touch rows still carrying the v5 provisional values (an
owner-edited price is never stomped). New route `src/routes/boosts.js`:
`GET /boosts/status` (banked counts + featured window) · `POST /boosts/profile`
(consume one banked row → `boosted_until = GREATEST(current, NOW()) + 7d`,
stacking) · `POST /boosts/applications/:id` (spend one banked row on MY pending
application; 409 `already_boosted`, 402 `paywall_required` → app routes to
M-Pesa preselected). Consumption is atomic (`UPDATE … WHERE consumed_at IS NULL`)
— a double-tap can never spend a row twice. `maids.js`: `/rails` — the
employer-home sections in ONE call: **featured** (active boost), **nearby**
(caller's county, nationwide fallback flagged), **verified** (Trust Badge),
**topRated** (quality-score proxy: badge 40 + experience ≤30 + §7 depth ≤20 +
fresh-active 10 — documented as a proxy, no reviews table exists in any spec);
§10 decay gates apply; browse gains `featured=1` and boosted-first ranking
everywhere via `RANK_SQL`. Ordering: BOTH application lists now pin boosted to
the top — `applications.js` (maid's own list) and **`jobs.js` GET /:id** (the
employer's applicant list, which had been missed in the first slice — caught by
the E2E probe "boosted pinned FIRST", then fixed + re-proven). `app.js` mounts
`/api/boosts` (requireVerified on the spend paths).

**Seed boost state (`seed_demo.js` re-run).** 3 maids with an active 7-day
profile boost (Mary · Esther · Beatrice — the Featured rail has real people),
Grace's pending application to James Kamau boosted AND backdated 30h (so the
employer-list probe is decisive: boosted-first beats a newer applicant), and 2
banked demo entitlements for Grace (application_boost 30 + profile_boost 99,
receipts DEMOBOOST01/02) so the Boost button and activation path demo without
an M-Pesa prompt. E2E left Grace's own profile boost ACTIVATED (featured until
2026-11-07) — re-running the seed resets the whole demo state.

**App screens (8 files).** `HomeScreen` employer hub rebuilt on the owner's
section list — Featured maids ("Boosted placement — the top spot, bought
fairly") · Maids near me (county subtitle, honest nationwide-fallback line) ·
Verified maids · Top rated maids — four rails, one `/maids/rails` call, each
hidden when empty; househelp hub gains the §15.5 boost strip ("You are featured
until …" / "Activate my boost" when banked / "Boost my profile" → Payment
preselected). `ApplicationsScreen`: Boosted chip, per-application **Boost**
button (spends a banked boost; 402 → Payment `application_boost`), banked count
in the credits card. `JobDetailScreen` (owner): Boosted chip on applicants +
"boosted sit at the top" note. `cards.js`: `FeaturedChip` (gold star on boosted
maids, browse + rails) and `BoostChip`. `MaidsScreen`: star toggle =
Featured-only filter (`?featured=1`). `PaymentScreen`: `route.params.purpose`
deep-link (Home/Application boost CTAs land preselected) + §15.5 fallback
prices. `api.js`: `maidsRails`, `boostsStatus`, `boostProfile`,
`boostApplication`. @babel parse 8/8 · missing-import scan clean · backend
`node --check` 7/7 on the box.

---

## 2026-11-01 — M-Pesa "fetch failed" root-caused + fixed: cause surfacing + one connect-retry (deployed, E2E 7/7)

Owner's field logs (same session that confirmed resetRoot): KYC submitted clean,
then the urgent upsell STK push failed TWICE — `payment #1/#2 failed — rc=null
"M-Pesa STK push unreachable: fetch failed"`. A third manual tap (after the
pasted log) succeeded and the callback settled with receipt `UJV6N0EZCT`.

**Root cause (proven from `stderr.log` + probes on the box).** Rows #1/#2 both
died at **~10.5 s** — that is undici's built-in **10 s connect timeout**, and
the telahost → `api.safaricom.co.ke` route is simply slow/lossy (same day:
OAuth 2.3 s, 5.7 s; push 7.7 s; curl connect 0.25 s → 3.8 s in Node). When TCP
connect exceeds 10 s, Node's global fetch throws the opaque `fetch failed`
with the real reason in `err.cause` — which `darajaFetch` never read, so the
log and the payment-row reason were blind. DNS/credentials/TLS all fine
(getent → `196.201.214.202` v4-only; unauthenticated OAuth probe → HTTP 400 in
~1 s; Node fetch probe OK).

**Fix — `backend/src/services/mpesa.js` (deploy `scripts/deploy_mpesa_connect_retry.py`, E2E 7/7, row #4 accepted):**
1. `networkReason()` walks the `err.cause` chain and appends the undici/OS
   codes — failures now read e.g. `M-Pesa STK push unreachable: fetch failed
   (UND_ERR_CONNECT_TIMEOUT · Connect Timeout Error)` instead of bare
   "fetch failed", in the stderr log AND in the reason stored on the payment
   row / shown to the user. (Offline-verified: ENOTFOUND extracts
   `ENOTFOUND · getaddrinfo …`, our own AbortSignal deadline stays
   `no response within Xms` and is NOT classified as connect-class.)
2. `isConnectClassError()` + ONE automatic retry (1.2 s backoff) for
   **connect-class failures only** — DNS (ENOTFOUND/EAI_AGAIN), TCP connect
   (UND_ERR_CONNECT_TIMEOUT, ETIMEDOUT w/ syscall=connect), refused/unreachable
   (ECONNREFUSED/EHOSTUNREACH/ENETUNREACH). The request provably never left
   the box, so a retry can never double-prompt the customer. Mid-response
   resets and our own deadlines are deliberately NOT retried — the push may
   already be on its way; a blind retry could charge twice. Worst case row
   stays pending ~2×25 s + 1.2 s — the app polls 4 s × 52, plenty.
3. Removed the shadowed duplicate `getAccessToken`/`requestToken` pair (the
   second declaration silently won since harden2; first was dead code).

**Not yet fixable from code:** the route itself. If connect-timeout failures
persist even WITH the retry, the next lever is a keep-alive agent/dispatcher
with a raised connect timeout, or asking the host about egress quality to
Safaricom. The surfaced cause codes will make that call data-driven.

---

## 2026-11-01 — resetRoot routing CONFIRMED on device · signup location permission ask · OTP screen revamp

Owner: "Great now working fine... after otp i get to the role select screen,
logout takes me to loginscreen." — the `resetRoot` mechanism (81d95f8) is
confirmed by field test. Two UX items followed.

**1. Signup location auto-fill now ASKS once (owner question — "can it be
automatic without necessarily pressing refresh my location, or all
permission be requested after app installation?").**
Root cause of the empty field on a fresh install: the auto-fill was
silent-only (`fetchLocationIfPermitted` never prompts), and after the owner
cleared app cache the permission was gone — so the field stayed empty until
the button was pressed. New `autofillLocationAskingOnce()` (location.js):
granted → silent capture; **'undetermined' → the OS dialog pops ONCE on the
signup screen itself** (the location field is visible, so the ask has
context); denied → never re-prompted (button stays the manual re-ask).
Deliberately NOT an install-time permission wall — users deny blind
multi-permission screens and store review expects asks tied to the feature.
Login pre-warm stays silent (§6 best-effort, never blocks login).

**2. OTP screen rebuilt (owner: "we need to revamp the ui of the otp
screen").**
- Compact layout: resend counter + "Wrong number? Start over" now sit right
  under the input (they used to pin to the screen bottom behind the
  keyboard); Screen's KeyboardAvoidingView lifts the block. Banners moved
  between the hint and the CTA (always visible).
- Paste code button REMOVED (owner) — OS SMS autofill (oneTimeCode /
  sms-otp) still fills the hidden field; expo-clipboard import dropped.
- Keyboard reliably re-opens: tapping the boxes runs blur → next-frame
  focus on the hidden input (a plain focus() is a no-op when Android still
  considers the field focused after a dismiss — owner: "when i dismiss the
  keyboard i cant launch it again").
- Reanimated animations: boxes pop as digits land, the active box lifts;
  wrong code → row shake + boxes flash red (digits held ~0.56s then cleared,
  never wiping retyped digits; `submittedRef` resets so the same code can be
  re-verified); correct code → green wave sweeps the boxes left-to-right
  during a deliberate ~0.64s success beat BEFORE `signIn` hands off (the
  root reset follows immediately). Logic (pendingReg, finishingRef, no
  manual navigation) untouched.

Verified: babel parse OK on OtpScreen / SignupScreen / location.js; clipboard
import fully removed. No backend change.

---

## 2026-10-31 (latest) — Root auth routing rebuilt on `resetRoot`: the navigator key-remount is retired

Two more owner trails killed the key-remount theory for good:

- **Logout**: drawer footer tapped → `signOut: start` → `root: key=out → Login`
  → `session cleared` — the STATE machine was perfect, yet the owner stayed
  inside the old tree for a full minute (opened KYC Verification, filled the
  personal form, took an avatar photo — every API call 401) and "had to reload
  the app".
- **OTP**: `verify-otp → 200` → `signIn` → `root: key=in → RoleSelect` with NO
  transient routes (the 5ea634e fix works at state level) — yet the owner
  "still lands on a blank screen after the otp".

**Conclusion: the mounted tree ignores a `key` change on `Stack.Navigator` in
this environment (RN new architecture + react-native-screens 4.30). Context
updates still propagate INTO the old tree — the OTP blank is OtpScreen's
`!pendingReg` guard re-rendering empty inside the surviving tree.** Every
in-navigator navigation action demonstrably works on device (RoleSelect →
tabs reset, Login → Otp replace, drawer switches).

**New mechanism (one persistent navigator + documented programmatic routing):**
- `NavigationContainer ref={navigationRef}` (`useNavigationContainerRef()`);
  RootNavigator receives the ref.
- A reset effect compares the computed **landingRoute** (real route names —
  the trace now prints `EmployerTabs`/`HousehelpTabs` instead of the
  pseudo-name `tabs`) with the stack's top route
  (`getRootState().routes.at(-1).name`) and dispatches
  **`navigationRef.resetRoot(...)`** on mismatch
  (reactnavigation.org/docs/navigating-without-navigation-prop).
  - `key='out'`: only rescues screens that belong to a signed-in tree —
    while on Welcome/Login/Signup/Otp/ForgotPassword the auth flow keeps
    navigating itself (no fighting Signup's `replace('Otp')`).
  - `key='in'`: mismatch = handoff (top is `Otp`/`Login`, landing is
    RoleSelect or the role tabs) → reset. Token refreshes (/me) change no
    dependency → never fire.
  - Every dispatch logs `[AUTH] root: resetRoot → X (top was Y)` — the trail
    now shows the action, not just the intent.
- `key={authKey}` REMOVED from Stack.Navigator (single mechanism; the
  initialRouteName still governs the first mount after boot).
- OtpScreen: mid-handoff (`finishingRef`) the screen now KEEPS its content
  (phone label pinned in a ref) instead of the empty `!pendingReg` guard
  render — no blank frame even before the reset lands.

Verified: `useNavigationContainerRef` + `resetRoot`/`getRootState` exist in
the installed @react-navigation/core 7.x (re-exported by native); babel parse
OK on App.js, OtpScreen, LoginScreen, ProfileDrawer. Comments in
LoginScreen/ProfileDrawer/OtpScreen updated to the new mechanism.

---

## 2026-10-31 (later) — Blank-screen-after-OTP + login-latency fixes · GPS now fills location_county/area

Owner's field report from testing `2adcc6a`: OTP verify → **"blank screen with
back arrow which took me to login screen"** → login "button loads and nothing
happens" → restart → RoleSelect → Employer → home. Plus: "on the table(users)
location_area and location_county are null — do we delete those fields?"

**1. Blank screen — root cause found in the hardening itself.**
`OtpScreen.verify` still did `await setPendingReg(null)` BEFORE `signIn`
(`signIn` clears pendingReg itself). That early flip (a) hit OtpScreen's own
`if (!pendingReg) return <Screen/>` guard → the screen rendered EMPTY under
the stack header with the automatic back chevron — the exact sighting — and
(b) produced the transient `[AUTH] root: key=out → Login (pendingReg=false)`
line right before the real `key=in → RoleSelect` remount, visible in the
owner's pasted trail. Fix: the premature clear is removed; `signIn` batches
token+user+pendingReg-null in ONE render, so the first state flip IS the
remount — nothing renders in between. `finishingRef` stays as a guard.

**2. "Login button loads and nothing happens" — latency, not a dead end.**
The trail proves both login attempts COMPLETED (`signIn` → `key=in →
RoleSelect` twice). The dead-feeling button: submit awaited a COLD GPS fix
(permission check + lock + reverse geocode, 6s race) BEFORE `api.login`.
Fix: `fetchLocationIfPermitted()` (silent, never prompts) pre-warms the fix
at screen mount; by the time credentials are typed it is ready and submit is
a single round trip. No pre-warmed fix → one 3s-capped attempt; still none →
login proceeds WITHOUT a location stamp (§6 best-effort).

**3. location_county / location_area NULL — columns KEPT, now populated.**
Nothing ever sent them: the backend has accepted `locationArea`/
`locationCounty` at BOTH `/register` and `/auth/login` from day one
(`sanitizeLoginLocation` + register insert), but the app only sent the
`location_name` display string. `location.js` now derives county (city/
region) + area (district/subregion/name) from the reverse geocode and
Signup + Login send the pair — GPS users get structured location for free.
The GUIDED county+area picker (47 counties + estate suggestions, GPS
pre-seeded) is ADVISED as the authoritative source — awaiting go-ahead.

**4. `[AUTH]` round-trip logs** for every `/auth/*` call in `api.js` (same
contract as `[MPESA]`/`[KYC]`) — the next "login did nothing" report arrives
with latency + status right next to the state trail.

Verified: babel parse OK on all 5 edited files. No backend change needed.
Answers sent to the owner: child tables KEEP their BIGINT ids (migrate_v7
decision), AUTO_INCREMENT drift = DELETE never rewinds (v7 TRUNCATEd the
transient tables), abandoned OTP = account exists in `pending_verification`
and pendingReg survives restart by design.

---

## 2026-10-31 — `users.id` IS the UUID: PK + every FK converted (owner request) · signup keyboard + location auto-fill · OTP-handoff navigation hardening

Owner cleared the database "to try again from start" and upgraded the earlier
uuid request: **"now user id and its reference in (fk) should refer to the
uuid... so user id is now uuid"** — plus three field reports from testing the
fresh-install experience. One deploy, one commit.

**1. UUID primary key (migrate_v7, supersedes the additive v6).**
`users.id` is now **CHAR(36) PRIMARY KEY holding a v4 UUID minted at signup**
(`/register` → `crypto.randomUUID()`); the v6 `uuid` column is folded into id
(`publicUser.uuid` stays as an alias). All six child `user_id` columns
(phone_otps · email_otps · media_assets · payments · maid_profiles ·
employer_profiles) are CHAR(36) FKs → users(id); `login_attempts.user_id`
widened, no FK (by design). **Owner's two questions answered in the schema:**
child tables KEEP their own BIGINT `id` (row identity: M-Pesa callback
matching, OTP attempts, `ORDER BY id DESC` — nothing to do with user
identity), and the AUTO_INCREMENT counters were reset to 1 (the 12/13/60-74
drift = DELETE never rewinds the counter; only TRUNCATE does). `verify-otp`/
`resend-otp` take the UUID as an opaque string (`parseUserRef`, no
`Number()` coercion); referral codes are `M` + 6 random chars with a dup
retry (no numeric id to derive from). migrate_v6 gained a superseded-guard.
- **migrate_v7_uuid_pk.js** (idempotent): FKs dropped/rebuilt from
  INFORMATION_SCHEMA; user rows re-identified to their v6 uuid; children
  re-pointed through the captured old→new map; TRUNCATE + reset on
  phone_otps/email_otps/login_attempts (all rows were expired OTPs / today's
  2 failed attempts). **Deploy `deploy_uuid_pk_v7.py`**: mysqldump backup →
  pass 1 → restart → pass 2 (verify-only no-op) → health/db-health green →
  live probe: register 201 with `userId=145a568a-7aca-419f-962b-e65a935ef1a9`
  (v4-shape, uuid alias matches), `users.id` PK = same value, wrong-code
  verify-otp → clean 400 "Incorrect code" (uuid handoff parses), probe user
  cascade-deleted. **UUID-PK DEPLOY PASSED.** Owner's account preserved,
  now `5978f03a-650e-4e09-b948-0bf247f8baca`; FKs→users = 6; all counters = 1.

**2. Signup keyboard fix (`Screen`, owner: "keyboard hides input fields").**
The shared `Screen` passed `behavior={undefined}` on Android — and with
`edgeToEdgeEnabled: true` the window no longer resizes for the keyboard
(adjustResize is a no-op on Android 15+), so the password/referral fields
disappeared behind it. `Screen` now wraps every screen in
`KeyboardAvoidingView behavior='height'` on Android ('padding' on iOS) —
all form screens benefit, not just signup.

**3. Location auto-fill on signup (owner: "just fetch the current location
and autofill that field... or whats your view").** Implemented the
auto-fill with a consent guard: `fetchLocationIfPermitted()` (location.js)
checks `getForegroundPermissionsAsync` — fills the Location field + coords
on screen entry **only when permission is already granted** (login captures
it silently, so it usually is); never prompts, never throws, never clobbers
typed text. The explicit button (relabelled "Refresh my location") stays as
the manual refresh and as the only path that may trigger the OS dialog.
View: auto-fill without asking is right once permission is granted; asking
in advance on a signup form would burn trust for a field the user can type.

**4. OTP-handoff navigation hardening (owner: abandon OTP → relaunch →
login → OTP resent → success "navigated me back to the signup screen";
after a restart it landed RoleSelect → homepage as expected).**
Root cause class: manual navigation racing the auth-key remount.
`OtpScreen.verify` reset the stack AFTER `signIn` (the stack is being torn
down mid-flight) and its `!pendingReg → Welcome` effect fired during the
handoff (`setPendingReg(null)` clears context before `signIn` commits).
`verify` now flips state only, behind a `finishingRef` that suppresses the
empty-pending effect; the remount decides the landing (RoleSelect while no
role, role tabs after onboarding). `LoginScreen` post-signIn resets removed
(same principle). `RoleSelectScreen` no longer routes a SIGNED-IN user into
Signup — the legacy param hop fired while the context was still settling in
the remount window (the likely "back to signup" sighting); signed-in + role
set → straight to the tabs. **What happens when signup is abandoned at the
OTP (owner's question):** the account row exists immediately as
`pending_verification` (no role); `pendingReg` survives restart for 30 min
so relaunch resumes at the OTP screen; after expiry the handoff is lost and
logging in routes back to OTP (server-correct — codes expire in 10 min,
resend cooldown 60 s, hourly caps). The phone/email stays reserved (409 on
re-register) but the login→OTP path always rescues it.

Verified: `node --check` ×3 backend; Babel parse ×8 app files; 21/21 logic
checks (`scripts/verify_uuid_auth_flow.py`).

## 2026-10-31 — `users.uuid`: public v4 identifier set AT SIGNUP (owner request) — *superseded same day by the PK conversion above*

Owner: "for user id we need to setup uuid at signup." Shipped as an ADDITIVE
`users.uuid CHAR(36)` (UNIQUE `uk_users_uuid`) — **not** a PK-type switch: the
BIGINT `id` stays PRIMARY KEY, JWT `uid` claim, and every FK
(phone_otps · email_otps · maid_profiles · employer_profiles · payments ·
media_assets) keeps working; converting a live PK to CHAR(36) would rewrite
six FK tables for zero functional gain. Consumers use `uuid` as the public
identifier; `id` remains in `publicUser` for client compatibility (the app
never reads `user.id`, so this is purely additive client-side).

- **migrate_v6** (`backend/sql/migrate_v6.js`, idempotent): adds the column
  (nullable), backfills every row with a Node `crypto.randomUUID()` (v4 —
  NOT MySQL `UUID()`, which is v1/MAC-based), adds the UNIQUE index.
  Deliberately leaves the column NULLABLE on the live DB: the old node
  process serves until `tmp/restart.txt` flips it and its INSERTs don't know
  the column — NOT NULL in the same pass would 500 every registration in the
  upload→restart window. The deploy runs the migration BEFORE and AGAIN AFTER
  the restart; pass 2 backfills any window stragglers. `schema.sql` keeps
  `uuid CHAR(36) NOT NULL UNIQUE` for fresh installs.
- **auth.js**: `/register` generates `crypto.randomUUID()` per signup and
  INSERTs it; the response now carries `uuid` alongside the existing
  `userId` (the OTP handoff still uses the internal id — OtpScreen depends
  on it). `publicUser` exposes `uuid: u.uuid || null`, so verify-otp · login
  · onboarding · /me · email flows all return it.
- **Deploy `scripts/deploy_uuid_v6.py`** (backup → upload → migrate pass 1 →
  restart → migrate pass 2 → health → LIVE register probe → cleanup): probe
  registered `+254711346747`, got 201 with `uuid
  59776d63-b58c-4564-90b3-37648f9ec69e`, DB row matched, DELETE cascade
  cleaned the probe (leftover 0). Health + db-health green. **UUID DEPLOY
  PASSED.** First run flagged a probe-regex typo (variant group `{4}` →
  `{3}`) — probe bug, not a server bug; fixed and re-run clean.
- **⚠ DATA-STATE FINDING (independent of this change, reported to owner)**:
  `maidorac_db` was emptied BEFORE this deploy — users 0 rows (AUTO_INCREMENT
  34 → 33 rows deleted, counter preserved), payments 0 (AI 67), phone_otps 0
  (AI 70), media_assets 0, profiles 0, login_attempts exactly ONE row: a
  FAILED login for `amungalucas@gmail.com` at 2026-10-31 13:46 (+102.203.137.244)
  seven minutes before my 13:53 deploy. All project cleanup scripts delete by
  exact email/phone/id (grepped) — nothing bulk-deletes. No `.sql` dumps
  exist under /home/maidorac. Consequence: cached app sessions keep working
  until the next 401; fresh logins will fail until accounts are re-created.
  Owner decision pending: restore from a cPanel/JetBackup point (if any) or
  re-signup fresh (uuid now live for every new account).

---

## 2026-10-31 — Logout navigation hardening + `[AUTH]` event trail · hamburger ghost style (owner field feedback)

Owner round-trip on the `72f4620`/`5a2b60b` build (browsing the drawer
screens): **(a)** the hamburger "looks like it's floating — not sure whether
it's the background blending or the button is actually floating… we can add a
subtle drop shadow and then remove the background"; **(b)** "I clicked logout
but it didn't navigate to login… it did reset the data but [nothing] until I
reload/restart the app — we can also log the events."

- **Logout — why the key-remount fix alone wasn't enough.** The remount is
  driven by `token`/`user` state, but `signOut` **awaited
  `storage.clearSession()` before the setters**. That is the only path where
  the disk session can be gone (restart → Login, exactly what the owner saw)
  while the running UI never hears about it: one AsyncStorage throw /
  rejection before `setToken(null)` skipped every state flip. **Fix
  (AppContext.js):** state FIRST — `setToken(null)`/`setUser(null)`/
  `setProfileCompleteness(null)` run synchronously so the root stack's
  `key='in'→'out'` remount on Login is unconditional — then storage clear,
  best-effort, in try/catch (a failure now only means stale disk keys, which
  the next `signIn` overwrites).
- **`[AUTH]` event trail (owner: "we can also log the events").** New
  `console.log` trace, same spirit as `[MPESA]`/`[KYC]`: tap source
  (`drawer footer tapped` / `settings row tapped`) → `signOut: start (had
  token=… user=…)` → `session cleared from storage` **or** `storage clear
  FAILED — <msg>` → `[AUTH] root: key=in|out → route (token=… user=…
  pendingReg=… onboarding=…)` on every auth-state change (App.js effect, hook
  kept above the `booting` early-return). `signIn` logs the session store
  too. Both `logOut` handlers wrap `signOut()` in `Promise.resolve(...).catch`
  so a failure lands on the trail instead of dying as an unhandled rejection.
- **Hamburger ghost style (DrawerMenuButton.js).** The old white
  (`colors.card`) rounded square + border read as a floating chip on the
  cream header. Background and border removed — bare `menu` icon (size 26,
  brand) — with a subtle drop shadow riding the **glyph** via `textShadow`
  (rgba forest @ 0.28, r=3, y+1). Chosen over `elevation` because Android
  View elevation needs a background to cast from — precisely what was
  removed; `textShadow` renders on both platforms.
- **Verify:** Babel parse OK ×5 (App.js, AppContext, ProfileDrawer,
  SettingsScreen, DrawerMenuButton); render-path simulation
  `scripts/verify_logout_hamburger.js` — old order + storage throw = **0
  state flips** (UI stranded, the reported bug), new order = flips always +
  storage cleared when possible. Docs: §1 logout row field-hardened, drawer
  row gains the ghost-style note.

---

## 2026-10-31 — Headers re-based on the OFFICIAL React Navigation implementation (owner: "read the docs")

After the previous round shipped headers as **in-content chrome** (custom
`ScreenHeader` rows with `headerShown: false` everywhere), the owner pointed
at the official docs — reactnavigation.org/docs/headers, /docs/header-buttons,
/docs/drawer-navigator, /docs/status-bar (#tabs-and-drawer) — "to see the
implementation of headers and drawers". This round moves the app onto the
documented patterns: **the navigator owns the header chrome; screens render
none**.

- **Root native-stack (App.js)** — `screenOptions` carry the branded bar
  (cream `headerStyle`, `headerShadowVisible: false`, forest
  `headerTintColor`, 800-weight ink `headerTitleStyle`, slide_from_right
  kept) with `headerShown: true` DEFAULT. The **back button is automatic**
  (docs: it appears only when there is somewhere to go back to — no
  `canGoBack()` checks of ours anymore). Per-screen `options.title`:
  Settings · Payment · Trust Badge · Personal details · Your document type ·
  Your photos · Review your submission; auth screens get `title: ''` bars
  (their big headings stay in the content). `headerShown: false` opt-outs:
  Splash · Welcome · EmployerTabs · HousehelpTabs · terminal KycDone (no
  back INTO a submitted flow — "Done" pops to top). The three flow roots
  (Login post-logout, Otp with a pending registration, RoleSelect as the
  onboarding entry) keep a static titleless bar — cream-on-cream it reads as
  top spacing, and the SAME config serves their pushed states, which keeps
  each screen's safe-area `edges` static.
- **Profile drawer (ProfileDrawer.js)** — the drawer's OWN header is now on
  for all four drawer screens, per /docs/drawer-navigator +
  /docs/header-buttons: the hamburger lives in `headerLeft` and calls
  `navigation.openDrawer()`; titles per `Drawer.Screen` (Profile ·
  `Verification (Trust Badge)` · `Payments & receipts` · `Account settings`).
  `screenOptions` is passed as a FUNCTION so each screen's own navigation is
  captured — verified in the installed `@react-navigation/core`
  `useDescriptors.js`: option resolvers are invoked per route with that
  route's navigation object. (The drawer would otherwise inject its default
  `DrawerToggleButton` — `DrawerView.js` does exactly that when
  `headerLeft == null` — our branded `DrawerMenuButton` overrides it.)
- **Screens lost their in-content chrome** — Profile/Settings/Payment/
  KycIntro/KycDone rows and the 5 auth back-only rows removed; `KycShell`
  keeps the progress bar + subtitle while the step title moved onto the bar;
  `ScreenHeader` (ui.js) is now a chrome-free heading used ONLY by the six
  tab screens (Home · Find Jobs · Applications · My Jobs · Maids · Chats —
  tab screens never needed back buttons). Payment keeps the STK context as a
  muted intro line; KycIntro keeps "Free · Reviewed within 48–72 hours";
  KycDone (no bar, terminal) renders its heading as plain content.
- **Safe areas** — every screen under a navigator header now passes
  `edges` WITHOUT `'top'` (`Screen`): the header owns the status-bar inset,
  so content can't double-pad. Screens without a bar (Splash · Welcome ·
  KycDone · tabs) keep the top edge.
- **Focus-aware StatusBar (docs/status-bar — "Tabs and drawer")** — `Screen`'s
  dark `expo-status-bar` now renders only while the screen is focused
  (`useIsFocused`): tab and drawer navigators keep 5 tab + 4 drawer screens
  mounted at once and a bare `<StatusBar>` in each would race; the camera
  modal's light bar over GuidedCapture still wins on top.

Verification: Babel parse OK on all 20 touched/adjacent files
(`node --check` cannot parse JSX); render-path simulations in
`scripts/verify_headers_refactor.js` cover (A) per-route
`screenOptions({ navigation })` resolution with `openDrawer` reachable from
every drawer screen, (B) per-screen options overriding navigator defaults
(headers on/off split, titles, animation surviving the merge), (C)
ScreenHeader chrome-free rendering + empty→null, (D) KycShell progress/
subtitle. On-device check: open Profile tab (bar + hamburger opens the
drawer), drawer items (titles), Home banners → Settings/Payment/Trust Badge
(bar + back), KYC steps (bar titles + back through the flow), login flow
(bar appears once there is history), logout (still clean — signOut + keyed
remount, untouched this round).

---

## 2026-10-31 — Back-button headers everywhere + logout crash fix + interactive avatar crop editor (owner requests)

Three owner directives in one round: "remember we are using react navigation —
we need to have headers with back button in all non-tab screens"; "for the
profile screen have a header and move the hamburger menu to the header"; a
logout crash (`TypeError: undefined is not a function`); and "for the profile
pic upload the camera needs to be different where we can crop, zoom or
reposition the image within that circle".

- **Logout crash (root cause)**: `ProfileDrawer.logOut` and
  `SettingsScreen.logOut` called `navigation.resetRoot(...)` — that helper
  exists on STACK navigators only. The drawer-content navigation is a DRAWER
  object (no `resetRoot`), and Settings renders BOTH as a root-stack screen
  and inside the drawer, so logout threw `undefined is not a function` from
  either entry point. Fix: both `logOut`s now call `signOut()` only, and the
  root `Stack.Navigator` in `App.js` is keyed on the signed-in STATE
  (`token && user ? 'in' : 'out'`) — when auth flips, the whole stack
  remounts on the recomputed initial route (Login after logout; RoleSelect /
  tabs after sign-in). React Navigation ignores `initialRouteName` changes
  on a mounted navigator, which is why the navigation-call approach existed
  at all. Keying on STATE (not the raw token) keeps `/me` token refreshes
  remount-free; the post-signIn `navigation.reset(...)` calls in Login/OTP
  run before the context commit and land on the same route the remount
  computes — no race.
- **Headers with back button (all non-tab screens)**: `ScreenHeader` (ui.js)
  is now the ONE branded header with a smart left slot — HAMBURGER when the
  screen is inside the Profile drawer (`navigation.openDrawer` exists),
  BACK ARROW on root-stack screens when `navigation.canGoBack()` (so flow
  roots like Login-as-logout-target render no back), `onBack` override +
  `back={false}` opt-out. Wired: auth screens get back-only rows (their
  titles stay in the content) — Login, Signup, OTP, Forgot password, Role
  select; Settings / Payment / KycIntro dropped their ad-hoc right-slot
  hamburgers for `navigation={navigation}`; the four KYC step screens
  (Personal, Doc type, Photos, Review) get the arrow through `KycShell`.
  Exceptions by design: Splash, Welcome (auth root — nothing behind) and
  KycDone (terminal — "Done" pops to top). Profile's header IS the
  hamburger: rebuilt on `ScreenHeader` with the drawer hamburger in the
  left slot and "Profile" as the title (owner directive), replacing the old
  bespoke row; Settings' bespoke header row removed the same way.
- **Interactive avatar crop editor (new `AvatarAdjust` stage)**: avatar
  captures no longer auto-center-crop. After the shutter or a gallery pick,
  GuidedCapture (avatar mode only) hands the FULL photo to a new
  `AvatarAdjust` stage — square viewport, circular gold ring, scrim outside
  (same evenodd SVG trick as the camera guide) — where the user DRAGS to
  reposition and PINCHES to zoom (1×–4×). Pan/pinch run on the UI thread
  (RNGH Gesture API + Reanimated shared values; the stage carries its own
  `GestureHandlerRootView` because RN Modals render outside the app-root
  handler on Android); translations are clamped so the circle is always
  fully covered. "Use photo" maps the visible circle back into the image's
  pixel space (unit-tested: rect always inside bounds, always square, for
  portrait/landscape/square/small photos at every zoom) and `cropToWebp`
  encodes ≤600 px WebP exactly as before. Android front-camera shots are
  shown MIRRORED (scaleX −1) so positioning is WYSIWYG; the crop rect stays
  in that mirrored space and `cropToWebp(..., flipH)` flips the original
  first, then crops — no double encode. Retake returns to the viewfinder;
  [KYC] trace logs the crop (`avatar adjust crop WxH → mime KB`). Doc and
  selfie flows are untouched (stage exists only for `mode='avatar'`).

## 2026-10-31 — Employer Profile crash: `filter of undefined` (owner report)

Owner report: on the **employer** account, `TypeError: Cannot read property
'filter' of undefined` fired on BOTH Profile entry points — tapping the Home
"Profile strength" banner and tapping the avatar → Profile. This also
corrects the previous session's assumption that the stray error was fallout
from the front-camera native crash: it is **independent and employer-side**
(employers never touch the KYC camera).

- **Root cause**: `CompletenessWizard` renders (as an invisible Modal) the
  moment `ProfileScreen` mounts, and its render path computed
  `customLangs = form.languages.filter(...)` unconditionally — but the
  employer form shape (`emptyForm(false)` and the employer `hydrate` branch)
  never had a `languages` key. `undefined.filter` threw on EVERY Profile
  open for employers; the languages step is maid-only, yet the line ran for
  both roles.
- **Fix (same crash class, all guarded)**: employer `emptyForm`/`hydrate`
  now carry `languages: []` (total form shape for both roles);
  `customLangs` is computed from an `Array.isArray` guard; and the two
  `missing.join(', ')` renders — HomeScreen's strength banner and the
  wizard's done card — are `(… || [])`-guarded, so a server shape change
  (dropping `missing`) can never take either screen down the same way.
- **Verified**: Babel parse OK on both files; a render-path simulation
  reproduced the exact reported error on the old shape and confirmed the
  new shape returns `[]` with no throw. Smoke suite untouched (no logic
  paths changed beyond the guards).
- **Test on device**: reload in Expo Go → employer Home → tap the strength
  banner, then the avatar; Profile should open clean both ways.

## 2026-10-31 — Front-camera shot crash fix + urgent upsell revamp (tracker, paid card, live price, double-pay guard)

Owner live report: shutter in selfie mode (or any doc shot after flipping to
the front lens) died with "[flip] Cannot convert '[object Object]' to a
Kotlin type" — photo taken, pipeline dead; "Go urgent" needed the payment
screen's progress indicator and, when done, a paid confirmation instead of
the button "so that user cannot pay twice" (button returns on failure); and
the intro still showed KES 150 after the DB price was changed (the STK
prompt itself carried the new price).

- **Shot crash**: `cropToWebp` called the expo-image-manipulator context as
  `ref.flip({ horizontal: true })` — the installed API takes a FlipType
  STRING (`flip('horizontal')`); the object hit the Kotlin bridge and threw
  `UnexpectedException: Cannot convert '[object Object]' to a Kotlin type`
  on EVERY front-camera capture (selfie always; a doc capture after a flip
  too). The mirroring logic itself was right — only the call shape was
  wrong. The stray `TypeError: Cannot read property 'filter' of undefined`
  only ever appeared in tandem with this crash (also at the tail of the
  previous session's log) — same native-exception path, expected gone with
  the fix; the [KYC] trace will confirm on the next live run.
- **Urgent upsell revamp (`KycIntroScreen`)**: tapping "Go urgent" takes
  over the card with the SAME 4-step staged tracker as the payment screen
  (gateway accepted → prompt sent → enter M-Pesa PIN with countdown →
  confirmed), 4s×52 polling with the poll-overlap guard, adopt-pending on a
  timed-out push, "Didn't get a prompt?" tips, and a stopped state with
  Keep checking / "Close — pay later". On SUCCESS the card becomes a paid
  confirmation (M-Pesa receipt shown once the callback has landed) and the
  button is gone — nothing to pay twice; the parent re-fetches `/kyc` so
  server truth (`users.kyc_urgent`, granted by the settlement paths) drives
  the card across app restarts. On FAILURE the reason maps from the Daraja
  result code (same table as the payment screen) and "Try again · KSh
  {price}" returns. The intro screen now also re-fetches `/kyc` on every
  focus (`useFocusEffect`), not just on mount.
- **Live price**: the upsell reads `GET /payments/purposes` on mount and
  shows the `kyc_urgent` row amount (fallback 150 only while offline /
  pre-migration). The owner's repricing test (150 → 5) now shows on the
  very next visit to the screen; the server was already enforcing the table
  price at push time (his own payment #61: row = 5.00 while the client sent
  150) — the UI was the only stale part.
- **Double-pay guard (backend `stk-push`, deployed)**: purpose `kyc_urgent`
  is refused with 409 when `users.kyc_urgent` is already set (`already_paid`
  — the app flips straight to the paid card) or when a `kyc_urgent` payment
  is still pending and younger than 10 minutes (`pending_payment` — one
  open prompt at a time; two live prompts could both be approved and charge
  twice; the 10-min window matches the app's resume window so abandoned
  rows don't block forever). Deploy `scripts/deploy_urgent_guard.py`
  (backup → upload → node --check → restart → health 200; post-deploy DB
  check: kyc_urgent = 5.00 active, no users granted yet, owner's test
  pushes all rc=1032 unpaid).
- **Validation**: `check_jsx.js` 16/16; backend `node --check` ok.

---

## 2026-10-31 — KYC resume thumbnails (data-URI read path) + selfie mirror + camera flip

Owner live report: (1) "i took a selfie with the front camera and the image
was captured but inverted left-right"; (2) "took photo of id front and back
and when i restarted the app the state for the ids shows added but no
photos… what happens to the photos i took? are they temporarily stored on
phone? or do we start again"; (3) "for the selfie camera we can also add the
functionality to flip to front camera too".

- **Where the photos live — answered with DB facts**: uploads fire the
  moment "Use photo" is tapped (NOT at review completion). Owner's own rows:
  `media_assets` #6–#13 (id_front/id_back/selfie WebP), `users.kyc_*_url`
  populated, `kyc_status` even reached `submitted`. Files sit at
  `media.maidora.co.ke/kyc/*.webp` (0600, web-denied). Nothing is
  phone-only — a restart loses nothing and there is nothing to retake.
- **"Added but no photos" — ROOT CAUSE**: after a restart the checklist and
  review screens render server images from `kyc://field` markers through
  `<Image source={{ uri, headers: { Authorization } }}>` — the ONE path a
  restart exercises (fresh captures always render local `file://` URIs) —
  and header-authed RN `Image` sources fail silently on device: blank
  thumbnails under a truthful "Added" chip. Fix: new `useKycImage` hook
  (kycShared) — fetches `GET /kyc/images/:field?format=base64` through the
  proven fetch wrapper (token auth, [KYC]-logged round trip) and renders a
  data URI; local `file:`/`data:` URIs pass through untouched; a module
  cache keyed by an epoch that `bumpKycImageEpoch()` bumps on every upload,
  so a later resume never shows a pre-retake thumbnail.
- **Backend**: `GET /api/kyc/images/:field?format=base64` →
  `{ ok, field, mime, dataBase64 }` (raw byte stream unchanged for browser
  / future dashboard use). Deployed via `scripts/deploy_kyc_img.py` — E2E:
  base64 envelope 200 + `image/webp` + RIFF/WEBP magic, legacy stream
  intact, missing field 404, test user/files cleaned.
- **Selfie mirror**: Android expo-camera stores front-camera shots
  UN-mirrored while the preview shows the natural mirror — so the confirm
  stage (and everything downstream) showed a left-right inverted image.
  `cropToWebp(..., flipH)` now flips FIRST when facing front on Android,
  before the crop, so the crop rect (computed against the mirrored preview)
  stays valid and the stored/confirmed photo is exactly what the user
  framed (WYSIWYG). Gallery picks never flip.
- **Flip camera**: new top-bar flip button in `GuidedCapture` (all modes —
  doc/selfie/avatar) toggling front ↔ back live; the torch only shows (and
  auto-resets) on the back camera; facing resets to the mode's natural
  camera each open. Trace logs `camera: flip → front/back` and the shutter
  line now carries the facing.
- **Validation**: `scripts/smoke_kyc_capture.js` 38/38; live E2E in the
  deploy script (base64 + legacy + 404); commit on `main`.

---

## 2026-10-31 — KYC retake crash fix + end-to-end KYC flow trace

Owner live report after walking the rebuilt flow: "great works fine… ERROR
[ReferenceError: Property 'setShotDims' doesn't exist] took a photo and hit
retake" — plus a build request: "lets log all the kyc processes frm the time
one hits continue verification button api calls etc…".

- **Retake crash — ROOT CAUSE**: `GuidedCapture.backToCamera` (the Retake
  button + Android back on the confirm stage) still called
  `setShotDims(null)` — a leftover from a state variable that was removed in
  the guided-camera refactor. Hermes raises `ReferenceError: Property
  'setShotDims' doesn't exist` the moment Retake is pressed. The call is
  deleted (a comment documents why, so it doesn't get relearned).
- **KYC flow trace** — same contract as the `[MPESA]` payment traces:
  - New dependency-free `src/kycLog.js`: `kycStart(label)` opens a session
    (random 4-char id + wall clock), `kycLog(msg)` stamps
    `[KYC <id> +<elapsed>s]`, `kbOf(base64)` renders payload sizes (never the
    payloads themselves).
  - Session starts at the **Continue verification** press on the intro
    screen — the exact point the owner asked the log to begin — with the
    current KYC status and a draft/image summary.
  - Breadcrumbs through every stage: intro state fetch, step 1–4 screen
    entries (with dob/gender/doc-type/image-source summaries), profile
    prefill, draft autosaves (incl. failures — the autosave used to swallow
    errors silently), validation blocks (which field), doc-type picks,
    capture opens (source sheet vs live selfie), ActionSheet source choice,
    camera permission results, shutter + photo dims, crop dims + WebP KB,
    gallery picks, retakes, photo accepted, upload ms + KB, submit, done.
  - `api.js` now logs `[KYC]` round trips for **every `/kyc` and `/media`
    call** — success and failure: method, path, status, ms, and for uploads
    the payload KB (e.g. `[KYC] [214KB] POST /media/kyc/id_front → 200 in
    1823ms`). Errors log the raw fetch shape (name/msg/status) exactly like
    the MPESA ✗ lines, so timeouts/offline can't hide again.
  - Urgent-upsell STK push / poll outcomes also traced (KSh 150 `kyc_urgent`).
- **Validation**: `scripts/smoke_kyc_capture.js` — 38/38 OK (all modules
  incl. the new trace import cleanly; all screen renders pass; crop-math
  units unchanged). No backend change this round — client-side tracing only.

---

## 2026-10-31 — KYC capture rebuild: one checklist + guided in-app camera + brand action sheet + edge-to-edge fix

Owner walked the verification flow live: personal details → continue → "take
the front photo of my ID" — and reported four interactivity issues: (1) the
three capture items must live on ONE screen, not separate screens; (2) guided
frames — a frame that fits the ID and an oval for the selfie — and the taken
image must actually be cropped to that exact frame; (3) after taking a photo
and pressing OK **the app restarts**; (4) the OS popup for permissions /
"take photo, select from gallery" deserves a proper custom UI, as do all
other popups; plus (5) the whole layout ran edge-to-edge — fix at root level,
factoring in status bar, phone navigation bar and tabs.

- **App restart on OK — ROOT CAUSE**: `launchCameraAsync` (expo-image-picker)
  hands control to a *foreign* camera activity and then the `allowsEditing`
  OS crop editor; in Expo Go the host activity gets killed/reloaded on the
  return trip, so the app appears to restart after every capture. Fixed by
  replacing the whole capture pipeline with an **in-app camera**: new
  `GuidedCapture` modal on `expo-camera`'s `CameraView` (SDK 58 dep added,
  `expo-camera@~58.0.14` + plugin entry in `app.json` for future EAS builds).
  The app never leaves the foreground, so there is nothing to reload.
- **Guided frames + exact crop**: `GuidedCapture` renders a scrim (SVG
  evenodd hole) with a **rounded rect guide (16:10) for documents**, an
  **oval (3:4) for the selfie**, a **circle for the profile photo**, gold
  corner ticks on the rect, hint pill, torch toggle (docs), gallery button
  (docs/avatar), brand shutter. On shutter, `frameCropForPhoto` maps the
  on-screen frame from preview coords into photo pixels (CameraView previews
  *cover* — the visible region is a centered rect of the preview aspect
  inside the photo) and `cropToWebp` crops + downscales (≤1400/900/600 px)
  + encodes WebP ~0.8. Gallery picks skip the OS editor (`allowsEditing:
  false`) and center-crop to the same aspect, then pass the same confirm
  stage (**Retake / Use photo**) — every accepted photo, camera or gallery,
  fits the frame exactly.
- **One capture screen**: new `KycCaptureScreen` (route `KycCapture`) lists
  ID front + ID back (per doc type; passport hides the back, unknown type
  keeps it so review can never be blocked by a hidden missing image) + live
  selfie as cards with thumbnails and per-item status (Needed · Uploading ·
  Upload failed → "Try upload again" keeps the local shot · Added). The old
  `DocCaptureScreen`, `KycDocFrontScreen`, `KycDocBackScreen`,
  `KycSelfieScreen` are **deleted**; flow is now 4 steps (personal → doc
  type → photos → review), `KYC_STEPS`/`KYC_TOTAL_STEPS` renumbered, review
  retakes navigate `KycCapture { focus, returnTo: 'KycReview' }` and land
  straight in that item's capture. Uploads stay immediate
  (`POST /media/kyc/:field`) so the server-draft resume contract is intact.
- **Brand action sheet**: new `src/components/common/ActionSheet.js` (handle,
  icon rows, sub-labels, cancel, `useSafeAreaInsets` bottom padding,
  `statusBarTranslucent`) replaces the OS Alert chooser for "Add photo"
  (take photo / choose from gallery) and drives the **profile photo** flow —
  ProfileScreen now offers take photo (guided circle camera) or gallery
  through the sheet instead of the raw gallery picker (old flow also hit the
  restart bug). Camera-permission denial renders an inline explainer inside
  the capture modal with an **Open phone settings** shortcut — no OS popups
  anywhere in the flow.
- **Edge-to-edge fix (root level)**: the KYC screens (`KycPersonal`,
  `KycDocType`, `KycReview`, capture) rendered raw `<ScrollView>` roots and
  sat under the status bar AND the Android navigation bar
  (`edgeToEdgeEnabled: true`). All four now root in the safe-area `Screen`
  wrapper (all-edges insets + 24 px padding). §4.5 gains the hard rule:
  every screen roots in `Screen`, never a bare ScrollView.
- **Validation**: `scripts/check_jsx.js` 16/16 (Babel parse of every touched
  file) and NEW `scripts/smoke_kyc_capture.js` — 34/34: Babel-compiled
  imports of all 11 touched modules (automatic JSX runtime + commonjs via
  the app's own plugins), crop-math unit tests (cover-fit both directions,
  degenerate → null fallback, center-crop, clamping, identity scale),
  4-step constants, route-name integrity (no references to the deleted
  routes), and first renders of KycCapture (fresh / passport / all-uploaded),
  GuidedCapture (closed + permission explainer), KycReview, KycPersonal,
  KycDocType, KycIntro, KycDone, ProfileScreen, ActionSheet and App.js via a
  React-19 `internals.H` hook dispatcher. Two test-side math expectations
  were corrected during authoring — the implementation's cover-fit mapping
  was verified against the derivation (photo wider than preview → sides
  cropped, `visW = photoW·(pa/qa)`), not the other way round.
- **Owner test note**: Expo Go needs a JS reload after pulling this round
  (new native-capable dep `expo-camera` is bundled in Go — no dev client
  needed). First camera open triggers the OS camera-permission dialog once.

---

## 2026-10-31 — Pricing table + media.maidora.co.ke pipeline + capture crash fix + admin spec

Owner: pricing needs a **table** (prices change) · prepare the **admin
dashboard documentation** (build later) · fix `Cannot read property 'step'
of undefined` · next step: **secure media upload** (KYC docs + profile
photos, WebP) on the newly created `media.maidora.co.ke` subdomain.

- **Capture crash ROOT CAUSE** ("step" of undefined): the wrapper screens
  (`KycDocFront/Back/Selfie`) pass the capture target as a PROP, but
  `DocCaptureScreen` read `route.params?.field` — undefined on the normal
  forward flow (params only carry `{ draft }`), so `CONFIG[undefined]` blew
  up the moment the user reached step 3 (owner hit it right after the
  dead-Continue fix unblocked the flow). Fixed prop-first + params-fallback;
  unknown fields render a graceful fallback instead of crashing. Also found
  and fixed two siblings in the same screen: `CONFIG.selfie` had NO `next`
  (selfie Continue would have thrown `cfg.next is not a function` — it now
  navigates to `KycReview`), and the draft image keys were mismatched
  (`idFront` camelCase in the draft vs `id_front` snake_case reads in
  capture + review — remote images silently never showed). `IMG_KEY` in
  `kycShared` is now the single mapping; render smoke asserts KycShell
  receives the right title/step for all three fields + the fallback.
- **Pricing table (migrate_v5)**: `payment_purposes` is the §9 source of
  truth — label, description, `amount_kes` (NULL = any amount), audience
  (`system|both|househelp|employer`), STK ref/desc labels, `is_active`,
  `sort_order`; seeded 8 rows (app_test any · kyc_urgent 150 ·
  profile_boost 100 · maid_basic 200 · maid_gold 500 · employer_gold 500
  active; application 20 · application_boost 50 INACTIVE). Gateway:
  `GET /payments/purposes` serves the catalog; stk-push REJECTS unknown
  purposes (400 `bad_purpose`) and inactive ones (409 `purpose_inactive`)
  and **enforces fixed prices server-side** (client amount overridden + log
  line) — a tampered client cannot underpay a plan. Purpose label joins the
  list/status views → the success card now reads "Maid Gold · KES 500".
  App: PaymentScreen fetches the live catalog on mount (role-filtered by
  audience) with `DEFAULT_PRODUCTS` as offline fallback; the provisional
  note comes from the table's `description`.
- **Media pipeline (`backend/src/routes/media.js`)**: `POST /media/avatar`
  and `POST /media/kyc/:field` — base64 JSON ≤5 MB decoded, magic-byte
  sniff (WebP/JPEG/PNG, never the claimed mime), sha256, `media_assets`
  audit rows, old-file replace, names `<ts>_<96-bit random>`. Avatars →
  `media.maidora.co.ke/avatars/` PUBLIC (unguessable name + immutable
  cache), URL on `users.avatar_url` (v5 column) and in every `publicUser`.
  KYC docs → `media.maidora.co.ke/kyc/` **web-denied** (`Require all
  denied`), streamed only via the authenticated `GET /kyc/images/:field`
  (now resolves media dir first, legacy `kyc_uploads/` second). Managed
  `.htaccess` trio: root hardening (no indexes, no script execution, dotfiles
  denied, nosniff), avatars cache policy, kyc deny. **LiteSpeed uid trap
  (E2E-proven): 0600 avatars → 403, 0644 → 200 `image/webp`** — LiteSpeed
  reads under a different uid than the app owner; avatars are 0644 (privacy
  from the random name), KYC stays 0600 (only the API reads it).
- **App WebP pipeline**: `processToWebp` in kycShared (expo-image-manipulator
  `SaveFormat.WEBP`, ≤1400 px docs / ≤900 px selfie, q0.8) — captures +
  avatar uploads are WebP now (~half the JPEG bytes). DocCaptureScreen
  uploads via `POST /media/kyc/:field`; ProfileScreen gets a camera-badge
  avatar (library pick → square crop → 600 px WebP → `/media/avatar` →
  instant context update) and the Profile drawer header shows the photo.
- **Admin dashboard spec**: `docs/Admin_Dashboard_Spec.md` — control-panel
  build doc grounded in the live schema: RBAC (`admin_users` owner/reviewer/
  support + audit trail), KYC review queue (admin-scoped media reader),
  users/transactions modules, the `payment_purposes` pricing editor (M3 —
  closes the no-app-release pricing loop), analytics, reports & disputes,
  `event_log` monitoring, 4 build phases, open questions.
- **Deploy + E2E**: migrate_v5 on the live DB (payment_purposes 8 rows,
  media_assets, avatar_url); E2E 22/22 — purposes catalog (table source,
  inactive hidden), maid_gold price enforcement (client 100 → row 500.00),
  unknown/inactive guards, real-WebP avatar upload → public URL serves
  `image/webp` + RIFF magic, KYC upload → public URL 403 + dir listing 403 +
  authenticated stream 200, `/auth/me` exposes `avatarUrl`, garbage bytes
  400, cascade cleanup verified.
- **Validation**: node --check 7/7 backend files; check_jsx 10/10 app files;
  render smoke `scripts/smoke_media_round.js` 16/16.

---

## 2026-10-31 — Payment purposes + KYC personal-step fixes (owner live report)

Owner: payment purposes wanted ("STK Push test, KYC expeditiation, Profile
boost, Maid Basic subscription, employer gold subscription etc."), and three
live bugs in Identity & Verification step 1: DOB not fetched, gender buttons
need a better UI, "when I click continue, nothing happens".

- **ROOT CAUSE of the dead Continue (KycPersonalScreen)**: the DOB state
  held the DISPLAY string ("12 Mar 2002") but `onContinue` fed it into
  `normalizeDobInput` — which only parses `DD-MM-YYYY` / `YYYY-MM-DD` — so
  EVERY picker-chosen (or prefilled) DOB failed validation, and the one
  error it set (`errors.dob`) was never rendered anywhere on the screen.
  Silent death, exactly as reported. Fix: DOB state is now the ISO string
  (`YYYY-MM-DD`), the field only renders `formatDate(iso)`, validation is a
  straight regex matching the server, and `errors.dob` renders as red text
  plus a red field border.
- **DOB "not fetched"**: the screen only read the KYC draft
  (`kyc_date_of_birth`); the §7 profile wizard stores DOB/gender in the
  PROFILE tables. KycPersonalScreen now prefills DOB + gender from
  `GET /profile` when the draft lacks them (same lowercase `GENDERS` enum —
  1:1), filling only empty fields and never marking the form dirty.
- **Gender pills rebuilt**: the old `SecondaryButton` chips turned
  forest-on-forest when selected (unreadable). New pills: icon + label,
  forest fill + cream text + checkmark when selected, tap again to
  un-select (withhold), radio accessibility roles.
- **Payment purposes (app)**: PaymentScreen gains a purpose chip row
  (§9 product slots) — `app_test` any amount, `kyc_urgent` K150
  (owner-confirmed), `profile_boost` K100, `maid_basic` K200, `maid_gold`
  K500, `employer_gold` K500 — the last four **PROVISIONAL prices** pending
  the owner's product decisions; the on-screen note says so. Fixed-price
  purposes lock the amount and hide the amount chips; the purpose is sent
  on the push and shows in the tracker ("KES 500 · Employer Gold · payment
  #id").
- **Gateway**: `PURPOSE_STK` gains `employer_gold` (ref `EMPLOYERGOLD`,
  desc "Employer Gold"). Deployed via `scripts/deploy_purpose_map.py`:
  backup → upload → node --check → restart → health → register+OTP →
  stk-push purpose=employer_gold KES 500 (row `55|employer_gold|500.00|
  pending`, Daraja accepted) + kyc_urgent regression guard. BONUS live
  proof: the second push to the same unallocated MSISDN 2 s apart settled
  `failed` via callback with rc=4999 "Duplicated MSISDN… existing USSD
  Session" — the documented 4999 path works on the new purpose flow.
  (First script run showed 2 assertion-format failures — `500.00` DECIMAL
  and the 4999 collision — assertions made format-tolerant; no code issue.)
- **Validation**: `check_jsx_marks.js` 4/4 parse OK; smoke test extended to
  29 checks — KYC renders with ISO DOB (formatted, 3 radio pills, no
  `normalizeDobInput` left), PaymentScreen renders all 6 purpose chips +
  provisional-price note, all 57 animation interpolation configs still
  clamp-clean.
- **Entitlements are still §10** — settling a `maid_basic`/`*_gold`/
  `profile_boost` payment records the row + sends the labelled prompt but
  grants nothing yet.

## 2026-10-31 — Brand terminal animations: SuccessMark + FailMark

Owner: "can we design success and failure animations along and around our
brand identity since the generic checkmark is too common". Pure UI round —
zero backend changes, zero flow changes (polling, receipt chase, resume,
adopt all untouched). Both result cards keep their layout; only the mark at
the top changed.

- **SuccessMark** (`src/components/brand/SuccessMark.js`) — the Maidora mark
  DRAWS ITSELF: one soft radar lock-on ring expands and fades (the same
  radar the user just watched in the tracker "locks on"), then the exact
  BrandMark paths draw stroke-by-stroke — p3 house → p2 inner stroke → p1
  pillar fades to its 28% fill → p4 gold seam last — finished by a gold
  spark popping at the seam end (echoes BrandLoader's comet head) and a
  single 8-particle burst in gold/brandSoft/goldDark. No confetti rain, no
  generic checkmark; rests on the finished mark + spark.
  - Dash lengths measured from the real path data (`scripts/mark_path_lengths.js`:
    p2 423.6, p3 1720.3, p4 122.1 units; ×1.02 headroom) so reveal speed is
    proportional to true stroke length.
  - Two clocks: JS-driven master for `strokeDashoffset` (non-transform SVG
    prop — cannot be native), parallel NATIVE-driven clock for every view
    layer (ring, spark, halo, particles, badge spring). All interpolations
    clamped; every layer rests at its final frame.
- **FailMark** (`src/components/brand/FailMark.js`) — the inverse: three
  radar rings collapse INWARD (staggered, full fade-out) onto a GHOST of
  the mark (same `MARK_PATHS`, rendered in `colors.line` — the home was
  never reached), a danger dot pops with slight overshoot, one soft danger
  pulse breathes out, and the badge gives one keyframed shake
  (0→−9→+8→−6→+4→0 px). Every layer is transform/opacity → fully
  native-driven; the gold seam is absent on failure by design (accent =
  completion).
- **PaymentScreen**: terminal cards now render `<SuccessMark size={148} />`
  / `<FailMark size={122} />`; the old `checkAnim` spring + Ionicons
  checkmark / close-circle removed (Ionicons stays for the tracker rows).
  Both animations replay automatically — the card branch remounts on
  status flip.
- **Validation**: `scripts/check_jsx_marks.js` (Babel parse, 3/3 OK) +
  `scripts/smoke_brand_marks.js` — a render smoke test that seeds stubs for
  react/react-native/react-native-svg with RN-faithful `interpolate`
  validation (monotonic inputRange, range-length match, NaN checks) and
  renders all three components: 13/13 checks pass, incl. evaluating all 57
  recorded interpolation configs inside/between/outside every window with
  clamp semantics (no NaNs). Visual proof: `scripts/preview_brand_marks.js`
  + `preview_sheets.py` re-implement the choreography math and emit frame
  contact sheets (9 frames reviewed: lock-on → draw → pillar+seam → spark
  burst; collapse → dot → pulse all read correctly).
- Preview tooling lives in `/scripts` (not shipped in the app bundle).

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
- **Follow-up (same day) — success/failure screens split from the tracker**
  (owner brought a UX blueprint from a chat; it validated the built polling
  + real-event stages and added four things, all client-side, no gateway
  changes):
  - **Success is now a dedicated celebration screen** — subtle spring
    checkmark badge (no confetti — a KES 50 payment must not feel like a
    lottery win), receipt number, amount + paying phone, **paid-at time in
    EAT** (deterministic UTC+3 formatting, device-timezone-independent),
    Back to Home. Fires only when the backend holds ResultCode 0 from the
    callback or an authoritative query — never on the synchronous
    ResponseCode 0 (respond-first means the app never even sees that).
  - **Failure is now a standalone calm card** (no step list) with
    code-specific copy — 1032 reworded to "You cancelled the payment before
    entering your PIN…" (neutral, no alarm) and 1037 kept factually
    accurate ("We did not receive your PIN in time" — the blueprint's
    "couldn't send the prompt" is wrong for 1037: the prompt *was* sent;
    real delivery failures surface earlier as push-stage errors) — plus
    Try Again **and** a Back to Home exit.
  - **Countdown on the PIN wait** ("Waiting for your PIN · 3:28 remaining")
    instead of a bare elapsed counter — the ball is visibly in the user's
    court. Calibrated to the 3.5 min polling window (longer and more
    accurate than the blueprint's generic 90 s: the server's settle window
    is 150 s and real prompts live ~2 min).
  - **"Didn't get a prompt?" tips toggle** in the progress card (SIM
    coverage, wrong line, expiry → send a new push).
  - **Resume after app close**: on mount the screen probes the user's
    recent payments and offers a "Payment still open — Resume watching /
    Dismiss" banner for any pending row younger than 10 min (the gateway
    and the M-Pesa SMS keep working either way). Logged as
    `[MPESA] resuming payment #…`.
  - Blueprint items already in place (no change needed): polling at 3–5 s
    (ours 4 s), double-tap guard, idempotent callback settlement by
    `checkout_request_id`, terminal-before-advance rule (stage 3 never
    advances without a real result), 1032/1037/2001/1 code-specific
    failure copy.

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
