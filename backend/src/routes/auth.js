// Auth routes: register (role immutable), verify-otp, resend-otp, login, me.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { sendSms } = require('../services/sms');
const { issueOtp, verifyOtpCode, otpSmsMessage } = require('../services/otp');
const { validateRegister, normalizePhone } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const RESEND_AFTER_S = 60;

function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(u) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    locationName: u.location_name,
    latitude: u.latitude === null ? null : Number(u.latitude),
    longitude: u.longitude === null ? null : Number(u.longitude),
    myReferralCode: u.my_referral_code,
    phoneVerified: !!u.phone_verified,
    status: u.status,
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

// POST /api/auth/register
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
      `INSERT INTO users (full_name, email, phone, role, password_hash, location_name, latitude, longitude, referral_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [values.fullName, values.email, values.phone, values.role, passwordHash,
       values.locationName, values.lat, values.lng, values.referralCode]
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
      role: values.role,
      otpSent,
      note: note || null,
      resendAfterSeconds: RESEND_AFTER_S,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/verify-otp
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
    if (u.status === 'suspended') {
      return res.status(403).json({ message: 'This account is suspended. Contact support.' });
    }
    await pool.query("UPDATE users SET phone_verified = 1, status = 'active' WHERE id = ?", [userId]);
    return res.json({
      message: 'Phone verified. Welcome to Maidora Kenya!',
      token: signToken(u),
      user: publicUser({ ...u, phone_verified: 1, status: 'active' }),
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
    if (u.phone_verified) {
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

// POST /api/auth/login  { identifier: email | phone, password }
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

    const [[u]] = await pool.query(`SELECT * FROM users WHERE ${column} = ? LIMIT 1`, [value]);
    if (!u) return res.status(401).json({ message: 'Incorrect email/phone or password.' });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ message: 'Incorrect email/phone or password.' });
    if (u.status === 'suspended') {
      return res.status(403).json({ message: 'This account is suspended. Contact support.' });
    }

    if (!u.phone_verified) {
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
        role: u.role,
        otpSent,
        note: note || null,
        resendAfterSeconds: RESEND_AFTER_S,
      });
    }

    return res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    return res.json({ user: publicUser(u) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
