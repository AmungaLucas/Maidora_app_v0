# Maidora MPS — Amendment v3.1

**Document code:** MPS-AMD-1
**Amends:** MPS v3.0
**Rule applied:** each change references the section it modifies; appended to §42 change log.
**Superseded in part by:** Amendment v3.2 (MPS-AMD-2, appended at the end of this file, 2026-10-29) — read §42 v3.2 for the sections this text no longer governs.

All conflicts identified in review are resolved below. Where MPS v3.0 is silent or contradictory, the resolution reflects the decisions you confirmed in this thread. Items not touched remain as in v3.0.

---

## Summary of changes

| # | Section | Change |
|---|---|---|
| 1 | §4.3 | Signup collects full name + email + phone + location + password + confirm + referral toggle. Phone primary. |
| 2 | §4.8 (new) | Disposable email blocking added. |
| 3 | §5.2 | KYC review time corrected 24–72 → 48–72 hours. KYC-not-required row clarified vs contact-verification requirement. |
| 4 | §8.1 | Maid free allowance: 3+2=5 → **2 lifetime, withdrawn/rejected consume, 3rd = paywall**. |
| 5 | §9 / §9.1 | Maid pricing and Basic positioning copy rewritten for 2-credit model. |
| 6 | §11.1 | Maid pricing grid updated. |
| 7 | §12.1 | Value ladder updated. |
| 8 | §16.2 | Withdrawn/rejected explicitly consume the free credit. |
| 9 | §18.2 | Activity event list finalized; `last_active_at` throttled 1/hr. |
| 10 | §24 | Credits pill, subscription card, welcome screen copy updated. |
| 11 | §31 | Signup spine rewritten: single signup form replaces contact+password+first-name steps. |
| 12 | §32 | Signup-by-role field lists rewritten. |
| 13 | §33 | Empty KYC section filled (8-step flow, draft resume, rejection enum). |
| 14 | §34 | Profile completeness fields updated to include DOB, years of experience, next of kin. |
| 15 | §35 | Data model updated: `account_status`, `phone_verified_at`/`email_verified_at` timestamps, `last_login_at`/`last_active_at`, `full_name`, `referral_code`, `referred_by_code`, `years_of_experience`, `next_of_kin_*`, KYC enum locked. |
| 16 | §39.1 | Under-18 and abandoned-OTP edge cases aligned to new signup. |
| 17 | §42 | Change log appended. |

---

## §4.3 Contact model — REPLACED

A user signs up with **all of the following**:

| Field | Required? | Notes |
|---|---|---|
| `full_name` | ✓ | Displayed as entered; first name derived for greetings |
| `email` | ✓ | Lowercased; blocklist-checked (§4.8) |
| `phone` | ✓ | Normalized to E.164; **primary identity** |
| `location_name` | ✓ | Manual entry or via **[Use my current location]** button |
| `password` | ✓ | §4.4 |
| `password_confirm` | ✓ | Must match |
| Referral | optional | Toggle **"Have a referral code?"** → reveals `referred_by_code` input |

**One contact = one account.** A phone or email already registered blocks a second signup with a support link.

**Login input:** `contact` (phone or email) + password.

**OTP channel at signup:** SMS to `phone` (primary). Email OTP available on request as fallback. The account is created with `account_status = 'pending_verification'` and `phone_verified_at = NULL` on OTP send; on successful OTP confirm, `account_status = 'active'` and `phone_verified_at` is stamped.

**Service gate:** until **phone OR email is verified**, the user may land on the home screen but **cannot apply, post, chat, or use any write-action service**. Read-only browsing is permitted.

**Phone normalization:** store E.164 only (`+254712345678`). Display as `0712 345 678`.

**Regex classifier (for login input):**

| Input pattern | Detected as |
|---|---|
| `+254…`, `07…`, `01…`, `254…` | Phone |
| Contains `@` + valid domain | Email |

---

## §4.8 Disposable contact blocking — NEW

| Rule | Spec |
|---|---|
| Disposable email domains | Blocked at signup and at email-verification time |
| Blocklist source | Maintained domain list + manual additions via admin console |
| Re-check | On email change and on email verification (blocklists change over time) |
| Error copy | "This email provider isn't supported. Please use a personal or work email." |
| Phone-based disposable numbers | **Out of scope for v1.0** (flagged, not built) |

---

## §5.2 Verification — REPLACED

### §5.2.1 Contact verification gate

| Item | Rule |
|---|---|
| Verified contact required to use services | **Yes** — phone OR email must be verified before applying, posting, chatting, or any write action |
| Home screen access | **Yes** — unverified users may land on home and browse read-only |
| Verification path | Phone OTP (primary, sent at signup) **or** email OTP (fallback) |
| KYC badge (trust badge) | **Separate** — never a gate. Non-blocking banner prompts it |

### §5.2.2 KYC badge rules

| Item | Rule |
|---|---|
| Standard KYC | **Free**, **48–72 hours** |
| Urgent KYC | **KSh 150**, faster review **only** |
| Approval guarantee | **None** — urgent buys speed only |
| Badge | Earned on approval; **permanent** |
| Required to browse | **No** |
| Required to subscribe | **No** |
| Required to apply / post | **No** (KYC badge is not required; contact verification is — see §5.2.1) |
| Affects pricing | **No** |
| Gender in KYC | Optional; not shown to employers if withheld |

