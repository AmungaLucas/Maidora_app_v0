// Maidora schema migration v3 → v4 (unified spec §7 — employer profile side).
// Idempotent — safe to run repeatedly. Every operation is guarded by an
// INFORMATION_SCHEMA check so re-runs and partially-migrated DBs are fine.
//
// v4 adds the `employer_profiles` table (household size, number of children,
// monthly budget) so profile completeness works for BOTH roles. The maid side
// needs no DDL: `expected_salary` is an API-level rename of the existing
// `maid_profiles.wage_expectation` column (kept for rollback safety), and
// `languages` / `bio` already exist from v2.
//
// Run on the server with the app's Node:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v4.js

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

  try {
    if (await tableExists('employer_profiles')) {
      skip.push('CREATE TABLE employer_profiles (already exists)');
    } else {
      await conn.query(`
        CREATE TABLE employer_profiles (
          user_id BIGINT UNSIGNED PRIMARY KEY,
          household_size TINYINT UNSIGNED NULL COMMENT 'people living in the home, 1..30',
          num_children TINYINT UNSIGNED NULL COMMENT 'children at home, 0..20',
          budget_amount INT UNSIGNED NULL COMMENT 'KES per month offered',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_employer_profiles_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      done.push('CREATE TABLE employer_profiles');
    }
  } finally {
    console.log('[migrate_v4] done:', JSON.stringify(done));
    console.log('[migrate_v4] skipped:', JSON.stringify(skip));
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[migrate_v4] FAILED:', e.message);
  process.exit(1);
});
