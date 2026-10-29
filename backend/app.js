// Maidora Kenya gateway — Express API (entry point).
// Deployed on cPanel (LiteSpeed lsnode), app root /home/maidorac/maidora_app.
//
// Structure:
//   src/config     env loading, MySQL pool
//   src/routes     health, auth, profile, payments (mounted below)
//   src/services   otp, sms (TalkSasa), mpesa (Daraja), email (SMTP)
//   src/middleware JWT auth + verification gate
//   src/utils      validation (mirrors the mobile app)
const express = require('express');
const config = require('./src/config');
const healthRoutes = require('./src/routes/health');
const authRoutes = require('./src/routes/auth');
const paymentsRoutes = require('./src/routes/payments');
const profileRoutes = require('./src/routes/profile');

const app = express();
app.use(express.json({ limit: '256kb' }));

// --- Routes ---
app.use('/api', healthRoutes); // /api/health (contract monitored externally), /api/db-health
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/profile', profileRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Central error handler — maps err.status from services/routes.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[gateway] error on', req.method, req.path, err);
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
  });
});

// --- Start ---
app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