---

## §8.1 Maids — REPLACED

| Allowance | Amount | Nature |
|---|---|---|
| On signup (any contact state) | **2 free application credits** | Lifetime; not renewable |
| Withdrawn applications | **Consume 1 free credit** | No refund |
| Rejected (declined) applications | **Consume 1 free credit** | No refund |
| After 2 used | **Paywall** — PAYG KSh 50, or subscription | — |
| Verification bonus | **None** — KYC badge does not grant credits | — |

**Consumption order:** `maid_sub_credits` → `maid_banked_credits` → `maid_free_credits` → PAYG KSh 50.

**Rules:**
- Free credit consumed only on **successful submission**; failed submits roll back.
- Withdrawn and declined applications **do not refund** the free credit (confirmed §16.2).
- Free credits are **permanent** and survive subscription expiry.
- Contact verification (§5.2.1) required to submit an application; KYC badge not required.

**Rationale for 2:** a welcome allowance sized to test the market without dangling a perpetual free tier. It is exhausted in one active day; the paywall follows immediately, keeping PAYG conversion honest.

---

## §9 Maid pricing — REPLACED

| Product | Price | Grants |
|---|---|---|
| PAYG application | **KSh 50** | 1 submission (charged on success only) |
| **Maid Basic** | **KSh 99 / 30 days** | **5 application credits/month** + **"Subscriber" tag on application cards** |
| **Maid Gold** | **KSh 199 / 30 days** | **10 application credits/month** + **1 profile boost/month** + **1 application boost/month** + **priority application visibility** |
| Profile boost (standalone) | **KSh 99** | 7 days rotating top-of-feed |
| Application boost (standalone) | **KSh 30** | Highlighted applicant slot |
| Urgent KYC | **KSh 150** | Faster review only |

### §9.1 Basic repositioning — REPLACED

> **Basic is your monthly working allowance.**
> Your **2 free applications** are a one-time welcome bonus. They sit as a safety net and are only touched when subscription and banked credits run out. At KSh 99 for 5 credits you pay **KSh 20 per application instead of KSh 50**.
> Credits are consumed in this order: **this month's credits → banked credits → your 2 free welcome credits → KSh 50**.
> Cancel anytime; no auto-renew.

---

## §11.1 Maid grid — REPLACED

| Product | Price | Key grant |
|---|---|---|
| Free tier | KSh 0 | Browse + **2 lifetime applications** |
| Verification bonus | — | **None** (badge only) |
| PAYG application | KSh 50 | 1 submission |
| Maid Basic | KSh 99 / 30 days | 5 credits + "Subscriber" tag |
| Maid Gold | KSh 199 / 30 days | 10 credits + 1 profile boost + 1 application boost + priority visibility |
| Profile boost | KSh 99 | 7 days rotation |
| Application boost | KSh 30 | Top-3 highlighted slot |
| Urgent KYC | KSh 150 | Speed only |

---

## §12.1 Maids value ladder — REPLACED

| State | Spend | Delivers | Why climb |
|---|---|---|---|
| Unverified contact | KSh 0 | Read-only browse only | Cannot apply until contact verified |
| Verified contact, unsubscribed | KSh 0 | Badge (if KYC approved) + **2 free applications** | Free and high-return — every maid should verify |
| Unverified, subscribed | KSh 99–199 | Credits + boost, no badge | Worst-value state |
| **Verified contact + KYC, subscribed (target)** | KSh 99–199 | Badge + credits + profile boost + application boost + priority visibility | Every credit converts at a higher rate; placement is not purchasable any other way |

---

## §16.2 Application lifecycle — AMENDED

Add row to existing table:

| Event | Can reapply to that post? | Credit | Boost |
|---|---|---|---|
| **Maid withdraws** | ✓ if slots remain | **Free credit consumed — not refunded** | Forfeited |
| **Employer declines** | ✗ Final | **Free credit consumed — not refunded** | Consumed |

The existing "Post expires, no decision" row is unchanged — the 48-hour free reapply window does **not** consume a credit.

---

## §18.2 Activity definition — REPLACED

**Resets `last_active_at`:**
- Login (successful auth)
- Push notification tap
- Search performed
- Job view
- Application submitted
- Chat reply sent
- Profile edit
- KYC submission

**Login alone counts** — a user who logs in but takes no further action still resets the clock.

**Write throttling:** `last_active_at` is written at most **once per hour** per user to avoid DB hammering. Session length is tracked separately and does not affect the clock.

**`last_login_at` vs `last_active_at`:**
- `last_login_at` — stamped on every successful authentication. Used for security and analytics.
- `last_active_at` — stamped on any activity event above, throttled to 1/hr. **Drives decay (§18.1) and employer-facing "last seen" labels.**

---

## §24 Maid Home — AMENDED

### §24.1 Credits pill

| State | Copy |
|---|---|
| Free credits remaining | "**{N} free applications left** · Apply · KSh 50 each after" |
| Subscribed, credits remaining | "**Gold · {N} of 10 credits left · expires {date}**" |
| Subscribed, credits exhausted | "**Gold · 0 of 10 · expires {date}** · Buy more: KSh 50 each" |
| No credits, no subscription | "**Pay KSh 50 per application** or [Subscribe · KSh 99]" |

### §24.4 Subscribed-but-unverified banner

Changed copy (removed "2 credits" promise, since verification no longer grants credits):

