// M-Pesa payment — live STK Push against the Daraja production gateway.
// Flow: choose amount -> "Send STK Push" (the button itself spins — no
// full-screen veil; the gateway answers in milliseconds and a blackout
// during a network hiccup reads as a freeze) -> the staged progress card
// crossfades in -> the user keys their M-Pesa PIN -> the SAFARICOM CALLBACK
// settles the payment (source of truth; the gateway only uses the Daraja
// query API to confirm success early, never to fail an in-flight prompt)
// -> the receipt code lands on stage 4.
//
// The progress card is a truthful step tracker driven by REAL events, not
// cosmetic timers:
//   1. Payment accepted by gateway   — always done once the card shows
//                                      (respond-first: the row exists).
//   2. Prompt sent to your phone     — done when the row carries a
//                                      checkout_request_id (Daraja accepted
//                                      the push, seen on the next poll).
//   3. Enter your M-Pesa PIN         — the long wait; elapsed timer lives
//                                      on this step.
//   4. Payment confirmed             — receipt chip appears here.
// A push rejection (e.g. an existing USSD session) fails at stage 2; a
// PIN timeout / cancellation / low balance fails at stage 3.
//
// Timing: STK prompts regularly take 30-60s+ for the user to key their PIN,
// so polling runs every 4s for up to ~3.5 minutes, and a little longer after
// success so the callback's receipt number lands on screen. When we stop
// auto-checking the payment is left PENDING (never "failed") with a Keep
// Checking action.
//
// If the push call itself times out (offline / old gateway / network flap)
// we ADOPT the most recent pending payment row instead of dead-ending — the
// row is created server-side before the push, so it almost always exists.
//
// Every step of the journey logs a [MPESA] line (start → push → poll ticks →
// settlement → receipt) so the whole flow can be traced from the console.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandLoader from '../../components/brand/BrandLoader';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton, Screen, ScreenHeader, TextField } from '../../ui';
import DrawerMenuButton from '../../components/common/DrawerMenuButton';

const AMOUNTS = [1, 50, 100, 200, 500];
const POLL_MS = 4000;
const MAX_POLLS = 52; // ~3.5 minutes of auto-checking
const RECEIPT_EXTRA_POLLS = 8; // keep polling ~30s after success until the receipt lands
const ADOPT_WINDOW_MS = 3 * 60 * 1000; // adopt a pending row created within 3 min

// Daraja result codes -> human sentences (the raw ResultDesc reads like a log).
const FRIENDLY_FAILURES = {
  1: 'There was not enough M-Pesa balance to complete this payment. Top up and try again.',
  1032: 'The payment request was cancelled before it was approved.',
  1037: 'The request expired before a PIN was entered. Send a new push and approve it in time.',
  2001: 'The PIN entered was not correct. Nothing was charged — please try again.',
};

function friendlyFailure(payment) {
  if (payment && FRIENDLY_FAILURES[payment.resultCode]) return FRIENDLY_FAILURES[payment.resultCode];
  return (
    (payment && payment.resultDesc && payment.resultDesc.replace(/\.$/, '')) ||
    'The payment could not be completed.'
  );
}

