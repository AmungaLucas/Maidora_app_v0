// Maidora schema migration v4 → v5 (§9 payments pricing + media pipeline).
// Idempotent — safe to run repeatedly; every operation is guarded.
//
// v5 adds:
//   1. payment_purposes — the PRICING TABLE. Prices change over time and the
//      owner must be able to change them without an app release, so the
//      purpose catalog (label, fixed price, audience, STK labels, active
//      flag) moves OUT of the app's PRODUCTS array and the gateway's
//      PURPOSE_STK map into the database. GET /api/payments/purposes reads
//      it; stk-push validates against it and ENFORCES fixed prices
//      server-side (the client can never pay KES 10 for a KES 500 plan).
//   2. media_assets — one row per uploaded media file (avatar, KYC images).
//      Gives the admin dashboard (§13) an audit trail: who uploaded what,
//      when, how big, which file serves a user's KYC front.
//   3. users.avatar_url — public media.maidora.co.ke URL of the profile
//      photo (avatars are the only web-served media class; KYC files live
//      under the same subdomain but are web-DENIED and stream only through
//      the authenticated API).
//
// Run on the server with the app's Node:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v5.js

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

  async function tableExists(name) {
    const [rows] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name]
    );
    return rows.length > 0;
  }

  async function columnExists(table, column) {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows.length > 0;
  }

  try {
    // ── 1. payment_purposes (§9 pricing table — source of truth) ──────────
    if (await tableExists('payment_purposes')) {
      skip.push('CREATE TABLE payment_purposes (already exists)');
    } else {
      await conn.query(`
        CREATE TABLE payment_purposes (
          code VARCHAR(32) PRIMARY KEY COMMENT 'purpose code sent by the app',
          label VARCHAR(64) NOT NULL COMMENT 'human name shown in the app + receipts',
          description VARCHAR(190) NULL COMMENT 'one-liner for the purpose picker',
          amount_kes DECIMAL(10,2) NULL COMMENT 'fixed price; NULL = caller picks the amount',
          audience ENUM('system','both','househelp','employer') NOT NULL DEFAULT 'both'
            COMMENT 'which role sees it in the picker (system = always visible)',
          stk_ref VARCHAR(12) NOT NULL DEFAULT 'MAIDORA' COMMENT 'STK AccountReference (<=12 alnum)',
          stk_desc VARCHAR(13) NOT NULL DEFAULT 'Maidora' COMMENT 'STK TransactionDesc (<=13 chars)',
          is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden + rejected at stk-push',
          sort_order INT NOT NULL DEFAULT 100 COMMENT 'picker order, ascending',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='Payment purpose + pricing catalog — edit here, no app release needed'
      `);
      done.push('CREATE TABLE payment_purposes');

      // Seed the §9 slots. Prices marked provisional match the app's
      // PROVISIONAL chips; only kyc_urgent's 150 is owner-confirmed. Prices
      // change by UPDATE, never by app release. app_test stays active for
      // checkout testing; application/application_boost seed INACTIVE until
      // those products ship.
      const purposes = [
        // code, label, description, amount, audience, stk_ref, stk_desc, active, sort
        ['app_test', 'STK push test', 'Checkout smoke test — pick any amount', null, 'system', 'TEST', 'Test payment', 1, 10],
        ['kyc_urgent', 'KYC expedite', 'Your identity review jumps the queue (speed only)', 150, 'househelp', 'KYCURGENT', 'Urgent KYC', 1, 20],
        ['profile_boost', 'Profile boost', 'Top of search results for 7 days (provisional)', 100, 'both', 'PROFILEBOOST', 'Profile boost', 1, 30],
        ['maid_basic', 'Maid Basic', 'Contact unlocks + standard visibility (provisional)', 200, 'househelp', 'MAIDBASIC', 'Maid Basic', 1, 40],
        ['maid_gold', 'Maid Gold', 'Priority placement + Gold badge (provisional)', 500, 'househelp', 'MAIDGOLD', 'Maid Gold', 1, 50],
        ['employer_gold', 'Employer Gold', 'Verified employer badge + priority support (provisional)', 500, 'employer', 'EMPLOYERGOLD', 'Employer Gold', 1, 60],
        ['application', 'Application fee', 'Apply to a job (provisional)', 20, 'househelp', 'APPLICATION', 'Application', 0, 70],
        ['application_boost', 'Application boost', 'Your application moves to the top (provisional)', 50, 'househelp', 'APPBOOST', 'App boost', 0, 80],
      ];
      const [ins] = await conn.query(
        `INSERT INTO payment_purposes
           (code, label, description, amount_kes, audience, stk_ref, stk_desc, is_active, sort_order)
         VALUES ?`,
        [purposes]
      );
      done.push(`SEED payment_purposes (${ins.affectedRows} rows)`);
    }

    // ── 2. media_assets (upload audit trail) ──────────────────────────────
    if (await tableExists('media_assets')) {
      skip.push('CREATE TABLE media_assets (already exists)');
    } else {
      await conn.query(`
        CREATE TABLE media_assets (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          kind ENUM('avatar','id_front','id_back','selfie') NOT NULL,
          storage_path VARCHAR(255) NOT NULL COMMENT 'path relative to the media root, e.g. avatars/u42/2026/10/ab12….webp',
          public_url VARCHAR(255) NULL COMMENT 'absolute URL when web-served (avatars); NULL for private KYC files',
          bytes INT UNSIGNED NOT NULL DEFAULT 0,
          mime VARCHAR(40) NOT NULL DEFAULT 'image/webp' COMMENT 'sniffed content type, never the claimed one',
          sha256 CHAR(64) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_media_user (user_id),
          INDEX idx_media_kind (kind),
          CONSTRAINT fk_media_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='One row per uploaded media file — dashboard audit + cleanup'
      `);
      done.push('CREATE TABLE media_assets');
    }

    // ── 3. users.avatar_url ───────────────────────────────────────────────
    if (await columnExists('users', 'avatar_url')) {
      skip.push('ADD COLUMN users.avatar_url (already exists)');
    } else {
      await conn.query(
        "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL COMMENT 'public media.maidora.co.ke URL of the profile photo' AFTER kyc_draft_updated_at"
      );
      done.push('ADD COLUMN users.avatar_url');
    }
  } finally {
    console.log('[migrate_v5] done:', JSON.stringify(done));
    console.log('[migrate_v5] skipped:', JSON.stringify(skip));
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[migrate_v5] FAILED:', e.message);
  process.exit(1);
});