> *"You're subscribed but not verified. Verification is free — it unlocks your badge and improves reply rates."*

---

## §31 Onboarding spine — REPLACED

```
1. SPLASH (max 1.5s)
        ▼
2. SESSION CHECK → valid → Home
        ▼
3. ROLE SELECTOR → "I'm hiring" | "I'm looking for work"
        ▼
4. SIGNUP FORM — full name, email, phone, location [+ GPS button],
                 password, confirm, referral toggle
        ▼
5. OTP to phone — account created as 'pending_verification' on send;
                  'active' on confirm
        ▼
6. LEGAL CONSENTS (3 checkboxes)
        ▼
7. JOB TYPES + WORK TYPE
        ▼
8. WELCOME → Home
```

**Total: 8 screens** (was 9 — "first name" step folded into the signup form).

### §31.2 Signup form — REPLACED

Single screen, in this order:

| Field | Behaviour |
|---|---|
| Full name | Free text; must contain at least 2 words |
| Email | Validated; blocklist-checked (§4.8) |
| Phone | Kenya +254 prefix fixed; regex classified |
| Location | Text input + **[Use my current location]** button; button triggers OS permission and fills field |
| Password | §4.4 rules |
| Confirm password | Must match |
| "Have a referral code?" | Toggle; when on, reveals referral code input |

**Account created at OTP send** (`pending_verification`), not at form submit and not at OTP confirm. Rationale: the user's row exists so the OTP can be tied to it and abuse throttles apply; but services are gated until OTP confirm.

**OTP screen:**
- 6-digit, auto-advancing, auto-read enabled (Android SMS Retriever / iOS autofill)
- Code valid 5 minutes; **[Resend]** enabled after 60s
- Resend limit: 3 per 10 minutes, then 10-minute lockout
- Errors: "Incorrect code. {attempts} remaining." After 5 failures → 15-minute lockout
- Fallback: "Didn't get it? **[Get help]**" after 90s — WhatsApp support link
- On confirm: `account_status = 'active'`, `phone_verified_at` stamped, onboarding resumes at §31.3

**Merge flow:** if email or phone matches an existing account, OTP proceeds normally; on success, user is logged into that account (merge handled transparently). No "account exists" error surfaced at form submit.

### §31.4–§31.5 Location — AMENDED

| Source | Fills | Editable? |
|---|---|---|
| Signup form, manual | `area`, `county`, `location_source = 'manual'` | ✓ |
| Signup form, **[Use my current location]** | OS permission prompt → `device_lat/lng` → reverse geocode → `area`, `county`, `location_source = 'gps'` | ✓ |
| GPS denied | Falls back to manual entry; nothing pre-filled | ✓ |
| Reverse geocode partial | Pre-fill what was found; complete the rest | ✓ |
| **On login** | App reads last-known device location from OS cache (no prompt). If available and different from stored, updates `device_lat/lng`, reverse-geocodes, overwrites `area`/`county`/`location_source` | Overwritable again at next login |
| **Login, no cached location** | Existing location retained (manual fallback) | ✓ |

**Rule:** login-time location update may overwrite a manual edit. The explicit permission prompt fires **only** when the user taps **[Use my current location]** — not at app launch, not at login.

---

## §32 Signup by role — REPLACED

### §32.1 Maid

| Step | Fields |
|---|---|
| Signup form | `full_name`, `email`, `phone`, `location_name`, `password`, `password_confirm`, `referred_by_code` (optional) |
| OTP | 6-digit to `phone` |
| Consents | 3 checkboxes |
| Job types + work type | `primary_job_types[]`, `other_job_type`, `work_type` |

**Credits granted server-side at OTP success** — 2 free applications.

### §32.2 Employer

| Step | Fields |
|---|---|
| Signup form | Same as maid |
| OTP | Same |
| Consents | Same |
| Help type | `primary_job_types[]`, `work_type` |

**Grants at OTP success:** 2 free posts + 1 free limited chat.

### §32.3 Welcome screen — AMENDED

**Maid welcome:**

| Element | Content |
|---|---|
| Headline | "Karibu, {first name}." |
| Body | "You have **2 free applications** to start. Apply to any job — no payment needed." |
| Primary CTA | **[See jobs near me]** |
| Secondary CTA | **[Browse all jobs]** |
| Micro-copy | "Verify your identity anytime to earn the badge — it's free." |

**Employer welcome:** unchanged from v3.0.

### §32.4 Not in signup — AMENDED

Remove v3.0 exclusions that no longer hold:
- ~~No email if phone given~~ — email is now collected.
- ~~No referral code~~ — referral toggle is now in signup.

Still excluded from signup: location permission at launch · push permission · profile photo · subscription tier selection · KYC modal.

---

## §33 KYC flow — FILLED

### §33.1 Flow

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

**Autofill:** any field filled at profile completeness (§34.4) — notably `date_of_birth` — autofills into step 2. `full_name` from signup autofills into first / middle / last name fields for confirmation.

### §33.2 Draft and resume

- Draft saved **server-side** on abandonment (every field change written with 2s debounce).
- Resume from status banner: "You have a KYC draft. **[Continue]**"
- Draft persists 30 days, then discarded.

### §33.3 Rejection handling

