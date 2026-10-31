// migrate_v10_job_boost.js — JOB BOOST (owner request 2026-11-01):
//   "lets introduce job boost so it can feature on maids homescreen"
//
//   • jobs.boosted_until   — Job Boost (KES 99 / 7 days — placement parity
//     with profile_boost; owner can reprice in payment_purposes anytime
//     without a release). Drives the FEATURED JOBS rail on the househelp
//     home + boosted-first ordering in the jobs feed.
//   • payment_purposes     — job_boost slot (employer audience), guarded
//     INSERT so re-runs never duplicate or stomp an owner-edited price.
//   • Demo sugar           — features up to 2 existing demo jobs so the
//     Featured Jobs rail has content on day one. Guarded: only rows whose
//     boosted_until IS NULL, only @demo.maidora.co.ke employers.
//
// Placement logic (Initial_app_deliberations §9/§11.1): "placement is not
// purchasable any other way" — boosts are the ONLY paid placement; everything
// else (verified badge, freshness) is earned. Job boost mirrors the profile
// boost mechanics exactly (7-day window, GREATEST stacking).
//
// Idempotent: every step checks information_schema / row existence first.
// Run on the live DB:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v10_job_boost.js
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
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
    [index]
  );
  return rows[0].n > 0;
}

const STEPS = [
  {
    name: 'jobs.boosted_until',
    run: async () => {
      if (!(await columnExists('jobs', 'boosted_until'))) {
        await pool.query(
          "ALTER TABLE jobs ADD COLUMN boosted_until DATETIME NULL COMMENT 'Job Boost active until (KES 99/7d — featured on househelp home)'"
        );
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: 'INDEX jobs idx_job_boost',
    run: async () => {
      if (!(await indexExists('jobs', 'idx_job_boost'))) {
        await pool.query('ALTER TABLE jobs ADD INDEX idx_job_boost (boosted_until)');
        return 'added';
      }
      return 'exists';
    },
  },
  {
    name: "payment_purposes ← job_boost (KES 99, employer, active)",
    run: async () => {
      const [[row]] = await pool.query(
        "SELECT code, amount_kes, is_active FROM payment_purposes WHERE code = 'job_boost'"
      );
      if (!row) {
        await pool.query(
          `INSERT INTO payment_purposes
             (code, label, description, amount_kes, audience, stk_ref, stk_desc, is_active, sort_order)
           VALUES ('job_boost', 'Job boost',
                   'Your job leads Featured Jobs and the feed for 7 days',
                   99, 'employer', 'JOBBOOST', 'Job boost', 1, 85)`
        );
        return 'inserted (99 / employer / active)';
      }
      // Exists but INACTIVE (should not happen) — activate, never reprice.
      if (!row.is_active) {
        await pool.query("UPDATE payment_purposes SET is_active = 1 WHERE code = 'job_boost'");
        return 'reactivated (price untouched)';
      }
      return `exists (KES ${row.amount_kes}, active — untouched)`;
    },
  },
  {
    name: 'demo featured jobs (≤2 @demo.maidora.co.ke postings)',
    run: async () => {
      // Single-table UPDATE (subquery, not JOIN — MySQL forbids
      // ORDER BY/LIMIT on a multi-table UPDATE).
      const [res] = await pool.query(
        `UPDATE jobs
         SET boosted_until = NOW() + INTERVAL 7 DAY
         WHERE status = 'open' AND boosted_until IS NULL
           AND employer_id IN
               (SELECT id FROM users WHERE email LIKE '%@demo.maidora.co.ke')
         ORDER BY created_at DESC
         LIMIT 2`
      );
      return `${res.affectedRows} demo job(s) featured for 7 days`;
    },
  },
];

(async () => {
  try {
    await pool.query('SELECT 1');
    for (const step of STEPS) {
      const result = await step.run();
      console.log(`[migrate_v10] ${step.name}: ${result}`);
    }
    console.log('[migrate_v10] done — job boost schema is current.');
    process.exit(0);
  } catch (e) {
    console.error('[migrate_v10] FAILED:', e.message);
    process.exit(1);
  }
})();
