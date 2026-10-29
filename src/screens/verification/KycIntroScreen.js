// KYC step 0 — intro (§33.1 step 1). Explains the badge, shows the current
// state (not started / draft to resume / rejected with reason / in review /
// approved), and carries the KSh 150 urgent upsell (speed only, never
// refunded — MPS §33.3).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader } from '../../ui';
import DrawerMenuButton from '../../components/common/DrawerMenuButton';
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.kycGet(token);
        if (alive) setState(res);
      } catch (e) {
        if (alive) setError(e.message || 'Could not load your verification status.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

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
    navigation.navigate('KycPersonal', { draft });
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Maidora Trust Badge"
        title="Verify your identity"
        subtitle="Free · Reviewed within 48–72 hours"
        right={<DrawerMenuButton navigation={navigation} />}
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

      {inReview && state && !state.urgent ? <UrgentUpsell token={token} /> : null}
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

// Urgent upsell — inline STK push of KSh 150 with the gateway's standard
// patient polling. Success marks the review as expedited server-side
// (payments callback grants kyc_urgent). Never refunded, per MPS §33.3.
export function UrgentUpsell({ token }) {
  const [phase, setPhase] = useState('idle'); // idle | pushing | polling | done | failed
  const [msg, setMsg] = useState('');
  const [paymentId, setPaymentId] = useState(null);

  useEffect(() => {
    if (phase !== 'polling' || !paymentId) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      try {
        const res = await api.mpesaStatus(paymentId, token, true);
        if (res.payment?.status === 'success') {
          setPhase('done');
          setMsg('Urgent review is active. We will notify you within 72 hours — most urgent reviews come back sooner.');
          clearInterval(t);
        } else if (res.payment?.status === 'failed') {
          setPhase('idle');
          setMsg(res.payment?.resultDesc || 'The payment could not be completed. You can try again.');
          clearInterval(t);
        } else if (n > 52) {
          setPhase('idle');
          setMsg('We stopped auto-checking the payment. If you completed it, the urgent review will activate shortly.');
          clearInterval(t);
        }
      } catch {
        /* keep polling through transient errors */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [phase, paymentId, token]);

  async function goUrgent() {
    setMsg('');
    setPhase('pushing');
    try {
      const res = await api.mpesaStkPush({ amount: 150, purpose: 'kyc_urgent' }, token);
      setPaymentId(res.paymentId);
      setMsg('Check your phone — enter your M-Pesa PIN to pay KSh 150 for the urgent review.');
      setPhase('polling');
    } catch (e) {
      setPhase('idle');
      setMsg(e.message || 'Could not start the payment. Try again in a moment.');
    }
  }

  if (phase === 'done') {
    return (
      <View style={[styles.urgentCard, { borderColor: colors.brandSoft }]}>
        <Ionicons name="flash" size={18} color={colors.goldDark} />
        <Text style={styles.urgentText}>{msg}</Text>
      </View>
    );
  }

  return (
    <View style={styles.urgentCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="flash" size={18} color={colors.goldDark} />
        <Text style={styles.urgentTitle}>In a hurry?</Text>
      </View>
      <Text style={styles.urgentBody}>
        Go urgent for <Text style={{ fontWeight: '800' }}>KSh 150</Text> — your review jumps the queue.
        Urgent buys speed only, and is not refunded if the submission is rejected.
      </Text>
      {msg ? <Text style={styles.urgentMsg}>{msg}</Text> : null}
      <Pressable
        onPress={goUrgent}
        disabled={phase === 'pushing' || phase === 'polling'}
        style={({ pressed }) => [styles.urgentBtn, pressed && { opacity: 0.85 }, (phase === 'pushing' || phase === 'polling') && { opacity: 0.6 }]}
      >
        <Text style={styles.urgentBtnText}>
          {phase === 'pushing' ? 'Starting…' : phase === 'polling' ? 'Waiting for M-Pesa…' : 'Go urgent · KSh 150'}
        </Text>
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
  },
  urgentTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  urgentBody: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  urgentMsg: { fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  urgentBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  urgentBtnText: { fontSize: 14, fontWeight: '800', color: colors.ink },
});