| Field | Value |
|---|---|
| `kyc_status` | `'rejected'` |
| `kyc_rejection_reason` | `unreadable_document` \| `name_mismatch` \| `expired_document` \| `selfie_mismatch` \| `suspected_fraud` \| `other` |

- Banner: "**Action needed: {reason}.** **[Try again]**"
- Retake only what failed.
- **Urgent fee not refunded on rejection** — urgent is a speed fee, not approval.
- Urgent fee not refunded on abandonment or cancellation either.

---

## §34 Post-onboarding profile completion — REPLACED

No completion-percentage gate. **Non-blocking banner** appears until fields below are filled. Card is dismissible.

**Order:** profile completeness first, then KYC. Fields filled here autofill into KYC.

### §34.4 Profile completeness field spec — REPLACED

| Field | Type | Validation | Required? | Visible to employers? |
|---|---|---|---|---|
| `date_of_birth` | date | Age ≥ 18; drives `age` filter | Optional | Age only (if she opts in) |
| `languages_spoken[]` | array of enum | — | Optional | ✓ |
| `primary_job_types[]` | array of enum | §34.5 | ✓ (signup) | ✓ |
| `other_job_type` | string, 2–50 | Only if `other` | Conditional | ✓ |
| `work_type` | enum(`live_in`,`live_out`,`part_time`,`full_time`) | — | ✓ (signup) | ✓ |
| `years_of_experience` | integer | 0–50 | Optional | ✓ |
| `next_of_kin_name` | string, 2–80 | — | Optional | ✗ (never shown) |
| `next_of_kin_phone` | E.164, encrypted | — | Optional | ✗ |
| `next_of_kin_relationship` | enum(`parent`,`spouse`,`sibling`,`relative`,`friend`,`other`) | — | Optional | ✗ |
| `availability_status` | enum(`available_now`,`available_from_date`,`not_available`) | `availability_date` required if `from_date` | ✓ (signup) | ✓ |
| `availability_date` | date | Future date | Conditional | ✓ |
| `bio` | text ≤500 | — | Optional | ✓ |
| `photo` | image | — | Optional | ✓ |

**All fields non-blocking.** They improve matching and filtering; none gate any action.

**Next of kin privacy:** never shown to employers. Used only for account recovery and safety contact. Maid affirms consent: *"I confirm I have this person's permission to share their contact details with Maidora."*

**References (v3.0 `maid_references` table) are replaced by next-of-kin in v1.0.** Employer-facing reference verification is deferred to v1.1.

### §34.2.1 Maid first-7-days — AMENDED

Update "Free credits exhausted" trigger copy to reference the paywall moment (§34.3) — which now fires after 2 applications, not after 5.

### §34.3 Paywall moment — AMENDED

When maid has **0 free credits and 0 subscription credits** and taps **[Apply]**:

| Element | Content |
|---|---|
| Headline | "Apply to this job?" |
| Credit line | "**This will charge KSh 50.**" |
| **Verification offer** (if unverified contact) | *"Verify your phone or email free to unlock applications."* + **[Verify free]** |
| Subscription offer | Small link: "Or subscribe for KSh 99 — 5 applications." |
| Primary CTA | **[Pay KSh 50 and apply]** |

Ordering unchanged: free verification first, subscription secondary, PAYG primary unmissable.

---

## §35 Data model — REPLACED (changed tables only)

### users (changed)

```
users
  id                       uuid pk
  role                     enum('maid','employer')
  full_name                string                          -- collected at signup
  email                    string (lowercased)
  email_verified_at        timestamptz | null              -- null = unverified
  phone                    string (E.164)                  -- primary identity
  phone_verified_at        timestamptz | null              -- null = unverified
  account_status           enum('pending_verification','active','suspended','deactivated','deleted')
                                                           -- default 'pending_verification'
  referral_code            string                          -- own code, system-generated
  referred_by_code         string | null                   -- from signup toggle
  payer_phone              string | null
  payer_phone_saved        bool default false
  password_hash            string (Argon2id)
  password_set_at          timestamptz
  terms_accepted           bool
  terms_accepted_at        timestamptz
  privacy_policy_accepted  bool
  privacy_policy_accepted_at timestamptz
  data_sharing_consent     bool
  data_sharing_consent_at  timestamptz
  onboarding_step          string
  last_login_at            timestamptz                     -- every successful auth
  last_active_at           timestamptz                     -- activity event, throttled 1/hr
  created_at               timestamptz
  updated_at               timestamptz
```

**Derived (do not store):**
- `phone_verified` = `phone_verified_at IS NOT NULL`
- `email_verified` = `email_verified_at IS NOT NULL`
- `first_name` = `split_part(full_name, ' ', 1)`
- `trust_badge` = `kyc_status = 'approved' AND (phone_verified OR email_verified)`
- `visibility_state` = f(`last_active_at`) per §18.1

**Status split:** one `status` column is not used. `account_status` governs account lifecycle; contact and KYC states are independent.

### maid_profiles (changed)

```
maid_profiles
  user_id                  uuid fk
  gender                   enum | null
  date_of_birth            date | null                     -- encrypted; drives age filter
  area, county, device_lat, device_lng, location_source
  primary_job_types        text[]
  other_job_type           string | null
  work_type                enum
  availability_status      enum
  availability_date        date | null
  languages_spoken         text[]
  years_of_experience      int | null
  next_of_kin_name         string | null
  next_of_kin_phone_encrypted string | null
  next_of_kin_relationship enum | null
  next_of_kin_consent_at   timestamptz | null
  bio                      text | null
  photo_url                string | null
```

