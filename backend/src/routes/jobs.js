// Jobs + applications — unified spec §9 (free applications & paywall), §5 gate.
//
//   POST   /api/jobs                     employer posts (requireVerified)
//   GET    /api/jobs                     househelp browse (open jobs; read-only
//                                        scope §15.1 — requireAuth, no gate)
//   GET    /api/jobs/mine                employer's own jobs + applicant counts
//   GET    /api/jobs/:id                 detail; the owner also receives the
//                                        applications with maid summaries
//   PATCH  /api/jobs/:id                 owner edits fields / closes|reopens
//   POST   /api/jobs/:id/apply           househelp applies — §9: 2 lifetime free,
//                                        withdrawn/rejected still consume, then
//                                        402 paywall_required
//   GET    /api/applications             role-aware list (mine / incoming)
//   PATCH  /api/applications/:id         employer accept|reject · maid withdraw
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];
const JOB_TYPE_LABELS = { live_in: 'Live-in', live_out: 'Live-out', day_burg: 'Day burg' };
const WELCOME_FREE_APPLICATIONS = 2; // §9 — lifetime; withdrawn/rejected consume too

function shapeJob(r) {
  return {
    id: Number(r.id),
    title: r.title,
    description: r.description,
    jobType: r.job_type,
    jobTypeLabel: JOB_TYPE_LABELS[r.job_type] || null,
    county: r.county || null,
    area: r.area || null,
    salaryAmount: r.salary_amount === null || r.salary_amount === undefined ? null : Number(r.salary_amount),
    status: r.status,
    createdAt: r.created_at,
    employer: r.employer_name
      ? {
          id: r.employer_id,
          fullName: r.employer_name,
          avatarUrl: r.employer_avatar || null,
          trustBadge: r.employer_kyc === 'approved',
        }
      : null,
    applicantCount: r.applicant_count === undefined ? undefined : Number(r.applicant_count),
    myApplicationStatus: r.my_application_status || null,
  };
}

// Column list shared by the job SELECTs (applicants + employer identity joined
// by the caller; `me` param adds the caller's own application status).
function baseSelect(meUid) {
  return `
    j.*, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
    u.kyc_status AS employer_kyc, u.id AS employer_id,
    (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count
    ${meUid ? `, (SELECT a.status FROM job_applications a WHERE a.job_id = j.id AND a.maid_id = ? LIMIT 1) AS my_application_status` : ''}`;
}

function validateJobPayload(b) {
  const errors = {};
  const values = {};
  const title = String(b.title || '').trim();
  if (title.length < 5 || title.length > 120) errors.title = 'Give the job a clear title (5–120 characters).';
  else values.title = title;

  const description = String(b.description || '').trim();
  if (description.length < 20 || description.length > 2000) {
    errors.description = 'Describe the duties, days and expectations (20–2000 characters).';
  } else {
    values.description = description;
  }

  if (!JOB_TYPES.includes(b.jobType)) errors.jobType = 'Choose live-in, live-out or day burg.';
  else values.job_type = b.jobType;

  values.county = String(b.county || '').trim().slice(0, 120) || null;
  values.area = String(b.area || '').trim().slice(0, 120) || null;

  if (b.salaryAmount !== undefined && b.salaryAmount !== null && b.salaryAmount !== '') {
    const s = Number(b.salaryAmount);
    if (!Number.isFinite(s) || s < 1000 || s > 1000000) {
      errors.salaryAmount = 'Monthly salary must be between KES 1,000 and 1,000,000.';
    } else {
      values.salary_amount = Math.round(s);
    }
  } else {
    values.salary_amount = null;
  }
  return { errors, values };
}

// POST /api/jobs — employer only, verified only (§5 services gate).
router.post('/', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Only employer accounts can post jobs.' });
    }
    const { errors, values } = validateJobPayload(req.body || {});
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      return res.status(400).json({ message: errors[first], errors, field: first });
    }
    const cols = Object.keys(values);
    const [ins] = await pool.query(
      `INSERT INTO jobs (employer_id, ${cols.map((c) => `\`${c}\``).join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})`,
      [req.user.uid, ...cols.map((c) => values[c])]
    );
    console.error(`[JOBS] job #${ins.insertId} posted by ${req.user.uid} — "${values.title}" (${values.job_type}, ${values.county || '-'})`);
    const [[row]] = await pool.query(
      `SELECT j.*, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
              u.kyc_status AS employer_kyc, u.id AS employer_id,
              0 AS applicant_count
       FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = ?`,
      [ins.insertId]
    );
    return res.status(201).json({ message: 'Job posted.', job: shapeJob(row) });
  } catch (e) {
    next(e);
  }
});

