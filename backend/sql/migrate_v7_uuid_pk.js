// Maidora schema migration v6 → v7 — users.id BECOMES the UUID (owner
// request 2026-10-31: "user id and its reference in (fk) should refer to the
// uuid... so user id is now uuid").
//
// Supersedes migrate_v6 (which only ADDED a users.uuid column next to the
// BIGINT id). Here the BIGINT AUTO_INCREMENT id is converted to CHAR(36)
// holding the v4 UUID, and EVERY child user_id column follows:
//   phone_otps, email_otps, media_assets, payments  (FK → users(id))
//   maid_profiles, employer_profiles                (user_id IS the PK, FK)
//   login_attempts                                  (plain column, no FK by design)
//
// The other tables' own BIGINT id PKs are KEPT — they identify rows within
// their own table (payment #67, OTP attempt #73, M-Pesa callback matching,
// ORDER BY id DESC cursors) and have nothing to do with user identity.
// Their AUTO_INCREMENT counters are reset to 1 (owner: "should reset to 1";
// they had drifted to 60-74 because DELETE never rewinds the counter).
//
// Row preservation: existing users keep their accounts. A user's new id is
// its existing migrate_v6 uuid when present, else a fresh crypto.randomUUID().
// Child rows are re-pointed through a captured old→new mapping BEFORE the
// FKs are rebuilt. login_attempts is TRUNCATED (throttle-transient data —
// the 2 rows were today's failed attempts; per-account/IP cooldown windows
// are minutes-to-hours, nothing durable is lost). phone_otps/email_otps are
// TRUNCATED too (all rows expired/consumed; any OTP hash was computed with
// the OLD numeric id and could never verify after re-identity anyway).
//
// Idempotent: if users.id is already CHAR(36) the run verifies the FK map
// and exits without changing anything.
//
// Run on the server with the app's node (BEFORE the restart; run twice per
// deploy like v6 — pass 2 catches rows the old process wrote in between):
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v7_uuid_pk.js

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

// Children with an FK to users(id): [table, column, constraint, nullable]
// Constraint names are read live from INFORMATION_SCHEMA (the `constraint`
// field here is only the expected/default name for the report).
const FK_CHILDREN = [
  ['phone_otps', 'user_id', 'fk_otps_user', false],
  ['email_otps', 'user_id', 'fk_email_otps_user', false],
  ['media_assets', 'user_id', 'fk_media_user', false],
  ['payments', 'user_id', 'fk_payments_user', false],
  ['maid_profiles', 'user_id', 'fk_maid_profiles_user', false],
  ['employer_profiles', 'user_id', 'fk_employer_profiles_user', false],
];

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

  try {
    // ── 0. already converted? ────────────────────────────────────────────
    const [[idCol]] = await conn.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'`
    );
    if (String(idCol.DATA_TYPE).toLowerCase() === 'char') {
      console.log('[migrate_v7] users.id is already CHAR — converted (nothing to do).');
      await verify(conn);
      return;
    }

    // ── 1. capture the old→new identity map ──────────────────────────────
    const [users] = await conn.query('SELECT id, uuid FROM users ORDER BY id');
    const map = users.map((u) => ({
      old: String(u.id),
      fresh: u.uuid || crypto.randomUUID(), // reuse the v6 uuid when present
    }));
    console.log(`[migrate_v7] identity map: ${map.length} user(s) → ${map.map((m) => m.fresh.slice(0, 8) + '…').join(', ')}`);

    // ── 2. transient tables reset to 1 (owner: "or should reset to 1") ───
    for (const t of ['phone_otps', 'email_otps', 'login_attempts']) {
      await conn.query(`TRUNCATE TABLE ${t}`);
      await conn.query(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
      done.push(`TRUNCATE+reset ${t}`);
    }

    // ── 3. drop the FKs that reference users(id) ─────────────────────────
    const [fks] = await conn.query(
      `SELECT TABLE_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users'
         AND REFERENCED_COLUMN_NAME = 'id'`
    );
    for (const fk of fks) {
      await conn.query(`ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
      done.push(`DROP FK ${fk.CONSTRAINT_NAME} (${fk.TABLE_NAME})`);
    }

    // ── 4. widen children + re-point values ──────────────────────────────
    for (const [table, col] of FK_CHILDREN) {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY \`${col}\` CHAR(36) NOT NULL`);
      for (const m of map) {
        await conn.query(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`, [m.fresh, m.old]);
      }
      done.push(`WIDEN ${table}.${col} + re-point`);
    }
    // login_attempts.user_id has NO FK — widen only (nullable).
    await conn.query('ALTER TABLE login_attempts MODIFY user_id CHAR(36) NULL');
    done.push('WIDEN login_attempts.user_id (nullable, no FK)');

    // ── 5. users.id → CHAR(36) PK, values → uuids, drop the v6 uuid col ──
    // MODIFY drops the AUTO_INCREMENT attribute in the same statement (the
    // PK stays on the column through the type change; values coerce to
    // strings), then rows are re-identified from the captured map.
    await conn.query('ALTER TABLE users MODIFY id CHAR(36) NOT NULL');
    await conn.query('ALTER TABLE users DROP INDEX uk_users_uuid');
    for (const m of map) {
      await conn.query('UPDATE users SET id = ? WHERE id = ?', [m.fresh, m.old]);
    }
    await conn.query('ALTER TABLE users DROP COLUMN uuid');
    await conn.query("ALTER TABLE users COMMENT = 'id IS the v4 UUID (migrate_v7)'");
    done.push('users.id → CHAR(36) PK (UUID values) + drop uuid col');

    // ── 6. rebuild the FKs against the new users.id ──────────────────────
    for (const [table, col, name] of FK_CHILDREN) {
      await conn.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
         FOREIGN KEY (\`${col}\`) REFERENCES users(id) ON DELETE CASCADE`
      );
      done.push(`RE-ADD FK ${name}`);
    }

    // ── 7. reset remaining child AUTO_INCREMENT counters to 1 ────────────
    for (const t of ['payments', 'media_assets']) {
      await conn.query(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
      done.push(`reset ${t} AUTO_INCREMENT=1`);
    }

    await verify(conn);
  } finally {
    console.log('[migrate_v7] done:', JSON.stringify(done));
    console.log('[migrate_v7] skipped:', JSON.stringify(skip));
    await conn.end();
  }
}

async function verify(conn) {
  const [[u]] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'`
  );
  const [[cnt]] = await conn.query('SELECT COUNT(*) AS n FROM users');
  const [fk] = await conn.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users'`
  );
  console.log(`[migrate_v7] VERIFY users.id ${u.COLUMN_TYPE}, users rows=${cnt.n}, FKs→users=${fk.length}`);
  if (fk.length !== 6) {
    console.log('[migrate_v7] WARNING: expected 6 FKs referencing users — list:', JSON.stringify(fk));
  }
  for (const t of ['phone_otps', 'email_otps', 'login_attempts', 'payments', 'media_assets']) {
    const [[auto]] = await conn.query(
      `SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [t]
    );
    console.log(`[migrate_v7] VERIFY ${t}: AUTO_INCREMENT=${auto.AUTO_INCREMENT ?? 1}`);
  }
}

main().catch((e) => {
  console.error('[migrate_v7] FAILED:', e.message);
  process.exit(1);
});
