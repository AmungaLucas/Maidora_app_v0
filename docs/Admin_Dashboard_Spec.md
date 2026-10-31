# Maidora Admin Dashboard — Build Specification

**Status:** Approved for later build (owner request, 2026-10-31). Not started.
**Goal:** a private control panel that lets the Maidora team run the platform —
manage users (employers + househelps), manage transactions and pricing, review
identity verifications manually, watch patterns/analytics, handle reports and
disputes, and monitor backend processes and events.

Everything in here is grounded in what the gateway ALREADY has (tables, routes,
status enums) so the build starts from reality, not guesses. Section numbers
refer to the unified build spec / MPS amendment conventions used across this
repo (`UNIFIED_BUILD_SPEC.md`, `Maidora_kenya_Architecture.md`).

---

## 1. Product principles

1. **Control plane, not a second product.** The dashboard is internal-only.
   No marketing, no self-signup — accounts are provisioned by the owner.
2. **Read-mostly, write-deliberately.** Every state-changing action
   (suspend, approve KYC, change a price) is explicit, confirmed, and logged
   to an immutable audit trail.
3. **The API is the only door.** The dashboard never touches MySQL directly;
   it goes through the same Express gateway (`/api/admin/*`) so business
   rules (e.g. KYC is non-blocking, prices live in `payment_purposes`)
   cannot be bypassed.
4. **Kenya DPA 2019 aware.** KYC documents (ID front/back, selfie) are
   sensitive personal data. Access is role-gated, per-view logged, and
   never exported in bulk.

## 2. Access model & security

| Role | Scope |
|---|---|
| `owner` (superadmin) | Everything, including pricing edits, admin management, audit export |
| `reviewer` | KYC queue review (approve/reject with reason), user read |
| `support` | User lookups, payment lookups, dispute triage — no approvals, no pricing |

- Separate JWT audience: admin tokens are issued by `POST /api/admin/login`
  (email + password + TOTP 2FA at M2) against an `admin_users` table —
  **never** the `users` table. Admin JWTs carry `{ aud: 'admin', rid }`.
- Transport/hosting: `admin.maidora.co.ke` (cPanel subdomain, same Node
  selector pattern as the gateway). Optional IP allowlist at the LiteSpeed
  level; the API additionally enforces role checks.
- Every admin request writes an `admin_actions` row (see §9) — who, what,
  target, before/after JSON. Read views for KYC media also log.
- Session policy: 8h access token, no refresh on the admin surface
  (re-login is acceptable for staff), logout revokes via `token_version`.

### `admin_users` (M1 DDL)