// GET /api/jobs — open jobs for the Find Jobs feed (any signed-in user,
// read-only scope §15.1). Filters: q, county, job_type, page/per_page.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const county = String(req.query.county || '').trim().slice(0, 120);
    const jobType = String(req.query.job_type || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(24, Math.max(1, parseInt(req.query.per_page, 10) || 12));

    const where = ["j.status = 'open'", "u.account_status = 'active'"];
    const params = [];
    if (q) {
      where.push('(j.title LIKE ? OR j.description LIKE ? OR j.area LIKE ? OR u.full_name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (county) {
      where.push('j.county = ?');
      params.push(county);
    }
    if (JOB_TYPES.includes(jobType)) {
      where.push('j.job_type = ?');
      params.push(jobType);
    }
    const whereSql = where.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM jobs j JOIN users u ON u.id = j.employer_id WHERE ${whereSql}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT ${baseSelect(req.user.uid)}
       FROM jobs j JOIN users u ON u.id = j.employer_id
       WHERE ${whereSql}
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.uid, ...params, perPage, (page - 1) * perPage]
    );

    let counties = [];
    if (page === 1) {
      [counties] = await pool.query(
        `SELECT DISTINCT j.county AS county FROM jobs j
         WHERE j.status = 'open' AND j.county IS NOT NULL AND j.county != ''
         ORDER BY county LIMIT 30`
      );
      counties = counties.map((r) => r.county);
    }

    res.json({ jobs: rows.map(shapeJob), page, perPage, total, hasMore: page * perPage < total, counties });
  } catch (e) {
    next(e);
  }
});

// GET /api/jobs/mine — the employer's own postings (open + closed) with
// applicant counts, newest first.
router.get('/mine', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Only employer accounts have job postings.' });
    }
    const [rows] = await pool.query(
      `SELECT j.*, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
              u.kyc_status AS employer_kyc, u.id AS employer_id,
              (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count
       FROM jobs j JOIN users u ON u.id = j.employer_id
       WHERE j.employer_id = ?
       ORDER BY j.created_at DESC
       LIMIT 100`,
      [req.user.uid]
    );
    res.json({ jobs: rows.map(shapeJob) });
  } catch (e) {
    next(e);
  }
});

