-- Maidora Kenya gateway schema — v2 (unified build spec §3, §4, §7, §11, §12)
--
-- Idempotent: safe to re-run on a fresh install. The LIVE database is
-- migrated by sql/migrate_v2.js (column-level, checked ALTERs) — run that
-- once per release that changes the schema, then keep this file in sync.

-- ─── Users — identity + split status model (§4.1/§4.2) ─────────────────────
-- users.id IS the user identifier: a v4 UUID generated AT SIGNUP by the
-- register route (crypto.randomUUID(), migrate_v7 — owner request
-- 2026-10-31: "user id and its reference in (fk) should refer to the uuid").
-- Non-enumerable, globally unique, safe to expose in JWTs/URLs/receipts.
-- Every child table's user_id is CHAR(36) referencing users(id). There is
-- no numeric user id anywhere anymore.
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(16) NOT NULL UNIQUE,
  -- Role is chosen at ONBOARDING (post phone-verification), not at signup.
  -- NULL until onboarding; immutable once set.
  role ENUM('employer','househelp') NULL,
  password_hash VARCHAR(255) NOT NULL,

  -- §4.2 status model — split columns, never one `status` column.
  account_status ENUM('pending_verification','active','suspended','deactivated','deleted')
    NOT NULL DEFAULT 'pending_verification',
  phone_verified_at DATETIME NULL,           -- null = unverified
  email_verified_at DATETIME NULL,           -- null = unverified
  kyc_status ENUM('not_started','draft','submitted','under_review','approved','rejected')
    NOT NULL DEFAULT 'not_started',
  kyc_rejection_reason VARCHAR(32) NULL,     -- enum value, set only on rejection
  kyc_submitted_at DATETIME NULL,
  kyc_reviewed_at DATETIME NULL,
  -- §8 KYC submission data — the draft lives in these columns until submit
  -- (MPS Amendment v3.2 §35: columns on users; separate table = future).
  kyc_full_name VARCHAR(190) NULL,           -- full name as on ID
  kyc_id_number VARCHAR(32) NULL,
  kyc_id_type ENUM('national_id','passport','drivers_license') NULL,
  kyc_date_of_birth DATE NULL,
  kyc_gender ENUM('female','male','other') NULL,  -- optional; withheld = not shown
  kyc_id_front_url VARCHAR(255) NULL,        -- private filename inside kyc_uploads/
  kyc_id_back_url VARCHAR(255) NULL,         -- required for national_id only
  kyc_selfie_url VARCHAR(255) NULL,
  kyc_urgent TINYINT(1) NOT NULL DEFAULT 0,  -- KSh 150 expedite: speed only, never refunded
  kyc_urgent_paid_at DATETIME NULL,
  kyc_draft_updated_at DATETIME NULL,

  -- §4.3 activity — decay + "last seen" read these.
  last_login_at DATETIME NULL,               -- every successful authentication
  last_active_at DATETIME NULL,              -- login + any authenticated action (1h write throttle)

  -- §4.1 / §6 location
  location_name VARCHAR(190) NULL,           -- display string, e.g. "Nairobi, Utawala"
  location_area VARCHAR(120) NULL,
  location_county VARCHAR(120) NULL,
  location_source ENUM('gps','manual') NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,

  -- Referrals — my_referral_code = own code (system-generated),
  -- referred_by_code = the code entered at signup (optional).
  referred_by_code VARCHAR(24) NULL,
  my_referral_code VARCHAR(12) NULL UNIQUE,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_last_active (last_active_at),
  INDEX idx_users_account_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Phone OTP (SMS, TalkSasa) — hashed codes, caps in services/otp.js ──────
CREATE TABLE IF NOT EXISTS phone_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose VARCHAR(24) NOT NULL DEFAULT 'phone_verification',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otps_user (user_id),
  CONSTRAINT fk_otps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Email OTP (nodemailer SMTP) — optional verification path (§2/§5) ───────
CREATE TABLE IF NOT EXISTS email_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose VARCHAR(24) NOT NULL DEFAULT 'email_verification',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_otps_user (user_id),
  CONSTRAINT fk_email_otps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Login attempts — §11 throttle data (account 5/15min, IP 20/hour) ───────
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NULL,                     -- known only when the account exists
  identifier VARCHAR(190) NOT NULL,          -- normalized email or phone as attempted
  ip VARCHAR(45) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempts_identifier (identifier, attempted_at),
  INDEX idx_login_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Maid profiles — §7 profile-completeness fields (+ §13 enrichment) ──────
-- Completeness (derived at read): date_of_birth, languages, job_type,
-- years_experience, next_of_kin_* — all present = complete. Non-blocking.
CREATE TABLE IF NOT EXISTS maid_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  date_of_birth DATE NULL,
  gender ENUM('female','male','other') NULL,
  languages JSON NULL,                       -- array of strings, max 8
  job_type ENUM('live_in','live_out','day_burg') NULL,
  years_experience TINYINT UNSIGNED NULL,    -- 0..50
  wage_expectation INT UNSIGNED NULL,        -- KES, optional
  bio VARCHAR(500) NULL,
  photo_url VARCHAR(512) NULL,               -- upload pipeline comes with KYC phase
  boosted_until DATETIME NULL COMMENT 'Profile Boost active until (KES 99/7d — §15.5 featured placement)',
  next_of_kin_name VARCHAR(120) NULL,
  next_of_kin_phone VARCHAR(16) NULL,
  next_of_kin_relationship VARCHAR(48) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_maid_boost (boosted_until),
  CONSTRAINT fk_maid_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Employer profiles — §7 employer side (household context, non-blocking) ─
