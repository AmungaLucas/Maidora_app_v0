# Maidora — Unified Build Spec (adopted 2026-10-29)

> Source of truth agreed with the product owner. Sections marked ✅ in the
> adoption map are implemented; the rest lands in spec order (see
> `Maidora_kenya_Architecture.md` §10 roadmap). §15 Open Items: as of
> 2026-10-29, six of seven are RESOLVED — the operative defaults below are
> adopted as final and `Initial_app_deliberations.md` (Amendment v3.2)
> supplies the paywall pricing that was deferred. Only §15.6 (multi-device
> sessions) remains open.

## Adoption map

| Spec section | Status | Where |
|---|---|---|
| §1 Current state | — | — |
| §2 Email/SMTP | ✅ live (2026-10-29) | `src/services/email.js`, `SMTP_*` env; `SMTP_PASS` installed + auth verified |
| §3.1–3.2 Signup fields/behavior | ✅ | `SignupScreen.js`, `POST /auth/register` |
| §3.2 Role at onboarding | ✅ | `POST /auth/onboarding`, `RoleSelectScreen.js` |
| §3.3 Account lifecycle | ✅ | `pending_verification` → `active` |
| §3.4 Phone-first default | ✅ | phone OTP default; email optional |
| §4 Data model | ✅ v2 | `sql/schema.sql`, `sql/migrate_v2.js` |
| §5 Verification gate | ✅ | `requireVerified` middleware (gates services) |
| §6 Location | ✅ (login update) | `LoginScreen.js` + `sanitizeLoginLocation` |
| §7 Profile completeness | ✅ BOTH roles (v4 + wizard) | `maid_profiles` + `employer_profiles`, role-aware `GET/PUT /api/profile` (partial per-step saves), MULTISTEP `CompletenessWizard` + HomeScreen banner (first, instant via AppContext) |
| §8 KYC / trust badge | 🟡 submission live (2026-10-29) | 8-step app flow + `src/routes/kyc.js` (draft/images/submit); review tooling next |
| §9 Free applications/paywall | ⏳ | needs jobs/applications first |
| §10 Visibility decay | ⏳ | `last_active_at` collected; ranking comes with search |
| §11 Login rules | ✅ | throttle in `POST /auth/login`, 30d sliding token |
| §12 Abuse prevention | ✅ (temp email) | `isDisposableEmail`; VoIP flagged → §15.4 |
| §13 Post-onboarding suggestions | ⏳ | needs §7 data + day counters |
| §14 Priority summary | order honored | gate → completeness → KYC → paywall |
| §15 Open items | 6/7 RESOLVED (2026-10-29) | see Operative defaults below |

## Operative defaults — RESOLVED 2026-10-29 (owner confirmed via MPS Amendment v3.2)

- **§15.1 read-only scope — ADOPTED**: unverified users may land on home,
  browse listings/search, and view their own profile; services (apply, post,
  pay, chat-start) are gated via `requireVerified`.
- **§15.2 OTP parameters — ADOPTED as built**: 6-digit code, 10-minute
  expiry, 60-second resend cooldown, 5 wrong attempts per code, 5 sends per
  phone/hour. Login-OTP and signup-OTP share the same type/policy.
- **§15.3 phone-first — CONFIRMED final**: phone OTP is THE default path;
  email verification is fallback/optional.
- **§15.4 VoIP/disposable phone blocking — OUT OF SCOPE for v1.0** (owner
  decision, MPS §4.8): defer until abuse appears; Kenyan normalization
  already rejects foreign ranges.
- **§15.5 paywall pricing — DECIDED (pending build, MPS §9/§11.1)**:
  PAYG KSh 50/application · Maid Basic KSh 99/30d = 5 credits + Subscriber
  tag · Maid Gold KSh 199/30d = 10 credits + 1 profile boost + 1 application
  boost + priority visibility · profile boost KSh 99 (7 days) · application
  boost KSh 30 · urgent KYC KSh 150. Consumption order: subscription credits
  → banked → 2 lifetime free → PAYG.
