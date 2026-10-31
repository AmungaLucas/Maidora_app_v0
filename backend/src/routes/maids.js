// Maid discovery — search, filters, §10 visibility decay (unified spec).
//
//   GET /api/maids        browse + search (requireAuth — read-only scope §15.1)
//   GET /api/maids/:id    public profile of one househelp (no contact details —
//                         phone/chat only through the verified, gated flows)
//
// §10 decay (driven by users.last_active_at):
//   0–13d  Active   — normal, ranked first
//   14–29d Quiet    — fully visible, ranked below Active within a tier
//   30–59d Dormant  — EXCLUDED from default browse; findable only when a
//                     search term (q) is present, with a label
//   60+    Archived — never in browse/search (threads/applications stay live)
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];
const JOB_TYPE_LABELS = { live_in: 'Live-in', live_out: 'Live-out', day_burg: 'Day burg' };

function lastActiveLabel(days) {
  if (days === null || days === undefined) return 'New here';
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 14) return `Active ${days} days ago`;
  if (days < 30) return 'Last active 2 weeks ago';
  if (days < 60) return 'Last active a while ago';
  return 'Archived';
}

// Shared SELECT for list + detail. NEVER exposes contact details or next of
// kin — those move through gated chat/application flows only.
const SELECT_COLUMNS = `
  u.id AS user_id, u.full_name, u.avatar_url, u.location_county, u.location_area,
  u.location_name, u.last_active_at, u.kyc_status, u.created_at,
  mp.date_of_birth, mp.gender, mp.languages, mp.job_type, mp.years_experience,
  mp.wage_expectation, mp.bio, TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) AS days_idle
`;

function shapeMaid(r, { detailed = false } = {}) {
  const age = r.date_of_birth
    ? Math.floor((Date.now() - new Date(r.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  return {
    id: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url || null,
    locationCounty: r.location_county || null,
    locationArea: r.location_area || null,
    locationName: r.location_name || null,
    trustBadge: r.kyc_status === 'approved',
    kycStatus: r.kyc_status || 'not_started',
    languages: r.languages ? (typeof r.languages === 'string' ? JSON.parse(r.languages) : r.languages) : [],
    jobType: r.job_type || null,
    jobTypeLabel: JOB_TYPE_LABELS[r.job_type] || null,
    yearsExperience: r.years_experience === null || r.years_experience === undefined ? null : Number(r.years_experience),
    expectedSalary: r.wage_expectation === null || r.wage_expectation === undefined ? null : Number(r.wage_expectation),
    bio: detailed ? r.bio || null : r.bio ? String(r.bio).slice(0, 120) : null,
    age,
    gender: r.gender || null,
    // §10 + §4.3 — employer-facing "last seen" uses last_active_at
    lastActiveDays: r.days_idle === null ? null : Number(r.days_idle),
    lastActiveLabel: lastActiveLabel(r.days_idle === null ? null : Number(r.days_idle)),
    memberSince: r.created_at ? String(r.created_at).slice(0, 10) : null,
  };
}

// GET /api/maids?q=&county=&job_type=&min_experience=&max_salary=&verified=1
//               &include_dormant=0&page=1&per_page=12
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const county = String(req.query.county || '').trim().slice(0, 120);
    const jobType = String(req.query.job_type || '').trim();
    const minExp = parseInt(req.query.min_experience, 10);
    const maxSalary = parseInt(req.query.max_salary, 10);
    const verifiedOnly = req.query.verified === '1';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(24, Math.max(1, parseInt(req.query.per_page, 10) || 12));

    const where = [
      "u.role = 'househelp'",
      "u.account_status = 'active'",
      // §10 archived (60d+) never appears anywhere.
      '(u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 60 DAY))',
    ];
    const params = [];

    // §10 dormant (30–59d) — only when the caller is actually SEARCHING.
    if (q) {
      where.push('(u.full_name LIKE ? OR mp.bio LIKE ? OR mp.languages LIKE ? OR u.location_area LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    } else {
      where.push('(u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 30 DAY))');
    }

    if (county) {
      where.push('u.location_county = ?');
      params.push(county);
    }
    if (JOB_TYPES.includes(jobType)) {
      where.push('mp.job_type = ?');
      params.push(jobType);
    }
    if (Number.isInteger(minExp) && minExp > 0) {
      where.push('mp.years_experience >= ?');
      params.push(minExp);
    }
    if (Number.isInteger(maxSalary) && maxSalary > 0) {
      where.push('mp.wage_expectation IS NOT NULL AND mp.wage_expectation <= ?');
      params.push(maxSalary);
    }
    if (verifiedOnly) {
      where.push("u.kyc_status = 'approved'");
    }

    const whereSql = where.join(' AND ');
    // §10 ranking: Active maids first, most-recently-active within each tier.
    const orderSql =
      'ORDER BY (u.last_active_at IS NOT NULL AND u.last_active_at > (NOW() - INTERVAL 14 DAY)) DESC, u.last_active_at DESC';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    // Counties actually present in THIS result — the app renders them as
    // filter chips, so the list never offers a county with no maids behind it.
    let counties = [];
    if (page === 1) {
      [counties] = await pool.query(
        `SELECT DISTINCT u.location_county AS county
         FROM users u
         WHERE u.role = 'househelp' AND u.account_status = 'active'
           AND u.location_county IS NOT NULL AND u.location_county != ''
           AND (u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 60 DAY))
         ORDER BY county LIMIT 30`
      );
      counties = counties.map((r) => r.county);
    }

    res.json({
      maids: rows.map((r) => shapeMaid(r)),
      page,
      perPage,
      total,
      hasMore: page * perPage < total,
      counties,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/maids/:id — public profile (direct links/threads stay live for
// dormant/archived maids per §10; only deleted/suspended accounts 404).
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return res.status(400).json({ message: 'Invalid profile id.' });

    const [[row]] = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE u.id = ? AND u.role = 'househelp' AND u.account_status IN ('active')`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'This profile is not available.' });

    res.json({ maid: shapeMaid(row, { detailed: true }) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
