// KYC step 0 — intro (§33.1 step 1). Explains the badge, shows the current
// state (not started / draft to resume / rejected with reason / in review /
// approved), and carries the urgent upsell (speed only, never refunded —
// MPS §33.3).
//
// Urgent upsell revamp (2026-10-31, owner request): tapping "Go urgent"
// takes over the card with the SAME staged progress tracker the payment
// screen uses — gateway accepted → prompt sent → enter your M-Pesa PIN
// (with a countdown) → payment confirmed. Every stage maps to a real
// gateway event; nothing is cosmetic.
//   · On success the card becomes a PAID confirmation and the button is
//     gone — the review can never be paid for twice. The parent re-fetches
//     /kyc so the server truth (users.kyc_urgent, granted by the payments
//     callback) drives the paid card even after an app restart; the server
//     additionally refuses a second kyc_urgent push with 409 already_paid.
//   · On failure (or a cancelled / expired prompt) the reason is mapped
//     from the Daraja result code exactly like the payment screen, and
//     "Go urgent" comes back for a retry.
//   · The PRICE is read live from the payment_purposes table on every
//     mount (GET /payments/purposes) — the owner changes it in the DB and
//     the next visit to this screen shows the new figure with no app
//     release. The server enforces the table price at push time regardless
//     of what the client sent.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader } from '../../ui';
import BrandLoader from '../../components/brand/BrandLoader';
import { kycLog, kycStart } from '../../kycLog';
import { REASON_LABELS, emptyDraft } from './kycShared';

const STATUS_COPY = {
  not_started: {
    title: 'Earn your Trust Badge',
    body: 'Verify your identity with your ID and a quick selfie. Verified house helps get more views, more replies and more hires.',
  },
  draft: {
    title: 'Continue your verification',
    body: 'Your progress is saved. Pick up right where you left off.',
  },
  rejected: {
    title: 'Action needed',
    body: 'Your last submission could not be approved. Retake the failed step and submit again — everything else stays as it was.',
  },
  submitted: {
    title: 'Verification in review',
    body: 'We received your submission. We will notify you within 72 hours.',
  },
  under_review: {
    title: 'Verification in review',
    body: 'A reviewer is checking your submission. We will notify you within 72 hours.',
  },
  approved: {
    title: 'You have the Trust Badge',
    body: 'Your identity is verified. Employers see the badge on your profile.',
  },
};