- **§15.6 multi-device session policy — STILL OPEN.**
- **§15.7 urgent-fee refund — DECIDED: no refund** on rejection, abandonment,
  or cancellation (MPS §33.3).

---

# Maidora — Unified Build Spec (original text)

Consolidates all notes and decisions to date. Decided items are stated as final; unresolved items are collected in **§15 Open Items** and are not assumed anywhere above it.

---

## §1 Current state
- Basic authentication: **done**.
- Next phase: full requirements below.

## §2 Email / SMTP
- Host: `mail.maidora.co.ke`
- Username: `verification@maidora.co.ke`
- Password: held in secrets management — **not** hardcoded, **not** stored in spec/docs. Rotate the copy that was shared in plain text.

---

## §3 Identity & signup

### §3.1 Signup form fields
1. Full name
2. Email
3. Phone number
4. Location (+ small text button **"Use my current location"** which updates the location field when clicked)
5. Password
6. Confirm password
7. **"Have a referral code?"** — toggle; when clicked, a referral code input appears

### §3.2 Signup behavior
- On **Create account** → OTP is sent to the entered phone number.
- **Phone is the primary identity** (rationale: most Kenyan users have at least a basic phone that can receive SMS/calls). Email is secondary and optional to verify.
- Login input is **contact + password**, where contact = phone or email.
- Role is chosen at onboarding (not at signup).
- System-generated on signup: referral code, my-referral-code, status fields, timestamps, last login / last active.
- Location updates automatically at login (see §6).

### §3.3 Account lifecycle
- Account row is **created before OTP confirmation**.
- Until OTP is confirmed, the account is `pending_verification` with `phone_verified_at = null`.
- On successful OTP confirm → `account_status = active`, `phone_verified_at` stamped.
- If a user logs in while unverified, they may be routed back to the OTP step.

### §3.4 Default verification path
- **Phone-first**: signup fires phone OTP; confirming it verifies the phone automatically.
- Email verification is **optional** in the normal path.
- **Gate rule: phone OR email must be verified before using platform services** (see §5).

---

## §4 Data model

### §4.1 Account fields
| Field | Notes |
|---|---|
| `full_name` | entered at signup |
| `email` | entered at signup |
| `phone` | entered at signup — primary identity |
| `password_hash` | — |
| `role` | set at onboarding |
| `location_name` | from signup / login update / manual |
| `lat`, `long` | from GPS reverse geocode or manual |
| `location_source` | `gps` \| `manual` |
| `referral_code` | system-generated (own) |
| `referred_by_code` | optional, from signup toggle |
| `created_at`, `updated_at` | system |

### §4.2 Status model (split — one `status` column is not used)
Stored:
- `account_status` — `pending_verification` → `active` → `suspended` / `deactivated` / `deleted`
- `phone_verified_at` — timestamp, null = unverified
- `email_verified_at` — timestamp, null = unverified
- `kyc_status` — `not_started` / `draft` / `submitted` / `under_review` / `approved` / `rejected`
- `kyc_rejection_reason` — enum, null unless rejected
- `kyc_submitted_at`, `kyc_reviewed_at`

Derived (not stored as source of truth; may be cached):
- `phone_verified` = `phone_verified_at IS NOT NULL`
- `email_verified` = `email_verified_at IS NOT NULL`
- `trust_badge` = `kyc_status === 'approved'`
- `visibility_state` = f(`last_active_at`) — §10
- `profile_complete` = all §7 fields present

If an API/UI needs a single display status, derive it at read time.

### §4.3 Activity tracking
- `last_login_at` — stamped on successful authentication. Used for security/analytics.
- `last_active_at` — stamped on login **and** any authenticated action: search, job view, application submitted, chat opened/sent, profile edit, KYC submission. Write-throttled to **once per hour**.
- **Decay uses `last_active_at`.**
- Employer-facing "last seen 1hr ago / 2 days ago" also uses `last_active_at`.

---

