// Maidora Kenya gateway — Express API (entry point).
// Deployed on cPanel (LiteSpeed lsnode), app root /home/maidorac/maidora_app.
//
// Structure:
//   src/config     env loading, MySQL pool
//   src/routes     health, auth, profile, payments, kyc (mounted below)
//   src/services   otp, sms (TalkSasa), mpesa (Daraja), email (SMTP)
//   src/middleware JWT auth + verification gate
//   src/utils      validation (mirrors the mobile app)
const express = require('express');
const config = require('./src/config');
const healthRoutes = require('./src/routes/health');
const authRoutes = require('./src/routes/auth');
const paymentsRoutes = require('./src/routes/payments');
const profileRoutes = require('./src/routes/profile');
const kycRoutes = require('./src/routes/kyc');
const mediaRoutes = require('./src/routes/media');

const app = express();

// Earliest possible request timestamp — routes log (Date.now() - req.t0) to
// attribute latency between body parse + middleware (JWT auth, DB lookups)
// and their own work. This is how we tell "slow mobile network" from "slow
// gateway" in the [MPESA] trace (the 9.4s push call on 2026-10-30 was
// network: the gateway answered in 5ms of route time).
app.use((req, res, next) => {
  req.t0 = Date.now();
  next();
});

// KYC image uploads arrive as base64 JSON (up to ~7 MB encoded) — mount the
// KYC router with its own larger body parser BEFORE the global 256kb one.
// body-parser skips requests it has already parsed, so nothing double-runs.
app.use('/api/kyc', express.json({ limit: '12mb' }), kycRoutes);

// Media uploads (avatars + KYC documents, WebP-first) use the same base64
// JSON shape — same 12 MB parser allowance.
app.use('/api/media', express.json({ limit: '12mb' }), mediaRoutes);

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
// field/code pass through so the app can highlight the offending input
// (e.g. which KYC item is missing) and branch on typed error codes.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[gateway] error on', req.method, req.path, err);
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
    ...(err.field ? { field: err.field } : {}),
    ...(err.code && status < 500 ? { code: err.code } : {}),
  });
});

// --- Start ---
app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
