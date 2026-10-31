// M-Pesa payment — live STK Push against the Daraja production gateway.
// Flow: choose amount -> "Send STK Push" (the button itself spins — no
// full-screen veil; the gateway answers in milliseconds) -> the staged
// progress card crossfades in -> the user keys their M-Pesa PIN -> the
// SAFARICOM CALLBACK settles the payment (source of truth; the gateway only
// uses the Daraja query API to confirm success early, never to fail an
// in-flight prompt) -> a dedicated SUCCESS screen celebrates with the
// receipt. Failure gets its own calm card with the reason mapped from the
// result code — never a generic "Payment failed".
//
// Three distinct UI phases (2026-10-31 UX round, owner-approved blueprint):
//   PROGRESS — a truthful 4-step tracker driven by REAL events:
//     1. Payment accepted by gateway   — always done once the card shows
//                                        (respond-first: the row exists).
//     2. Prompt sent to your phone     — done when the row carries a
//                                        checkout_request_id (Daraja accepted
//                                        the push, seen on the next poll).
//     3. Enter your M-Pesa PIN         — the long wait; a COUNTDOWN lives
//                                        here (ball is in the user's court)
//                                        plus a "Didn't get a prompt?" tips
//                                        toggle.
//     4. Payment confirmed             — the terminal step; the tracker
//                                        NEVER advances past stage 3 until
//                                        the backend holds a real result.
//   SUCCESS — separate celebration screen: the BRAND MARK draws itself
//     (SuccessMark — radar lock-on ping, house strokes draw in, gold seam
//     finishes with a spark + one restrained brand spark burst; no confetti,
//     no generic checkmark — KES 50 should still not feel like a lottery
//     win), receipt number, amount, paid-at time (EAT), Back to Home. Fired
//     only when the backend holds ResultCode 0 from the callback or an
//     authoritative query.
//   FAILED — separate calm card: FailMark (the radar rings collapse onto a
//     ghost of the mark — signal lost — plus a gentle shake) with the
//     specific reason by code (1 balance / 1032 cancelled / 1037 no PIN in
//     time / 2001 wrong PIN), reassurance that nothing was charged, Try
//     Again + Back to Home.
//
// Timing: STK prompts regularly take 30-60s+ for the user to key their PIN,
// so polling runs every 4s for up to ~3.5 minutes (the countdown mirrors
// this — calibrated to the server's 150s settle window and real prompt
// lifetimes, longer than the generic "90s" rule), and a little longer after
// success so the callback's receipt lands. When we stop auto-checking the
// payment is left PENDING (never "failed") with a Keep Checking action.
//
// Edge cases handled: double-tap (button disabled + starting guard), app
// closed mid-payment (a mount probe offers to RESUME a recent pending row —
// the gateway and the M-Pesa SMS keep working either way), duplicate
// callbacks (backend settlement is idempotent by checkout_request_id), and
// a timed-out push call (the most recent pending row is ADOPTED instead of
// dead-ending).
//
// Every step of the journey logs a [MPESA] line (start → push → poll ticks →
// settlement → receipt) so the whole flow can be traced from the console.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandLoader from '../../components/brand/BrandLoader';
import SuccessMark from '../../components/brand/SuccessMark';
import FailMark from '../../components/brand/FailMark';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton, Screen, ScreenHeader, TextField } from '../../ui';

const AMOUNTS = [1, 50, 100, 200, 500];
const POLL_MS = 4000;
const MAX_POLLS = 52; // ~3.5 minutes of auto-checking
const TOTAL_WAIT_S = (MAX_POLLS * POLL_MS) / 1000; // countdown mirror of the polling window
const RECEIPT_EXTRA_POLLS = 8; // keep polling ~30s after success until the receipt lands
const ADOPT_WINDOW_MS = 3 * 60 * 1000; // adopt a pending row created within 3 min
const RESUME_WINDOW_MS = 10 * 60 * 1000; // offer to resume a pending row up to 10 min old

