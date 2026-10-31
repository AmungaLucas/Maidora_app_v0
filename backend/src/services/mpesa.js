// Safaricom Daraja client — STK Push (Lipa na M-Pesa Online), production.
// Endpoints:
//   OAuth      GET  /oauth/v1/generate?grant_type=client_credentials
//   STK Push   POST /mpesa/stkpush/v1/processrequest
//   STK Query  POST /mpesa/stkpushquery/v1/query
//
// Every call is timed and logged with the [MPESA] tag so the WHOLE payment
// journey (request → OAuth → push → query → callback) can be traced in the
// gateway stderr log end to end. All Daraja fetches carry hard timeouts —
// an undici socket left hanging used to stall the STK push route for the
// full client timeout and get the request cancelled on the phone.
const config = require('../config');

const m = config.mpesa;

const OAUTH_TIMEOUT_MS = 15000;
const PUSH_TIMEOUT_MS = 25000;
const QUERY_TIMEOUT_MS = 15000;

// OAuth token cache — Daraja tokens last ~1 hour; refresh 60s early.
let cachedToken = null; // { token, expiresAtMs }
let tokenFetchPromise = null; // in-flight refresh — two concurrent background
// pushes used to race here and fetch TWO tokens (seen live 2026-10-30); the
// shared promise makes every concurrent caller await the same fetch.

const nowMs = () => Date.now();
const elapsed = (t0) => `${Date.now() - t0}ms`;

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

// undici's bare "fetch failed" hides the real reason in err.cause. Dig it out
// (one level is usually enough, but walk the chain just in case) so the log —
// and the reason stored on the payment row — actually names the problem.
function networkReason(e, timeoutMs) {
  if (!e) return 'network error';
  if (e.name === 'TimeoutError') return `no response within ${timeoutMs}ms`;
  const bits = [];
  let c = e.cause;
  while (c) {
    if (c.code) bits.push(String(c.code));
    if (c.message && c.message !== e.message) bits.push(String(c.message));
    c = c.cause;
  }
  const causeStr = bits.length ? ` (${bits.slice(0, 3).join(' · ')})` : '';
  return `${e.message || 'network error'}${causeStr}`;
}

// Connect-class network errors = the request NEVER LEFT this box (DNS, TCP
// connect, TLS handshake) — Daraja never saw attempt 1, so retrying is safe:
// it cannot double-prompt the customer. Everything else (reset mid-response,
// our own AbortSignal deadline, socket hang-up after send) is NOT retried —
// the push may already be on its way and a blind retry could charge twice.
// Observed live 2026-10-31: the tela-host→api.safaricom.co.ke route is lossy;
// undici's built-in 10s connect timeout produced two "fetch failed" rows
// (~10.5s each) before a third manual attempt succeeded in 7.7s.
function isConnectClassError(e) {
  const connectCodes = new Set([
    'UND_ERR_CONNECT_TIMEOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ]);
  let c = e && e.cause;
  while (c) {
    if (connectCodes.has(c.code)) return true;
    // OS-level connect timeout: ETIMEDOUT tagged with syscall 'connect'
    if (c.code === 'ETIMEDOUT' && (c.syscall === 'connect' || c.syscall === undefined)) return true;
    c = c.cause;
  }
  return false;
}

const CONNECT_RETRY_BACKOFF_MS = 1200;

// fetch() with a hard deadline; network/abort failures become readable
// provider errors instead of undici's bare "fetch failed". Connect-class
// failures get ONE automatic retry (attempt 2/2) — the first attempt provably
// never reached Daraja, so this can never double-prompt.
async function darajaFetch(url, opts, timeoutMs, label) {
  const t0 = nowMs();
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
      console.error(`[MPESA] ${label} → HTTP ${res.status} in ${elapsed(t0)}`);
      return res;
    } catch (e) {
      lastErr = e;
      const retryable = isConnectClassError(e) && attempt < 2;
      console.error(
        `[MPESA] ${label} FAILED after ${elapsed(t0)} (attempt ${attempt}/2): ${networkReason(e, timeoutMs)}` +
          (retryable ? ' — request never reached Daraja, retrying once…' : '')
      );
      if (!retryable) break;
      await new Promise((r) => setTimeout(r, CONNECT_RETRY_BACKOFF_MS));
    }
  }
  throw mpesaError(`M-Pesa ${label} unreachable: ${networkReason(lastErr, timeoutMs)}`, null);
}

function timestamp() {
  // Daraja requires the timestamp in Kenya time (UTC+3) — never rely on the
  // server's local timezone (cPanel hosts commonly run UTC, which produces
  // "invalid timestamp" rejections). Format: yyyyMMddHHmmss.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((x) => x.type === t) || { value: '' };
  return (
    `${get('year').value}${get('month').value}${get('day').value}` +
    `${get('hour').value}${get('minute').value}${get('second').value}`
  );
}

