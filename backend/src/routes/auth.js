// Auth routes — unified build spec §3, §5, §6, §11, §12.
//   register        — account row BEFORE OTP confirm (pending_verification), no role yet
//   verify-otp      — phone confirm → active, stamps phone_verified_at + last_login_at
//   resend-otp      — cooldown-enforced SMS resend
//   login           — contact + password, §11 throttle, §6 location update,
//                     routes unverified accounts back to the OTP step
//   onboarding      — role selection (post-verification, immutable once set)
//   me              — token validation; returns a refreshed 30d token (§11 sliding session)
//   request-email-verification / verify-email — optional email path (§5), SMTP §2
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../config/db');
const { sendSms } = require('../services/sms');
const {
  issueOtp,
  verifyOtpCode,
  issueEmailOtp,
  verifyEmailOtpCode,
  otpSmsMessage,
} = require('../services/otp');
const { sendVerificationCode } = require('../services/email');
const {
  validateRegister,
  normalizePhone,
  isDisposableEmail,
  EMAIL_RE,
} = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const RESEND_AFTER_S = 60;
const ROLES = ['employer', 'househelp'];

function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role || null },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function publicUser(u) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role || null, // null until onboarding (§3.2)
    locationName: u.location_name,
    locationArea: u.location_area || null,
    locationCounty: u.location_county || null,
    locationSource: u.location_source || null,
    latitude: u.latitude === null || u.latitude === undefined ? null : Number(u.latitude),
    longitude: u.longitude === null || u.longitude === undefined ? null : Number(u.longitude),
    myReferralCode: u.my_referral_code,
    // Media subdomain profile photo (public URL, set via POST /api/media/avatar)
    avatarUrl: u.avatar_url || null,
    // §4.2 — derived at read time, never stored as booleans
    phoneVerified: !!u.phone_verified_at,
    emailVerified: !!u.email_verified_at,
    accountStatus: u.account_status,
    kycStatus: u.kyc_status || 'not_started',
    kycRejectionReason: u.kyc_rejection_reason || null, // §33.3 banner: "Action needed: {reason}"
    kycUrgent: !!u.kyc_urgent, // KSh 150 expedite paid (speed only)
    trustBadge: u.kyc_status === 'approved',
    requiresOnboarding: !u.role,
  };
}

function maskPhone(p) {
  if (!p) return '';
  return `${p.slice(0, 6)}•••${p.slice(-3)}`;
}

function makeReferralCode(id) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += alphabet[cryptoRandom(alphabet.length)];
  return `M${Number(id).toString(36).toUpperCase()}${suffix}`;
}

function cryptoRandom(max) {
  const c = require('crypto');
  return c.randomInt(0, max);
}

async function sendOtpSms(phone, code) {
  return sendSms(phone, otpSmsMessage(code));
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().slice(0, 45);
  return (req.socket && req.socket.remoteAddress) || null;
}

// §6 — location auto-update at login. Only touches stored location when the
// client sends a usable GPS fix; a failed/denied capture means the app sends
// nothing and the last known location stands (fallback per spec).
function sanitizeLoginLocation(raw) {
  const loc = raw && typeof raw === 'object' ? raw : null;
  if (!loc) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const name = loc.locationName ? String(loc.locationName).trim().slice(0, 190) : '';
  const area = loc.locationArea ? String(loc.locationArea).trim().slice(0, 120) : '';
  const county = loc.locationCounty ? String(loc.locationCounty).trim().slice(0, 120) : '';
  const source = loc.locationSource === 'manual' ? 'manual' : 'gps';
  if (!hasFix && !name) return null;
  return { lat: hasFix ? lat : null, lng: hasFix ? lng : null, name, area, county, source };
}

async function recordLoginAttempt({ userId, identifier, ip, success }) {
  try {
    await pool.query(
      'INSERT INTO login_attempts (user_id, identifier, ip, success) VALUES (?, ?, ?, ?)',
      [userId || null, identifier, ip, success ? 1 : 0]
    );
  } catch (e) {
    console.error('[auth] login_attempts insert failed:', e.message);
  }
}