-- Completeness (derived at read): household_size, num_children, budget_amount
-- — all three present = complete. Non-blocking, mirrors maid_profiles.
CREATE TABLE IF NOT EXISTS employer_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  household_size TINYINT UNSIGNED NULL,      -- people living in the home, 1..30
  num_children TINYINT UNSIGNED NULL,        -- children at home, 0..20
  budget_amount INT UNSIGNED NULL,           -- KES per month offered
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── M-Pesa STK Push payments (Lipa na M-Pesa Online) — unchanged ───────────
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose VARCHAR(64) NOT NULL DEFAULT 'general',
  amount DECIMAL(10,2) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  merchant_request_id VARCHAR(128) NULL,
  checkout_request_id VARCHAR(128) NULL,
  mpesa_receipt VARCHAR(64) NULL,
  result_code INT NULL,
  result_desc VARCHAR(255) NULL,
  status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  raw_callback JSON NULL,
  consumed_at DATETIME NULL COMMENT 'Entitlement spent (application_boost → one application; profile_boost → activation; §10)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_user (user_id),
  INDEX idx_payments_checkout (checkout_request_id),
  INDEX idx_payments_entitlement (user_id, purpose, status, consumed_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Media assets — one row per uploaded file (avatars public, KYC private) ─
CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind ENUM('avatar','id_front','id_back','selfie') NOT NULL,
  storage_path VARCHAR(255) NOT NULL COMMENT 'path relative to the media root, e.g. avatars/2026/10/ab12.webp',
  public_url VARCHAR(255) NULL COMMENT 'absolute URL when web-served (avatars); NULL for private KYC files',
  bytes INT UNSIGNED NOT NULL DEFAULT 0,
  mime VARCHAR(40) NOT NULL DEFAULT 'image/webp' COMMENT 'sniffed content type, never the claimed one',
  sha256 CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_user (user_id),
  INDEX idx_media_kind (kind),
  CONSTRAINT fk_media_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='One row per uploaded media file — dashboard audit + cleanup';

-- ─── Payment purposes + pricing catalog (admin-editable, no app release) ────
CREATE TABLE IF NOT EXISTS payment_purposes (
  code VARCHAR(32) NOT NULL COMMENT 'purpose code sent by the app',
  label VARCHAR(64) NOT NULL COMMENT 'human name shown in the app + receipts',
  description VARCHAR(190) NULL COMMENT 'one-liner for the purpose picker',
  amount_kes DECIMAL(10,2) NULL COMMENT 'fixed price; NULL = caller picks the amount',
  audience ENUM('system','both','househelp','employer') NOT NULL DEFAULT 'both' COMMENT 'which role sees it in the picker (system = always visible)',
  stk_ref VARCHAR(12) NOT NULL DEFAULT 'MAIDORA' COMMENT 'STK AccountReference (<=12 alnum)',
  stk_desc VARCHAR(13) NOT NULL DEFAULT 'Maidora' COMMENT 'STK TransactionDesc (<=13 chars)',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden + rejected at stk-push',
  sort_order INT NOT NULL DEFAULT 100 COMMENT 'picker order, ascending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Payment purpose + pricing catalog — edit here, no app release needed';

-- ─── Jobs — employer listings (v8 marketplace, unified spec §9) ─────────────
CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employer_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  job_type ENUM('live_in','live_out','day_burg') NOT NULL,
  county VARCHAR(120) NULL,
  area VARCHAR(120) NULL,
  salary_amount INT UNSIGNED NULL COMMENT 'KES per month, optional',
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_employer (employer_id),
  INDEX idx_jobs_status_created (status, created_at),
  INDEX idx_jobs_county (county),
  CONSTRAINT fk_jobs_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Job applications — §9: 2 lifetime free (withdrawn/rejected still
-- consume), then paywall. The consumed count is COUNT(*) per maid.
CREATE TABLE IF NOT EXISTS job_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  maid_id CHAR(36) NOT NULL,
  message VARCHAR(500) NULL,
  status ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  boosted_at DATETIME NULL COMMENT 'Application Boost applied at (KES 30 — §15.5 top slot)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_job_maid (job_id, maid_id),
  INDEX idx_app_maid (maid_id, status),
  INDEX idx_app_boost (boosted_at),
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_maid FOREIGN KEY (maid_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Chat threads — one per employer↔househelp pair, pair stored ORDERED ────
CREATE TABLE IF NOT EXISTS chat_threads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_a_id CHAR(36) NOT NULL COMMENT 'lexically smaller uuid of the pair',
  user_b_id CHAR(36) NOT NULL,
  last_message_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_thread_pair (user_a_id, user_b_id),
  INDEX idx_thread_a (user_a_id),
  INDEX idx_thread_b (user_b_id),
  CONSTRAINT fk_thread_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_thread_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Chat messages — polling-based (?after=<id>), read_at bulk-stamped ──────
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id BIGINT UNSIGNED NOT NULL,
  sender_id CHAR(36) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_thread (thread_id, id),
  INDEX idx_msg_unread (thread_id, sender_id, read_at),
  CONSTRAINT fk_msg_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