// Fallback purpose catalog (§9 product slots) — used ONLY until the server
// responds (and when the gateway is unreachable offline). The LIVE catalog is
// the `payment_purposes` DB table fetched via GET /payments/purposes, so the
// owner can change prices/labels without an app release. `amount: null` =
// user picks from AMOUNTS; a number = fixed price and the amount chips hide.
// Plan/boost prices remain PROVISIONAL until the products ship (§10) — only
// kyc_urgent's KES 150 is owner-confirmed. Entitlements land with §10.
const DEFAULT_PRODUCTS = [
  { key: 'app_test', label: 'STK push test', amount: null },
  { key: 'kyc_urgent', label: 'KYC expedite', amount: 150 },
  { key: 'profile_boost', label: 'Profile boost', amount: 100 },
  { key: 'maid_basic', label: 'Maid Basic', amount: 200 },
  { key: 'maid_gold', label: 'Maid Gold', amount: 500 },
  { key: 'employer_gold', label: 'Employer Gold', amount: 500 },
];

// Audience gate from the pricing table: 'system' and 'both' are visible to
// everyone; role-scoped purposes only show for that role.
function purposeVisible(p, role) {
  return (
    !p.audience || p.audience === 'both' || p.audience === 'system' ||
    (p.audience === 'househelp' && role === 'househelp') ||
    (p.audience === 'employer' && role === 'employer')
  );
}

// Daraja result codes -> human sentences. Tone: neutral, specific, never
// alarmist — 1032 (user cancelled) reads very differently from 1 (balance).
// 1037 = DS timeout: the prompt WAS sent, the PIN just never arrived in
// time (delivery failures surface earlier, at the push stage).
const FRIENDLY_FAILURES = {
  1: 'There was not enough M-Pesa balance to complete this payment. Top up and try again.',
  1032: 'You cancelled the payment before entering your PIN. Nothing was charged — tap below to try again.',
  1037: 'We did not receive your PIN in time. Send a new push and enter it promptly.',
  2001: 'The M-Pesa PIN you entered was not correct. Nothing was charged — please try again.',
};

function friendlyFailure(payment) {
  if (payment && FRIENDLY_FAILURES[payment.resultCode]) return FRIENDLY_FAILURES[payment.resultCode];
  return (
    (payment && payment.resultDesc && payment.resultDesc.replace(/\.$/, '')) ||
    'The payment could not be completed.'
  );
}

const log = (...a) => console.log('[MPESA]', ...a);

// Deterministic EAT display time (the gateway stores UTC; EAT = UTC+3) —
// independent of the device timezone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtEAT(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).endsWith('Z') ? iso : `${String(iso).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const e = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]} ${e.getUTCFullYear()} · ${p(e.getUTCHours())}:${p(e.getUTCMinutes())}`;
}