## §5 Verification gate (access rules)
- Unverified user (neither phone nor email verified) **can land on the homepage**.
- Unverified user **cannot**:
  - Apply for jobs
  - Post jobs
  - Use any other platform service
- Verification is cleared by **phone OTP** (default) or **email** (fallback).
- KYC verification (trust badge) is separate and always non-blocking — §8.

---

## §6 Location

| Source | Fills | Editable? |
|---|---|---|
| Device GPS allowed | `device_lat/lng` → reverse geocode → `area`, `county` | ✅ Both editable |
| GPS denied | Manual county picker → area | ✅ |
| Reverse geocode partial | Pre-fill what was found; complete the rest | ✅ |
| Manual entry | `location_source = 'manual'` | ✅ |

- Location auto-updates **on login** and **may overwrite** a prior manual edit.
- Fallback applies if the login-time update fails (retain last known location; manual edit remains possible).

---

## §7 Profile completeness (non-blocking banner)
- Non-blocking banner nudges completion.
- Required fields:
  - **Age** — derived from DOB; used for age filtering
  - **Languages spoken** — used in search/filter
  - **Job type** — live-in, dayburg, etc.
  - **Years of experience**
  - **Next of kin / contact person** — full name, phone number, relationship
- All are **non-blockers** — the user can use allowed services without them.
- **Order: profile completeness first, then KYC.** Any field filled at completeness **autofills into KYC**.

### §7.1 Built additions (v4, 2026-10-29) — both roles
- **Maid (househelp):** 6 completeness checks — DOB, languages, job type, years experience, **bio ("tell us a little more about yourself")**, next of kin. `expectedSalary` is the API name for the `wage_expectation` column (legacy key accepted); optional, not a completeness check.
- **Languages:** full Kenyan list (official + community languages) with **Other → specify** storing the typed value as its own entry; max 8.
- **DOB input:** 3-step picker popup (year → month → day) in Profile and KYC personal steps.
- **Employer:** new `employer_profiles` table — **household size (1–30), number of children (0–20), monthly budget (KES)** — 3 completeness checks; partial saves allowed.
- **Email verification UI:** tapping "Email unverified" opens a sheet with a prefilled **editable** email → `POST /auth/update-email` (clears `email_verified_at`, 409 on duplicates) → SMTP 6-digit code → verified.

### §7.2 Built additions (wizard, 2026-10-29) — owner follow-up
- **Multistep wizard** (`src/screens/profile/CompletenessWizard.js`): maid 6 steps (DOB · languages · job type · experience & salary · about yourself · next of kin), employer 3 steps (household size · children · budget). Progress dots, opens at the FIRST incomplete step, **one step = one partial `PUT /profile`** — househelp validation is now partial like the employer side (empty body → 400). Closing mid-way keeps saved steps (non-blocking preserved).
- **Instant banner:** §7 completeness lives in `AppContext` — every step save updates the Home banner immediately (plus `useFocusEffect` refetch).
- **Drawer navigation:** the Profile tab is a REAL `@react-navigation/drawer` (ProfileMain · Verification · Payments · Settings; hamburger + swipe). Settings icon removed from Home header — replaced by the user's avatar → Profile.
- **Screen folders (owner):** `src/screens/{auth,home,maid,employer,chat,profile,payments,settings,verification}/`.

---

## §8 KYC / trust badge
- Verification = ID front + ID back + selfie.
- Grants a **trust badge**.
- Review time: **48–72 hours or more**.
- **Urgent fee: KES 150** — expedites review only, does **not** buy approval, **not refunded on rejection**.
- Non-blocking home banner prompts unverified users to verify.
- `id_number` is captured; full name from signup autofills first / last / other names for confirmation. Name must be **as on ID**. DOB captured.

