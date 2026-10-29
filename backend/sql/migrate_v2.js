// Maidora schema migration v1 → v2 (unified build spec §4).
// Idempotent — safe to run repeatedly. Every ALTER is guarded by an
// INFORMATION_SCHEMA check so re-runs and partially-migrated DBs are fine.
//
// Run on the server with the app's Node:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v2.js
// (dotenv path resolves relative to src/config, so cwd does not matter.)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'src', '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  const done = [];
  const skip = [];

  async function columns(table) {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    return new Set(rows.map((r) => r.COLUMN_NAME));
  }

  async function tableExists(table) {
    const [[r]] = await conn.query(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    return r.n > 0;
  }

  async function addColumn(table, ddl, col) {
    const cols = await columns(table);
    if (cols.has(col)) return skip.push(`${table}.${col} (exists)`);
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    return done.push(`${table}.${col} added`);
  }

  async function addIndex(table, indexName, ddl) {
    const [[r]] = await conn.query(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName]
    );
    if (r.n > 0) return skip.push(`${table}@${indexName} (exists)`);
    await conn.query(`ALTER TABLE \`${table}\` ADD INDEX ${ddl}`);
    return done.push(`${table}@${indexName} added`);
  }

  // ── 1. New tables ──────────────────────────────────────────────────────────
  await conn.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  done.push('table email_otps ensured');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      identifier VARCHAR(190) NOT NULL,
      ip VARCHAR(45) NULL,
      success TINYINT(1) NOT NULL DEFAULT 0,
      attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_attempts_identifier (identifier, attempted_at),
      INDEX idx_login_attempts_ip (ip, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  done.push('table login_attempts ensured');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS maid_profiles (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      date_of_birth DATE NULL,
      gender ENUM('female','male','other') NULL,
      languages JSON NULL,
      job_type ENUM('live_in','live_out','day_burg') NULL,
      years_experience TINYINT UNSIGNED NULL,
      wage_expectation INT UNSIGNED NULL,
      bio VARCHAR(500) NULL,
      photo_url VARCHAR(512) NULL,
      next_of_kin_name VARCHAR(120) NULL,
      next_of_kin_phone VARCHAR(16) NULL,
      next_of_kin_relationship VARCHAR(48) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_maid_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  done.push('table maid_profiles ensured');

  // ── 2. users: role becomes NULL-able (chosen at onboarding) ────────────────
  {
    const cols = await columns('users');
    if (cols.has('role')) {
      const [[r]] = await conn.query(
        `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
      );
      if (r.IS_NULLABLE === 'NO') {
        await conn.query(
          "ALTER TABLE `users` MODIFY `role` ENUM('employer','househelp') NULL"
        );
        done.push('users.role made NULL-able (onboarding sets it)');
      } else skip.push('users.role (already nullable)');
    }
  }

  // ── 3. users: single `status` → account_status (§4.2) ─────────────────────
  {
    const cols = await columns('users');
    if (!cols.has('account_status')) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN account_status
         ENUM('pending_verification','active','suspended','deactivated','deleted')
         NOT NULL DEFAULT 'pending_verification' AFTER password_hash`
      );
      done.push('users.account_status added');
    } else skip.push('users.account_status (exists)');

    if (cols.has('status')) {
      await conn.query(`
        UPDATE users SET account_status = CASE status
          WHEN 'pending'  THEN 'pending_verification'
          WHEN 'active'   THEN 'active'
          WHEN 'suspended' THEN 'suspended'
          ELSE 'pending_verification' END`);
      done.push('users.account_status backfilled from status');
      await conn.query('ALTER TABLE users DROP COLUMN status');
      done.push('users.status dropped');
    }
  }

  // ── 4. users: phone_verified TINYINT → phone_verified_at (§4.2) ───────────
  {
    const cols = await columns('users');
    if (!cols.has('phone_verified_at')) {
      await conn.query(
        'ALTER TABLE users ADD COLUMN phone_verified_at DATETIME NULL AFTER account_status'
      );
      done.push('users.phone_verified_at added');
    } else skip.push('users.phone_verified_at (exists)');

    if (cols.has('phone_verified')) {
      await conn.query(
        'UPDATE users SET phone_verified_at = NOW() WHERE phone_verified = 1 AND phone_verified_at IS NULL'
      );
      done.push('users.phone_verified_at backfilled from phone_verified');
      await conn.query('ALTER TABLE users DROP COLUMN phone_verified');
      done.push('users.phone_verified dropped');
    }
  }

  // ── 5. users: remaining §4 columns ─────────────────────────────────────────
  await addColumn('users', 'email_verified_at DATETIME NULL AFTER phone_verified_at', 'email_verified_at');
  await addColumn(
    'users',
    "kyc_status ENUM('not_started','draft','submitted','under_review','approved','rejected') NOT NULL DEFAULT 'not_started' AFTER email_verified_at",
    'kyc_status'
  );
  await addColumn('users', 'kyc_rejection_reason VARCHAR(32) NULL AFTER kyc_status', 'kyc_rejection_reason');
  await addColumn('users', 'kyc_submitted_at DATETIME NULL AFTER kyc_rejection_reason', 'kyc_submitted_at');
  await addColumn('users', 'kyc_reviewed_at DATETIME NULL AFTER kyc_submitted_at', 'kyc_reviewed_at');
  await addColumn('users', 'last_login_at DATETIME NULL AFTER kyc_reviewed_at', 'last_login_at');
  await addColumn('users', 'last_active_at DATETIME NULL AFTER last_login_at', 'last_active_at');
  await addColumn('users', 'location_area VARCHAR(120) NULL AFTER location_name', 'location_area');
  await addColumn('users', 'location_county VARCHAR(120) NULL AFTER location_area', 'location_county');
  await addColumn(
    'users',
    "location_source ENUM('gps','manual') NULL AFTER location_county",
    'location_source'
  );
  await addIndex('users', 'idx_users_last_active', '(last_active_at)');
  await addIndex('users', 'idx_users_account_status', '(account_status)');

  // ── 6. users: referral_code → referred_by_code (§4.1 naming) ──────────────
  {
    const cols = await columns('users');
    if (cols.has('referral_code') && !cols.has('referred_by_code')) {
      await conn.query(
        'ALTER TABLE users CHANGE COLUMN `referral_code` `referred_by_code` VARCHAR(24) NULL'
      );
      done.push('users.referral_code renamed to referred_by_code');
    } else skip.push('users.referral_code rename (nothing to do)');
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('=== migrate_v2 done ===');
  console.log('Applied:');
  done.forEach((d) => console.log('  + ' + d));
  console.log('Skipped:');
  skip.forEach((s) => console.log('  - ' + s));

  const [[u]] = await conn.query('SELECT COUNT(*) AS n FROM users');
  console.log(`users rows: ${u.n}`);
  await conn.end();
}

main().catch((e) => {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
});