// GET /api/jobs/:id — detail. The owner additionally receives the
// applications (maid summary + message + status) so the applicants UI can
// live on the same screen.
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job id.' });
    const [[row]] = await pool.query(
      `SELECT ${baseSelect(req.user.uid)}
       FROM jobs j JOIN users u ON u.id = j.employer_id
       WHERE j.id = ? LIMIT 1`,
      [req.user.uid, id]
    );
    if (!row) return res.status(404).json({ message: 'This job is no longer listed.' });

    const isOwner = row.employer_id === req.user.uid;
    const job = shapeJob(row);
    let applications = null;
    if (isOwner) {
      const [apps] = await pool.query(
        `SELECT a.id, a.status, a.message, a.created_at, a.maid_id,
                u.full_name, u.avatar_url, u.kyc_status, u.location_county, u.location_area,
                mp.years_experience, mp.wage_expectation, mp.job_type,
                TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) AS days_idle
         FROM job_applications a
         JOIN users u ON u.id = a.maid_id
         LEFT JOIN maid_profiles mp ON mp.user_id = a.maid_id
         WHERE a.job_id = ? AND a.status != 'withdrawn'
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [id]
      );
      applications = apps.map((a) => ({
        id: Number(a.id),
        status: a.status,
        message: a.message || null,
        createdAt: a.created_at,
        maid: {
          id: a.maid_id,
          fullName: a.full_name,
          avatarUrl: a.avatar_url || null,
          trustBadge: a.kyc_status === 'approved',
          locationCounty: a.location_county || null,
          locationArea: a.location_area || null,
          yearsExperience: a.years_experience === null ? null : Number(a.years_experience),
          expectedSalary: a.wage_expectation === null ? null : Number(a.wage_expectation),
          jobType: a.job_type || null,
          jobTypeLabel: JOB_TYPE_LABELS[a.job_type] || null,
        },
      }));
    }
    res.json({ job, isOwner, applications });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/jobs/:id — owner edits fields or flips status open<->closed.
router.patch('/:id', requireAuth, requireVerified, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job id.' });
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ? LIMIT 1', [id]);
    if (!job) return res.status(404).json({ message: 'This job is no longer listed.' });
    if (job.employer_id !== req.user.uid) {
      return res.status(403).json({ message: 'You can only edit your own job postings.' });
    }
    const body = req.body || {};
    const sets = {};
    if (body.status !== undefined) {
      if (!['open', 'closed'].includes(body.status)) {
        return res.status(400).json({ message: 'Status must be open or closed.' });
      }
      sets.status = body.status;
    }
    const editingFields = body.title !== undefined || body.description !== undefined || body.jobType !== undefined ||
      body.county !== undefined || body.area !== undefined || body.salaryAmount !== undefined;
    if (editingFields) {
      // Carry over snake_case columns the validator cannot see from the row
      // spread (job_type → jobType, salary_amount → salaryAmount) — otherwise
      // a title-only edit would null the salary.
      const merged = {
        ...job,
        ...body,
        jobType: body.jobType !== undefined ? body.jobType : job.job_type,
        salaryAmount: body.salaryAmount !== undefined ? body.salaryAmount : job.salary_amount,
      };
      const { errors, values } = validateJobPayload(merged);
      if (Object.keys(errors).length) {
        const first = Object.keys(errors)[0];
        return res.status(400).json({ message: errors[first], errors, field: first });
      }
      Object.assign(sets, values);
    }
    if (!Object.keys(sets).length) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }
    const cols = Object.keys(sets);
    await pool.query(
      `UPDATE jobs SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => sets[c]), id]
    );
    const [[row]] = await pool.query(
      `SELECT j.*, u.full_name AS employer_name, u.avatar_url AS employer_avatar,
              u.kyc_status AS employer_kyc, u.id AS employer_id,
              (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count
       FROM jobs j JOIN users u ON u.id = j.employer_id WHERE j.id = ?`,
      [id]
    );
    res.json({ message: 'Job updated.', job: shapeJob(row) });
  } catch (e) {
    next(e);
  }
});

// POST /api/jobs/:id/apply — househelp, verified (§5). §9 paywall: every
// application ever submitted (any status) consumed one of the 2 lifetime
// free ones; after that the gateway answers 402 paywall_required.
router.post('/:id/apply', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (req.user.role !== 'househelp') {
      return res.status(403).json({ message: 'Only househelp accounts can apply for jobs.' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job id.' });

    const [[job]] = await pool.query(
      `SELECT j.*, u.account_status AS employer_status FROM jobs j JOIN users u ON u.id = j.employer_id
       WHERE j.id = ? LIMIT 1`,
      [id]
    );
    if (!job || job.status !== 'open' || job.employer_status !== 'active') {
      return res.status(409).json({ message: 'This job is no longer open for applications.' });
    }

    const [[{ mine }]] = await pool.query(
      'SELECT COUNT(*) AS mine FROM job_applications WHERE job_id = ? AND maid_id = ?',
      [id, req.user.uid]
    );
    if (mine > 0) {
      return res.status(409).json({ code: 'already_applied', message: 'You already applied for this job.' });
    }

    // §9 — lifetime consumed count (every status).
    const [[{ used }]] = await pool.query(
      'SELECT COUNT(*) AS used FROM job_applications WHERE maid_id = ?',
      [req.user.uid]
    );
    const creditsLeft = Math.max(0, WELCOME_FREE_APPLICATIONS - Number(used));
    if (creditsLeft <= 0) {
      return res.status(402).json({
        code: 'paywall_required',
        creditsLeft: 0,
        message: 'You have used your 2 free applications. Top up to keep applying.',
      });
    }

    const message = String((req.body || {}).message || '').trim().slice(0, 500) || null;
    const [ins] = await pool.query(
      'INSERT INTO job_applications (job_id, maid_id, message) VALUES (?, ?, ?)',
      [id, req.user.uid, message]
    );
    console.error(`[JOBS] application #${ins.insertId} — maid ${req.user.uid} → job #${id} (credit used, ${creditsLeft - 1} left)`);
    res.status(201).json({
      message: 'Application sent.',
      applicationId: Number(ins.insertId),
      creditsLeft: creditsLeft - 1,
    });
  } catch (e) {
    next(e);
  }
});


module.exports = router;
