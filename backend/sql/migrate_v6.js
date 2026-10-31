// Maidora schema migration v5 → v6 — users.uuid (owner request 2026-10-31:
// "for user id we need to setup uuid at signup").
//
// What it does (idempotent — safe to run repeatedly):
//   1. ADD COLUMN users.uuid CHAR(36) NULL after id — the PUBLIC user
//      identifier (non-enumerable, safe to print on receipts/reports/URLs),
//      generated at signup by the register route (crypto.randomUUID(), v4).
//   2. BACKFILL every existing row with a random v4 UUID — generated HERE in
//      Node (not MySQL UUID(), which is v1/MAC-based) so historical users get
//      the same randomness quality as new signups.
//   3. ADD UNIQUE index uk_users_uuid.
//
// WHY THE COLUMN STAYS NULLABLE (deliberate): on the live host the OLD node
// process keeps serving until tmp/restart.txt flips it, and the old
// INSERT INTO users (...) does not know the uuid column — if we enforced
// NOT NULL in the same pass, every registration in the upload→restart window
// would 500. The deploy runs this script BEFORE and AGAIN AFTER the restart:
// the second pass backfills any rows the old process created with NULL.
// Register has set uuid on every insert since v6 ships, so NULLs never
// occur in steady state.
//
// The internal BIGINT id is UNTOUCHED: it stays the PRIMARY KEY, the JWT
// `uid` claim, and every FK (phone_otps, email_otps, maid_profiles,
// employer_profiles, payments, media_assets, login_attempts) keeps working —
// converting a live PK to CHAR(36) would mean rewriting every FK table for
// zero functional gain. Consumers who need a user identifier use `uuid`.
//
// Run on the server with the app's Node (twice per deploy, see above):
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v6.js

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
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

  async function columnExists(table, column) {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows.length > 0;
  }

  async function uniqueIndexExists(table, index) {
    const [rows] = await conn.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, index]
    );
    return rows.length > 0;
  }

  try {
    // ── 1. the column ─────────────────────────────────────────────────────
    if (await columnExists('users', 'uuid')) {
      skip.push('ADD COLUMN users.uuid (already exists)');
    } else {
      await conn.query(
        "ALTER TABLE users ADD COLUMN uuid CHAR(36) NULL COMMENT 'public v4 UUID identifier, set at signup (migrate_v6)' AFTER id"
      );
      done.push('ADD COLUMN users.uuid');
    }

    // ── 2. backfill (v4 UUIDs, Node-generated) ────────────────────────────
    const [missing] = await conn.query('SELECT id FROM users WHERE uuid IS NULL ORDER BY id');
    if (missing.length) {
      for (const row of missing) {
        await conn.query('UPDATE users SET uuid = ? WHERE id = ? AND uuid IS NULL', [
          crypto.randomUUID(),
          row.id,
        ]);
      }
      done.push(`BACKFILL users.uuid (${missing.length} rows)`);
    } else {
      skip.push('BACKFILL users.uuid (no NULL rows)');
    }

    // ── 3. uniqueness ─────────────────────────────────────────────────────
    if (await uniqueIndexExists('users', 'uk_users_uuid')) {
      skip.push('ADD UNIQUE uk_users_uuid (already exists)');
    } else {
      await conn.query('ALTER TABLE users ADD UNIQUE KEY uk_users_uuid (uuid)');
      done.push('ADD UNIQUE uk_users_uuid');
    }

    // ── verify ────────────────────────────────────────────────────────────
    const [[stats]] = await conn.query(
      `SELECT COUNT(*) AS total,
              SUM(uuid IS NULL) AS nulls,
              COUNT(DISTINCT uuid) AS distinct_uuids
         FROM users`
    );
    console.log(
      `[migrate_v6] users: total=${stats.total} nulls=${stats.nulls} distinct_uuids=${stats.distinct_uuids}`
    );
    if (Number(stats.nulls) > 0) {
      console.log('[migrate_v6] WARNING: NULL uuids remain — re-run after restart');
    }
  } finally {
    console.log('[migrate_v6] done:', JSON.stringify(done));
    console.log('[migrate_v6] skipped:', JSON.stringify(skip));
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[migrate_v6] FAILED:', e.message);
  process.exit(1);
});
