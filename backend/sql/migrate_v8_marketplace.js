// migrate_v8_marketplace.js — marketplace tables: jobs, applications, chat.
// Idempotent (CREATE TABLE IF NOT EXISTS). Run once on the live DB:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/migrate_v8_marketplace.js
//
// Spec anchors:
//   §9  — job applications + 2-lifetime-free paywall (count derived, no column)
//   §10 — visibility decay reads users.last_active_at (no storage here)
//   §15.1 — browse/search is read-only (requireAuth); apply/post/chat-start
//           are gated by requireVerified in the routes.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');

const DDL = [
  // ─── Jobs — employer listings (§9 needs them before applications) ──────────
  `CREATE TABLE IF NOT EXISTS jobs (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── Applications — §9: 2 lifetime free (withdrawn/rejected still consume),
  // then paywall. The consumed count is COUNT(*) per maid — no credits column.
  `CREATE TABLE IF NOT EXISTS job_applications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id BIGINT UNSIGNED NOT NULL,
    maid_id CHAR(36) NOT NULL,
    message VARCHAR(500) NULL,
    status ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_job_maid (job_id, maid_id),
    INDEX idx_app_maid (maid_id, status),
    CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_maid FOREIGN KEY (maid_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── Chat threads — one per employer↔househelp pair. The pair is stored
  // ORDERED (lexically smaller uuid first) so find-or-create hits the UNIQUE
  // key without needing OR comparisons.
  `CREATE TABLE IF NOT EXISTS chat_threads (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ─── Chat messages — plain text, polling-based (no websockets on cPanel).
  // read_at is bulk-stamped when the peer opens the thread.
  `CREATE TABLE IF NOT EXISTS chat_messages (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

(async () => {
  try {
    await pool.query('SELECT 1');
    for (const ddl of DDL) {
      await pool.query(ddl);
      const table = ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
      console.log(`[migrate_v8] ok: ${table}`);
    }
    console.log('[migrate_v8] done — marketplace schema is current.');
    process.exit(0);
  } catch (e) {
    console.error('[migrate_v8] FAILED:', e.message);
    process.exit(1);
  }
})();
