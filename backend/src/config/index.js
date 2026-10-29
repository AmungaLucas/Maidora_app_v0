// Central gateway configuration — loads .env once; every module reads from here.
// The .env path is resolved relative to this file so scripts and workers find
// it no matter what the process working directory is.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  jwtSecret: process.env.JWT_SECRET,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    pool: Number(process.env.DB_POOL || 5),
  },

  // TalkSasa SMS gateway (OTP delivery)
  sms: {
    apiUrl: (process.env.SMS_API_URL || 'https://bulksms.talksasa.com/api/v3').replace(/\/+$/, ''),
    token: process.env.SMS_API_TOKEN,
    senderId: process.env.SMS_SENDER_ID || 'TALK-SASA',
  },

  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
    // Android SMS Retriever app hash (11 chars, from expo-otp-autofill
    // getAppHashAsync()). When set, it is appended to OTP SMS so the app can
    // auto-fill the code. Leave empty until the Android dev build exists.
    appHash: (process.env.OTP_APP_HASH || '').trim(),
  },

  // §11 login throttle — 5 failures/account/15min → 15min cooldown; 20 attempts/IP/hour.
  login: {
    maxFailsPerWindow: Number(process.env.LOGIN_MAX_FAILS || 5),
    failWindowMinutes: Number(process.env.LOGIN_FAIL_WINDOW_MIN || 15),
    cooldownMinutes: Number(process.env.LOGIN_COOLDOWN_MIN || 15),
    maxPerIpPerHour: Number(process.env.LOGIN_MAX_PER_IP_HOUR || 20),
  },

  // §2 — SMTP for the optional email-verification path (mail.maidora.co.ke).
  // SMTP_PASS lives ONLY in the server .env (rotated credential — never in
  // the repo). When host/user/pass are unset the email service fails soft
  // and phone verification remains the default path.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? '1') === '1',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },

  // §8 KYC — private image storage. Files live under the app root but are
  // NEVER web-served: kyc_uploads/.htaccess denies direct access and the only
  // read path is the authenticated /api/kyc/images/:field route. Override
  // with KYC_UPLOAD_DIR if the layout ever changes.
  kyc: {
    uploadDir: process.env.KYC_UPLOAD_DIR || path.join(__dirname, '..', '..', 'kyc_uploads'),
  },

  // Safaricom Daraja — M-Pesa STK Push (Lipa na M-Pesa Online, production)
  mpesa: {
    baseUrl: process.env.MPESA_BASE_URL || 'https://api.safaricom.co.ke',
    consumerKey: process.env.MPESA_PROD_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_PROD_CONSUMER_SECRET,
    shortcode: process.env.MPESA_PROD_BUSINESS_SHORTCODE,
    transactionType: process.env.MPESA_PROD_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
    partyB: process.env.MPESA_PROD_PARTY_B,
    passkey: process.env.MPESA_PROD_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    // AccountReference appears on the customer's M-Pesa statement (max 12 chars)
    accountReference: (process.env.MPESA_ACCOUNT_REFERENCE || 'Maidora').slice(0, 12),
    // TransactionDesc (max 13 chars on Daraja)
    description: (process.env.MPESA_TRANSACTION_DESC || 'Maidora payment').slice(0, 13),
  },
};

module.exports = config;