export default function KycIntroScreen({ navigation }) {
  const { token } = useApp();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    kycLog('intro open — GET /kyc');
    try {
      const res = await api.kycGet(token);
      if (!mountedRef.current) return;
      kycLog(
        `intro: KYC state = ${res?.kycStatus || 'not_started'}` +
          `${res?.urgent ? ' · urgent' : ''}` +
          `${res?.rejectionReason ? ` · reason=${res.rejectionReason}` : ''}`
      );
      setState(res);
      setError('');
    } catch (e) {
      kycLog(`intro: KYC state FAILED — ${e.message || e}`);
      if (!mountedRef.current) return;
      setError(e.message || 'Could not load your verification status.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [token]);

  // Fresh state every time the screen comes to the front — the urgent flag
  // must reflect the payments table even if a callback settled while the
  // user was elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load])
  );

  const status = state?.kycStatus || 'not_started';
  const copy = STATUS_COPY[status] || STATUS_COPY.not_started;
  const inReview = status === 'submitted' || status === 'under_review';

  function startFlow() {
    // Server draft fields + image flags carry into the flow; fresh captures
    // override remote previews as the user redoes each step.
    const draft = {
      ...emptyDraft(),
      ...(state?.draft || {}),
      images: {
        idFront: state?.images?.idFront ? `kyc://id_front` : null,
        idBack: state?.images?.idBack ? `kyc://id_back` : null,
        selfie: state?.images?.selfie ? `kyc://selfie` : null,
      },
      urgent: !!state?.urgent,
    };
    // Trace session starts HERE — the owner asked for the log to begin at
    // this button. Everything after is stamped with the session id + clock.
    kycStart(`Continue verification pressed · status=${status}`);
    kycLog(
      `draft → personal · images: front=${draft.images.idFront ? 'server' : '∅'}` +
        ` back=${draft.images.idBack ? 'server' : '∅'}` +
        ` selfie=${draft.images.selfie ? 'server' : '∅'}` +
        ` docType=${draft.idType || '∅'}`
    );
    navigation.navigate('KycPersonal', { draft });
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Maidora Trust Badge"
        title="Verify your identity"
        subtitle="Free · Reviewed within 48–72 hours"
        navigation={navigation}
      />

      <View style={styles.badgeCard}>
        <View style={styles.badgeIconWrap}>
          <Ionicons name="shield-checkmark" size={30} color={colors.cream} />
        </View>
        <Text style={styles.badgeTitle}>{copy.title}</Text>
        <Text style={styles.badgeBody}>{copy.body}</Text>
        {status === 'rejected' && state?.rejectionReason ? (
          <Text style={styles.badgeReason}>
            Action needed: {REASON_LABELS[state.rejectionReason] || 'Your submission needs attention'}.
          </Text>
        ) : null}
      </View>

      <Banner kind="error" message={error} />

      {inReview || status === 'approved' ? (
        <View style={[styles.infoCard, status === 'approved' && styles.infoCardGood]}>
          <Ionicons
            name={status === 'approved' ? 'checkmark-circle' : 'time-outline'}
            size={22}
            color={status === 'approved' ? colors.forest : colors.goldDark}
          />
          <Text style={styles.infoCardText}>
            {status === 'approved'
              ? 'No further action needed. Thank you for verifying!'
              : 'We will notify you as soon as the review is done. You can keep using Maidora in the meantime.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>What you will need</Text>
            <StepRow icon="card-outline" text="Your ID (front and back), passport or driver's license" />
            <StepRow icon="camera-outline" text="A live selfie so we can match your face" />
            <StepRow icon="moon-outline" text="Good lighting — no glare on the document" />
          </View>

          <PrimaryButton
            title={status === 'rejected' ? 'Try again' : status === 'draft' ? 'Continue verification' : 'Start verification'}
            onPress={startFlow}
            loading={loading}
            style={{ marginTop: 6 }}
          />
          <Text style={styles.disclaimer}>
            Verification is free and never blocks you from using Maidora. Your documents stay private and are only used for verification.
          </Text>
        </>
      )}

      {inReview && state ? (
        <UrgentUpsell token={token} paid={!!state.urgent} onPaid={load} />
      ) : null}
    </Screen>
  );
}

function StepRow({ icon, text }) {
  return (
    <View style={styles.stepRow}>
      <Ionicons name={icon} size={17} color={colors.forest} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

// ── Urgent upsell ────────────────────────────────────────────────────────────
// Phases: idle → pushing → polling → paid (terminal) | failed → retry.
// The polling loop mirrors PaymentScreen (4s × 52 with an overlap guard so a
// slow network never double-ticks); the tracker rows mirror its staged card.

const POLL_MS = 4000;
const MAX_POLLS = 52; // ~3.5 minutes of auto-checking (same as payments)
const TOTAL_WAIT_S = (MAX_POLLS * POLL_MS) / 1000; // countdown mirror
const URGENT_FALLBACK_PRICE = 150; // pre-migration / offline fallback
const ADOPT_WINDOW_MS = 3 * 60 * 1000; // adopt a pending row after a timed-out push

// Daraja result codes → human sentences (same mapping as the payment screen).
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

const fmtMMSS = (s) => {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

// One row of the staged progress tracker — visually identical to the
// payment screen's StepRow (icon column + connecting rail).
function TrackRow({ state, title, sub, last }) {
  return (
    <View style={styles.trackRow}>
      <View style={styles.trackIconCol}>
        {state === 'done' ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
        ) : state === 'active' ? (
          <BrandLoader variant="radar" size={22} color={colors.brandSoft} />
        ) : (
          <Ionicons name="ellipse-outline" size={20} color={colors.line} />
        )}
        {!last ? <View style={styles.trackRail} /> : null}
      </View>
      <View style={[styles.trackText, !last && styles.trackTextSpaced]}>
        <Text style={[styles.trackTitle, state === 'todo' && styles.trackTitleTodo]}>{title}</Text>
        {sub ? <Text style={styles.trackSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function UrgentUpsell({ token, paid, onPaid }) {
  const [price, setPrice] = useState(URGENT_FALLBACK_PRICE); // live DB price
  const [phase, setPhase] = useState('idle'); // idle | pushing | polling | paid | failed
  const [payment, setPayment] = useState(null); // gateway row snapshot (from push + polls)
  const [msg, setMsg] = useState('');
  const [stopped, setStopped] = useState(false); // stopped auto-checking, still pending
  const [elapsed, setElapsed] = useState(0);
  const [showTips, setShowTips] = useState(false);

  const pollRef = useRef({ timerId: null, n: 0 });
  const busyRef = useRef(false); // a poll tick is in flight — skip overlapping ticks
  const doneRef = useRef(false); // flow ended — swallow any stray queued tick
  const elapsedRef = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // LIVE PRICE — GET /payments/purposes on every mount. The owner edits the
  // payment_purposes table and the very next visit to this screen shows the
  // new figure (the intro remounts on navigation, and re-focus refreshes the
  // parent state). The server enforces the table price at push time anyway,
  // so display and prompt can never disagree for more than one visit.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.paymentPurposes(token);
        const row = (res.purposes || []).find((p) => p.code === 'kyc_urgent');
        if (alive && row && Number.isFinite(Number(row.amount)) && Number(row.amount) > 0) {
          setPrice(Number(row.amount));
          kycLog(`urgent: price KES ${Number(row.amount)} (payment_purposes${res.source === 'legacy' ? ' · legacy fallback' : ''})`);
        }
      } catch (e) {
        kycLog(`urgent: price fetch failed — ${e.message || e} (fallback KES ${URGENT_FALLBACK_PRICE})`);
      }
    })();
    return () => {
      alive = false;
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

  // Stop everything when the upsell unmounts (screen change / paid card).
  useEffect(() => stopTimers, []);

  const startPolling = (paymentId) => {
    stopTimers();
    doneRef.current = false; // fresh run — stopTimers marked it done
    busyRef.current = false;
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    kycLog(`urgent: polling payment #${paymentId} every ${POLL_MS / 1000}s (max ${MAX_POLLS})`);
    const runTick = async () => {
      pollRef.current.n += 1;
      const n = pollRef.current.n;
      let keepGoing = true;
      let stillPending = false;
      try {
        const res = await api.mpesaStatus(paymentId, tokenRef.current, true);
        if (res.payment) {
          setPayment(res.payment);
          if (res.payment.status === 'pending') {
            stillPending = true;
          } else if (res.payment.status === 'success') {
            keepGoing = false;
            kycLog(
              `urgent: payment #${paymentId} SUCCESS — receipt ${res.payment.mpesaReceipt || 'landing via callback'}`
            );
            setPhase('paid');
            setMsg('');
            setStopped(false);
            onPaid?.(); // parent re-fetches /kyc → users.kyc_urgent drives the paid card
          } else {
            keepGoing = false;
            kycLog(
              `urgent: payment #${paymentId} failed — rc=${res.payment.resultCode} "${res.payment.resultDesc || ''}"`
            );
            setPhase('failed');
            setMsg(friendlyFailure(res.payment));
            setStopped(false);
          }
        }
      } catch (e) {
        kycLog(`urgent: poll #${n} hiccup — keeping pending (${e.message || e})`);
        stillPending = true; // transient network error — keep polling
      }
      if (!keepGoing) {
        stopTimers();
        setStopped(false);
        return;
      }
      if (stillPending && pollRef.current.n >= MAX_POLLS) {
        // Leave the payment pending — the M-Pesa prompt may still be open.
        kycLog(`urgent: stopped polling after ${n} ticks — payment #${paymentId} still pending`);
        stopTimers();
        setStopped(true);
      }
    };
    // Overlap guard (learned on the payment screen): on a slow network one
    // tick can outlive the 4s interval — never let two checks interleave.
    const tick = async () => {
      if (doneRef.current) return;
      if (busyRef.current) return;
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
  // push call usually left a live pending row behind — find it and keep
  // going instead of dead-ending while a real prompt sits on the phone.
  const adoptPending = async () => {
    try {
      kycLog('urgent: push call did not complete — probing recent payments for a live pending row…');
      const list = await api.mpesaList(tokenRef.current);
      const cand = (list.payments || []).find(
        (p) =>
          p.status === 'pending' &&
          p.purpose === 'kyc_urgent' &&
          p.createdAt &&
          Date.now() - new Date(p.createdAt).getTime() < ADOPT_WINDOW_MS
      );
      if (cand) {
        kycLog(`urgent: adopted pending payment #${cand.id} — continuing to poll`);
        setPayment(cand);
        setPhase('polling');
        startPolling(cand.id);
        return true;
      }
      kycLog('urgent: no recent pending row found — the push never reached the gateway');
    } catch (e) {
      kycLog(`urgent: adopt probe failed — ${e.message || e}`);
    }
    return false;
  };

  async function goUrgent() {
    if (phase === 'pushing' || phase === 'polling') return;
    setMsg('');
    setStopped(false);
    setShowTips(false);
    setPayment(null);
    setPhase('pushing');
    kycLog(`urgent: STK push KES ${price} (purpose kyc_urgent)`);
    try {
      const res = await api.mpesaStkPush({ amount: price, purpose: 'kyc_urgent' }, tokenRef.current);
      const enforced = res.amount ? Number(res.amount) : price; // server-enforced table price
      if (enforced !== price) {
        kycLog(`urgent: table price enforced — showing KES ${enforced} (client sent ${price})`);
        setPrice(enforced);
      }
      kycLog(`urgent: push accepted — payment #${res.paymentId} KES ${enforced}${res.queued ? ' (Daraja push running in background)' : ''}`);
      setPayment({
        id: res.paymentId,
        status: 'pending',
        amount: enforced,
        purposeLabel: res.purposeLabel || 'KYC expedite',
        phone: null,
        checkoutRequestId: null, // lands on the row after Daraja accepts; next poll picks it up
        mpesaReceipt: null,
        resultDesc: null,
      });
      setPhase('polling');
      startPolling(res.paymentId);
    } catch (e) {
      // Server double-pay guard: the review was paid from another session
      // (or the callback settled while we were idle) — flip to the paid card.
      if (e && e.code === 'already_paid') {
        kycLog('urgent: server says already paid — switching to the paid card');
        setPhase('paid');
        setMsg('');
        onPaid?.();
        return;
      }
      const adopted =
        e && (e.code === 'TIMEOUT' || e.code === 'OFFLINE') ? await adoptPending() : false;
      if (!adopted) {
        kycLog(`urgent: push FAILED — ${e.message || e}`);
        setPhase('failed');
        setMsg(
          (e && e.code === 'pending_payment'
            ? e.message
            : e.message || 'Could not start the payment. Try again in a moment.')
        );
      }
    }
  }

  function dismissPending() {
    kycLog(`urgent: dismissed tracking for payment #${payment?.id || '?'}`);
    stopTimers();
    setPhase('idle');
    setPayment(null);
    setStopped(false);
    setMsg('We stopped tracking. If you complete the payment, the urgent review activates on its own.');
  }

  // ── PAID — server truth (paid prop) or this session's success. No button:
  // the review can never be paid for twice. ────────────────────────────────
  if (paid || phase === 'paid') {
    return (
      <View style={[styles.urgentCard, styles.urgentCardPaid]}>
        <View style={styles.urgentHead}>
          <Ionicons name="flash" size={18} color={colors.goldDark} />
          <Text style={styles.urgentTitle}>Urgent review is active</Text>
          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
        </View>
        <Text style={styles.urgentBody}>
          {payment?.mpesaReceipt
            ? `Paid via M-Pesa · receipt ${payment.mpesaReceipt}. `
            : 'Paid. '}
          Your review jumps the queue — we will notify you within 72 hours, most urgent reviews
          come back sooner.
        </Text>
        <Text style={styles.urgentNote}>You cannot be charged again for this submission.</Text>
      </View>
    );
  }

  // ── IN-FLIGHT — the staged tracker replaces the upsell card entirely. ────
  if (phase === 'pushing' || phase === 'polling') {
    const pushSent = !!(payment && payment.checkoutRequestId);
    const remaining = Math.max(0, TOTAL_WAIT_S - elapsed);
    const rows = [
      {
        title: 'Payment accepted by gateway',
        sub: payment ? `KES ${payment.amount || price} · KYC expedite · payment #${payment.id}` : null,
        state: 'done',
      },
      {
        title: 'Prompt sent to your phone',
        sub: pushSent ? `STK request to ${payment.phone || 'your phone'}` : 'Sending the STK request…',
        state: pushSent ? 'done' : 'active',
      },
      {
        title: 'Enter your M-Pesa PIN',
        sub: pushSent ? `Waiting for your PIN · ${fmtMMSS(remaining)} remaining` : undefined,
        state: pushSent ? 'active' : 'todo',
      },
      {
        title: 'Payment confirmed',
        sub: 'The tracker updates by itself — keep this screen open',
        state: 'todo',
      },
    ];
    return (
      <View style={[styles.urgentCard, styles.urgentCardLive]}>
        <Text style={styles.urgentTitleLive}>Processing payment</Text>
        <View style={styles.trackSteps}>
          {rows.map((r, i) => (
            <TrackRow key={r.title} {...r} last={i === rows.length - 1} />
          ))}
        </View>
        <Pressable onPress={() => setShowTips((v) => !v)} hitSlop={8}>
          <Text style={styles.tipsLink}>{showTips ? 'Hide tips' : "Didn't get a prompt?"}</Text>
        </Pressable>
        {showTips ? (
          <Text style={styles.tipsBody}>
            Keep the SIM active with network coverage — the prompt can take up to a minute on busy
            networks. If the countdown ends, the request expires and you can simply send a new push.
          </Text>
        ) : null}
        {stopped ? (
          <>
            <Text style={styles.urgentStopped}>
              We stopped auto-checking, but the payment is still open — if you approve the prompt it
              can still complete. Check your M-Pesa messages.
            </Text>
            <Pressable
              style={[styles.urgentBtn, { marginTop: 4 }]}
              onPress={() => {
                setStopped(false);
                if (payment?.id) startPolling(payment.id);
              }}
            >
              <Text style={styles.urgentBtnText}>Keep checking</Text>
            </Pressable>
            <Pressable onPress={dismissPending} hitSlop={6} style={styles.urgentClose}>
              <Text style={styles.urgentCloseText}>Close — pay later</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  // ── FAILED — calm card with the mapped reason; "Go urgent" returns. ──────
  if (phase === 'failed') {
    return (
      <View style={[styles.urgentCard, styles.urgentCardFailed]}>
        <View style={styles.urgentHead}>
          <Ionicons name="close-circle" size={20} color={colors.danger} />
          <Text style={styles.urgentTitle}>Payment not completed</Text>
        </View>
        <Text style={styles.urgentBody}>{msg}</Text>
        <Text style={styles.urgentNote}>
          Nothing is charged for unapproved requests. Urgent buys speed only — it never buys
          approval and is not refunded after a rejection.
        </Text>
        <Pressable style={styles.urgentBtn} onPress={goUrgent}>
          <Text style={styles.urgentBtnText}>Try again · KSh {price}</Text>
        </Pressable>
      </View>
    );
  }

  // ── IDLE — the upsell with the LIVE table price. ─────────────────────────
  return (
    <View style={styles.urgentCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="flash" size={18} color={colors.goldDark} />
        <Text style={styles.urgentTitle}>In a hurry?</Text>
      </View>
      <Text style={styles.urgentBody}>
        Go urgent for <Text style={{ fontWeight: '800' }}>KSh {price}</Text> — your review jumps the
        queue. Urgent buys speed only, and is not refunded if the submission is rejected.
      </Text>
      {msg ? <Text style={styles.urgentMsg}>{msg}</Text> : null}
      <Pressable onPress={goUrgent} style={({ pressed }) => [styles.urgentBtn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.urgentBtnText}>Go urgent · KSh {price}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeCard: {
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 2,
  },
  badgeTitle: { fontSize: 19, fontWeight: '800', color: colors.cream, textAlign: 'center' },
  badgeBody: { fontSize: 14, color: colors.brandSoftLight, textAlign: 'center', lineHeight: 20 },
  badgeReason: { fontSize: 13.5, fontWeight: '700', color: colors.gold, textAlign: 'center', marginTop: 4 },
  stepsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  stepsTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepText: { flex: 1, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  disclaimer: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(214, 166, 79, 0.12)',
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  infoCardGood: { backgroundColor: 'rgba(123, 192, 139, 0.18)' },
  infoCardText: { flex: 1, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  urgentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 14,
    gap: 8,
    marginTop: 4,
  },
  urgentCardPaid: { borderColor: colors.brand, backgroundColor: 'rgba(20,60,40,0.06)' },
  urgentCardFailed: { borderColor: colors.danger },
  urgentCardLive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  urgentTitle: { fontSize: 14, fontWeight: '800', color: colors.ink, flex: 1 },
  urgentTitleLive: { fontSize: 15, fontWeight: '800', color: colors.ink },
  urgentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgentBody: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  urgentNote: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  urgentMsg: { fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  urgentStopped: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.goldDark,
    fontWeight: '600',
    textAlign: 'center',
  },
  urgentClose: { alignItems: 'center', paddingVertical: 6 },
  urgentCloseText: { fontSize: 13, fontWeight: '700', color: colors.muted, textDecorationLine: 'underline' },
  urgentBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  urgentBtnText: { fontSize: 14, fontWeight: '800', color: colors.ink },
  // Staged progress tracker (mirrors the payment screen's styles).
  trackSteps: { alignSelf: 'stretch', marginTop: 2 },
  trackRow: { flexDirection: 'row' },
  trackIconCol: { width: 30, alignItems: 'center' },
  trackRail: { width: 2, flex: 1, backgroundColor: colors.line, borderRadius: 1, marginVertical: 3 },
  trackText: { flex: 1, marginLeft: 12 },
  trackTextSpaced: { paddingBottom: 16 },
  trackTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 20 },
  trackTitleTodo: { color: colors.muted, fontWeight: '600' },
  trackSub: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: colors.muted },
  tipsLink: {
    alignSelf: 'flex-start',
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.goldDark,
    textDecorationLine: 'underline',
  },
  tipsBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
  },
});