const log = (...a) => console.log('[MPESA]', ...a);

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
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [payment, setPayment] = useState(null); // { id, status, mpesaReceipt, resultDesc, phone, checkoutRequestId }
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false); // stopped auto-checking while still pending
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
        setPayment({ id: cand.id, status: 'pending', mpesaReceipt: null, resultDesc: null });
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
    setStarting(true);
    log(`start — amount KES ${amount}, phone ${phone.trim()}`);
    const t0 = Date.now();
    try {
      const res = await api.mpesaStkPush(
        { amount, phone: phone.trim(), purpose: 'app_test' },
        token
      );
      log(`push accepted by gateway in ${Date.now() - t0}ms — payment #${res.paymentId}${res.queued ? ' (Daraja push running in background)' : ''}`);
      setPayment({ id: res.paymentId, status: 'pending', mpesaReceipt: null, resultDesc: null });
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
  // Inside the Profile drawer → hamburger + HomeTab exit; root-stack copy → goBack.
  const inDrawer = typeof navigation.openDrawer === 'function';

  // Staged tracker rows for each card state — every stage maps to a real
  // event (row created / Daraja accepted / PIN / callback settlement).
  const stageRows = (() => {
    const accepted = {
      title: 'Payment accepted by gateway',
      sub: payment ? `KES ${amount} · payment #${payment.id}` : null,
      state: 'done',
    };
    const prompt = (state, sub) => ({
      title: 'Prompt sent to your phone',
      sub: sub !== undefined ? sub : `STK request to ${(payment && payment.phone) || phone}`,
      state,
    });
    const pin = (state, sub) => ({
      title: 'Enter your M-Pesa PIN',
      sub: sub !== undefined ? sub : `Waiting for confirmation · ${elapsed}s`,
      state,
    });
    const confirmed = (state, sub) => ({
      title: 'Payment confirmed',
      sub: sub !== undefined ? sub : 'M-Pesa receipt appears here',
      state,
    });
    if (pending) {
      return [
        accepted,
        prompt(pushSent ? 'done' : 'active'),
        pin(pushSent ? 'active' : 'todo'),
        confirmed('todo'),
      ];
    }
    if (payment && payment.status === 'failed') {
      // No checkout_request_id -> Daraja never accepted the push (stage 2);
      // otherwise the PIN request itself failed (stage 3).
      const failedAtPrompt = !pushSent;
      return [
        accepted,
        prompt(failedAtPrompt ? 'failed' : 'done', failedAtPrompt ? 'The prompt could not be sent' : undefined),
        pin(failedAtPrompt ? 'todo' : 'failed', failedAtPrompt ? undefined : 'The PIN request failed'),
        confirmed('todo', 'Not reached'),
      ];
    }
    if (payment && payment.status === 'success') {
      return [accepted, prompt('done'), pin('done', 'PIN approved'), confirmed('done')];
    }
    return [];
  })();

  return (
    <Screen>
      <ScreenHeader
        eyebrow="M-Pesa · Live"
        title="Pay with M-Pesa"
        subtitle="STK Push via Safaricom Daraja. Real money moves — test with KES 1 first."
        right={<DrawerMenuButton navigation={navigation} />}
      />

      <Banner message={error} />

      {payment && payment.status === 'success' ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.brandSoft }, cardStyle]}>
          <Text style={styles.statusTitle}>Payment received</Text>
          <View style={styles.steps}>
            {stageRows.map((s, i) => (
              <StepRow key={s.title} {...s} last={i === stageRows.length - 1} />
            ))}
          </View>
          <View style={styles.receiptChip}>
            <Text style={styles.receiptLabel}>M-Pesa receipt</Text>
            <Text style={styles.receiptValue}>{payment.mpesaReceipt || 'Confirming…'}</Text>
          </View>
          <PrimaryButton
            title="Back to Home"
            onPress={() => (inDrawer ? navigation.navigate('HomeTab') : navigation.goBack())}
            style={{ marginTop: 18 }}
          />
        </Animated.View>
      ) : payment && payment.status === 'failed' ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.danger }, cardStyle]}>
          <Text style={styles.statusTitle}>Payment not completed</Text>
          <View style={styles.steps}>
            {stageRows.map((s, i) => (
              <StepRow key={s.title} {...s} last={i === stageRows.length - 1} />
            ))}
          </View>
          <Text style={styles.statusBody}>{friendlyFailure(payment)}</Text>
          <Text style={styles.statusNote}>
            Nothing is charged for unapproved requests. Send a new push whenever you are ready.
          </Text>
          <PrimaryButton title="Try Again" onPress={reset} style={{ marginTop: 18 }} />
        </Animated.View>
      ) : payment && pending ? (
        <Animated.View style={[styles.statusCard, { borderColor: colors.gold }, cardStyle]}>
          <Text style={styles.statusTitle}>Processing payment</Text>
          <View style={styles.steps}>
            {stageRows.map((s, i) => (
              <StepRow key={s.title} {...s} last={i === stageRows.length - 1} />
            ))}
          </View>
          <Text style={styles.statusNote}>
            The prompt can take a few seconds to reach your phone, and up to a minute on busy
            networks. You have about 3 minutes to enter your PIN — keep this screen open.
          </Text>
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
            title={`Send STK Push · KES ${amount}`}
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
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 24,
    marginTop: 8,
  },
  statusTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, marginBottom: 14 },
  statusBody: {
    marginTop: 12,
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
  // Staged progress tracker.
  steps: { alignSelf: 'stretch' },
  stepRow: { flexDirection: 'row' },
  stepIconCol: { width: 30, alignItems: 'center' },
  stepRail: { width: 2, flex: 1, backgroundColor: colors.line, borderRadius: 1, marginVertical: 3 },
  stepText: { flex: 1, marginLeft: 12 },
  stepTextSpaced: { paddingBottom: 18 },
  stepTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink, lineHeight: 20 },
  stepTitleTodo: { color: colors.muted, fontWeight: '600' },
  stepSub: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: colors.muted },
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
