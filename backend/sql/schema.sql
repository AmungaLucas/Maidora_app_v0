-- Maidora Kenya gateway schema — v2 (unified build spec §3, §4, §7, §11, §12)
--
-- Idempotent: safe to re-run on a fresh install. The LIVE database is
-- migrated by sql/migrate_v2.js (column-level, checked ALTERs) — run that
-- once per release that changes the schema, then keep this file in sync.

-- ─── Users — identity + split status model (§4.1/§4.2) ─────────────────────
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  user_id BIGINT UNSIGNED NOT NULL,
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
  user_id BIGINT UNSIGNED NOT NULL,
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
  user_id BIGINT UNSIGNED NULL,              -- known only when the account exists
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
  user_id BIGINT UNSIGNED PRIMARY KEY,
  date_of_birth DATE NULL,
  gender ENUM('female','male','other') NULL,
  languages JSON NULL,                       -- array of strings, max 8
  job_type ENUM('live_in','live_out','day_burg') NULL,
  years_experience TINYINT UNSIGNED NULL,    -- 0..50
  wage_expectation INT UNSIGNED NULL,        -- KES, optional
  bio VARCHAR(500) NULL,
  photo_url VARCHAR(512) NULL,               -- upload pipeline comes with KYC phase
  next_of_kin_name VARCHAR(120) NULL,
  next_of_kin_phone VARCHAR(16) NULL,
  next_of_kin_relationship VARCHAR(48) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maid_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── M-Pesa STK Push payments (Lipa na M-Pesa Online) — unchanged ───────────
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_user (user_id),
  INDEX idx_payments_checkout (checkout_request_id),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
