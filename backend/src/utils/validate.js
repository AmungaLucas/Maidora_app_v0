// Server-side validation — mirrors the mobile app's src/validation.js exactly
// (keep both in sync).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-().]/g, '');
  const m = digits.match(/^(?:\+?254|0)?([17]\d{8})$/);
  return m ? `+254${m[1]}` : null;
}

// §12 — temporary/disposable email domains, blocked at signup, on email
// change, and re-checked at email-verification time (blocklists change).
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'sharklasers.com',
  'grr.la', 'yopmail.com', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'trashmail.com', 'fakeinbox.com', 'spam4.me', 'tempr.email', 'discard.email',
  '1secmail.com', '1secmail.org', '1secmail.net', 'mohmal.com', 'emailondeck.com',
  'mailcatch.com', 'tempinbox.com', 'mytemp.email', 'burnermail.io', 'mail7.io',
  'linshiyouxiang.net', 'bccto.me', 'chacuo.net', 'mailsac.com', 'inboxkitten.com',
  'tempmail.plus', 'moakt.com', 'tmail.ws', 'smtpbox.org', 'mailpoof.com',
]);

function isDisposableEmail(email) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// NOTE: role is intentionally NOT part of signup anymore — it is chosen at
// onboarding, after phone verification (unified spec §3.2), and is immutable
// once set.
function validateRegister(body) {
  const errors = {};
  const b = body || {};

  const fullName = String(b.fullName || '').trim();
  if (fullName.length < 3 || fullName.length > 120) {
    errors.fullName = 'Enter your full name (at least 3 characters).';
  } else if (!/^[A-Za-z][A-Za-z' -]*$/.test(fullName)) {
    errors.fullName = 'Name contains invalid characters.';
  }

  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 190) {
    errors.email = 'Enter a valid email address.';
  } else if (isDisposableEmail(email)) {
    errors.email = 'This email provider is not accepted. Please use a different email.';
  }

  const phone = normalizePhone(b.phone);
  if (!phone) errors.phone = 'Enter a valid Kenyan number, e.g. 0712 345 678.';

  const password = String(b.password || '');
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (b.confirmPassword !== undefined && b.confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  const locationName = b.locationName ? String(b.locationName).trim().slice(0, 190) : null;
  if (locationName !== null && locationName.length < 2) {
    errors.locationName = 'Tell us where you are located.';
  }

  let lat = null;
  let lng = null;
  if (b.latitude !== undefined && b.latitude !== null && b.latitude !== '') {
    const v = Number(b.latitude);
    if (!Number.isFinite(v) || v < -90 || v > 90) errors.latitude = 'Invalid latitude.';
    else lat = v;
  }
  if (b.longitude !== undefined && b.longitude !== null && b.longitude !== '') {
    const v = Number(b.longitude);
    if (!Number.isFinite(v) || v < -180 || v > 180) errors.longitude = 'Invalid longitude.';
    else lng = v;
  }

  const locationArea = b.locationArea ? String(b.locationArea).trim().slice(0, 120) || null : null;
  const locationCounty = b.locationCounty ? String(b.locationCounty).trim().slice(0, 120) || null : null;
  const locationSource = b.locationSource === 'gps' || b.locationSource === 'manual'
    ? b.locationSource
    : (lat !== null && lng !== null ? 'gps' : null);

  const referralCode = b.referralCode
    ? String(b.referralCode).trim().toUpperCase().slice(0, 24) || null
    : null;

  return {
    errors,
    values: {
      fullName, email, phone, password,
      locationName, locationArea, locationCounty, locationSource, lat, lng,
      referralCode,
    },
  };
}

module.exports = { validateRegister, normalizePhone, EMAIL_RE, isDisposableEmail, DISPOSABLE_EMAIL_DOMAINS };
