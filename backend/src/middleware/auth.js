// JWT auth middleware + verification gate (unified spec §4.3, §5).
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ message: 'Authentication required.' });
  try {
    req.user = jwt.verify(m[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  // §4.3 — stamp last_active_at on every authenticated action, write-throttled
  // to at most once per hour (decay + "last seen" read last_active_at).
  // Fire-and-forget: never blocks or fails the request.
  pool
    .query(
      'UPDATE users SET last_active_at = NOW() WHERE id = ? AND ' +
        '(last_active_at IS NULL OR last_active_at < (NOW() - INTERVAL 1 HOUR))',
      [req.user.uid]
    )
    .catch((e) => console.error('[auth] last_active_at update failed:', e.message));

  return next();
}

// §5 verification gate — clears when phone OR email is verified AND the
// account is active. Attach to every service endpoint (apply/post jobs,
// payments, chat-start…). Browsing/search stay open to unverified users.
async function requireVerified(req, res, next) {
  try {
    const [[u]] = await pool.query(
      'SELECT account_status, phone_verified_at, email_verified_at FROM users WHERE id = ? LIMIT 1',
      [req.user.uid]
    );
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (u.account_status === 'suspended' || u.account_status === 'deleted') {
      return res.status(403).json({
        code: 'account_inactive',
        message: 'This account is not active. Contact support.',
      });
    }
    if (!u.phone_verified_at && !u.email_verified_at) {
      return res.status(403).json({
        code: 'verification_required',
        message: 'Verify your phone number or email to use this feature.',
      });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { requireAuth, requireVerified };
