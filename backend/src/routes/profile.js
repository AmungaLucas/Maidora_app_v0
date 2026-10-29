// Maid profile + profile completeness (unified spec §7).
// Non-blocking: the client shows a banner; the gate never blocks services on
// these fields. Completeness is DERIVED at read time (never stored as truth).
// Order per spec: profile completeness first — filled fields autofill into
// KYC later (§8).
const express = require('express');
const { pool } = require('../config/db');
const { normalizePhone } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];
const GENDERS = ['female', 'male', 'other'];

// §7 required completeness fields — all five must be present.
function completeness(row) {
  const nextOfKinPresent = Boolean(
    row && row.next_of_kin_name && row.next_of_kin_phone && row.next_of_kin_relationship
  );
  const checks = {
    dateOfBirth: Boolean(row && row.date_of_birth),
    languages: Boolean(row && Array.isArray(row.languages) && row.languages.length > 0),
    jobType: Boolean(row && row.job_type),
    yearsExperience: row && row.years_experience !== null && row.years_experience !== undefined,
    nextOfKin: nextOfKinPresent,
  };
  const labels = {
    dateOfBirth: 'Date of birth',
    languages: 'Languages spoken',
    jobType: 'Job type',
    yearsExperience: 'Years of experience',
    nextOfKin: 'Next of kin',
  };
  const done = Object.values(checks).filter(Boolean).length;
  const missing = Object.keys(checks).filter((k) => !checks[k]).map((k) => labels[k]);
  return { complete: done === 5, done, total: 5, missing, checks };
}

function shapeProfile(row) {
  const profile = row
    ? {
        dateOfBirth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
        gender: row.gender || null,
        languages: Array.isArray(row.languages) ? row.languages : [],
        jobType: row.job_type || null,
        yearsExperience: row.years_experience === null ? null : Number(row.years_experience),
        wageExpectation: row.wage_expectation === null ? null : Number(row.wage_expectation),
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
        yearsExperience: null, wageExpectation: null, bio: null, photoUrl: null,
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

  if (b.wageExpectation !== undefined && b.wageExpectation !== null && b.wageExpectation !== '') {
    const w = Number(b.wageExpectation);
    if (!Number.isFinite(w) || w < 1000 || w > 1000000) {
      errors.wageExpectation = 'Wage expectation must be between KES 1,000 and 1,000,000.';
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

// GET /api/profile — profile + derived completeness (househelp only).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.role !== 'househelp') {
      return res.json({ profile: null, completeness: null });
    }
    const row = await loadProfile(req.user.uid);
    return res.json({ profile: shapeProfile(row), completeness: completeness(row) });
  } catch (e) {
    next(e);
  }
});

// PUT /api/profile — upsert the §7 fields. Non-blocking by design: the client
// nudges, it never locks the user out of allowed services.
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.role !== 'househelp') {
      return res.status(400).json({ message: 'Only househelp accounts have this profile.' });
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