```sql
CREATE TABLE admin_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','reviewer','support') NOT NULL,
  totp_secret VARCHAR(64) NULL,          -- M2
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 3. Architecture & stack

- **Backend:** extend the existing Express gateway with an `admin` router
  (`backend/src/routes/admin/*.js`) guarded by `requireAdmin(role)`. Same
  deploy path, same MySQL pool, same .env discipline (secrets only in
  server `.env`).
- **Frontend:** a small React SPA (Vite + React + Tailwind, or shadcn/ui
  scaffold) deployed to the `admin.maidora.co.ke` docroot as static files.
  No SSR needed. Reuse Maidora brand tokens (forest/cream/gold) so it feels
  like the same company.
- **Realtime:** start with 30s polling (SWR/react-query). WebSockets are a
  later optimization, not a M1 need.
- **Why not an off-the-shelf admin (AdminJS/Retool):** the KYC reviewer UX
  (side-by-side ID + selfie, zoom, reason codes) and the pricing editor are
  core workflows worth owning; the rest is standard CRUD we can still model
  on shadcn patterns quickly.

## 4. Data the dashboard reads (existing today)

| Area | Source (already in production) |
|---|---|
| Users + status split model | `users` (account_status enum, kyc_status enum, phone/email verified, role, location, referral) |
| Maid profiles / employer profiles | `maid_profiles`, `employer_profiles` (completeness fields) |
| Payments | `payments` (purpose, amount, phone, status, result_code, mpesa_receipt, raw_callback JSON) |
| **Pricing catalog** | `payment_purposes` (v5 — label, amount_kes, audience, stk_ref/desc, is_active, sort_order) |
| Media audit | `media_assets` (v5 — user, kind, storage_path, public_url, bytes, mime, sha256) |
| Auth safety | `phone_otps`, `email_otps`, `login_attempts` |
| KYC files | media subdomain `kyc/` dir (web-denied; reader must be admin-scoped) |

Gaps the dashboard build must add: `admin_users`, `admin_actions`,
`reports` (§7), and an admin-scoped KYC media reader route.

## 5. Modules

### 5.1 Dashboard home (KPI cards)

- Today: signups, OTP verify rate, logins, successful payments (count + KES),
  KYC submissions pending, KYC reviewed < 72h SLA %, active listings.
- 7-day trend sparkline per KPI (SQL GROUP BY day — cheap, no warehouse).
- System strip: `/api/health` + `/api/db-health` status, last Daraja callback
  received (max `updated_at` where status settled), last SMS error.

### 5.2 Users management (employers + househelps)

- Search by name / phone / email / ID number (`kyc_id_number`); filter by
  role, account_status, kyc_status, verification state, signup date,
  last_active.
- User detail = ONE screen with everything: identity, verification state +
  rejection reason, profile completeness, payments history, media assets,
  referrals, login attempts (brute-force visibility).
- Actions (role-gated, all confirmed + audited):
  - `suspend` / `reactivate` / `deactivate` → `account_status` (§4.2 — the
    split status model already supports this; the app must treat suspended
    as read-only-on-login — gateway change required at M2).
  - Force password reset (invalidates password via `token_version` bump).
  - Clear login cooldown (throttle override for support).
  - KYC: jump into the review queue for that user (§5.3).
  - Media: list + view a user's assets (per-view audit).
- **No hard delete from the UI.** Deletion is a §4.2 `deleted` flow executed
  by the owner via a dedicated, double-confirmed action (DPA erasure
  requests) that anonymizes PII columns and keeps financial rows.

### 5.3 Manual KYC verification queue (the heart of M2)

The gateway already models the full lifecycle
(`not_started → draft → submitted → under_review → approved/rejected`,
rejection reasons enum `unreadable_document | name_mismatch | expired_document |
selfie_mismatch | suspected_fraud | other`, urgency flag `kyc_urgent`).

- **Queue view:** submitted users, oldest-first, `kyc_urgent` pinned on top
  (paying customers jump the queue — speed only). Show wait time vs the
  72h SLA promise; breach highlighted.
- **Review view (one submission):**
  - ID front + ID back side-by-side, selfie below, click-to-zoom; images
    stream through the new admin-only route
    `GET /api/admin/kyc/:userId/images/:field` which resolves the same
    media-dir layout the self-read route uses (`requireAdmin('reviewer')` +
    per-view audit log).
  - Data panel: full name, ID number, DOB (age shown), gender, document
    type; consistency callouts (name vs profile name mismatch, age < 18
    guard already enforced at draft).
  - **Approve** → `kyc_status='approved'`, sets `kyc_reviewed_at`,
    `trustBadge` flips in the app on next `/me`.
  - **Reject** → pick a §33.3 reason (dropdown maps to the exact enum the
    app already translates via REASON_LABELS) + free-text note (stored on
    the row for the audit; app shows the friendly label + "retake" path).
    Rejection re-opens the draft (`writable()` states) — already implemented
    gateway-side.
- Throughput aids: keyboard shortcuts (A approve / R reject / S skip),
  reviewer attribution, daily reviewed-count per reviewer.

### 5.4 Transactions & money

- Payments table: filter by purpose, status, date range, phone, amount;
  row → detail with raw Daraja callback JSON (`payments.raw_callback`),
  timeline (created → push accepted → settled), receipt number.
- **Reconciliation helper:** list of `pending` rows older than 30 min
  (lost callbacks / user closed app) with a "query Daraja" action reusing
  `mpesa.stkQuery` + the same settle guards the app polling path uses.
  This closes the rare "paid but row stuck pending" case (observed class
  of issue during the Oct 30 hardening).
- **Pricing catalog editor (the §9 table):** full CRUD over
  `payment_purposes` — change `amount_kes`, rename labels, toggle
  `is_active`, reorder `sort_order`, set `audience`. Every edit is audited
  with before/after. The app picker and stk-push enforcement pick changes
  up with ZERO app release — this is exactly why the catalog moved to the
  DB in v5.
- Refunds: M-Pesa STK has no programmatic refund in our flow — policy is
  documented as manual (owner sends via PayBill tools); the dashboard only
  RECORDS a refund note on the payment row (new nullable
  `refund_note VARCHAR(255)` + `refunded_at`) so finance has a trail.
  KYC expedite is never refunded (§33.3 — already the stated policy).

### 5.5 Analytics & patterns

Phase M3 (needs an `events` table — see §8) plus SQL over existing rows:

- Growth: signups/day by role, signup→OTP-verified conversion, onboarding
  role-select completion, profile completeness distribution.
- Engagement: DAU/WAU (`last_active_at`), searches, profile views (needs
  events), applications (needs jobs module — spec later).
- Money: revenue by purpose/day, success vs failure rate by result_code
  (1 balance / 1032 cancel / 1037 timeout / 2001 wrong PIN), retry
  behavior, purpose funnel (views → pushes → settles).
- Verification: median submission→decision time, rejection reasons mix,
  urgent uptake.
- Patterns worth alerting: same-device multi-account signals
  (`login_attempts` IP clustering), OTP resend storms, payment failure
  spikes (Daraja incidents).

### 5.6 Reports & disputes (M4)

New `reports` table (placeholder DDL at M4, not M1):

```sql
CREATE TABLE reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT UNSIGNED NOT NULL,
  reported_user_id BIGINT UNSIGNED NULL,
  reported_payment_id BIGINT UNSIGNED NULL,
  kind ENUM('user','payment','listing','other') NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolution_note TEXT NULL,
  handled_by BIGINT UNSIGNED NULL COMMENT 'admin_users.id',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- Triage inbox (open → investigating → resolved/dismissed) with the same
  audit trail; one-click "suspend reported user" hands off to §5.2.
- In-app report entry points ship with the M4 app work (profile menu +
  payment receipt), not with the dashboard.

### 5.7 Backend process & event monitoring

- **Gateway vitals:** health/db-health poll, 5xx counter from logs,
  response-time p50/p95 (the `req.t0` latency attribution already in every
  route makes this trivial to extend into a log line the dashboard tails).
- **M-Pesa ops view:** last N `[MPESA]` events mirrored into an
  `event_log` (push accepted / callback settled / query outcomes), callback
  freshness, Daraja OAuth failures. The response-first + callback-as-truth
  architecture means the dashboard watches; it never hand-edits a payment.
- **SMS/OTP ops:** TalkSasa failures, OTP send/receive rates, app-hash
  autofill coverage.
- **Media ops:** `media_assets` growth, orphaned files report (rows without
  files, files without rows — cleanup script trigger), 5MB rejections.
- **Jobs/queues (future):** when async work (SMS retries, push, exports)
  becomes queue-based, each job writes `event_log` rows the dashboard
  renders as a live tail.

## 6. Admin API surface (route map)

```
POST   /api/admin/login                       { email, password, totp? } → admin JWT
GET    /api/admin/overview                    KPI block (owner/reviewer/support)
GET    /api/admin/users                       search + filters + paging
GET    /api/admin/users/:id                   full user detail
POST   /api/admin/users/:id/status            { account_status }      owner
POST   /api/admin/users/:id/force-reset       bump token_version      owner
POST   /api/admin/users/:id/clear-cooldown    throttle override       support+
GET    /api/admin/kyc/queue                   submitted, urgent-first
GET    /api/admin/kyc/:userId                 submission detail
GET    /api/admin/kyc/:userId/images/:field   stream (audit-logged)   reviewer+
POST   /api/admin/kyc/:userId/approve                                 reviewer+
POST   /api/admin/kyc/:userId/reject          { reason, note }        reviewer+
GET    /api/admin/payments                    filters + paging
GET    /api/admin/payments/:id                detail incl. raw_callback
POST   /api/admin/payments/:id/query          Daraja query + settle   owner
POST   /api/admin/payments/:id/refund-note    { note }                owner
GET    /api/admin/purposes                    catalog read
POST   /api/admin/purposes                    create                  owner
PUT    /api/admin/purposes/:code              edit (price/label/active/sort) owner
GET    /api/admin/analytics/:domain           growth|money|verification
GET    /api/admin/events                      event_log tail + filters
GET    /api/admin/audit                       admin_actions trail     owner
POST   /api/admin/admins                      provision staff         owner
```

RBAC matrix enforced in middleware, mirrored in the UI (routes a role
cannot call are not rendered).

## 7. Audit trail

```sql
CREATE TABLE admin_actions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) NOT NULL,           -- 'kyc.approve', 'purposes.update', …
  target_type VARCHAR(32) NULL,
  target_id VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_admin (admin_id),
  INDEX idx_audit_target (target_type, target_id)
);
```

Written by `requireAdmin` wrapper automatically for POST/PUT/DELETE. KYC
image views log `action='kyc.view_media'`. Export (CSV) is owner-only and
itself audited.

## 8. Event log (backend → dashboard)

Single append-only table the gateway already has the hooks for — every
console.error currently used for ops tracing ([MPESA] lines, SMS failures)
gains a structured sibling write:

```sql
CREATE TABLE event_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,     -- 'mpesa.push', 'mpesa.callback', 'sms.fail', 'media.upload'
  level ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  ref_type VARCHAR(32) NULL, ref_id VARCHAR(64) NULL,
  message VARCHAR(500) NULL, data_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_kind (kind),
  INDEX idx_event_time (created_at)
);
```

Retention: 90 days (scheduled DELETE — the dashboard's first background
job; runs on-demand via a cron hit to an internal endpoint).

## 9. Build phases

| Phase | Ships | Why first |
|---|---|---|
| **M1 — Read spine** (≈1 week) | admin login + RBAC, overview KPIs, users search/detail, payments list/detail, `admin_users` + `admin_actions` DDL, SPA scaffold on admin.maidora.co.ke | Visibility without risk: zero write paths |
| **M2 — KYC review + user actions** | review queue UI, admin media reader, approve/reject, suspend/reactivate, force-reset, 2FA | Unblocks the 72h SLA the app already promises; highest owner time-sink today |
| **M3 — Money control** | pricing catalog editor, payment query/settle, refund notes, analytics v1 (SQL over existing tables), `event_log` | Pricing changes stop depending on the owner's SQL access |
| **M4 — Trust ops** | reports/disputes inbox (app entry points + `reports`), alerting (SLA breach, callback silence, SMS storms), CSV exports | Completes the control loop as transaction volume grows |

## 10. Open questions (decide before M1)

1. Admin domain: `admin.maidora.co.ke` confirmed? (subdomain creation, like
   media.maidora.co.ke, is a cPanel task for the owner.)
2. 2FA provider: TOTP (self-hosted, otplib) is the default — SMS 2FA would
   burn TalkSasa credits and shares the app's failure modes.
3. Do reviewers see full ID numbers, or masked with a reveal step?
   Default: masked with reveal (audited) — cheapest DPA win.
4. Retention for rejected KYC media: 90 days then purge? (DPA
   minimization vs re-review needs — owner decision.)
5. Should `support` see phone numbers in full? Default: yes (needed for
   payment support), but logged.
