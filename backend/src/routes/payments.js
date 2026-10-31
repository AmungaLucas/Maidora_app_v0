// M-Pesa payments — STK Push initiate, status (with Daraja query fallback),
// and the public Daraja callback receiver.
//
//   POST /api/payments/stk-push   { amount, phone?, purpose? }  (auth)
//   GET  /api/payments            latest payments for the user  (auth)
//   GET  /api/payments/:id        payment status (?refresh=1 polls Daraja) (auth)
//   POST /api/payments/callback   Safaricom C2B callback       (public, ACKs fast)
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireVerified } = require('../middleware/auth');
const mpesa = require('../services/mpesa');
const { normalizePhone } = require('../utils/validate');

const router = express.Router();

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500000;

// ── Settlement policy ────────────────────────────────────────────────────
// The Safaricom CALLBACK is the single source of truth for settling a
// payment. The STK query API is only an accelerator, because Daraja is
// known to return misleading results for IN-FLIGHT transactions (e.g. 1032
// "Request Cancelled by user" while the prompt is still travelling to the
// phone — observed live at t+12s, before the prompt had even arrived).
//
//   0 … 45s      never query — the prompt may not have reached the phone
//                yet; the callback (or nothing) settles in this window.
//   45s … 150s   a query may only CONFIRM SUCCESS (rc=0). Failure codes are
//                reported to the client as live info but the row stays
//                pending — the callback remains authoritative.
//   after 150s   the STK prompt has well and truly expired, so a
//                definitive failure code finally closes the payment and
//                rows are not left pending forever if a callback is lost.
//   A late callback ALWAYS overrides the stored state (success included).
const GRACE_MS = 45000;
const SETTLE_MS = 150000;

// Query result codes that are DEFINITELY terminal failures:
//   1    insufficient funds
//   1032 cancelled by user
//   1037 timed out / expired
// Any other non-zero code stays pending — the Safaricom callback is the
// source of truth for the remaining failure modes.
const DEFINITIVE_FAILURE_CODES = new Set(['1', '1032', '1037']);

