// M-Pesa payment — live STK Push against the Daraja production gateway.
// Flow: choose amount -> confirm phone -> "Send push" -> the prompt lands on
// the phone -> user enters their M-Pesa PIN -> the SAFARICOM CALLBACK settles
// the payment (source of truth; the gateway only uses the Daraja query API
// to confirm success early, never to fail an in-flight prompt) -> success
// shows the M-Pesa receipt code.
//
// Timing: STK prompts regularly take 30-60s+ for the user to key their PIN,
// so polling runs every 4s for up to ~3.5 minutes, and a little longer after
// success so the callback's receipt number lands on screen. When we stop
// auto-checking the payment is left PENDING (never "failed") with a Keep
// Checking action.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandLoader from '../../components/brand/BrandLoader';
import FullScreenLoader from '../../components/brand/FullScreenLoader';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton, Screen, ScreenHeader, TextField } from '../../ui';
import DrawerMenuButton from '../../components/common/DrawerMenuButton';

const AMOUNTS = [1, 50, 100, 200, 500];
const POLL_MS = 4000;
const MAX_POLLS = 52; // ~3.5 minutes of auto-checking
const RECEIPT_EXTRA_POLLS = 8; // keep polling ~30s after success until the receipt lands

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

export default function PaymentScreen({ navigation }) {
  const { user, token } = useApp();
  const [amount, setAmount] = useState(1);
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [payment, setPayment] = useState(null); // { id, status, mpesaReceipt, resultDesc, phone }
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false); // stopped auto-checking while still pending
  const pollRef = useRef({ timerId: null, n: 0 });
  const elapsedRef = useRef(null);

  const stopTimers = () => {
    if (pollRef.current.timerId) clearInterval(pollRef.current.timerId);
    pollRef.current = { timerId: null, n: 0 };
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = null;
  };

  // Stop polling when the screen unmounts.
  useEffect(() => stopTimers, []);

  const startPolling = (paymentId) => {
    stopTimers();
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    const tick = async () => {
      pollRef.current.n += 1;
      let keepGoing = true;
      let stillPending = false;
      try {
        const res = await api.mpesaStatus(paymentId, token, true);
        if (res.payment) {
          setPayment(res.payment);
          if (res.payment.status === 'pending') {
            stillPending = true;
          } else if (
            res.payment.status === 'success' &&
            !res.payment.mpesaReceipt &&
            pollRef.current.n < MAX_POLLS + RECEIPT_EXTRA_POLLS
          ) {
            // Settled, but the callback has not stored the receipt number yet
            // — poll a little longer so it appears on screen.
          } else {
            keepGoing = false;
          }
        }
      } catch {
        stillPending = true; // transient network error — keep polling
      }
      if (!keepGoing) {
        stopTimers();
        setStopped(false);
        return;
      }
      if (stillPending && pollRef.current.n >= MAX_POLLS) {
        // Leave the payment pending — the M-Pesa prompt may still be waiting.
        stopTimers();
        setStopped(true);
      }
    };
    pollRef.current.timerId = setInterval(tick, POLL_MS);
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
    try {
      const res = await api.mpesaStkPush(
        { amount, phone: phone.trim(), purpose: 'app_test' },
        token
      );
      setPayment({ id: res.paymentId, status: 'pending', mpesaReceipt: null, resultDesc: null });
      startPolling(res.paymentId);
    } catch (e) {
      setError(e.message || 'Could not start the payment. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const reset = () => {
    stopTimers();
    setPayment(null);
    setStopped(false);
    setError('');
  };

  const pending = payment?.status === 'pending';
  // Inside the Profile drawer → hamburger + HomeTab exit; root-stack copy → goBack.
  const inDrawer = typeof navigation.openDrawer === 'function';

  return (
    <Screen>
      <FullScreenLoader visible={starting} label="Sending push" theme="dark" />

      <ScreenHeader
        eyebrow="M-Pesa · Live"
        title="Pay with M-Pesa"
        subtitle="STK Push via Safaricom Daraja. Real money moves — test with KES 1 first."
        right={<DrawerMenuButton navigation={navigation} />}
      />

      <Banner message={error} />

      {payment && payment.status === 'success' ? (
        <View style={[styles.statusCard, { borderColor: colors.brandSoft }]}>
          <Ionicons name="checkmark-circle" size={46} color={colors.brandSoft} />
          <Text style={styles.statusTitle}>Payment received</Text>
          <Text style={styles.statusBody}>
            KES {amount} via M-Pesa — asante! Your payment is confirmed.
          </Text>
          <View style={styles.receiptChip}>
            <Text style={styles.receiptLabel}>M-Pesa receipt</Text>
            <Text style={styles.receiptValue}>{payment.mpesaReceipt || 'Confirming…'}</Text>
          </View>
          <PrimaryButton
            title="Back to Home"
            onPress={() => (inDrawer ? navigation.navigate('HomeTab') : navigation.goBack())}
            style={{ marginTop: 18 }}
          />
        </View>
      ) : payment && payment.status === 'failed' ? (
        <View style={[styles.statusCard, { borderColor: colors.danger }]}>
          <Ionicons name="close-circle" size={46} color={colors.danger} />
          <Text style={styles.statusTitle}>Payment not completed</Text>
          <Text style={styles.statusBody}>{friendlyFailure(payment)}</Text>
          <Text style={styles.statusNote}>
            Nothing is charged for unapproved requests. Send a new push whenever you are ready.
          </Text>
          <PrimaryButton title="Try Again" onPress={reset} style={{ marginTop: 18 }} />
        </View>
      ) : payment && pending ? (
        <View style={[styles.statusCard, { borderColor: colors.gold }]}>
          <BrandLoader variant="radar" size={92} color={colors.brandSoft} />
          <Text style={styles.statusTitle}>Check your phone</Text>
          <Text style={styles.statusBody}>
            An M-Pesa prompt for KES {amount} was sent to {payment.phone || phone}. Enter your
            M-Pesa PIN to approve it.
          </Text>
          <Text style={styles.statusHint}>
            Waiting for confirmation · {elapsed}s{stopped ? '' : ' — keep this screen open'}
          </Text>
          <Text style={styles.statusNote}>
            The prompt can take a few seconds to reach your phone, and up to a minute on busy
            networks. You have about 3 minutes to enter your PIN.
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
        </View>
      ) : (
        <>
          <Text style={styles.label}>Amount (KES)</Text>
          <View style={styles.chipRow}>
            {AMOUNTS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAmount(a)}
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
  statusTitle: { marginTop: 12, fontSize: 19, fontWeight: '800', color: colors.ink },
  statusBody: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  statusHint: { marginTop: 12, fontSize: 12.5, color: colors.goldDark, fontWeight: '700' },
  statusNote: {
    marginTop: 6,
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
