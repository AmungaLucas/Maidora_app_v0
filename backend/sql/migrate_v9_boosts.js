// migrate_v9_boosts.js — §15.5 boost entitlements (first slice):
//   • maid_profiles.boosted_until   — Profile Boost (KES 99 / 7 days,
//     "rotating top-of-feed") → drives the FEATURED rails + ranking.
//   • job_applications.boosted_at   — Application Boost (KES 30,
//     "top-3 highlighted slot") → pinned to the TOP of the employer's
//     application list, with a badge.
//   • payments.consumed_at          — a paid product-slot payment row doubles
//     as an ENTITLEMENT (profile_boost = activates immediately on activation
//     call; application_boost = banked until spent on one application).
//     consumed_at marks the row spent so it can never be replayed.
//
// Idempotent: every ALTER checks information_schema first. Run once on the
// live DB:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v9_boosts.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function indexExists(table, index) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return rows[0].n > 0;
}

const STEPS = [
  {
    name: 'maid_profiles.boosted_until',
    run: async () => {
      if (!(await columnExists('maid_profiles', 'boosted_until'))) {
        await pool.query(
          'ALTER TABLE maid_profiles ADD COLUMN boosted_until DATETIME NULL COMMENT \'Profile Boost active until (KES 99/7d — §15.5 featured placement)\''
        );
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'INDEX maid_profiles idx_maid_boost',
    run: async () => {
      if (!(await indexExists('maid_profiles', 'idx_maid_boost'))) {
        await pool.query('ALTER TABLE maid_profiles ADD INDEX idx_maid_boost (boosted_until)');
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'job_applications.boosted_at',
    run: async () => {
      if (!(await columnExists('job_applications', 'boosted_at'))) {
        await pool.query(
          'ALTER TABLE job_applications ADD COLUMN boosted_at DATETIME NULL COMMENT \'Application Boost applied at (KES 30 — §15.5 top slot)\''
        );
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'INDEX job_applications idx_app_boost',
    run: async () => {
      if (!(await indexExists('job_applications', 'idx_app_boost'))) {
        await pool.query('ALTER TABLE job_applications ADD INDEX idx_app_boost (boosted_at)');
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'payments.consumed_at',
    run: async () => {
      if (!(await columnExists('payments', 'consumed_at'))) {
        await pool.query(
          'ALTER TABLE payments ADD COLUMN consumed_at DATETIME NULL COMMENT \'Entitlement spent (application_boost → one application; §10)\''
        );
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'INDEX payments idx_payments_entitlement',
    run: async () => {
      if (!(await indexExists('payments', 'idx_payments_entitlement'))) {
        await pool.query(
          "ALTER TABLE payments ADD INDEX idx_payments_entitlement (user_id, purpose, status, consumed_at)"
        );
        return 'added';
      }
      return 'exists';
    },
  },
  // ── §15.5 FINAL pricing lands (MPS Amendment v3.2): profile boost 99,
  // application boost 30 + ACTIVATED (v5 seeded both provisional: 100 and
  // an INACTIVE 50). Guarded: only rows still carrying the provisional
  // values are touched — a price the owner edited live is NEVER stomped
  // (the pricing table is admin-editable without a release, migrate_v5).
  {
    name: 'payment_purposes §15.5 final pricing (profile_boost 99, application_boost 30 active)',
    run: async () => {
      const [p] = await pool.query(
        "UPDATE payment_purposes SET amount_kes = 99, description = 'Featured placement — top of search, home rails and feed for 7 days' WHERE code = 'profile_boost' AND amount_kes = 100"
      );
      const [a] = await pool.query(
        "UPDATE payment_purposes SET amount_kes = 30, is_active = 1, description = 'Your application jumps to the top of the household\\'s list' WHERE code = 'application_boost' AND amount_kes = 50 AND is_active = 0"
      );
      return `profile_boost ${p.affectedRows} row(s) → 99 · application_boost ${a.affectedRows} row(s) → 30 + active`;
    },
  },
];

(async () => {
  try {
    await pool.query('SELECT 1');
    for (const step of STEPS) {
      const result = await step.run();
      console.log(`[migrate_v9] ${step.name}: ${result}`);
    }
    console.log('[migrate_v9] done — boost entitlements schema is current.');
    process.exit(0);
  } catch (e) {
    console.error('[migrate_v9] FAILED:', e.message);
    process.exit(1);
  }
})();
