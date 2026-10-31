// Boosts — §15.5 entitlements (profile boost + application boost + job boost).
//
// A PAID payment row IS the entitlement:
//   • profile_boost (KES 99 / 7d)   — POST /boosts/profile consumes the newest
//     unconsumed success row and extends maid_profiles.boosted_until by
//     7 days (stacking past the current expiry — "7 days rotating top-of-feed").
//   • application_boost (KES 30)    — POST /boosts/applications/:id consumes
//     one banked row and stamps job_applications.boosted_at = NOW(), which
//     pins that application to the TOP of the employer's list (§15.5
//     "top-3 highlighted slot") with a Boosted badge.
//   • job_boost (KES 99 / 7d)       — POST /boosts/jobs/:id consumes one
//     banked row and extends jobs.boosted_until by 7 days (GREATEST stacking,
//     same mechanics as profile boost) → the job leads the jobs feed AND the
//     FEATURED JOBS rail on the househelp home. Owner request 2026-11-01.
//
// No unconsumed success row → 402 paywall_required { purpose } so the app can
// route straight into the M-Pesa PaymentScreen. Payment rows are consumed
// atomically (UPDATE ... WHERE consumed_at IS NULL) — a double-tap can never
// spend one row twice.
//
//   GET  /api/boosts/status              → househelp: { profileBoostedUntil,
//                                            profileBoostsBanked,
//                                            applicationBoostsBanked }
//                                          employer: { jobBoostsBanked }
//   POST /api/boosts/profile             → { boostedUntil }
//   POST /api/boosts/applications/:id    → { boostedAt }
//   POST /api/boosts/jobs/:id            → { boostedUntil }
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

const PROFILE_BOOST_DAYS = 7; // §15.5 — profile boost KSh 99 (7 days)
const JOB_BOOST_DAYS = 7;     // §15.5 — job boost KSh 99 (7 days, placement parity)

// Atomic take: newest unconsumed success payment of `purpose` for this user.
// Returns the row id, or null when nothing is banked.
async function consumeEntitlement(uid, purpose) {
  const [[row]] = await pool.query(
    `SELECT id FROM payments
     WHERE user_id = ? AND purpose = ? AND status = 'success' AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [uid, purpose]
  );
  if (!row) return null;
  const [upd] = await pool.query(
    'UPDATE payments SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL',
    [row.id]
  );
  return upd.affectedRows ? row.id : null;
}

async function bankedCount(uid, purpose) {
  const [[{ n }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM payments
     WHERE user_id = ? AND purpose = ? AND status = 'success' AND consumed_at IS NULL`,
    [uid, purpose]
  );
  return Number(n);
}

// GET /api/boosts/status — what the caller has banked / active right now.
// Role-aware: househelp get the profile/application view, employers get the
// job-boost bank (used by My Jobs "Boost" buttons).
router.get('/status', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role === 'employer') {
      const jobBoosts = await bankedCount(req.user.uid, 'job_boost');
      return res.json({ jobBoostsBanked: jobBoosts });
    }
    if (req.user.role !== 'househelp') {
      return res.status(403).json({ message: 'Boosts are for househelp profiles.' });
    }
    const [[profile]] = await pool.query(
      'SELECT boosted_until FROM maid_profiles WHERE user_id = ?',
      [req.user.uid]
    );
    const [profileBoosts, applicationBoosts] = await Promise.all([
      bankedCount(req.user.uid, 'profile_boost'),
      bankedCount(req.user.uid, 'application_boost'),
    ]);
    res.json({
      profileBoostedUntil: profile?.boosted_until || null,
      profileBoostActive: !!profile?.boosted_until && new Date(profile.boosted_until) > new Date(),
      profileBoostsBanked: profileBoosts,
      applicationBoostsBanked: applicationBoosts,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/boosts/profile — consume one profile_boost payment, extend the
// featured window by 7 days from NOW() or the current expiry (whichever is
// later), so multiple purchases stack instead of truncating.
router.post('/profile', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'househelp') {
      return res.status(403).json({ message: 'Boosts are for househelp profiles.' });
    }
    const paymentId = await consumeEntitlement(req.user.uid, 'profile_boost');
    if (!paymentId) {
      return res.status(402).json({
        code: 'paywall_required',
        purpose: 'profile_boost',
        message: 'No profile boost on file — buy one via M-Pesa to get featured for 7 days.',
      });
    }
    await pool.query(
      `UPDATE maid_profiles
       SET boosted_until = GREATEST(COALESCE(boosted_until, NOW()), NOW()) + INTERVAL ${PROFILE_BOOST_DAYS} DAY
       WHERE user_id = ?`,
      [req.user.uid]
    );
    const [[{ boosted_until }]] = await pool.query(
      'SELECT boosted_until FROM maid_profiles WHERE user_id = ?',
      [req.user.uid]
    );
    console.error(`[BOOST] profile boosted for ${req.user.uid} until ${boosted_until} (payment #${paymentId})`);
    res.json({ message: 'Profile boost active — you are featured for 7 days.', boostedUntil: boosted_until, paymentId });
  } catch (e) {
    next(e);
  }
});