// POST /api/auth/register — §3.2/§3.3: create the row BEFORE OTP confirm;
// role is NOT taken here (chosen at onboarding); §12 disposable email block.
router.post('/register', async (req, res, next) => {
  try {
    const { errors, values } = validateRegister(req.body);
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      return res.status(400).json({ message: errors[first], errors, field: first });
    }

    const [dupe] = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = ? OR phone = ? LIMIT 2',
      [values.email, values.phone]
    );
    if (dupe.length) {
      const emailTaken = dupe.some((r) => r.email === values.email);
      return res.status(409).json({
        message: emailTaken
          ? 'An account with this email already exists. Try logging in.'
          : 'An account with this phone number already exists. Try logging in.',
        field: emailTaken ? 'email' : 'phone',
      });
    }

    const passwordHash = await bcrypt.hash(values.password, 10);
    const [ins] = await pool.query(
      `INSERT INTO users
         (full_name, email, phone, role, password_hash,
          location_name, location_area, location_county, location_source,
          latitude, longitude, referred_by_code, account_status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification')`,
      [
        values.fullName, values.email, values.phone, passwordHash,
        values.locationName, values.locationArea, values.locationCounty, values.locationSource,
        values.lat, values.lng, values.referralCode,
      ]
    );
    await pool.query('UPDATE users SET my_referral_code = ? WHERE id = ?',
      [makeReferralCode(ins.insertId), ins.insertId]);

    // Send OTP — account creation still succeeds if the SMS provider hiccups.
    let otpSent = true;
    let note;
    try {
      const code = await issueOtp(ins.insertId);
      await sendOtpSms(values.phone, code);
    } catch (e) {
      otpSent = false;
      console.error('[auth/register] OTP send failed:', e.message);
      note = 'We could not send the SMS right now. Use "Resend code" in a minute.';
    }

    return res.status(201).json({
      message: 'Account created. We sent a 6-digit code to your phone.',
      userId: ins.insertId,
      phone: values.phone,
      maskedPhone: maskPhone(values.phone),
      role: null, // chosen at onboarding, after verification
      otpSent,
      note: note || null,
      resendAfterSeconds: RESEND_AFTER_S,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/verify-otp — §3.3: on confirm → active + phone stamped.
router.post('/verify-otp', async (req, res, next) => {
  try {
    const userId = Number(req.body && req.body.userId);
    const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
    if (!userId || code.length !== 6) {
      return res.status(400).json({ message: 'Enter the 6-digit code we sent you.' });
    }
    await verifyOtpCode(userId, code);
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!u) return res.status(404).json({ message: 'Account not found.' });
    if (u.account_status === 'suspended') {
      return res.status(403).json({ message: 'This account is suspended. Contact support.' });
    }
    await pool.query(
      `UPDATE users
       SET phone_verified_at = NOW(),
           account_status = 'active',
           last_login_at = NOW(),
           last_active_at = NOW()
       WHERE id = ?`,
      [userId]
    );
    return res.json({
      message: 'Phone verified. Welcome to Maidora Kenya!',
      token: signToken(u),
      user: publicUser({ ...u, phone_verified_at: new Date(), account_status: 'active' }),
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res, next) => {
  try {
    const userId = Number(req.body && req.body.userId);
    if (!userId) return res.status(400).json({ message: 'Missing user.' });
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!u) return res.status(404).json({ message: 'Account not found.' });
    if (u.phone_verified_at) {
      return res.status(400).json({ message: 'This phone is already verified. Please log in.' });
    }
    let otpSent = true;
    let note;
    try {
      const code = await issueOtp(userId);
      await sendOtpSms(u.phone, code);
    } catch (e) {
      if (e.status) throw e; // cooldown/caps errors are meaningful to the client
      otpSent = false;
      console.error('[auth/resend-otp] send failed:', e.message);
      note = 'We could not send the SMS right now. Please try again shortly.';
    }
    return res.json({
      message: otpSent ? 'A new code is on its way.' : 'Could not send the SMS right now.',
      otpSent,
      note: note || null,
      resendAfterSeconds: RESEND_AFTER_S,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/login — contact (phone or email) + password.
// §11 throttle: 5 failures/account/15min → 15min cooldown; 20 attempts/IP/hour.
router.post('/login', async (req, res, next) => {
  try {
    const identifierRaw = String((req.body && req.body.identifier) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!identifierRaw || !password) {
      return res.status(400).json({ message: 'Enter your email/phone and password.' });
    }

    let column;
    let value;
    const phone = normalizePhone(identifierRaw);
    if (phone) {
      column = 'phone';
      value = phone;
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(identifierRaw.toLowerCase())) {
      column = 'email';
      value = identifierRaw.toLowerCase();
    } else {
      return res.status(400).json({ message: 'Enter a valid email or Kenyan phone number.' });
    }

    const ip = clientIp(req);

    // §11 — per-IP throttle (all attempts, successful or not).
    const [[ipRow]] = await pool.query(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > (NOW() - INTERVAL 1 HOUR)',
      [ip]
    );
    if (ipRow.n >= config.login.maxPerIpPerHour) {
      return res.status(429).json({
        code: 'ip_throttled',
        message: 'Too many attempts from this device. Please try again later.',
      });
    }

    // §11 — per-account failure cooldown.
    const [[failRow]] = await pool.query(
      `SELECT COUNT(*) AS n, MAX(attempted_at) AS last_fail FROM login_attempts
       WHERE identifier = ? AND success = 0
         AND attempted_at > (NOW() - INTERVAL ? MINUTE)`,
      [value, config.login.failWindowMinutes]
    );
    if (failRow.n >= config.login.maxFailsPerWindow && failRow.last_fail) {
      const remainMs =
        config.login.cooldownMinutes * 60000 - (Date.now() - new Date(failRow.last_fail).getTime());
      const mins = Math.max(1, Math.ceil(remainMs / 60000));
      return res.status(429).json({
        code: 'cooldown',
        message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      });
    }

    const [[u]] = await pool.query(`SELECT * FROM users WHERE ${column} = ? LIMIT 1`, [value]);
    if (!u) {
      await recordLoginAttempt({ identifier: value, ip, success: false });
      return res.status(401).json({ message: 'Incorrect email/phone or password.' });
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await recordLoginAttempt({ userId: u.id, identifier: value, ip, success: false });
      return res.status(401).json({ message: 'Incorrect email/phone or password.' });
    }
    if (u.account_status === 'suspended' || u.status === 'suspended') {
      return res.status(403).json({ message: 'This account is suspended. Contact support.' });
    }

    // §3.3 — unverified accounts are routed back to the OTP step.
    const verified = !!u.phone_verified_at || !!u.email_verified_at;
    if (!verified) {
      let otpSent = true;
      let note;
      try {
        const code = await issueOtp(u.id);
        await sendOtpSms(u.phone, code);
      } catch (e) {
        if (e.status) throw e;
        otpSent = false;
        note = 'We could not send the SMS right now. Use "Resend code" in a minute.';
      }
      return res.json({
        requiresVerification: true,
        userId: u.id,
        phone: u.phone,
        maskedPhone: maskPhone(u.phone),
        role: u.role || null,
        otpSent,
        note: note || null,
        resendAfterSeconds: RESEND_AFTER_S,
      });
    }

    await recordLoginAttempt({ userId: u.id, identifier: value, ip, success: true });

    // §4.3 + §6 — stamp login, auto-update location (GPS fix from the app).
    const loc = sanitizeLoginLocation(req.body && req.body.location);
    if (loc) {
      await pool.query(
        `UPDATE users SET
           last_login_at = NOW(),
           last_active_at = NOW(),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           location_name = COALESCE(NULLIF(?, ''), location_name),
           location_area = COALESCE(NULLIF(?, ''), location_area),
           location_county = COALESCE(NULLIF(?, ''), location_county),
           location_source = COALESCE(?, location_source)
         WHERE id = ?`,
        [loc.lat, loc.lng, loc.name, loc.area, loc.county, loc.source, u.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = ?',
        [u.id]
      );
    }

    const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ?', [u.id]);
    return res.json({
      token: signToken(fresh),
      user: publicUser(fresh),
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/onboarding — §3.2: role is chosen here (post-verification),
// immutable once set. KYC later autofills from the profile, not from this.
router.post('/onboarding', requireAuth, async (req, res, next) => {
  try {
    const role = String((req.body && req.body.role) || '').trim();
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: 'Choose a role to continue.' });
    }
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.role && u.role !== role) {
      return res.status(409).json({ message: 'Your role is already set. Contact support to change it.' });
    }
    if (!u.role) {
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, u.id]);
    }
    const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ?', [u.id]);
    return res.json({
      message: 'Role saved. Welcome to Maidora Kenya!',
      token: signToken(fresh), // refreshed token carries the role claim
      user: publicUser(fresh),
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me — validates the stored token and returns a REFRESHED 30d
// token (§11 "valid 30 days, refreshed on use" — sliding window).
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    return res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/request-email-verification — §5 optional email path via SMTP.
router.post('/request-email-verification', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.email_verified_at) {
      return res.status(400).json({ message: 'This email is already verified.' });
    }
    // §12 — re-check the blocklist at verification time (it changes).
    if (isDisposableEmail(u.email)) {
      return res.status(400).json({
        code: 'disposable_email',
        message: 'This email provider is no longer accepted. Please update your email.',
      });
    }
    try {
      const code = await issueEmailOtp(u.id);
      await sendVerificationCode(u.email, code);
      return res.json({
        sent: true,
        message: `We sent a 6-digit code to ${maskEmail(u.email)}.`,
        resendAfterSeconds: RESEND_AFTER_S,
      });
    } catch (e) {
      if (e.code === 'EMAIL_NOT_CONFIGURED') throw e;
      console.error('[auth/request-email-verification] send failed:', e.message);
      const err = new Error('We could not send the email right now. Please try again shortly.');
      err.status = 502;
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/update-email — change the account email BEFORE verification
// (used by the Profile screen: tap "Email unverified" → prefilled, editable).
// Changing the address clears email_verified_at; a fresh code is then sent to
// the new address via /request-email-verification. Duplicate contact → 409
// (same policy as §4.3 register). Disposable blocklist re-checked here (§12).
router.post('/update-email', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.', field: 'email' });
    }
    if (isDisposableEmail(email)) {
      return res.status(400).json({
        code: 'disposable_email',
        message: 'This email provider is not accepted. Please use another.',
        field: 'email',
      });
    }
    if (email === String(u.email || '').toLowerCase()) {
      return res.json({ message: 'Email unchanged.', user: publicUser(u) });
    }
    const [[dupe]] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (dupe) {
      return res.status(409).json({
        code: 'email_taken',
        message: 'An account with this email already exists. Try logging in instead.',
        field: 'email',
      });
    }
    await pool.query('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', [
      email,
      u.id,
    ]);
    const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [u.id]);
    return res.json({ message: 'Email updated.', user: publicUser(fresh) });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/verify-email {code}
router.post('/verify-email', requireAuth, async (req, res, next) => {
  try {
    const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
    if (code.length !== 6) {
      return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
    }
    await verifyEmailOtpCode(req.user.uid, code);
    await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [req.user.uid]);
    const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.uid]);
    return res.json({
      message: 'Email verified. You now have full access.',
      user: publicUser(fresh),
    });
  } catch (e) {
    next(e);
  }
});

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

module.exports = router;