const fmtMMSS = (s) => {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

// One row of the staged progress tracker. State: done | active | todo | failed.
// A thin rail connects the icons so the list reads as one journey.
function StepRow({ state, title, sub, last }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIconCol}>
        {state === 'done' ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
        ) : state === 'active' ? (
          <BrandLoader variant="radar" size={22} color={colors.brandSoft} />
        ) : state === 'failed' ? (
          <Ionicons name="close-circle" size={22} color={colors.danger} />
        ) : (
          <Ionicons name="ellipse-outline" size={20} color={colors.line} />
        )}
        {!last ? <View style={styles.stepRail} /> : null}
      </View>
      <View style={[styles.stepText, !last && styles.stepTextSpaced]}>
        <Text style={[styles.stepTitle, state === 'todo' && styles.stepTitleTodo, state === 'failed' && { color: colors.danger }]}>
          {title}
        </Text>
        {sub ? <Text style={styles.stepSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function PaymentScreen({ navigation }) {
  const { user, token } = useApp();
  const [amount, setAmount] = useState(1);
  const [purpose, setPurpose] = useState('app_test'); // key into products
  const [products, setProducts] = useState(DEFAULT_PRODUCTS); // live catalog replaces the fallback
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [payment, setPayment] = useState(null); // { id, status, mpesaReceipt, resultDesc, phone, checkoutRequestId, updatedAt }
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false); // stopped auto-checking while still pending
  const [showTips, setShowTips] = useState(false);
  const [resumable, setResumable] = useState(null); // recent pending row found on mount
  const pollRef = useRef({ timerId: null, n: 0 });
  const busyRef = useRef(false); // a poll tick is in flight — skip overlapping ticks
  const doneRef = useRef(false); // flow ended — swallow any stray queued tick
  const elapsedRef = useRef(null);

  // Entrance animation for the status card: it fades in and rises — a real
  // crossfade with the button returning to idle. Replays when the status
  // flips (pending → success / failed) so every state change lands smoothly.
  const cardAnim = useRef(new Animated.Value(0)).current;
  const statusKey = payment ? payment.status : '';
  useEffect(() => {
    if (!statusKey || starting) return;
    cardAnim.setValue(0);
    Animated.timing(cardAnim, { toValue: 1, duration: 340, useNativeDriver: true }).start();
  }, [statusKey, starting, cardAnim]);
  const cardStyle = {
    opacity: cardAnim,
    transform: [
      { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
    ],
  };

  // Terminal-state animations live inside SuccessMark (the mark draws
  // itself) and FailMark (radar collapse + shake) — both are one-shot and
  // replay automatically because their card branch remounts on status flip.

  // Edge case: the app was closed (or crashed) while a prompt was open. The
  // gateway kept the row and the callback still settles it — offer to
  // reattach instead of pretending nothing happened.
  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    (async () => {
      try {
        const list = await api.mpesaList(token);
        const pend = (list.payments || []).find(
          (p) =>
            p.status === 'pending' &&
            p.createdAt &&
            Date.now() - new Date(p.createdAt).getTime() < RESUME_WINDOW_MS
        );
        if (!cancelled && pend && !payment) setResumable(pend);
      } catch (e) {
        // Silent — the resume probe is a convenience, never a blocker.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Live pricing table (§9) — labels, fixed prices and audience come from
  // the DB so the owner can reprice without a release. Silent on failure:
  // DEFAULT_PRODUCTS keeps checkout working offline / pre-migration.
  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    (async () => {
      try {
        const res = await api.paymentPurposes(token);
        const rows = (res.purposes || [])
          .filter((p) => purposeVisible(p, user?.role))
          .map((p) => ({
            key: p.code,
            label: p.label,
            description: p.description || null,
            amount: p.amount === undefined ? null : p.amount,
          }));
        if (!cancelled && rows.length) setProducts(rows);
      } catch (e) {
        log(`purpose catalog fetch failed (${e && e.message}) — using built-in fallback`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stopTimers = () => {
    doneRef.current = true; // reject any already-queued tick
    if (pollRef.current.timerId) clearInterval(pollRef.current.timerId);
    pollRef.current = { timerId: null, n: 0 };
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = null;
  };

  // Stop polling when the screen unmounts.
  useEffect(() => stopTimers, []);

  const startPolling = (paymentId) => {
    stopTimers();
    doneRef.current = false; // fresh run — stopTimers marked it done
    busyRef.current = false;
    setElapsed(0);
    setShowTips(false);
    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    log(`polling started for payment #${paymentId} every ${POLL_MS / 1000}s (max ${MAX_POLLS})`);
    const runTick = async () => {
      pollRef.current.n += 1;
      const n = pollRef.current.n;
      let keepGoing = true;
      let stillPending = false;
      try {
        const res = await api.mpesaStatus(paymentId, token, true);
        if (res.payment) {
          const live = res.live || {};
          log(
            `poll #${n} payment #${paymentId} status=${res.payment.status}` +
              (live.grace ? ` (grace ${live.ageSeconds}s — not querying Daraja yet)` : '') +
              (live.queried ? ` (Daraja rc=${live.resultCode}${live.settleIn ? `, settle in ${live.settleIn}s` : ''})` : '') +
              (live.error ? ` (query error: ${live.error})` : '')
          );
          setPayment(res.payment);
          if (res.payment.status === 'pending') {
            stillPending = true;
          } else if (
            res.payment.status === 'success' &&
            !res.payment.mpesaReceipt &&
            n < MAX_POLLS + RECEIPT_EXTRA_POLLS
          ) {
            log(`payment #${paymentId} settled but receipt not stored yet — polling a little longer`);
          } else {
            keepGoing = false;
            log(
              res.payment.status === 'success'
                ? `payment #${paymentId} COMPLETE — receipt ${res.payment.mpesaReceipt || 'pending on callback'}`
                : `payment #${paymentId} ended as ${res.payment.status} (rc=${res.payment.resultCode})`
            );
          }
        }
      } catch (e) {
        log(`poll #${n} network hiccup (keeping pending): ${e && e.message}`);
        stillPending = true; // transient network error — keep polling
      }
      if (!keepGoing) {
        stopTimers();
        setStopped(false);
        return;
      }
      if (stillPending && pollRef.current.n >= MAX_POLLS) {
        // Leave the payment pending — the M-Pesa prompt may still be waiting.
        log(`polling stopped after ${n} ticks — payment #${paymentId} still pending (prompt may still be open)`);
        stopTimers();
        setStopped(true);
      }
    };
    // Overlap guard: on a slow network one tick can outlive the 4s interval;
    // two overlapping checks double-logged "ended as failed" (live 2026-10-30).
    const tick = async () => {
      if (doneRef.current) return; // flow already ended — stray queued tick
      if (busyRef.current) {
        log('poll tick skipped — previous check still running (slow network)');
        return;
      }
      busyRef.current = true;
      try {
        await runTick();
      } finally {
        busyRef.current = false;
      }
    };
    pollRef.current.timerId = setInterval(tick, POLL_MS);
  };

  // The gateway row is created BEFORE Daraja is called, so even a timed-out
  // / cancelled stk-push request usually left a live pending row behind.
  // Find it (same amount + phone, created within the adopt window) and keep
  // going instead of showing a dead end.
  const adoptPendingPayment = async () => {
    try {
      log('push call failed — probing recent payments for a live pending row…');
      const list = await api.mpesaList(token);
      const last9 = phone.replace(/\D/g, '').slice(-9);
      const cand = (list.payments || []).find(
        (p) =>
          p.status === 'pending' &&
          Number(p.amount) === Number(amount) &&
          String(p.phone || '').replace(/\D/g, '').slice(-9) === last9 &&
          p.createdAt &&
          Date.now() - new Date(p.createdAt).getTime() < ADOPT_WINDOW_MS
      );
      if (cand) {
        log(`adopted pending payment #${cand.id} (created ${cand.createdAt}) — continuing to poll`);
        setPayment({
          id: cand.id,
          status: 'pending',
          amount: cand.amount,
          purposeLabel: cand.purposeLabel || null,
          mpesaReceipt: null,
          resultDesc: null,
        });
        startPolling(cand.id);
        return true;
      }
      log('no recent pending row found — the request never reached the gateway');
    } catch (e) {
      log('adopt probe failed:', e && e.message);
    }
    return false;
  };

  const start = async () => {
    if (starting || payment?.status === 'pending') return;
    setPhoneError('');
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(digits)) {
      setPhoneError('Enter a valid Kenyan number, e.g. 0712 345 678.');
      return;
    }
    const product = products.find((p) => p.key === purpose) || products[0];
    const payAmount = product.amount || amount; // fixed price or chosen amount
    setStarting(true);
    log(`start — purpose ${product.key}, amount KES ${payAmount}, phone ${phone.trim()}`);
    const t0 = Date.now();
    try {
      const res = await api.mpesaStkPush(
        { amount: payAmount, phone: phone.trim(), purpose: product.key },
        token
      );
      // The server may have ENFORCED the table price (tamper guard) — trust
      // the response amount over the client's.
      const enforced = res.amount ? Number(res.amount) : payAmount;
      log(`push accepted by gateway in ${Date.now() - t0}ms — payment #${res.paymentId} KES ${enforced}${res.queued ? ' (Daraja push running in background)' : ''}`);
      setPayment({
        id: res.paymentId,
        status: 'pending',
        amount: enforced,
        purposeLabel: res.purposeLabel || product.label,
        mpesaReceipt: null,
        resultDesc: null,
      });
      setResumable(null);
      startPolling(res.paymentId);
    } catch (e) {
      const code = e && e.code;
      log(
        `push call did not complete (${Date.now() - t0}ms) — code=${code} status=${e && e.status} msg="${e && e.message}"`
      );
      // Timeout/offline here does NOT mean the payment failed — the row and
      // possibly the prompt exist. Adopt the pending row and keep watching.
      const adopted = code === 'TIMEOUT' || code === 'OFFLINE' ? await adoptPendingPayment() : false;
      if (!adopted) {
        setError(e.message || 'Could not start the payment. Please try again.');
      }
    } finally {
      setStarting(false);
    }
  };

  const resume = () => {
    if (!resumable) return;
    log(`resuming payment #${resumable.id} (KES ${resumable.amount}) — it may have settled while the app was closed`);
    setPayment({
      id: resumable.id,
      status: resumable.status,
      amount: resumable.amount,
      purposeLabel: resumable.purposeLabel || null,
      mpesaReceipt: resumable.mpesaReceipt || null,
      resultDesc: resumable.resultDesc || null,
      phone: resumable.phone || null,
      checkoutRequestId: resumable.checkoutRequestId || null,
      updatedAt: resumable.updatedAt || null,
    });
    setResumable(null);
    startPolling(resumable.id);
  };

  const reset = () => {
    log('reset — back to the amount form');
    stopTimers();
    setPayment(null);
    setStopped(false);
    setError('');
  };

  const pending = payment?.status === 'pending';
  // The push is accepted once the row carries a checkout_request_id (written
  // by the gateway right after Daraja accepts — visible on the next poll).
  const pushSent = !!(payment && payment.checkoutRequestId);
  const remaining = Math.max(0, TOTAL_WAIT_S - elapsed);
  // The selected product card drives the button title and the tracker copy.
  const product = products.find((p) => p.key === purpose) || products[0];
  const payAmount = product.amount || amount; // mirrors start()
  // Truth once a payment object exists: the server-enforced amount + label
  // (set at push time, refreshed by every poll) — not the form state.
  const liveAmount = payment && payment.amount ? Number(payment.amount) : payAmount;
  const liveLabel = (payment && payment.purposeLabel) || product.label;
  // Inside the Profile drawer → hamburger + HomeTab exit; root-stack copy → goBack.
  const inDrawer = typeof navigation.openDrawer === 'function';

  // Staged tracker rows for the PROGRESS card — every stage maps to a real
  // event (row created / Daraja accepted / PIN / callback settlement).
  const stageRows = [
    {
      title: 'Payment accepted by gateway',
      sub: payment ? `KES ${liveAmount} · ${liveLabel} · payment #${payment.id}` : null,
      state: 'done',
    },
    {
      title: 'Prompt sent to your phone',
      sub: `STK request to ${(payment && payment.phone) || phone}`,
      state: pushSent ? 'done' : 'active',
    },
    {
      title: 'Enter your M-Pesa PIN',
      sub: pushSent ? `Waiting for your PIN · ${fmtMMSS(remaining)} remaining` : undefined,
      state: pushSent ? 'active' : 'todo',
    },
    {
      title: 'Payment confirmed',
      sub: 'M-Pesa receipt appears here',
      state: 'todo',
    },
  ];

  const goHome = () => (inDrawer ? navigation.navigate('HomeTab') : navigation.goBack());

  return (
    <Screen>
      <ScreenHeader
        eyebrow="M-Pesa · Live"
        title="Pay with M-Pesa"
        subtitle="STK Push via Safaricom Daraja. Real money moves — test with KES 1 first."
        navigation={navigation}
      />

      <Banner message={error} />

      {resumable && !payment ? (
        <View style={styles.resumeCard}>
          <Text style={styles.resumeTitle}>Payment still open</Text>
          <Text style={styles.resumeBody}>
            A KES {resumable.amount} payment to {resumable.phone} is still waiting for a PIN. It may
            have completed while the app was closed.
          </Text>
          <View style={styles.resumeActions}>
            <PrimaryButton title="Resume watching" onPress={resume} style={styles.resumeBtn} />
            <SecondaryButton title="Dismiss" onPress={() => setResumable(null)} style={styles.resumeBtn} />
          </View>
        </View>
      ) : null}

      {payment && payment.status === 'success' ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.brandSoft }, cardStyle]}>
          <SuccessMark size={148} />
          <Text style={styles.statusTitle}>Payment received</Text>
          <Text style={styles.statusBody}>
            {liveLabel} · KES {liveAmount} received via M-Pesa from{' '}
            {(payment.phone || phone).replace(/\s/g, ' ')} — asante! Your payment is confirmed.
          </Text>
          <View style={styles.receiptChip}>
            <Text style={styles.receiptLabel}>M-Pesa receipt</Text>
            <Text style={styles.receiptValue}>{payment.mpesaReceipt || 'Confirming…'}</Text>
          </View>
          {payment.updatedAt ? (
            <Text style={styles.paidLine}>Paid {fmtEAT(payment.updatedAt)} EAT</Text>
          ) : null}
          <PrimaryButton title="Back to Home" onPress={goHome} style={{ marginTop: 18 }} />
        </Animated.View>
      ) : payment && payment.status === 'failed' ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.danger }, cardStyle]}>
          <FailMark size={122} />
          <Text style={styles.statusTitle}>Payment not completed</Text>
          <Text style={styles.statusBody}>{friendlyFailure(payment)}</Text>
          <Text style={styles.statusNote}>
            Nothing is charged for unapproved requests. Send a new push whenever you are ready.
          </Text>
          <PrimaryButton title="Try Again" onPress={reset} style={{ marginTop: 18, alignSelf: 'stretch' }} />
          <SecondaryButton title="Back to Home" onPress={goHome} style={{ marginTop: 10, alignSelf: 'stretch' }} />
        </Animated.View>
      ) : payment && pending ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.gold }, cardStyle]}>
          <Text style={styles.statusTitle}>Processing payment</Text>
          <View style={styles.steps}>
            {stageRows.map((s, i) => (
              <StepRow key={s.title} {...s} last={i === stageRows.length - 1} />
            ))}
          </View>
          <Pressable onPress={() => setShowTips((v) => !v)} hitSlop={8}>
            <Text style={styles.tipsLink}>{showTips ? 'Hide tips' : "Didn't get a prompt?"}</Text>
          </Pressable>
          {showTips ? (
            <Text style={styles.tipsBody}>
              Keep the SIM active with network coverage — the prompt can take up to a minute on
              busy networks. Make sure the phone shown above is the line you want to pay from. If
              the countdown ends, the request expires and you can simply send a new push.
            </Text>
          ) : null}
          {stopped ? (
            <>
              <Text style={styles.statusStopped}>
                We stopped auto-checking, but the payment is still open — if you approve the prompt,
                it can still complete. Check your M-Pesa messages.
              </Text>
              <PrimaryButton
                title="Keep Checking"
                onPress={() => {
                  setStopped(false);
                  startPolling(payment.id);
                }}
                style={{ marginTop: 16, alignSelf: 'stretch' }}
              />
              <SecondaryButton title="Back to Home" onPress={reset} style={{ marginTop: 10, alignSelf: 'stretch' }} />
            </>
          ) : null}
        </Animated.View>
      ) : (
        <>
          <Text style={styles.label}>Payment purpose</Text>
          <View style={styles.chipRow}>
            {products.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => {
                  setPurpose(p.key);
                  if (p.amount) setAmount(p.amount); // lock the fixed price in
                }}
                disabled={starting || pending}
                style={[styles.chip, purpose === p.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, purpose === p.key && styles.chipTextActive]}>
                  {p.label}
                </Text>
                <Text style={[styles.chipSub, purpose === p.key && styles.chipTextActive]}>
                  {p.amount ? `KES ${p.amount}` : 'any amount'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.purposeNote}>
            {product.description
              ? product.description
              : product.amount
              ? `Fixed price · KES ${product.amount}. Plan & boost prices are provisional until the products launch.`
              : 'Test checkout — pick any amount below.'}
          </Text>

          {product.amount ? null : (
            <>
              <Text style={styles.label}>Amount (KES)</Text>
              <View style={styles.chipRow}>
                {AMOUNTS.map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => setAmount(a)}
                    disabled={starting}
                    style={[styles.chip, amount === a && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, amount === a && styles.chipTextActive]}>
                      {a}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <TextField
            label="Phone to charge"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setPhoneError('');
            }}
            keyboardType="phone-pad"
            error={phoneError}
            hint="Your M-Pesa number — change it to pay from another line."
          />

          <PrimaryButton
            title={`Send STK Push · KES ${payAmount}`}
            onPress={start}
            disabled={starting}
            loading={starting}
            loadingLabel="Sending push…"
          />
          <Text style={styles.footnote}>
            You will get a prompt from Safaricom asking you to enter your M-Pesa PIN. Nothing is
            charged until you approve it with your PIN.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  chipText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  chipTextActive: { color: colors.white },
  chipSub: { color: colors.muted, fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  purposeNote: { marginTop: -8, marginBottom: 14, fontSize: 12, lineHeight: 17, color: colors.muted },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 24,
    marginTop: 8,
  },
  statusTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 10, marginBottom: 6 },
  statusBody: {
    marginTop: 6,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  statusNote: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
  },
  statusStopped: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: colors.goldDark,
    fontWeight: '600',
    textAlign: 'center',
  },
  paidLine: { marginTop: 10, fontSize: 12, color: colors.muted },
  // Staged progress tracker.
  steps: { alignSelf: 'stretch', marginTop: 6 },
  stepRow: { flexDirection: 'row' },
  stepIconCol: { width: 30, alignItems: 'center' },
  stepRail: { width: 2, flex: 1, backgroundColor: colors.line, borderRadius: 1, marginVertical: 3 },
  stepText: { flex: 1, marginLeft: 12 },
  stepTextSpaced: { paddingBottom: 18 },
  stepTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink, lineHeight: 20 },
  stepTitleTodo: { color: colors.muted, fontWeight: '600' },
  stepSub: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: colors.muted },
  tipsLink: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.goldDark,
    textDecorationLine: 'underline',
  },
  tipsBody: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
  },
  // Resume banner (app closed mid-payment).
  resumeCard: {
    backgroundColor: colors.goldSoft,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 8,
  },
  resumeTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  resumeBody: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.muted },
  resumeActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  resumeBtn: { flex: 1 },
  receiptChip: {
    marginTop: 16,
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  receiptLabel: { fontSize: 11, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  receiptValue: { marginTop: 3, fontSize: 17, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  footnote: { marginTop: 14, fontSize: 12.5, lineHeight: 19, color: colors.muted, textAlign: 'center' },
});
