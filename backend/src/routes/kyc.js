// KYC / trust badge (unified spec §8, MPS §33 — consolidated by Amendment
// v3.2). KYC is ALWAYS non-blocking: it grants the trust badge, never gate
// access. The draft lives in kyc_* columns on `users`; images are stored
// privately under config.kyc.uploadDir and served only through the
// authenticated image route below.
//
//   GET    /api/kyc               state (status, draft fields, image flags)
//   PUT    /api/kyc/draft         upsert personal/doc-type fields (autosave)
//   POST   /api/kyc/images        upload one image (base64 JPEG/PNG/WEBP)
//   POST   /api/kyc/submit        validate + mark submitted (§5 gate applies)
//   GET    /api/kyc/images/:field stream the caller's own stored image
//
// Urgent (KSh 150, speed-only, never refunded) is granted by the payments
// callback when purpose = 'kyc_urgent' settles successfully.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');
const config = require('../config');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

const ID_TYPES = ['national_id', 'passport', 'drivers_license'];
const GENDERS = ['female', 'male', 'other'];
const REASONS = ['unreadable_document', 'name_mismatch', 'expired_document', 'selfie_mismatch', 'suspected_fraud', 'other'];

const IMAGE_FIELDS = {
  id_front: { col: 'kyc_id_front_url' },
  id_back: { col: 'kyc_id_back_url' },
  selfie: { col: 'kyc_selfie_url' },
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB binary (client sends base64 ≈ +33%)
const MIN_AGE = 18;                 // §39.1 — under-18 cannot obtain the badge
const MAX_AGE = 100;

// ---- storage bootstrap -----------------------------------------------------
// Private dir + .htaccess so LiteSpeed never serves the files directly.
function ensureUploadDir() {
  const dir = config.kyc.uploadDir;
  fs.mkdirSync(dir, { recursive: true });
  const ht = path.join(dir, '.htaccess');
  if (!fs.existsSync(ht)) {
    fs.writeFileSync(ht, 'Require all denied\n', { mode: 0o644 });
  }
}
ensureUploadDir();

// ---- helpers ---------------------------------------------------------------
function publicKyc(u) {
  return {
    kycStatus: u.kyc_status || 'not_started',
    rejectionReason: u.kyc_rejection_reason || null,
    urgent: !!u.kyc_urgent,
    submittedAt: u.kyc_submitted_at || null,
    reviewedAt: u.kyc_reviewed_at || null,
    draft: {
      fullNameAsOnId: u.kyc_full_name || null,
      idNumber: u.kyc_id_number || null,
      idType: u.kyc_id_type || null,
      dateOfBirth: u.kyc_date_of_birth ? String(u.kyc_date_of_birth).slice(0, 10) : null,
      gender: u.kyc_gender || null,
    },
    images: {
      idFront: !!u.kyc_id_front_url,
      idBack: !!u.kyc_id_back_url,
      selfie: !!u.kyc_selfie_url,
    },
  };
}

async function loadKycRow(userId) {
  const [[u]] = await pool.query(
    `SELECT kyc_status, kyc_rejection_reason, kyc_urgent, kyc_submitted_at,
            kyc_reviewed_at, kyc_full_name, kyc_id_number, kyc_id_type,
            kyc_date_of_birth, kyc_gender, kyc_id_front_url, kyc_id_back_url,
            kyc_selfie_url
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return u || null;
}

// Writes are locked once submitted — review is immutable from the client;
// a rejection re-opens retakes.
function writable(status) {
  return ['not_started', 'draft', 'rejected'].includes(status);
}

function calcAge(dobStr) {
  const dob = new Date(`${dobStr}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function isDateString(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && String(s) === d.toISOString().slice(0, 10);
}

function bad(message, field, status = 400) {
  const err = new Error(message);
  err.status = status;
  if (field) err.field = field;
  return err;
}

// ---- routes ----------------------------------------------------------------
router.use(requireAuth);

// GET /api/kyc — full KYC state for the caller.
router.get('/', async (req, res, next) => {
  try {
    const u = await loadKycRow(req.user.uid);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    return res.json(publicKyc(u));
  } catch (e) {
    return next(e);
  }
});

// PUT /api/kyc/draft — autosave (client debounces ~2s). Whitelisted fields,
// validated; images are NOT set here (dedicated upload route).
router.put('/draft', async (req, res, next) => {
  try {
    const u = await loadKycRow(req.user.uid);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (!writable(u.kyc_status)) {
      return res.status(409).json({
        code: 'kyc_locked',
        message:
          u.kyc_status === 'approved'
            ? 'Your identity is already verified.'
            : 'Your submission is under review and cannot be changed right now.',
      });
    }

    const b = req.body || {};
    const sets = [];
    const args = [];

    if (b.fullNameAsOnId !== undefined) {
      const v = String(b.fullNameAsOnId || '').trim().replace(/\s+/g, ' ').slice(0, 190);
      if (v && v.length < 3) throw bad('Enter your full name as it appears on your ID.', 'fullNameAsOnId');
      sets.push('kyc_full_name = ?');
      args.push(v || null);
    }
    if (b.idNumber !== undefined) {
      const v = String(b.idNumber || '').trim();
      if (v && !/^[A-Z0-9]{5,16}$/i.test(v)) {
        throw bad('Enter a valid ID or passport number.', 'idNumber');
      }
      sets.push('kyc_id_number = ?');
      args.push(v ? v.toUpperCase() : null);
    }
    if (b.idType !== undefined) {
      const v = b.idType ? String(b.idType) : null;
      if (v && !ID_TYPES.includes(v)) throw bad('Choose a valid document type.', 'idType');
      sets.push('kyc_id_type = ?');
      args.push(v);
    }
    if (b.dateOfBirth !== undefined) {
      const v = b.dateOfBirth ? String(b.dateOfBirth).slice(0, 10) : null;
      if (v) {
        if (!isDateString(v)) throw bad('Enter a valid date of birth (YYYY-MM-DD).', 'dateOfBirth');
        const age = calcAge(v);
        if (age === null || age < MIN_AGE || age > MAX_AGE) {
          throw bad(
            'You must be at least 18 years old to verify your identity.',
            'dateOfBirth'
          );
        }
      }
      sets.push('kyc_date_of_birth = ?');
      args.push(v || null);
    }
    if (b.gender !== undefined) {
      const v = b.gender ? String(b.gender) : null;
      if (v && !GENDERS.includes(v)) throw bad('Choose a valid gender or leave it out.', 'gender');
      sets.push('kyc_gender = ?');
      args.push(v);
    }

    if (!sets.length) throw bad('Nothing to save.');

    // not_started → draft on first save; rejection stays 'rejected' so the
    // banner keeps the "Action needed" context until resubmission.
    sets.push(
      "kyc_status = IF(kyc_status = 'not_started', 'draft', kyc_status)",
      'kyc_draft_updated_at = NOW()'
    );
    args.push(req.user.uid);

    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);
    const fresh = await loadKycRow(req.user.uid);
    return res.json(publicKyc(fresh));
  } catch (e) {
    return next(e);
  }
});

// POST /api/kyc/images — one image per call: { field, dataBase64, mime }.
// Base64 JSON (no multer on this deployment); size-capped and magic-sniffed.
router.post('/images', async (req, res, next) => {
  try {
    const u = await loadKycRow(req.user.uid);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (!writable(u.kyc_status)) {
      return res.status(409).json({ code: 'kyc_locked', message: 'Your submission is under review and cannot be changed right now.' });
    }

    const field = String((req.body && req.body.field) || '');
    const spec = IMAGE_FIELDS[field];
    if (!spec) throw bad('Unknown image field.', 'field');

    let b64 = String((req.body && req.body.dataBase64) || '').replace(/^data:[^;]+;base64,/, '');
    if (!b64) throw bad('No image data received.', 'dataBase64');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw bad('Image could not be read. Try capturing it again.', 'dataBase64');
    if (buf.length > MAX_BYTES) throw bad('This image is too large. Please retake it (max 5 MB).', 'dataBase64', 413);

    // Magic-byte sniff — never trust the declared mime.
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) throw bad('That file is not a supported photo (JPEG, PNG or WEBP).', 'dataBase64');
    const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';

    const name = `${req.user.uid}_${field}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.kyc.uploadDir, name), buf, { mode: 0o600 });

    // Replace stored image: delete the previous file (best-effort).
    if (u[spec.col]) {
      const old = path.join(config.kyc.uploadDir, path.basename(String(u[spec.col])));
      fs.unlink(old, () => {});
    }

    await pool.query(
      `UPDATE users SET ${spec.col} = ?, kyc_draft_updated_at = NOW(),
        kyc_status = IF(kyc_status = 'not_started', 'draft', kyc_status)
       WHERE id = ?`,
      [name, req.user.uid]
    );

    return res.json({ ok: true, field });
  } catch (e) {
    return next(e);
  }
});

// POST /api/kyc/submit — §5 gate applies (requireVerified): verification
// first, KYC always second. Completeness per §33.1; back side required for
// national ID only.
router.post('/submit', requireVerified, async (req, res, next) => {
  try {
    const u = await loadKycRow(req.user.uid);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.kyc_status === 'approved') return res.json({ ...publicKyc(u), message: 'Your identity is already verified.' });
    if (!writable(u.kyc_status)) {
      return res.status(409).json({ code: 'kyc_locked', message: 'Your submission is already under review.' });
    }

    if (!u.kyc_full_name || u.kyc_full_name.trim().length < 3) throw bad('Enter your full name as it appears on your ID.', 'fullNameAsOnId');
    if (!u.kyc_id_number) throw bad('Enter your ID or passport number.', 'idNumber');
    if (!u.kyc_id_type) throw bad('Choose your document type.', 'idType');
    if (!u.kyc_date_of_birth) throw bad('Enter your date of birth.', 'dateOfBirth');
    const age = calcAge(String(u.kyc_date_of_birth).slice(0, 10));
    if (age === null || age < MIN_AGE) throw bad('You must be at least 18 years old to verify your identity.', 'dateOfBirth');
    if (!u.kyc_id_front_url) throw bad('Add a photo of the front of your document.', 'idFront');
    if (u.kyc_id_type === 'national_id' && !u.kyc_id_back_url) throw bad('Add a photo of the back of your national ID.', 'idBack');
    if (!u.kyc_selfie_url) throw bad('Add a live selfie so we can match your face.', 'selfie');

    await pool.query(
      `UPDATE users
       SET kyc_status = 'submitted', kyc_submitted_at = NOW(),
           kyc_reviewed_at = NULL, kyc_rejection_reason = NULL,
           kyc_draft_updated_at = NULL
       WHERE id = ?`,
      [req.user.uid]
    );

    return res.json({
      kycStatus: 'submitted',
      urgent: !!u.kyc_urgent,
      message: 'Submitted. We will notify you within 72 hours.',
    });
  } catch (e) {
    return next(e);
  }
});

// GET /api/kyc/images/:field — streams the caller's OWN stored image bytes.
// (Reviewer access comes with the review tooling — admin scope, later.)
router.get('/images/:field', async (req, res, next) => {
  try {
    const field = String(req.params.field || '');
    const spec = IMAGE_FIELDS[field];
    if (!spec) return res.status(404).json({ message: 'Not found' });

    const u = await loadKycRow(req.user.uid);
    if (!u || !u[spec.col]) return res.status(404).json({ message: 'Not found' });

    // Basename prevents any path traversal from a tampered column value.
    const file = path.join(config.kyc.uploadDir, path.basename(String(u[spec.col])));
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'Not found' });

    const ext = path.extname(file).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(file);
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