function shortCodePassword(ts) {
  // base64(shortcode + passkey + timestamp) per Daraja spec
  return Buffer.from(`${m.shortcode}${m.passkey}${ts}`).toString('base64');
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs) return cachedToken.token;
  if (!tokenFetchPromise) {
    tokenFetchPromise = requestToken().finally(() => {
      tokenFetchPromise = null; // failed or finished — next caller retries fresh
    });
  }
  return tokenFetchPromise;
}

async function requestToken() {
  const t0 = nowMs();
  console.error('[MPESA] OAuth token missing/expired — requesting a new one…');
  const basic = Buffer.from(`${m.consumerKey}:${m.consumerSecret}`).toString('base64');
  let res;
  let data;
  try {
    res = await darajaFetch(
      `${m.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${basic}` } },
      OAUTH_TIMEOUT_MS,
      'OAuth'
    );
    data = await res.json().catch(() => null);
  } catch (e) {
    throw e; // already a readable mpesaError from darajaFetch
  }
  if (!res.ok || !data || !data.access_token) {
    console.error(`[MPESA] OAuth rejected after ${elapsed(t0)}: ${(data && (data.errorMessage || data.error)) || `HTTP ${res.status}`}`);
    throw mpesaError(
      (data && (data.errorMessage || data.error)) ||
        'M-Pesa authentication failed. Check consumer key/secret.',
      data
    );
  }
  const ttlS = Number(data.expires_in || 3599);
  cachedToken = { token: data.access_token, expiresAtMs: Date.now() + Math.max(60, ttlS - 60) * 1000 };
  console.error(`[MPESA] OAuth OK in ${elapsed(t0)} — token cached for ~${Math.round((cachedToken.expiresAtMs - Date.now()) / 1000)}s`);
  return cachedToken.token;
}

/**
 * Trigger an STK Push prompt on the customer's phone.
 * @param {{amount:number, phone:string, accountReference?:string,
 *           transactionDesc?:string}} p
 *   `phone` is E.164 (+2547XXXXXXXX) — the leading + is stripped for Daraja.
 *   `accountReference` (≤12 chars, alphanumeric) and `transactionDesc`
 *   (≤13 chars) override the configured defaults per payment purpose —
 *   the payments route derives them from the purpose map. The reference is
 *   what Safaricom shows as the payment reason (PayBill prompts show it as
 *   "for account …"; BuyGoods prompts keep it for the SMS + statement).
 * Resolves with { MerchantRequestID, CheckoutRequestID, CustomerMessage, ... }.
 * Throws Error with .status=502 and .provider on rejection.
 */
async function stkPush({ amount, phone, accountReference, transactionDesc }) {
  if (!isConfigured()) {
    const err = new Error('M-Pesa is not fully configured on the server.');
    err.status = 503;
    throw err;
  }
  const msisdn = String(phone).replace(/^\+/, '');
  const ts = timestamp();
  const t0 = nowMs();
  const acctRef = accountReference || m.accountReference;
  const txDesc = transactionDesc || m.description;
  console.error(
    `[MPESA] STK push payload — accountReference="${acctRef}" desc="${txDesc}" phone=${msisdn} amount=${Math.round(Number(amount))}`
  );
  let res;
  let data;
  try {
    res = await darajaFetch(
      `${m.baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
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
          AccountReference: acctRef,
          TransactionDesc: txDesc,
        }),
      },
      PUSH_TIMEOUT_MS,
      'STK push'
    );
    data = await res.json().catch(() => null);
  } catch (e) {
    throw e; // already a readable mpesaError from darajaFetch
  }
  if (String(data && data.ResponseCode) !== '0') {
    console.error(
      `[MPESA] STK push REJECTED in ${elapsed(t0)}: ${(data && (data.errorMessage || data.ResponseDescription)) || `HTTP ${res.status}`}`
    );
    throw mpesaError(
      (data && (data.errorMessage || data.ResponseDescription)) ||
        `M-Pesa rejected the request (HTTP ${res.status}).`,
      data
    );
  }
  console.error(
    `[MPESA] STK push ACCEPTED in ${elapsed(t0)} — MerchantRequestID=${data.MerchantRequestID} CheckoutRequestID=${data.CheckoutRequestID} phone=${msisdn} amount=${Math.round(Number(amount))}`
  );
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
    res = await darajaFetch(
      `${m.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
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
      },
      QUERY_TIMEOUT_MS,
      'STK query'
    );
    data = await res.json().catch(() => null);
  } catch (e) {
    throw e; // already a readable mpesaError from darajaFetch
  }
  if (!res.ok || !data || data.errorMessage) {
    console.error(`[MPESA] STK query FAILED: ${(data && (data.errorMessage || data.ResponseDescription)) || `HTTP ${res.status}`} (CheckoutRequestID=${checkoutRequestId})`);
    throw mpesaError(
      (data && (data.errorMessage || data.ResponseDescription)) ||
        `M-Pesa query failed (HTTP ${res.status}).`,
      data
    );
  }
  console.error(
    `[MPESA] STK query OK — CheckoutRequestID=${checkoutRequestId} ResultCode=${data.ResultCode} "${String(data.ResultDesc || '').slice(0, 80)}"`
  );
  return data;
}

module.exports = { getAccessToken, stkPush, stkQuery, isConfigured };