### maid_kyc (changed)

```
maid_kyc
  user_id                  uuid fk
  full_name_as_on_id       string
  id_number                string (encrypted)
  id_type                  enum('national_id','passport','drivers_license')
  date_of_birth            date (encrypted)
  gender                   enum | null
  id_front_url             string (private)
  id_back_url              string | null
  selfie_url               string (private)
  status                   enum('not_started','draft','submitted','under_review','approved','rejected')
  rejection_reason         enum('unreadable_document','name_mismatch','expired_document',
                                'selfie_mismatch','suspected_fraud','other') | null
  submitted_at, reviewed_at
  reviewer_id              uuid | null
  urgent                   bool
  urgent_paid_at           timestamptz | null
  draft_updated_at         timestamptz | null
```

### maid_next_of_kin — REPLACES maid_references

v3.0's `maid_references` (max 3 references) is removed for v1.0. Next-of-kin fields are stored inline in `maid_profiles` (see above). Employer-facing reference verification deferred to v1.1.

### credit_ledger buckets (changed description only)

| Bucket | Change |
|---|---|
| `maid_free_credits` | Now **2 lifetime**, granted at signup. No verification bonus. Consumed last (safety net). |

All other buckets unchanged.

### email_blocklist (new)

```
email_blocklist
  domain                   string pk
  added_at                 timestamptz
  added_by                 uuid | null
  notes                    string | null
```

### login_attempts, sessions, visibility_events, ranking_penalties — unchanged

---

## §39.1 Signup edge cases — AMENDED

Replace the following rows:

| Scenario | Behaviour |
|---|---|
| OTP sent, abandoned | Account exists as `pending_verification`; user cannot use services; on next login, routed back to OTP |
| OTP failed 5 times | 15-minute lockout; resend counter independent |
| Email blocklisted | Inline error at signup: "This email provider isn't supported." Form not submitted |
| Phone/email already registered | OTP proceeds normally (merge/login); no "account exists" error surfaced |
| Account created, no phone verify, no email verify, user returns 30 days later | Still `pending_verification`, still gated; OTP resend available |
| Under-18 detected via DOB | Block KYC submission; **contact gate still applies**; account remains `active` after contact verification but cannot obtain badge until 18 (policy pending legal review) |

---

## §42 Change log — APPENDED

### v3.1 — 2026-10-29 (Amendment 1)

| # | Section | Resolution |
|---|---|---|
| A1 | §8.1 | Free applications: 3+2=5 → **2 lifetime**. Withdrawn/rejected consume. 3rd = paywall. |
| A2 | §9, §11.1, §12.1, §24, §32.3, §34.3 | All maid pricing and copy updated to 2-credit model. |
| A3 | §4.3, §31.2 | Signup now collects **full name + email + phone + location + password + confirm + referral toggle**. Phone primary. |
| A4 | §4.3, §31.2 | Full name collected at signup (first name derived for greeting). |
| A5 | §4.3, §31.2, §35 | Referral toggle restored to signup; `referral_code` and `referred_by_code` in schema. |
| A6 | §31.2, §39.1 | Account created **before OTP** as `pending_verification`; `active` on OTP confirm. |
| A7 | §5.2.1 | Contact verification gate: phone OR email must be verified before write actions. KYC badge remains non-blocking. |
| A8 | §35 | Status split: `account_status`, `phone_verified_at`, `email_verified_at`, `kyc_status`, `rejection_reason` (locked enum). |
| A9 | §18.2, §35 | `last_login_at` and `last_active_at` added. Decay uses `last_active_at`, throttled 1/hr. |
| A10 | §18.2 | Activity event list finalized: login, push tap, search, job view, application, chat reply, profile edit, KYC submission. Login alone counts. |
| A11 | §34.4, §35 | Profile completeness adds `date_of_birth`, `years_of_experience`, `next_of_kin_*`. `maid_references` replaced by next-of-kin. |
| A12 | §4.8 | Disposable email blocking added. |
| B1 | §33 | Empty KYC section filled with 8-step flow, draft resume, locked rejection enum. |
| B2 | §35 | `maid_kyc.rejection_reason` typed as enum, not free string. |
| C1 | §31.4–§31.5 | Location: auto-updates on login from OS cache (overwrites manual); explicit permission prompt only on **[Use my current location]** button. |
| C2 | §4.3 | Email OTP path explicit for email-primary signup fallback. |
| C3 | §5.2.2 | KYC review time corrected 24–72 → **48–72 hours**. |
| C4 | §5.2.2 | "KYC not required to apply/post" clarified as KYC-only; contact verification required separately. |
| C5 | §31 | Onboarding spine reduced from 9 to 8 screens (first-name step folded into signup form). |
| C6 | §35 | `users.updated_at` added back (was omitted in v3.0). |

---

## Not changed in this amendment (flagged, not decided)

These remain as v3.0 left them and are pending your direction:

