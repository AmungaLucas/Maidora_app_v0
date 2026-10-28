// Health routes — mounted at /api. The /api/health contract is monitored
// externally, so its response shape must not change.
const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

router.get('/db-health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok, DATABASE() AS db, NOW() AS now');
    res.json({
      status: 'ok',
      database: rows[0].db,
      serverTime: rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      code: err.code,
    });
  }
});

module.exports = router;
