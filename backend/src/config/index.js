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
