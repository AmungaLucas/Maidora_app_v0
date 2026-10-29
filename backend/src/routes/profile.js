// Profile + profile completeness for BOTH roles (unified spec §7).
// Non-blocking: the client shows a banner; the gate never blocks services on
// these fields. Completeness is DERIVED at read time (never stored as truth).
// Order per spec: profile completeness first — filled fields autofill into
// KYC later (§8).
//   househelp → maid_profiles (DOB, languages, job type, experience, next of
//   kin, bio). `expectedSalary` is the API name for the wage_expectation
//   column (v4 rename; legacy payload key still accepted).
//   employer  → employer_profiles (household size, children, monthly budget).
const express = require('express');
const { pool } = require('../config/db');
const { normalizePhone } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];
const GENDERS = ['female', 'male', 'other'];

// ─── Employer side — §7 household context (3 completeness checks) ───────────
function employerCompleteness(row) {
  const checks = {
    householdSize: row && row.household_size !== null && row.household_size !== undefined,
    numChildren: row && row.num_children !== null && row.num_children !== undefined,
    budgetAmount: row && row.budget_amount !== null && row.budget_amount !== undefined,
  };
  const labels = {
    householdSize: 'Household size',
    numChildren: 'Number of children',
    budgetAmount: 'Monthly budget',
  };
  const done = Object.values(checks).filter(Boolean).length;
  const missing = Object.keys(checks).filter((k) => !checks[k]).map((k) => labels[k]);
  return { complete: done === 3, done, total: 3, missing, checks };
}

function shapeEmployerProfile(row) {
  const profile = row
    ? {
        householdSize: row.household_size === null || row.household_size === undefined
          ? null : Number(row.household_size),
        numChildren: row.num_children === null || row.num_children === undefined
          ? null : Number(row.num_children),
        budgetAmount: row.budget_amount === null || row.budget_amount === undefined
          ? null : Number(row.budget_amount),
      }
    : { householdSize: null, numChildren: null, budgetAmount: null };
  return profile;
}

async function loadEmployerProfile(userId) {
  const [[row]] = await pool.query('SELECT * FROM employer_profiles WHERE user_id = ? LIMIT 1', [userId]);
  return row || null;
}

function validateEmployerPayload(b) {
  const errors = {};
  const values = {};

  if (b.householdSize !== undefined && b.householdSize !== null && b.householdSize !== '') {
    const n = Number(b.householdSize);
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      errors.householdSize = 'How many people live in your home? (1–30)';
    } else {
      values.household_size = n;
    }
  }
  if (b.numChildren !== undefined && b.numChildren !== null && b.numChildren !== '') {
    const n = Number(b.numChildren);
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      errors.numChildren = 'Number of children must be between 0 and 20.';
    } else {
      values.num_children = n;
    }
  }
  if (b.budgetAmount !== undefined && b.budgetAmount !== null && b.budgetAmount !== '') {
    const n = Number(b.budgetAmount);
    if (!Number.isFinite(n) || n < 1000 || n > 1000000) {
      errors.budgetAmount = 'Monthly budget must be between KES 1,000 and 1,000,000.';
    } else {
      values.budget_amount = Math.round(n);
    }
  }

  return { errors, values };
}

// §7 required completeness fields — all six must be present (bio added v4 so
// "tell us a little more about yourself" is nudged like the rest).
function completeness(row) {
  const nextOfKinPresent = Boolean(
    row && row.next_of_kin_name && row.next_of_kin_phone && row.next_of_kin_relationship
  );
  const checks = {
    dateOfBirth: Boolean(row && row.date_of_birth),
    languages: Boolean(row && Array.isArray(row.languages) && row.languages.length > 0),
    jobType: Boolean(row && row.job_type),
    yearsExperience: row && row.years_experience !== null && row.years_experience !== undefined,
    bio: Boolean(row && String(row.bio || '').trim().length >= 10),
    nextOfKin: nextOfKinPresent,
  };
  const labels = {
    dateOfBirth: 'Date of birth',
    languages: 'Languages spoken',
    jobType: 'Job type',
    yearsExperience: 'Years of experience',
    bio: 'About yourself',
    nextOfKin: 'Next of kin',
  };
  const done = Object.values(checks).filter(Boolean).length;
  const missing = Object.keys(checks).filter((k) => !checks[k]).map((k) => labels[k]);
  return { complete: done === 6, done, total: 6, missing, checks };
}

function shapeProfile(row) {
  const profile = row
    ? {
        dateOfBirth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
        gender: row.gender || null,
        languages: Array.isArray(row.languages) ? row.languages : [],
        jobType: row.job_type || null,
        yearsExperience: row.years_experience === null ? null : Number(row.years_experience),
        expectedSalary: row.wage_expectation === null ? null : Number(row.wage_expectation),
        bio: row.bio || null,
        photoUrl: row.photo_url || null, // upload pipeline ships with the KYC phase (§8)
        nextOfKin: {
          name: row.next_of_kin_name || null,
          phone: row.next_of_kin_phone || null,
          relationship: row.next_of_kin_relationship || null,
        },
      }
    : {
        dateOfBirth: null, gender: null, languages: [], jobType: null,
        yearsExperience: null, expectedSalary: null, bio: null, photoUrl: null,
        nextOfKin: { name: null, phone: null, relationship: null },
      };
  return profile;
}

async function loadProfile(userId) {
  const [[row]] = await pool.query('SELECT * FROM maid_profiles WHERE user_id = ? LIMIT 1', [userId]);
  return row || null;
}

