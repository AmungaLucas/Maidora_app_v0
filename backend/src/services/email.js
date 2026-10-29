// Email service (nodemailer SMTP) — optional email-verification path
// (unified spec §2, §5). Credentials live ONLY in the server .env:
//   SMTP_HOST=mail.maidora.co.ke, SMTP_PORT=465, SMTP_SECURE=1,
//   SMTP_USER=verification@maidora.co.ke, SMTP_PASS=<rotated secret>,
//   SMTP_FROM="Maidora Kenya <verification@maidora.co.ke>"
// When host/user/pass are unset the service fails SOFT: callers return a
// friendly "temporarily unavailable" note and phone verification (the default
// path) is unaffected.
const nodemailer = require('nodemailer');
const config = require('../config');

let cachedTransporter = null;

function isConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return cachedTransporter;
}

function notConfiguredError() {
  const err = new Error('Email verification is temporarily unavailable.');
  err.status = 503;
  err.code = 'EMAIL_NOT_CONFIGURED';
  return err;
}

// 6-digit email verification code — same TTL/caps as the phone OTP.
async function sendVerificationCode(to, code) {
  const transporter = getTransporter();
  if (!transporter) throw notConfiguredError();

  const ttl = config.otp.ttlMinutes;
  const subject = 'Your Maidora Kenya verification code';
  const text =
    `Your Maidora Kenya verification code is ${code}. ` +
    `It expires in ${ttl} minutes. Do not share this code.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <p style="font-size:15px;color:#333;margin:0 0 16px;">Your Maidora Kenya verification code is</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#214E3B;margin:0 0 16px;">${code}</p>
      <p style="font-size:14px;color:#555;margin:0 0 8px;">It expires in ${ttl} minutes.</p>
      <p style="font-size:14px;color:#555;margin:0;">Do not share this code — Maidora will never call or email asking for it.</p>
    </div>`;

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendVerificationCode, isConfigured };