// What the customer sees from Safaricom, per payment purpose (§9 prices).
// Daraja limits: AccountReference ≤ 12 chars (alphanumeric), TransactionDesc
// ≤ 13 chars. Display reality: with CustomerBuyGoodsOnline (till) the prompt
// shows only the business name — the reference lands on the confirmation SMS
// and the M-Pesa statement; a PayBill-type shortcode additionally shows it
// on the prompt as "… for account <ref>".
const PURPOSE_STK = {
  app_test:          { ref: 'TEST',         desc: 'Test payment' },
  general:           { ref: 'MAIDORA',      desc: 'Maidora' },
  application:       { ref: 'APPLICATION',  desc: 'Application' },
  maid_basic:        { ref: 'MAIDBASIC',    desc: 'Maid Basic' },
  maid_gold:         { ref: 'MAIDGOLD',     desc: 'Maid Gold' },
  employer_gold:     { ref: 'EMPLOYERGOLD', desc: 'Employer Gold' },
  profile_boost:     { ref: 'PROFILEBOOST', desc: 'Profile boost' },
  application_boost: { ref: 'APPBOOST',     desc: 'App boost' },
  kyc_urgent:        { ref: 'KYCURGENT',    desc: 'Urgent KYC' },
};
const stkRef = (s) =>
  String(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'MAIDORA';
const stkDesc = (s) =>
  String(s).replace(/[^A-Za-z0-9 .-]/g, '').trim().slice(0, 13) || 'Maidora';

function paymentView(p) {
  return {
    id: p.id,
    purpose: p.purpose,
    amount: Number(p.amount),
    phone: p.phone,
    status: p.status,
    resultCode: p.result_code === undefined || p.result_code === null ? null : Number(p.result_code),
    mpesaReceipt: p.mpesa_receipt || null,
    resultDesc: p.result_desc || null,
    checkoutRequestId: p.checkout_request_id || null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// §8 urgent KYC (KSh 150) — marks the payer's identity review as expedited
// the moment an 'kyc_urgent' payment settles. Speed only: it never buys
// approval and is never refunded (rejection, abandonment or cancel).
// Fire-and-forget: a grant failure must not affect payment settlement.
async function grantKycUrgent(userId) {
  if (!userId) return;
  try {
    const [r] = await pool.query(
      'UPDATE users SET kyc_urgent = 1, kyc_urgent_paid_at = NOW() WHERE id = ? AND kyc_urgent = 0',
      [userId]
    );
    if (r.affectedRows) console.log(`[payments] kyc_urgent granted to user ${userId}`);
  } catch (e) {
    console.error('[payments] kyc_urgent grant failed:', e.message);
  }
}

// POST /api/payments/stk-push
// §5 verification gate — spending money is a platform service; unverified
// accounts must clear phone/email verification first. Browsing stays open.
//
// RESPOND-FIRST (2026-10-30): the payment row is created BEFORE Daraja is
// called, and the route answers the app IMMEDIATELY with the paymentId. The
// Daraja push then runs in the background. This kills the race where Daraja
// was slow, the app's 30s fetch was cancelled ("fetch has been cancelled"),
// the app showed FAILED — and the prompt still arrived a minute later and
// succeeded. The app now always lands in the "Check your phone" state and
// polls /payments/:id; a Daraja rejection flips the row to failed with a
// reason, which the poll surfaces. Same response shape as before plus
// `queued: true` (older builds only read paymentId — still compatible).
router.post('/stk-push', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (!mpesa.isConfigured()) {
      return res.status(503).json({ message: 'M-Pesa is not configured yet. Try again later.' });
    }
    const t0 = Date.now();

    const amount = Math.round(Number(req.body && req.body.amount));
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return res.status(400).json({
        message: `Enter an amount between KES ${MIN_AMOUNT} and KES ${MAX_AMOUNT}.`,
      });
    }

    const [[u]] = await pool.query('SELECT phone FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });

    const phone = normalizePhone((req.body && req.body.phone) || u.phone);
    if (!phone) {
      return res.status(400).json({ message: 'Enter a valid Kenyan number, e.g. 0712 345 678.' });
    }
    const purpose = String((req.body && req.body.purpose) || 'general').slice(0, 64);
    console.error(
      `[MPESA] push request → user=${req.user.uid} amount=${amount} phone=${phone} purpose=${purpose}` +
        ` (t+${Date.now() - (req.t0 || t0)}ms after request start — body parse + JWT auth + user lookup)`
    );

    // Persist the intent FIRST so we always have a row for reconciliation,
    // then hand the app its paymentId without waiting for Daraja.
    const [ins] = await pool.query(
      "INSERT INTO payments (user_id, purpose, amount, phone, status) VALUES (?, ?, ?, ?, 'pending')",
      [req.user.uid, purpose, amount, phone]
    );
    const paymentId = ins.insertId;
    console.error(`[MPESA] row #${paymentId} created (pending) in ${Date.now() - t0}ms`);

    // Fire the Daraja push in the background — never awaited by the request.
    // Every branch updates the same row; the callback stays the source of truth.
    const dispatch = (async () => {
      const dT0 = Date.now();
      console.error(`[MPESA] row #${paymentId} dispatching Daraja STK push…`);
      try {
        // Per-purpose label so the customer can tell WHY they are paying.
        const label = PURPOSE_STK[purpose] || { ref: purpose, desc: 'Maidora' };
        const push = await mpesa.stkPush({
          amount,
          phone,
          accountReference: stkRef(label.ref),
          transactionDesc: stkDesc(label.desc),
        });
        await pool.query(
          'UPDATE payments SET merchant_request_id = ?, checkout_request_id = ? WHERE id = ?',
          [push.MerchantRequestID || null, push.CheckoutRequestID || null, paymentId]
        );
        console.error(
          `[MPESA] row #${paymentId} push accepted in ${Date.now() - dT0}ms — prompt on its way to ${phone} (CheckoutRequestID=${push.CheckoutRequestID})`
        );
      } catch (e) {
        // Daraja refused the push — mark the row failed so the app's polling
        // shows the reason instead of waiting on a prompt that never comes.
        await pool.query("UPDATE payments SET status = 'failed', result_desc = ? WHERE id = ?", [
          String(e.message).slice(0, 250),
          paymentId,
        ]);
        console.error(`[MPESA] row #${paymentId} push FAILED in ${Date.now() - dT0}ms: ${e.message}`);
      }
    })();
    dispatch.catch((e) => console.error(`[MPESA] row #${paymentId} background push crashed:`, e && e.message));

    console.error(`[MPESA] row #${paymentId} responding to app in ${Date.now() - t0}ms (push continues in background)`);
    return res.json({
      message: 'Check your phone and enter your M-Pesa PIN.',
      paymentId,
      checkoutRequestId: null, // filled on the row once Daraja accepts
      queued: true,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/payments — user's recent payments
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [req.user.uid]
    );
    return res.json({ payments: rows.map(paymentView) });
  } catch (e) {
    next(e);
  }
});

// GET /api/payments/:id — status; ?refresh=1 live-queries Daraja while pending
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid payment.' });
    const [rows] = await pool.query(
      'SELECT * FROM payments WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.uid]
    );
    const p = rows[0];
    if (!p) return res.status(404).json({ message: 'Payment not found.' });

    let live = null;
    if (
      p.status === 'pending' &&
      req.query.refresh === '1' &&
      p.checkout_request_id &&
      mpesa.isConfigured()
    ) {
      const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0;
      const ageMs = Date.now() - createdMs;
      if (ageMs < GRACE_MS) {
        // Prompt may still be travelling to the phone — never query now.
        live = { grace: true, ageSeconds: Math.round(ageMs / 1000) };
      } else {
        try {
          const q = await mpesa.stkQuery({ checkoutRequestId: p.checkout_request_id });
          const rc = q.ResultCode === undefined || q.ResultCode === null ? null : String(q.ResultCode);
          live = { queried: true, resultCode: rc, resultDesc: q.ResultDesc || null };
          if (rc === '0') {
            // Success straight from Daraja — settle immediately (guarded so a
            // callback that just landed is never overwritten). The callback
            // will follow with the M-Pesa receipt number and fill it in.
            await pool.query(
              "UPDATE payments SET status = 'success', result_code = 0, result_desc = ? WHERE id = ? AND status = 'pending'",
              [String(q.ResultDesc || 'The service request is processed successfully.').slice(0, 250), id]
            );
            p.status = 'success';
            p.result_desc = q.ResultDesc;
            console.error(`[MPESA] row #${id} query SETTLED SUCCESS (age ${Math.round(ageMs / 1000)}s)`);
            if (p.purpose === 'kyc_urgent') await grantKycUrgent(p.user_id);
          } else if (rc !== null && DEFINITIVE_FAILURE_CODES.has(rc)) {
            if (ageMs >= SETTLE_MS) {
              // The prompt expired long ago (1032 cancelled, 1037 timed out,
              // 1 insufficient funds) — safe to close the payment now.
              await pool.query(
                "UPDATE payments SET status = 'failed', result_code = ?, result_desc = ? WHERE id = ? AND status = 'pending'",
                [Number(rc) || 0, String(q.ResultDesc || 'Payment failed.').slice(0, 250), id]
              );
              p.status = 'failed';
              p.result_code = Number(rc) || 0;
              p.result_desc = q.ResultDesc;
              console.error(`[MPESA] row #${id} query SETTLED FAILED rc=${rc} (age ${Math.round(ageMs / 1000)}s)`);
            } else {
              // In-flight quirk: Daraja sometimes reports 1032 for a
              // transaction that is merely still awaiting a PIN. Trust the
              // callback — do NOT fail yet, tell the client when we will.
              live.settleIn = Math.max(0, Math.round((SETTLE_MS - ageMs) / 1000));
              console.error(`[MPESA] row #${id} query rc=${rc} but in-flight (age ${Math.round(ageMs / 1000)}s) — staying pending, settle window opens in ${live.settleIn}s`);
            }
          } else {
            console.error(`[MPESA] row #${id} query rc=${rc} "${String(q.ResultDesc || '').slice(0, 80)}" — staying pending`);
          }
          // Any other outcome ("being processed", unknown codes) stays pending —
          // the Safaricom callback will settle it authoritatively.
        } catch (e) {
          // Query hiccup (e.g. "The transaction is being processed") — stay pending.
          live = { error: e.message };
          console.error(`[MPESA] row #${id} query error (staying pending): ${e.message}`);
        }
      }
    }

    return res.json({ payment: paymentView(p), live });
  } catch (e) {
    next(e);
  }
});

