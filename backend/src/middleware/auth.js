// JWT auth middleware.
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ message: 'Authentication required.' });
  try {
    req.user = jwt.verify(m[1], process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
}

module.exports = { requireAuth };
