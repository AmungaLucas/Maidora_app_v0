// Maidora schema migration v2 → v3 (unified spec §8 — KYC submission data).
// Idempotent — safe to run repeatedly. Every ALTER is guarded by an
// INFORMATION_SCHEMA check so re-runs and partially-migrated DBs are fine.
//
// v3 adds the KYC submission columns to `users` (kyc_status / rejection /
// submitted_at / reviewed_at already exist from v2). Per the adopted MPS
// Amendment v3.2 §35: KYC data lives as columns on `users`; a separate
// maid_kyc table is future hardening, not v1.0.
//
// Run on the server with the app's Node:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v3.js

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

  async function addColumn(table, col, ddl) {
    const cols = await columns(table);
    if (cols.has(col)) return skip.push(`${table}.${col} (exists)`);
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    return done.push(`${table}.${col} added`);
  }

  try {
    // §8 KYC submission data — the draft lives in these columns until submit.
    await addColumn('users', 'kyc_full_name', "kyc_full_name VARCHAR(190) NULL");
    await addColumn('users', 'kyc_id_number', "kyc_id_number VARCHAR(32) NULL");
    await addColumn(
      'users', 'kyc_id_type',
      "kyc_id_type ENUM('national_id','passport','drivers_license') NULL"
    );
    await addColumn('users', 'kyc_date_of_birth', "kyc_date_of_birth DATE NULL");
    await addColumn('users', 'kyc_gender', "kyc_gender ENUM('female','male','other') NULL");
    await addColumn('users', 'kyc_id_front_url', "kyc_id_front_url VARCHAR(255) NULL");
    await addColumn('users', 'kyc_id_back_url', "kyc_id_back_url VARCHAR(255) NULL");
    await addColumn('users', 'kyc_selfie_url', "kyc_selfie_url VARCHAR(255) NULL");
    await addColumn(
      'users', 'kyc_urgent',
      "kyc_urgent TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'KSh 150 expedite paid — review speed only, never refunded'"
    );
    await addColumn('users', 'kyc_urgent_paid_at', "kyc_urgent_paid_at DATETIME NULL");
    await addColumn('users', 'kyc_draft_updated_at', "kyc_draft_updated_at DATETIME NULL");
  } finally {
    console.log('[migrate_v3] done:', JSON.stringify(done));
    console.log('[migrate_v3] skipped:', JSON.stringify(skip));
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[migrate_v3] FAILED:', e.message);
  process.exit(1);
});