### §8.1 KYC flow
| Step | Screen | Fields |
|---|---|---|
| 1 | KYC intro | — + urgent upsell KSh 150 |
| 2 | Personal details | `full_name_as_on_id`, `id_number`, `date_of_birth`, `gender` (optional) |
| 3 | Document type | `national_id` (default) / `passport` / `drivers_license` |
| 4 | Document front | Camera/gallery, auto-crop, blur detection, glare detection |
| 5 | Document back | Same — national ID only; skipped for passport |
| 6 | Selfie | Live capture only, liveness + face match |
| 7 | Review | All fields + images, retake/submit |
| 8 | Confirmation | "Submitted. Notify within 72 hours." + urgent upsell |

- Draft saved **server-side** on abandonment; resume from status banner.
- **Rejection:** `kyc_status = 'rejected'`, `kyc_rejection_reason` ∈ {`unreadable_document`, `name_mismatch`, `expired_document`, `selfie_mismatch`, `suspected_fraud`, `other`}. Banner: "Action needed: {reason}. **[Try again]**". Retake only what failed.

---

## §9 Free applications & paywall
- After signup (verification gate cleared), maid can search and apply for jobs, with limited applications.
- **Welcome free bonus: 2 applications, lifetime.**
- **Withdrawn or rejected applications consume one of the 2.**
- 3rd attempt → **paywall**. Tiers (pay-as-you-go + 2 subscription packages) deferred to a later discussion.

---

## §10 Profile visibility decay
Driven by `last_active_at`.

| Days since last activity | State | Behavior |
|---|---|---|
| **0–13** | **Active** | Normal. Label: "Active today / X days ago" |
| **14–29** | **Quiet** | Fully visible. Ranked **below Active maids within same tier**. Label: "Last active 2 weeks ago." One push nudge |
| **30–59** | **Dormant** | Removed from default browse and curated rails. Findable via search or direct link with label. Applications and chats fully live. Push nudge with one-tap reactivate |
| **60+** | **Archived** | Not in search. Threads and applications remain live. One-tap reactivate restores everything |

---

## §11 Login rules (§4.5)
- Login input: **contact + password** (phone or email).
- **5 failures per account per 15 minutes** → **15-minute cooldown**.
- Per-IP throttle: **20 attempts per hour**.
- Session token valid **30 days**, refreshed on use.
- Logout on one device does **not** end sessions elsewhere (**open item §40**).

---

## §12 Abuse prevention
- **Temporary/disposable email domains blocked** — checked at signup and on email change.
- Re-check at email verification time (blocklists change).
- *(Flagged, not decided:* disposable/VoIP phone ranges — see §15.)

---

## §13 Post-onboarding profile completion (maid suggestions)

| Suggestion | Copy | Appears |
|---|---|---|
| Add a photo | "Profiles with photos get 2× more views." | From day 2 |
| Add experience | "Tell employers what you've done." | From day 3 |
| Add wage expectation | "Get matched to jobs in your range." | From day 3 |
| Add bio | "A short intro helps employers decide." | From day 5 |

- Each suggestion is dismissible; reappears after **1 day**.
- Card disappears entirely once **all complete** or **dismissed twice**.
- **Photo is optional, never required to apply.**

---

## §14 Priority summary
1. Verification gate (phone/email) — blocks services.
2. Profile completeness — non-blocking banner.
3. KYC verification — non-blocking banner.
4. Paywall after 2 lifetime applications.

---

## §15 Open items (unresolved — not assumed above)
1. **Exact scope of "read-only" for unverified users** — can they browse listings, search, view own profile, open a chat? Currently only the homepage is explicitly allowed.
2. **OTP parameters** — code length, expiry, resend cooldown, max attempts per code, max sends per phone/hour, whether login-OTP and signup-OTP share a type.
3. **Phone-first confirmation** — default path is phone-first with email as fallback; confirm this is final rather than user-selectable at signup.
4. **Disposable/VoIP phone number blocking** — flagged as a larger abuse vector than temp email; decide if in scope.
5. **Paywall pricing & tiers** — deferred by you.
6. **Multi-device session policy** — §40 open item.
7. **Urgent KYC fee refund path** — confirmed no refund on rejection; confirm no refund on abandonment/cancel either.
