// Safaricom Daraja client — STK Push (Lipa na M-Pesa Online), production.
// Endpoints:
//   OAuth      GET  /oauth/v1/generate?grant_type=client_credentials
//   STK Push   POST /mpesa/stkpush/v1/processrequest
//   STK Query  POST /mpesa/stkpushquery/v1/query
const config = require('../config');

const m = config.mpesa;

// OAuth token cache — Daraja tokens last ~1 hour; refresh 60s early.
let cachedToken = null; // { token, expiresAtMs }

function isConfigured() {
  return Boolean(
    m.consumerKey && m.consumerSecret && m.shortcode && m.passkey && m.partyB && m.callbackUrl
  );
}

function mpesaError(message, provider) {
  const err = new Error(message);
  err.status = 502;
  err.provider = provider;
  return err;
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function shortCodePassword(ts) {
  // base64(shortcode + passkey + timestamp) per Daraja spec
  return Buffer.from(`${m.shortcode}${m.passkey}${ts}`).toString('base64');
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs) return cachedToken.token;
  const basic = Buffer.from(`${m.consumerKey}:${m.consumerSecret}`).toString('base64');
  let res;
  let data;
  try {
    res = await fetch(`${m.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    throw mpesaError(`M-Pesa OAuth unreachable: ${e.message}`, null);
  }
  if (!res.ok || !data || !data.access_token) {
    throw mpesaError(
      (data && (data.errorMessage || data.error)) ||
        'M-Pesa authentication failed. Check consumer key/secret.',
      data
    );
  }
  const ttlS = Number(data.expires_in || 3599);
  cachedToken = { token: data.access_token, expiresAtMs: Date.now() + Math.max(60, ttlS - 60) * 1000 };
  return cachedToken.token;
}

/**
 * Trigger an STK Push prompt on the customer's phone.
 * @param {{amount:number, phone:string, accountReference?:string}} p
 *   `phone` is E.164 (+2547XXXXXXXX) — the leading + is stripped for Daraja.
 * Resolves with { MerchantRequestID, CheckoutRequestID, CustomerMessage, ... }.
 * Throws Error with .status=502 and .provider on rejection.
 */
async function stkPush({ amount, phone, accountReference }) {
  if (!isConfigured()) {
    const err = new Error('M-Pesa is not fully configured on the server.');
    err.status = 503;
    throw err;
  }
  const msisdn = String(phone).replace(/^\+/, '');
  const ts = timestamp();
  let res;
  let data;
  try {
    res = await fetch(`${m.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: m.shortcode,
        Password: shortCodePassword(ts),
        Timestamp: ts,
        TransactionType: m.transactionType,
        Amount: Math.round(Number(amount)),
        PartyA: msisdn,
        PartyB: m.partyB,
        PhoneNumber: msisdn,
        CallBackURL: m.callbackUrl,
        AccountReference: accountReference || m.accountReference,
        TransactionDesc: m.description,
      }),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    throw mpesaError(`M-Pesa STK push unreachable: ${e.message}`, null);
  }
  if (String(data && data.ResponseCode) !== '0') {
    throw mpesaError(
      (data && (data.errorMessage || data.ResponseDescription)) ||
        `M-Pesa rejected the request (HTTP ${res.status}).`,
      data
    );
  }
  return data;
}

/**
 * Query the status of an STK Push transaction (fallback when the callback is
 * missed — e.g. callback host unreachable). Resolves with
 * { ResultCode, ResultDesc, ResponseCode, ResponseDescription, ... }.
 * ResultCode: "0" paid, "1032" user cancelled, "1037" expired/timed out,
 * "1" insufficient balance. Throws if the transaction is not yet processed.
 */
async function stkQuery({ checkoutRequestId }) {
  if (!isConfigured()) {
    const err = new Error('M-Pesa is not fully configured on the server.');
    err.status = 503;
    throw err;
  }
  const ts = timestamp();
  let res;
  let data;
  try {
    res = await fetch(`${m.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: m.shortcode,
        Password: shortCodePassword(ts),
        Timestamp: ts,
        CheckoutRequestID: checkoutRequestId,
      }),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    throw mpesaError(`M-Pesa query unreachable: ${e.message}`, null);
  }
  if (!res.ok || !data || data.errorMessage) {
    throw mpesaError(
      (data && (data.errorMessage || data.ResponseDescription)) ||
        `M-Pesa query failed (HTTP ${res.status}).`,
      data
    );
  }
  return data;
}

module.exports = { getAccessToken, stkPush, stkQuery, isConfigured };
