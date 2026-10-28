// M-Pesa payment — live STK Push against the Daraja production gateway.
// Flow: choose amount -> confirm phone -> "Send push" -> the prompt lands on
// the phone -> user enters their M-Pesa PIN -> we poll status (the gateway
// uses the Daraja query API when callbacks are missed) -> success shows the
// M-Pesa receipt code.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { colors, radius } from '../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader, TextField } from '../ui';

const AMOUNTS = [1, 50, 100, 200, 500];
const POLL_MS = 3500;
const MAX_POLLS = 26; // ~90 seconds

export default function PaymentScreen({ navigation }) {
  const { user, token } = useApp();
  const [amount, setAmount] = useState(1);
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [payment, setPayment] = useState(null); // { id, status, mpesaReceipt, resultDesc, phone }
  const pollRef = useRef({ timerId: null, n: 0 });

  // Stop polling when the screen unmounts.
  useEffect(
    () => () => {
      if (pollRef.current.timerId) clearInterval(pollRef.current.timerId);
    },
    []
  );

  const startPolling = (paymentId) => {
    if (pollRef.current.timerId) clearInterval(pollRef.current.timerId);
    pollRef.current = { timerId: null, n: 0 };
    const tick = async () => {
      pollRef.current.n += 1;
      try {
        const res = await api.mpesaStatus(paymentId, token, true);
        if (res.payment) {
          setPayment(res.payment);
          if (res.payment.status !== 'pending' || pollRef.current.n >= MAX_POLLS) {
            clearInterval(pollRef.current.timerId);
            pollRef.current.timerId = null;
          }
        }
      } catch {
        // transient network error — keep polling until the cap
        if (pollRef.current.n >= MAX_POLLS) {
          clearInterval(pollRef.current.timerId);
          pollRef.current.timerId = null;
        }
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
    if (pollRef.current.timerId) clearInterval(pollRef.current.timerId);
    pollRef.current = { timerId: null, n: 0 };
    setPayment(null);
    setError('');
  };

  const pending = payment?.status === 'pending';

  return (
    <Screen>
      <ScreenHeader
        eyebrow="M-Pesa · Live"
        title="Pay with M-Pesa"
        subtitle="STK Push via Safaricom Daraja. Real money moves — test with KES 1 first."
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
            <Text style={styles.receiptValue}>{payment.mpesaReceipt || 'Pending receipt'}</Text>
          </View>
          <PrimaryButton title="Back to Home" onPress={() => navigation.goBack()} style={{ marginTop: 18 }} />
        </View>
      ) : payment && payment.status === 'failed' ? (
        <View style={[styles.statusCard, { borderColor: colors.danger }]}>
          <Ionicons name="close-circle" size={46} color={colors.danger} />
          <Text style={styles.statusTitle}>Payment not completed</Text>
          <Text style={styles.statusBody}>
            {payment.resultDesc || 'The payment could not be completed.'}
          </Text>
          <PrimaryButton title="Try Again" onPress={reset} style={{ marginTop: 18 }} />
        </View>
      ) : payment && pending ? (
        <View style={[styles.statusCard, { borderColor: colors.gold }]}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.statusTitle}>Check your phone</Text>
          <Text style={styles.statusBody}>
            An M-Pesa prompt for KES {amount} was sent to {payment.phone || phone}. Enter your
            M-Pesa PIN to approve it.
          </Text>
          <Text style={styles.statusHint}>
            Waiting for confirmation — keep this screen open.
          </Text>
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
            title={starting ? 'Sending push…' : `Send STK Push · KES ${amount}`}
            onPress={start}
            disabled={starting}
            loading={starting}
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
  statusHint: { marginTop: 12, fontSize: 12.5, color: colors.goldDark, fontWeight: '600' },
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