| # | Item |
|---|---|
| 1 | Chat freeze/reopen, concurrency caps, no-reply refund — all of §15, §29 remain in v3.0 scope. Confirm v1.0 inclusion. |
| 2 | Maid cannot initiate chat (§26) — v3.0 rule; confirm. |
| 3 | Expired-post 48h free reapply (§16.2) — does not consume credit; confirmed. |
| 4 | Employer-facing "last seen" label — §18.4 has job-post context labels only; employer profile last-seen not specified. |
| 5 | Subscriptions, boosts, rolls, rollover — v3.0 scope; confirm v1.0. |
| 6 | Under-18 policy — pending Kenyan legal counsel (§40 #16). |
| 7 | OTP parameters beyond signup: recovery OTP, contact-change OTP — v3.0 §6 covers paths; parameters not enumerated. |
| 8 | §15.5 behavioural penalty magnitude — fixed as "Moderate"; unchanged. |

---

**End of Amendment v3.1.** Apply by replacing the cited sections in MPS v3.0 and appending §42. No new principles added; no v3.0 rule removed except those explicitly listed in the change log above.

**End of Master Product Specification v3.0**

*This document doesnt supersede the already built architecture but invites a collaboration where necessary Any future amendment must reference the specific section it changes and append to the change log.*

*Whatever is not clear or conflicting kindly ask for clarification, do not assume*

---

# Maidora MPS — Amendment v3.2 — Consolidation with built reality

**Document code:** MPS-AMD-2
**Amends:** MPS v3.0 via Amendment v3.1 (this file)
**Date:** 2026-10-29
**Owner instruction applied (precedence rule):** where this document conflicts with (1) what is already **built and live** in the Maidora gateway/app, or (2) the **login & verification flow already deliberated** in `docs/UNIFIED_BUILD_SPEC.md`, the built/deliberated state **wins** and this document is amended to match. Where this document adds **new** decisions, they are recorded as decisions (built later, in spec order). Nothing is silently assumed: every change below cites the section it modifies.

**Sources verified line-by-line on 2026-10-29:** `backend/src/routes/auth.js`, `backend/src/services/otp.js`, `backend/src/services/email.js`, `backend/src/middleware/auth.js`, `backend/sql/schema.sql`, `backend/src/utils/validate.js`, `docs/UNIFIED_BUILD_SPEC.md`, `Maidora_kenya_Architecture.md` §1 status snapshot (all ✅ LIVE claims probe-verified).

---

## Summary of changes (v3.2)

| # | Section | Change |
|---|---|---|
| 1 | §4.3 | Merge-flow rule REPLACED by built duplicate-contact behaviour (409 at submit). OTP parameters reference built defaults (§31.2 v3.2). |
| 2 | §5.2.1 | "Read-only browsing" scoped precisely — adopts the built operative default; closes Unified Spec open item §15.1. |
| 3 | §31 | Onboarding spine REPLACED with the built flow (role selected AFTER OTP, at onboarding — not before signup). Consents + job-type steps re-classified as future onboarding enrichment, not v1.0 build. |
| 4 | §31.2 | OTP screen parameters REPLACED with built policy (10-min TTL, 60 s resend cooldown, 5 sends/hour, 5 attempts). Closes Unified Spec open item §15.2. |
| 5 | §34.4 | Field spec aligned to built `maid_profiles` (`job_type` enum values; `wage_expectation` retained); `availability_*` kept but tagged not-built. |
| 6 | §35 | Data model REPLACED where it conflicts with schema v2 (BIGINT ids, bcrypt, kyc on users, in-code blocklist). uuid/Argon2id/encrypted-columns/separate `maid_kyc` table re-classified as future hardening. |
| 7 | §42 | Change log appended; Unified Spec open-item register updated. |
| 8 | Decisions register (new) | Records that this document's pricing, urgent-fee and abuse-scope sections CLOSE Unified Spec open items §15.3–§15.5, §15.7. |

---

## §4.3 Contact model — AMENDED (v3.2)

The v3.1 text stands EXCEPT the merge-flow rule, which conflicts with the built gateway:

| Item | v3.1 said | BUILT (governs) |
|---|---|---|
| Duplicate phone/email at signup submit | "OTP proceeds normally; merge handled transparently; no error surfaced" | **`POST /auth/register` returns 409** with copy "An account with this phone/email already exists. Try logging in." and the offending `field` |

**Replacement rule:** duplicate contact is blocked at form submit with a friendly error and a link to Login. Transparent merge (auto-login via OTP) is **out of scope for v1.0**; revisit only if the owner wants it (it also weakens the "one contact = one account" guarantee the login throttle relies on). Everything else in §4.3 — field list, phone primary, E.164 storage, `0712 345 678` display, contact classifier, account created at OTP send as `pending_verification` — **already matches the built gateway exactly** and stands.

## §5.2.1 Contact verification gate — AMENDED (v3.2)

"Read-only browsing" is now the built operative default, closing Unified Spec open item §15.1. Unverified users (neither phone nor email verified) **may**:

- land on the home screen
- browse listings and search (once those services ship)
- view their own profile

Unverified users **may not** (enforced by the live `requireVerified` middleware, currently wired on STK push; auto-attached to every write endpoint as it ships):

- apply for jobs · post jobs · start chats · pay (STK push) · any other write action

This scope is **adopted as final** unless the owner reopens it. KYC badge remains separate and never a gate (§5.2.2 unchanged).

## §31 Onboarding spine — REPLACED (v3.2)

The v3.1 spine puts the role selector before signup and consents/job-types after OTP. The **built and deliberated** flow (Unified Spec §3.2, live since the identity-v3 deploy) is authoritative and is now the spec of record:

```
1. SPLASH (animated brand splash, ≥ 2.6 s hold — built behaviour)
        ▼
2. SESSION CHECK → token+user+role → Tabs · token+user, role unset → RoleSelect
        ▼
3. WELCOME
        ▼
4. SIGNUP FORM — full name, email, phone, location [+ Use my current location],
                password, confirm, referral toggle (NO role on this form)
        ▼
5. OTP to phone — account created as 'pending_verification' on send;
                'active' + phone_verified_at stamped on confirm
        ▼
6. ROLE SELECT (onboarding) — "I'm hiring" | "I'm looking for work";
                POST /auth/onboarding sets it ONCE, immutably
        ▼
7. WELCOME → HOME (role-based tabs)
```

**Why role moved after OTP (deliberated decision, restated):** signup collects one uniform form for both audiences; the role gates the correct tab set and is chosen by a fully-verified user; existing accounts are never re-onboarded.

**§31 steps 6–7 of v3.1 (Legal consents; Job types + work type) are re-classified as FUTURE onboarding enrichment.** They are good product direction but are **not built** and are not part of the v1.0 identity spine. When built, they slot between step 6 and step 7 above; their field lists (§32.1/§32.2) remain the reference. `terms_accepted`/`privacy_policy_accepted` columns (§35 v3.1) follow with them.

**Total: 7 screens to Home** (splash → welcome → signup → OTP → role select → home, plus the session-check gate).

## §31.2 Signup form & OTP screen — AMENDED (v3.2)

Signup form: unchanged (matches built `SignupScreen.js` + `POST /auth/register`, including the referral toggle and GPS button).

OTP screen — built policy **replaces** the v3.1 parameters (this also closes Unified Spec open item §15.2):

| Parameter | v3.1 said | BUILT (governs) |
|---|---|---|
| Code | 6-digit | 6-digit, crypto-random, stored SHA-256-hashed |
| Validity | 5 minutes | **10 minutes** (`OTP_TTL_MINUTES`, default 10) |
| Resend cooldown | 3 per 10 min, then 10-min lockout | **60-second cooldown** between sends |
| Send rate cap | — | **5 sends per user per hour** |
| Wrong attempts | 5 failures → 15-min lockout | **5 wrong attempts per code**, then code unusable — request a new one |
| Login-OTP vs signup-OTP | shared type | Same `phone_otps` policy; email path (`email_otps`) mirrors it for the fallback channel |
| Autofill | SMS Retriever enabled | **Zero-native autofill today** (iOS `textContentType`, Android `autoComplete`, clipboard paste); SMS Retriever deferred to the EAS dev build, then `OTP_APP_HASH` is appended server-side (already supported) |
| "Get help" WhatsApp link | after 90 s | Not built — carried as future UX polish |

**Adopted as final:** 6-digit · 10-minute expiry · 60 s resend cooldown · 5 attempts per code · 5 sends/hour.

## §34.4 Profile completeness field spec — AMENDED (v3.2)

Aligned to the built `maid_profiles` (schema v2). Changes only where v3.1 conflicts:

| Item | v3.1 said | BUILT (governs) |
|---|---|---|
| Work-type field + enum | `work_type` enum(`live_in`,`live_out`,`part_time`,`full_time`) | **`job_type` enum(`live_in`,`live_out`,`day_burg`)** — "day burg" is the built third value; part-time/full-time split is future scope |
| Wage | absent from v3.1 field spec | **`wage_expectation` (KES, optional) retained** — it is built, it feeds a suggestion card ("Add wage expectation"), and employers filter on it |
| `availability_status` / `availability_date` | required at signup | **Kept as spec, tagged NOT-BUILT** — columns do not exist yet; lands with jobs/search phase, not signup |
| `primary_job_types[]` / `other_job_type` | required at signup | Kept as spec, tagged NOT-BUILT (arrays of job types replace the single `job_type` later; single column governs until then) |
| Completeness set | 13 fields | **Built §7 set governs the banner today:** DOB, languages, job type, years of experience, next of kin (name/phone/relationship) — derived at read, never stored; everything else in this table arrives with its feature |

Next-of-kin privacy (never shown to employers; consent affirmation) and references-replaced-by-next-of-kin: **unchanged, good to build as written.**

## §35 Data model — AMENDED (v3.2)

v3.1's §35 conflicts with the live schema v2 in several places. **Schema v2 governs.** Verified live DDL (`backend/sql/schema.sql`, mirrored on the production DB via idempotent `migrate_v2.js`):

| Item | v3.1 said | BUILT (governs) |
|---|---|---|
| Primary keys | `uuid` | **`BIGINT UNSIGNED AUTO_INCREMENT`** |
| Password hashing | Argon2id | **bcrypt (bcryptjs, cost 10)** |
| KYC storage | separate `maid_kyc` table with encrypted columns | **`kyc_*` columns on `users`** (`kyc_status` enum incl. `draft`, `kyc_rejection_reason` locked enum, `kyc_submitted_at`, `kyc_reviewed_at`) |
| Referral columns | `referral_code` + `referred_by_code` | **`my_referral_code`** (system-generated at signup) + `referred_by_code` — same semantics, built names |
| Location columns | `area, county, device_lat, device_lng` on profile | **`location_name` / `location_area` / `location_county` / `location_source` / `latitude` / `longitude` on `users`** |
| Email blocklist | `email_blocklist` table + admin console | **In-code blocklist (38 domains) in `validate.js`, checked at signup + email verification** — table + admin console = future |
| Consent / `onboarding_step` / `payer_phone` columns | present | Not built — arrive with onboarding-enrichment (§31 v3.2) and payments-for-services phases |
| `credit_ledger` buckets | 2 lifetime free credits consumed last | Semantics **adopted as the design of record** for the paywall build (Unified Spec §9); nothing credit-related exists in the DB yet |

**Re-classified as future hardening (not v1.0 block):** uuid PKs, Argon2id migration, column-level encryption for `id_number`/DOB/next-of-kin phone, separate `maid_kyc` table, `email_blocklist` table. These are worthwhile but are refactors, not product gaps; the built schema already satisfies every v1.0 flow.

**Adopted as design-of-record (to build):** `maid_kyc`-style review metadata (reviewer_id, urgent flags, draft_updated_at) extends the users columns when the KYC flow ships · credit buckets and consumption order (`maid_sub_credits` → `maid_banked_credits` → `maid_free_credits` → PAYG KSh 50) · `email_blocklist` table when the admin console exists.

## Decisions register — Unified Spec §15 open items (v3.2)

This amendment + the built system close six of the seven open items:

| Unified Spec open item | Resolution | Source |
|---|---|---|
| §15.1 read-only scope for unverified users | **CLOSED** — home + browse/search + own profile; all write actions gated | §5.2.1 v3.2 (built `requireVerified`) |
| §15.2 OTP parameters | **CLOSED** — 6-digit · 10 min · 60 s resend · 5 attempts · 5/hour; shared policy for signup/login channels | §31.2 v3.2 (built `otp.js`) |
| §15.3 phone-first final | **CLOSED** — phone OTP is THE default path; email is fallback/optional | §4.3 (both amendments agree); built |
| §15.4 disposable/VoIP phone blocking | **CLOSED for v1.0** — out of scope (flagged, revisit on abuse evidence); foreign number ranges already rejected by E.164 normalization | §4.8 |
| §15.5 paywall pricing & tiers | **CLOSED as decision, pending build** — PAYG KSh 50 · Basic KSh 99/30d (5 credits + Subscriber tag) · Gold KSh 199/30d (10 credits + 1 profile boost + 1 application boost + priority visibility) · profile boost KSh 99/7d · application boost KSh 30 · urgent KYC KSh 150 | §9 / §11.1 / §12.1 (v3.1) |
| §15.6 multi-device session policy | **STILL OPEN** — not addressed by this document; built behaviour is 30-day sliding token refreshed on use, logout does not end other sessions | — |
| §15.7 urgent KYC fee refund path | **CLOSED** — no refund on rejection, abandonment, or cancellation | §33.3 (v3.1) |

## Still open / needs the owner (v3.2)

Carried from this document's own "not changed" list, plus what the consolidation surfaced:

1. **MPS v3.0 base text is not in the repo.** This file amends it by reference, so sections it cites (chat §15/§29, chat-initiation §26, boosts/rollover, penalty magnitude) can't be reviewed against reality. Commit `MPS_v3.0.md` to the repo so future amendments can cite exact text.
2. Multi-device session policy (§15.6 above) — decide whether logging out on one device should end other sessions.
3. Subscriptions/boosts v1.0 scope — pricing is now decided (§9), but confirm v1.0 ships credits+subscriptions before or after jobs/applications (spec order implies after — applications first).
4. Under-18 policy — pending Kenyan legal counsel; KYC block rule noted in §39.1 stands as written.
5. Behavioural penalty magnitude ("Moderate") — needs a number when ranking ships.
6. Employer "last seen" label context (§18.4) — employer-facing profile last-seen not specified.
7. OTP parameters for recovery/contact-change flows — enumerated only for signup/login; extend when those flows are specced.

## §42 Change log — v3.2 appended

### v3.2 — 2026-10-29 (Amendment 2 — consolidation with built reality)

| # | Section | Resolution |
|---|---|---|
| D1 | §4.3 | Merge flow replaced by built 409 duplicate-contact block; merge re-classified out of v1.0. |
| D2 | §5.2.1 | Read-only scope fixed to the built operative default; closes Unified Spec §15.1. |
| D3 | §31 | Onboarding spine replaced with built flow (role at onboarding, after OTP); consents + job-type steps tagged future; splash hold corrected to ≥ 2.6 s. |
| D4 | §31.2 | OTP parameters replaced with built policy; closes Unified Spec §15.2. |
| D5 | §34.4 | Field spec aligned to built `maid_profiles` (job_type enum, wage_expectation retained); availability_* tagged not-built. |
| D6 | §35 | Data model aligned to schema v2 (BIGINT, bcrypt, kyc on users, built location/referral names, in-code blocklist); uuid/Argon2id/encryption/separate-table re-classified as future hardening; credit-ledger semantics adopted as design-of-record. |
| D7 | Decisions register | Unified Spec §15.3–§15.5, §15.7 closed; §15.6 still open; 7 owner items listed. |
| D8 | §42 | This change log. |

**Rule for future amendments (unchanged):** reference the specific section changed, append to §42, and never contradict the precedence rule — built-and-live first, deliberated login/verification flow second, this document's product decisions third, MPS v3.0 base text for everything untouched.