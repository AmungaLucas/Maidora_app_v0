// Client-side validation — mirrors the server exactly (keep both in sync).
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s\-().]/g, '');
  const m = digits.match(/^(?:\+?254|0)?([17]\d{8})$/);
  return m ? `+254${m[1]}` : null;
}

export const isValidPhone = (raw) => normalizePhone(raw) !== null;

export const isValidEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

export const isValidPassword = (v) => typeof v === 'string' && v.length >= 8;

export const isValidFullName = (v) => {
  const s = String(v || '').trim();
  return s.length >= 3 && s.length <= 120 && /^[A-Za-z][A-Za-z' -]*$/.test(s);
};

export const isValidLocationName = (v) => {
  const s = String(v || '').trim();
  return s.length >= 2 && s.length <= 190;
};

export function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 6) return p;
  return `${p.slice(0, 6)} ••• ${p.slice(-3)}`;
}

export function validateSignup(form) {
  const errors = {};
  if (!isValidFullName(form.fullName)) {
    errors.fullName = 'Enter your full name (letters only, at least 3 characters).';
  }
  if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address.';
  if (!isValidPhone(form.phone)) {
    errors.phone = 'Enter a valid Kenyan number, e.g. 0712 345 678.';
  }
  if (!isValidLocationName(form.locationName)) {
    errors.locationName = 'Tell us where you are located, e.g. Nairobi, Utawala.';
  }
  if (!isValidPassword(form.password)) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  if (form.referralCode && String(form.referralCode).trim().length > 24) {
    errors.referralCode = 'Referral code looks too long.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
