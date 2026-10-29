// MySQL pool (lazy — the app can boot even if the DB is briefly down).
const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.pool,
  connectTimeout: 5000,
  dateStrings: true, // DATETIME as strings — avoids TZ drift in expiry checks
});

module.exports = { pool };
