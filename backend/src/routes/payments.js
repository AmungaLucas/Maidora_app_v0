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

// POST /api/payments/stk-push
// §5 verification gate — spending money is a platform service; unverified
// accounts must clear phone/email verification first. Browsing stays open.
router.post('/stk-push', requireAuth, requireVerified, async (req, res, next) => {
  try {
    if (!mpesa.isConfigured()) {
      return res.status(503).json({ message: 'M-Pesa is not configured yet. Try again later.' });
    }

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

    // Persist the intent first so we always have a row for reconciliation.
    const [ins] = await pool.query(
      "INSERT INTO payments (user_id, purpose, amount, phone, status) VALUES (?, ?, ?, ?, 'pending')",
      [req.user.uid, purpose, amount, phone]
    );
    const paymentId = ins.insertId;

    try {
      const push = await mpesa.stkPush({
        amount,
        phone,
        accountReference: undefined, // falls back to configured reference
      });
      await pool.query(
        'UPDATE payments SET merchant_request_id = ?, checkout_request_id = ? WHERE id = ?',
        [push.MerchantRequestID || null, push.CheckoutRequestID || null, paymentId]
      );
      return res.json({
        message: push.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
        paymentId,
        checkoutRequestId: push.CheckoutRequestID || null,
      });
    } catch (e) {
      // Daraja refused the push — mark the row failed and surface the reason.
      await pool.query("UPDATE payments SET status = 'failed', result_desc = ? WHERE id = ?", [
        String(e.message).slice(0, 250),
        paymentId,
      ]);
      throw e;
    }
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
            } else {
              // In-flight quirk: Daraja sometimes reports 1032 for a
              // transaction that is merely still awaiting a PIN. Trust the
              // callback — do NOT fail yet, tell the client when we will.
              live.settleIn = Math.max(0, Math.round((SETTLE_MS - ageMs) / 1000));
            }
          }
          // Any other outcome ("being processed", unknown codes) stays pending —
          // the Safaricom callback will settle it authoritatively.
        } catch (e) {
          // Query hiccup (e.g. "The transaction is being processed") — stay pending.
          live = { error: e.message };
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
router.post('/callback', async (req, res) => {
  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb && cb.CheckoutRequestID) {
      const items = {};
      if (cb.CallbackMetadata && Array.isArray(cb.CallbackMetadata.Item)) {
        for (const it of cb.CallbackMetadata.Item) items[it.Name] = it.Value;
      }
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
          JSON.stringify(req.body).slice(0, 4000),
          cb.CheckoutRequestID,
        ]
      );
      console.log(
        `[payments/callback] ${cb.CheckoutRequestID} -> ${status} rc=${rc} ` +
          `receipt=${items.MpesaReceiptNumber || '-'} rows=${r.affectedRows} "${String(cb.ResultDesc || '')}"`
      );
      if (!r.affectedRows) {
        console.warn(`[payments/callback] no payment row matches ${cb.CheckoutRequestID}`);
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
