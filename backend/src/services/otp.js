// Phone OTP issue/verify — hashed storage, cooldown + hourly caps, attempt limits.
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../config/db');

const TTL_MINUTES = config.otp.ttlMinutes;
const RESEND_COOLDOWN_S = 60;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function hashCode(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Creates the OTP row and returns the plaintext code (caller sends the SMS).
async function issueOtp(userId) {
  const [[last]] = await pool.query(
    'SELECT created_at FROM phone_otps WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (last) {
    const ageS = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (ageS < RESEND_COOLDOWN_S) {
      const err = new Error(`Please wait ${Math.ceil(RESEND_COOLDOWN_S - ageS)}s before requesting another code.`);
      err.status = 429;
      throw err;
    }
  }

  const [[cnt]] = await pool.query(
    'SELECT COUNT(*) AS n FROM phone_otps WHERE user_id = ? AND created_at > (NOW() - INTERVAL 1 HOUR)',
    [userId]
  );
  if (cnt.n >= MAX_PER_HOUR) {
    const err = new Error('Too many codes requested. Please try again later.');
    err.status = 429;
    throw err;
  }

  const code = generateCode();
  await pool.query(
    'INSERT INTO phone_otps (user_id, code_hash, expires_at) VALUES (?, ?, (NOW() + INTERVAL ? MINUTE))',
    [userId, hashCode(userId, code), TTL_MINUTES]
  );
  return code;
}

// Verifies and consumes the newest active OTP for the user.
async function verifyOtpCode(userId, code) {
  const [[row]] = await pool.query(
    'SELECT * FROM phone_otps WHERE user_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (!row) {
    const err = new Error('No active code found. Request a new one.');
    err.status = 400;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error('This code has expired. Request a new one.');
    err.status = 410;
    throw err;
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    const err = new Error('Too many wrong attempts. Request a new code.');
    err.status = 429;
    throw err;
  }
  if (hashCode(userId, String(code)) !== row.code_hash) {
    await pool.query('UPDATE phone_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const err = new Error('Incorrect code. Please try again.');
    err.status = 400;
    throw err;
  }
  await pool.query('UPDATE phone_otps SET consumed_at = NOW() WHERE id = ?', [row.id]);
}

// OTP SMS body. When OTP_APP_HASH is set (Android SMS Retriever), the message
// ends with the app's 11-char hash so expo-otp-autofill can read the code
// without SMS permissions. Keep the whole message <= 140 bytes.
function otpSmsMessage(code) {
  const base = `Your Maidora Kenya verification code is ${code}. It expires in ${TTL_MINUTES} minutes.`;
  return config.otp.appHash
    ? `${base} ${config.otp.appHash}`
    : `${base} Do not share this code.`;
}

module.exports = { issueOtp, verifyOtpCode, hashCode, generateCode, otpSmsMessage };
