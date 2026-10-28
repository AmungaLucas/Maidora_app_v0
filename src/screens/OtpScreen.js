// OTP verification — 6-digit SMS code.
// Reads pendingReg from context so it survives an app restart (pending userId
// stored at /register time). On success the session starts and role is locked.
//
// Autofill (three layers):
//   1. Android — SMS Retriever via expo-otp-autofill (no SMS permissions;
//      requires a dev build + the app hash appended to the SMS server-side).
//   2. iOS     — oneTimeCode textContentType on the hidden input.
//   3. Anywhere— "Paste code" button reads the clipboard (works in Expo Go).
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { getAppHashAsync, useOtpAutoFill } from 'expo-otp-autofill';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { tabsRouteFor } from '../navigation/Tabs';
import { colors, radius } from '../theme';
import { Banner, PrimaryButton, Screen } from '../ui';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen({ navigation }) {
  const { pendingReg, setPendingReg, signIn } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputRef = useRef(null);
  const submittedRef = useRef('');

  // Android SMS Retriever — the gateway appends the app hash (OTP_APP_HASH)
  // to the OTP SMS, so this fires the moment the SMS lands. No-ops on iOS/web
  // and inside Expo Go.
  const { otp: smsOtp, clear: clearSmsOtp } = useOtpAutoFill({ length: CODE_LENGTH });
  const [appHash, setAppHash] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    getAppHashAsync()
      .then((h) => {
        setAppHash(h || '');
        if (__DEV__ && h) console.log('[maidora] SMS Retriever app hash:', h);
      })
      .catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    if (!pendingReg) {
      // Direct nav with nothing pending — send the user back to the start.
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    }
  }, [pendingReg, navigation]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const verify = async (value) => {
    if (!pendingReg || verifying || value.length !== CODE_LENGTH) return;
    setVerifying(true);
    setError('');
    try {
      const res = await api.verifyOtp({ userId: pendingReg.userId, code: value });
      await setPendingReg(null);
      await signIn(res.token, res.user);
      navigation.reset({ index: 0, routes: [{ name: tabsRouteFor(res.user) }] });
    } catch (e) {
      setCode('');
      submittedRef.current = '';
      setError(e.message || 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (text) => {
    const clean = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(clean);
    setError('');
    if (clean.length === CODE_LENGTH && submittedRef.current !== clean) {
      submittedRef.current = clean;
      verify(clean);
    }
  };

  // Feed the SMS-delivered code through the same onChange flow.
  useEffect(() => {
    if (smsOtp && smsOtp.replace(/\D/g, '').length === CODE_LENGTH) {
      onChange(smsOtp);
      clearSmsOtp();
    }
  }, [smsOtp]);

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const digits = String(text || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
      if (digits.length === CODE_LENGTH) {
        onChange(digits);
      } else {
        setError('No 6-digit code found in your clipboard.');
      }
    } catch {
      setError('Could not read the clipboard.');
    }
  };

  const resend = async () => {
    if (!pendingReg || resending || seconds > 0) return;
    setResending(true);
    setError('');
    try {
      const res = await api.resendOtp({ userId: pendingReg.userId });
      setSeconds(RESEND_SECONDS);
      if (res.otpSent === false) {
        setInfo(res.note || 'We could not send the SMS right now. Please try again shortly.');
      } else {
        setInfo('A new code is on its way.');
      }
    } catch (e) {
      setError(e.message || 'Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  if (!pendingReg) return <Screen scroll={false} />;

  return (
    <Screen>
      <Text style={styles.title}>Verify your phone</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to{' '}
        <Text style={styles.phone}>{pendingReg.maskedPhone || pendingReg.phone}</Text>
      </Text>

      <View style={{ marginTop: 28 }}>
        <Banner kind="info" message={info} />
        <Banner message={error} />

        <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.box, code.length === i && styles.boxActive]}>
              <Text style={styles.boxDigit}>{code[i] || ''}</Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          style={styles.hiddenInput}
        />
        {code.length < CODE_LENGTH ? (
          <Pressable style={styles.pasteRow} onPress={pasteFromClipboard} hitSlop={8}>
            <Ionicons name="clipboard-outline" size={15} color={colors.goldDark} />
            <Text style={styles.pasteText}>Paste code</Text>
          </Pressable>
        ) : null}
        <Text style={styles.hint}>Enter the code. It expires in 10 minutes.</Text>
      </View>

      <View style={{ flex: 1, minHeight: 20 }} />

      <PrimaryButton
        title="Verify & Continue"
        onPress={() => verify(code)}
        disabled={code.length !== CODE_LENGTH}
        loading={verifying}
      />

      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text style={styles.resendWait}>Resend code in {seconds}s</Text>
        ) : (
          <Pressable onPress={resend} hitSlop={8}>
            <Text style={styles.resendLink}>{resending ? 'Sending…' : 'Resend code'}</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.changeNumberRow}
        hitSlop={8}
        onPress={async () => {
          await setPendingReg(null);
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        }}
      >
        <Text style={styles.changeNumberText}>Wrong number? Start over</Text>
      </Pressable>

      {__DEV__ && appHash ? (
        <Text style={styles.devHash}>Dev · SMS hash: {appHash}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 10 },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.muted },
  phone: { color: colors.forest, fontWeight: '700' },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  box: {
    width: 48,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.forest, borderWidth: 2 },
  boxDigit: { fontSize: 24, fontWeight: '800', color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  hint: { marginTop: 12, fontSize: 13, color: colors.muted, textAlign: 'center' },
  pasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 12,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pasteText: { color: colors.goldDark, fontSize: 13, fontWeight: '700' },
  devHash: { marginTop: 10, fontSize: 11, color: colors.muted, textAlign: 'center' },
  resendRow: { alignItems: 'center', marginTop: 18 },
  resendWait: { color: colors.muted, fontSize: 14 },
  resendLink: { color: colors.forest, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
  changeNumberRow: { alignItems: 'center', marginTop: 14 },
  changeNumberText: { color: colors.muted, fontSize: 13.5 },
});