function validateProfilePayload(b) {
  const errors = {};
  const values = {};

  const dob = String(b.dateOfBirth || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    errors.dateOfBirth = 'Enter your date of birth as YYYY-MM-DD.';
  } else {
    const d = new Date(`${dob}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      errors.dateOfBirth = 'That date does not exist. Check the day and month.';
    } else {
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 16 || age > 80) {
        errors.dateOfBirth = 'Age must be between 16 and 80 years.';
      } else {
        values.date_of_birth = dob;
      }
    }
  }

  if (b.gender !== undefined && b.gender !== null && b.gender !== '') {
    if (!GENDERS.includes(b.gender)) errors.gender = 'Choose female, male or other.';
    else values.gender = b.gender;
  }

  let langs = b.languages;
  if (!Array.isArray(langs) || langs.length === 0) {
    errors.languages = 'Pick at least one language you speak.';
  } else {
    langs = langs
      .map((l) => String(l).trim().slice(0, 24))
      .filter(Boolean)
      .slice(0, 8);
    if (langs.length === 0) errors.languages = 'Pick at least one language you speak.';
    else values.languages = JSON.stringify(langs);
  }

  if (!JOB_TYPES.includes(b.jobType)) {
    errors.jobType = 'Choose the type of work you want.';
  } else {
    values.job_type = b.jobType;
  }

  const yrs = Number(b.yearsExperience);
  if (!Number.isInteger(yrs) || yrs < 0 || yrs > 50) {
    errors.yearsExperience = 'Years of experience must be a number between 0 and 50.';
  } else {
    values.years_experience = yrs;
  }

  // expectedSalary is the v4 API name for the wage_expectation column; the
  // legacy key is still accepted so older app builds keep saving.
  const salaryRaw = b.expectedSalary !== undefined ? b.expectedSalary : b.wageExpectation;
  if (salaryRaw !== undefined && salaryRaw !== null && salaryRaw !== '') {
    const w = Number(salaryRaw);
    if (!Number.isFinite(w) || w < 1000 || w > 1000000) {
      errors.expectedSalary = 'Expected salary must be between KES 1,000 and 1,000,000.';
    } else {
      values.wage_expectation = Math.round(w);
    }
  }

  if (b.bio !== undefined && b.bio !== null && b.bio !== '') {
    const bio = String(b.bio).trim().slice(0, 500);
    if (bio.length < 10) errors.bio = 'Tell employers a little more (at least 10 characters).';
    else values.bio = bio;
  }

  const nok = b.nextOfKin && typeof b.nextOfKin === 'object' ? b.nextOfKin : {};
  const nokName = String(nok.name || '').trim();
  if (nokName.length < 3 || nokName.length > 120) {
    errors.nextOfKinName = "Enter your next of kin's full name.";
  } else {
    values.next_of_kin_name = nokName;
  }
  const nokPhone = normalizePhone(nok.phone);
  if (!nokPhone) {
    errors.nextOfKinPhone = "Enter your next of kin's Kenyan phone number.";
  } else {
    values.next_of_kin_phone = nokPhone;
  }
  const nokRel = String(nok.relationship || '').trim();
  if (nokRel.length < 2 || nokRel.length > 48) {
    errors.nextOfKinRelationship = 'Relationship, e.g. sister, uncle, guardian.';
  } else {
    values.next_of_kin_relationship = nokRel;
  }

  return { errors, values };
}

// GET /api/profile — role-aware: maid profile for househelp, household
// profile for employer, null for un-onboarded accounts.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.role === 'househelp') {
      const row = await loadProfile(req.user.uid);
      return res.json({ profile: shapeProfile(row), completeness: completeness(row) });
    }
    if (u.role === 'employer') {
      const row = await loadEmployerProfile(req.user.uid);
      return res.json({ profile: shapeEmployerProfile(row), completeness: employerCompleteness(row) });
    }
    return res.json({ profile: null, completeness: null });
  } catch (e) {
    next(e);
  }
});

// PUT /api/profile — upsert the §7 fields for the caller's role. Non-blocking
// by design: the client nudges, it never locks the user out of services.
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.role === 'employer') {
      const body = req.body || {};
      const { errors, values } = validateEmployerPayload(body);
      if (Object.keys(errors).length) {
        const first = Object.keys(errors)[0];
        return res.status(400).json({ message: errors[first], errors, field: first });
      }
      if (!Object.keys(values).length) {
        return res.status(400).json({
          message: 'Nothing to save — tell us about your household first.',
        });
      }
      await pool.query(
        `INSERT INTO employer_profiles (user_id, ${Object.keys(values).join(', ')})
         VALUES (?, ${Object.keys(values).map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${Object.keys(values).map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ')}`,
        [req.user.uid, ...Object.values(values)]
      );
      const row = await loadEmployerProfile(req.user.uid);
      return res.json({
        message: 'Household profile saved.',
        profile: shapeEmployerProfile(row),
        completeness: employerCompleteness(row),
      });
    }
    if (u.role !== 'househelp') {
      return res.status(400).json({ message: 'Choose your role first to build a profile.' });
    }
    const { errors, values } = validateProfilePayload(req.body || {});
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      return res.status(400).json({ message: errors[first], errors, field: first });
    }

    await pool.query(
      `INSERT INTO maid_profiles (user_id, ${Object.keys(values).join(', ')})
       VALUES (?, ${Object.keys(values).map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${Object.keys(values).map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ')}`,
      [req.user.uid, ...Object.values(values)]
    );

    const row = await loadProfile(req.user.uid);
    return res.json({
      message: 'Profile saved.',
      profile: shapeProfile(row),
      completeness: completeness(row),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
