// Applications — unified spec §9 (free applications & paywall) — own router
// mounted at /api/applications (these handlers must NOT share jobs.js: two
// GET "/" handlers on one router would shadow each other).
//
//   GET   /api/applications      role-aware list (maid: mine + credits left ·
//                                employer: incoming across my jobs)
//   PATCH /api/applications/:id  employer accept|reject · maid withdraw
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const JOB_TYPE_LABELS = { live_in: 'Live-in', live_out: 'Live-out', day_burg: 'Day burg' };
const WELCOME_FREE_APPLICATIONS = 2; // §9 — lifetime; withdrawn/rejected consume too

// GET /api/applications — role-aware.
//   househelp → my applications (+job +employer summary + credits left)
//   employer  → incoming applications across my jobs
router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'househelp') {
      const [rows] = await pool.query(
        `SELECT a.id, a.status, a.message, a.created_at, a.job_id, a.boosted_at,
                j.title, j.job_type, j.county, j.area, j.salary_amount, j.status AS job_status,
                u.full_name AS employer_name, u.avatar_url AS employer_avatar, u.kyc_status AS employer_kyc, u.id AS employer_id
         FROM job_applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN users u ON u.id = j.employer_id
         WHERE a.maid_id = ?
         ORDER BY (a.boosted_at IS NOT NULL) DESC, a.boosted_at DESC, a.created_at DESC
         LIMIT 100`,
        [req.user.uid]
      );
      const [[{ used }]] = await pool.query(
        'SELECT COUNT(*) AS used FROM job_applications WHERE maid_id = ?',
        [req.user.uid]
      );
      // §15.5 — banked (paid, unconsumed) application boosts the maid can
      // spend from this screen; the app shows the Boost button only when > 0.
      const [[{ banked }]] = await pool.query(
        `SELECT COUNT(*) AS banked FROM payments
         WHERE user_id = ? AND purpose = 'application_boost' AND status = 'success' AND consumed_at IS NULL`,
        [req.user.uid]
      );
      const applications = rows.map((r) => ({
        id: Number(r.id),
        status: r.status,
        message: r.message || null,
        createdAt: r.created_at,
        creditsLeftAfter: null,
        // §15.5 — application boost (KES 30): this application is pinned to
        // the top of the employer's list.
        boosted: !!r.boosted_at,
        boostedAt: r.boosted_at || null,
        job: {
          id: Number(r.job_id),
          title: r.title,
          jobType: r.job_type,
          jobTypeLabel: JOB_TYPE_LABELS[r.job_type] || null,
          county: r.county || null,
          area: r.area || null,
          salaryAmount: r.salary_amount === null ? null : Number(r.salary_amount),
          status: r.job_status,
          employer: {
            id: r.employer_id,
            fullName: r.employer_name,
            avatarUrl: r.employer_avatar || null,
            trustBadge: r.employer_kyc === 'approved',
          },
        },
      }));
      return res.json({
        applications,
        creditsLeft: Math.max(0, WELCOME_FREE_APPLICATIONS - Number(used)),
        freeTotal: WELCOME_FREE_APPLICATIONS,
        applicationBoostsBanked: Number(banked),
      });
    }
    if (req.user.role === 'employer') {
      // §15.5 — BOOSTED applications pin to the TOP of the owner's list
//       (boosted_at DESC), then the usual newest-first order.
      const [rows] = await pool.query(
        `SELECT a.id, a.status, a.message, a.created_at, a.job_id, a.maid_id, a.boosted_at,
                j.title, j.job_type, j.county, j.area, j.salary_amount, j.status AS job_status,
                u.full_name, u.avatar_url, u.kyc_status, u.location_county, u.location_area,
                mp.years_experience, mp.wage_expectation,
                TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) AS days_idle
         FROM job_applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN users u ON u.id = a.maid_id
         LEFT JOIN maid_profiles mp ON mp.user_id = a.maid_id
         WHERE j.employer_id = ?
         ORDER BY (a.boosted_at IS NOT NULL) DESC, a.boosted_at DESC, a.created_at DESC
         LIMIT 100`,
        [req.user.uid]
      );
      const applications = rows.map((r) => ({
        id: Number(r.id),
        status: r.status,
        message: r.message || null,
        createdAt: r.created_at,
        boosted: !!r.boosted_at,
        boostedAt: r.boosted_at || null,
        job: {
          id: Number(r.job_id),
          title: r.title,
          jobType: r.job_type,
          jobTypeLabel: JOB_TYPE_LABELS[r.job_type] || null,
          county: r.county || null,
          area: r.area || null,
          salaryAmount: r.salary_amount === null ? null : Number(r.salary_amount),
          status: r.job_status,
        },
        maid: {
          id: r.maid_id,
          fullName: r.full_name,
          avatarUrl: r.avatar_url || null,
          trustBadge: r.kyc_status === 'approved',
          locationCounty: r.location_county || null,
          locationArea: r.location_area || null,
          yearsExperience: r.years_experience === null ? null : Number(r.years_experience),
          expectedSalary: r.wage_expectation === null ? null : Number(r.wage_expectation),
        },
      }));
      return res.json({ applications });
    }
    return res.status(400).json({ message: 'Choose your role first.' });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/applications/:id — employer: accepted|rejected; maid: withdrawn.
// §9: a withdrawn/rejected application still consumed its free credit.
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String((req.body || {}).status || '');
    if (!id) return res.status(400).json({ message: 'Invalid application id.' });
    const [[app]] = await pool.query(
      `SELECT a.*, j.employer_id FROM job_applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? LIMIT 1`,
      [id]
    );
    if (!app) return res.status(404).json({ message: 'Application not found.' });

    if (req.user.role === 'employer') {
      if (app.employer_id !== req.user.uid) {
        return res.status(403).json({ message: 'This application is not for your job.' });
      }
      if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Employers can accept or reject an application.' });
      }
    } else if (req.user.role === 'househelp') {
      if (app.maid_id !== req.user.uid) {
        return res.status(403).json({ message: 'This is not your application.' });
      }
      if (status !== 'withdrawn') {
        return res.status(400).json({ message: 'You can withdraw your application.' });
      }
    } else {
      return res.status(400).json({ message: 'Choose your role first.' });
    }

    await pool.query('UPDATE job_applications SET status = ? WHERE id = ?', [status, id]);
    console.error(`[JOBS] application #${id} → ${status} (by ${req.user.role} ${req.user.uid})`);
    res.json({ message: `Application ${status}.`, status });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
