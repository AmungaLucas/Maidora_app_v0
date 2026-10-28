// Server-side validation — mirrors the mobile app's src/validation.js exactly.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-().]/g, '');
  const m = digits.match(/^(?:\+?254|0)?([17]\d{8})$/);
  return m ? `+254${m[1]}` : null;
}

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
  }

  const phone = normalizePhone(b.phone);
  if (!phone) errors.phone = 'Enter a valid Kenyan number, e.g. 0712 345 678.';

  if (!['employer', 'househelp'].includes(b.role)) {
    errors.role = 'Choose a role.';
  }

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

  const referralCode = b.referralCode
    ? String(b.referralCode).trim().toUpperCase().slice(0, 24) || null
    : null;

  return { errors, values: { fullName, email, phone, role: b.role, password, locationName, lat, lng, referralCode } };
}

module.exports = { validateRegister, normalizePhone, EMAIL_RE };