// POST /api/payments/callback — Safaricom posts the final result here.
// Must respond quickly with an ACK regardless of payload shape.
//
// RACE HARDENING (2026-10-31): the background push writes checkout_request_id
// onto the row right after the app got its respond-first answer, and on a
// loaded host that UPDATE can lag (observed 13.4s on payment #32 — MySQL
// stall, while Daraja had already accepted at t+2.2s). A callback arriving
// inside that window matches 0 rows and Safaricom does NOT retry, so the
// receipt would be lost forever. The first attempt therefore runs inline;
// if it matches nothing, the exact same settlement is retried in the
// BACKGROUND (~every 2.5s for up to ~60s) while Safaricom gets its ACK
// immediately. Residual risk: a gateway restart inside the retry window —
// the 150s Daraja-query path would still settle the payment (without the
// receipt number).
const CB_RETRY_MS = 2500;
const CB_RETRY_MAX = 24; // ~60s of background retries

// Apply a Daraja callback result to the row matched by checkout_request_id.
// Returns the number of rows updated (0 = row not ready yet).
async function settleByCheckoutId(cb, items, rawJson) {
  const rc = cb.ResultCode === undefined || cb.ResultCode === null ? null : Number(cb.ResultCode);
  const status = rc === 0 ? 'success' : 'failed';
  // Unconditional on purpose: the callback overrides any state the
  // query path wrote (it is the authoritative result from Safaricom).
  const [r] = await pool.query(
    `UPDATE payments
     SET status = ?, result_code = ?, result_desc = ?, mpesa_receipt = ?, raw_callback = ?
     WHERE checkout_request_id = ?`,
    [
      status,
      rc,
      String(cb.ResultDesc || '').slice(0, 250),
      items.MpesaReceiptNumber || null,
      rawJson,
      cb.CheckoutRequestID,
    ]
  );
  if (!r.affectedRows) return 0;
  console.error(
    `[MPESA] callback → ${cb.CheckoutRequestID} SETTLED ${status.toUpperCase()} rc=${rc} ` +
      `receipt=${items.MpesaReceiptNumber || '-'} rows=${r.affectedRows} "${String(cb.ResultDesc || '')}"`
  );
  // Purpose/user for side-effects (kyc_urgent) — purpose is immutable on the
  // row, so reading it after the settlement is equivalent to reading before.
  const [[pay]] = await pool.query(
    'SELECT user_id, purpose FROM payments WHERE checkout_request_id = ? LIMIT 1',
    [cb.CheckoutRequestID]
  );
  if (status === 'success' && pay && pay.purpose === 'kyc_urgent') {
    await grantKycUrgent(pay.user_id);
  }
  return r.affectedRows;
}