// POST /api/boosts/jobs/:id — spend one job_boost on MY open job:
// boosted_until = GREATEST(current, NOW()) + 7d → leads the feed + the
// househelp-home FEATURED JOBS rail. Mirrors POST /boosts/profile exactly.
router.post('/jobs/:id', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Only employer accounts can boost jobs.' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job id.' });

    const [[job]] = await pool.query(
      'SELECT id, status, boosted_until FROM jobs WHERE id = ? AND employer_id = ? LIMIT 1',
      [id, req.user.uid]
    );
    if (!job) return res.status(404).json({ message: 'Job not found among your postings.' });
    if (job.status !== 'open') {
      return res.status(409).json({ message: 'Reopen the job before boosting it.' });
    }

    const paymentId = await consumeEntitlement(req.user.uid, 'job_boost');
    if (!paymentId) {
      return res.status(402).json({
        code: 'paywall_required',
        purpose: 'job_boost',
        message: 'No job boost on file — buy one via M-Pesa to feature this job for 7 days.',
      });
    }
    await pool.query(
      `UPDATE jobs
       SET boosted_until = GREATEST(COALESCE(boosted_until, NOW()), NOW()) + INTERVAL ${JOB_BOOST_DAYS} DAY
       WHERE id = ?`,
      [id]
    );
    const [[{ boosted_until }]] = await pool.query(
      'SELECT boosted_until FROM jobs WHERE id = ?',
      [id]
    );
    console.error(`[BOOST] job #${id} boosted for ${req.user.uid} until ${boosted_until} (payment #${paymentId})`);
    res.json({ message: 'Job boost active — this job is featured for 7 days.', boostedUntil: boosted_until, paymentId });
  } catch (e) {
    next(e);
  }
});

// POST /api/boosts/applications/:id — spend one application_boost on MY
// pending application: boosted_at = NOW() → pinned at the top of the
// employer's applicant list.
router.post('/applications/:id', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'househelp') {
      return res.status(403).json({ message: 'Only househelp can boost applications.' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid application id.' });

    const [[app]] = await pool.query(
      'SELECT id, status, boosted_at FROM job_applications WHERE id = ? AND maid_id = ? LIMIT 1',
      [id, req.user.uid]
    );
    if (!app) return res.status(404).json({ message: 'Application not found.' });
    if (app.status !== 'pending') {
      return res.status(409).json({ message: 'Only a pending application can be boosted.' });
    }
    if (app.boosted_at) {
      return res.status(409).json({ code: 'already_boosted', message: 'This application is already boosted.' });
    }

    const paymentId = await consumeEntitlement(req.user.uid, 'application_boost');
    if (!paymentId) {
      return res.status(402).json({
        code: 'paywall_required',
        purpose: 'application_boost',
        message: 'No application boost on file — buy one via M-Pesa to jump to the top.',
      });
    }
    await pool.query('UPDATE job_applications SET boosted_at = NOW() WHERE id = ?', [id]);
    console.error(`[BOOST] application #${id} boosted (payment #${paymentId}) by ${req.user.uid}`);
    res.json({ message: 'Application boosted — it now sits at the top of the list.', boostedAt: new Date(), paymentId });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