function retrySettle(cb, items, rawJson, attempt = 1) {
  if (attempt > CB_RETRY_MAX) {
    console.error(
      `[payments/callback] giving up on ${cb.CheckoutRequestID} after ${CB_RETRY_MAX} retries ` +
        `(~${Math.round((CB_RETRY_MAX * CB_RETRY_MS) / 1000)}s) — the 150s query path can still settle it (without receipt)`
    );
    return;
  }
  setTimeout(async () => {
    try {
      const rows = await settleByCheckoutId(cb, items, rawJson);
      if (rows > 0) {
        console.error(`[payments/callback] late row write matched on retry #${attempt} — ${cb.CheckoutRequestID} settled from callback`);
      } else {
        retrySettle(cb, items, rawJson, attempt + 1);
      }
    } catch (e) {
      console.error(`[payments/callback] retry #${attempt} error:`, e.message);
      retrySettle(cb, items, rawJson, attempt + 1);
    }
  }, CB_RETRY_MS);
}

router.post('/callback', async (req, res) => {
  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb && cb.CheckoutRequestID) {
      const items = {};
      if (cb.CallbackMetadata && Array.isArray(cb.CallbackMetadata.Item)) {
        for (const it of cb.CallbackMetadata.Item) items[it.Name] = it.Value;
      }
      const rawJson = JSON.stringify(req.body).slice(0, 4000);
      let rows = 0;
      try {
        rows = await settleByCheckoutId(cb, items, rawJson);
      } catch (e) {
        console.error('[payments/callback] settlement error:', e.message);
      }
      if (!rows) {
        console.warn(
          `[payments/callback] no payment row matches ${cb.CheckoutRequestID} yet — retrying in background ` +
            `(every ${CB_RETRY_MS / 1000}s × ${CB_RETRY_MAX})`
        );
        retrySettle(cb, items, rawJson);
      }
    } else {
      console.warn(
        '[payments/callback] unrecognized payload — top-level keys:',
        Object.keys(req.body || {}).join(', ') || '(empty)'
      );
    }
  } catch (e) {
    console.error('[payments/callback]', e.message);
  }
  // Always ACK so Safaricom does not retry. Both documented response
  // conventions are included, so whichever shape their parser expects is
  // present; the HTTP 200 + body tells Daraja the result was received and
  // the transaction is fully processed on our side.
  return res.json({
    ResponseCode: '0',
    ResponseDescription: 'Accepted',
    ResultCode: 0,
    ResultDesc: 'Accepted',
  });
});

module.exports = router;
