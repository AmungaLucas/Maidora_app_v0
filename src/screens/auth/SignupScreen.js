// Signup — creates the account (no role here), then hands off to OTP.
// Role is chosen at ONBOARDING, after phone verification (spec §3.2) —
// the server ignores any role sent from this screen.
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../../api';
import { useApp } from '../../context/AppContext';
import { captureCurrentLocation } from '../../location';
import { LINKS, colors, radius } from '../../theme';
import { validateSignup } from '../../validation';
import { Banner, PrimaryButton, Screen, ScreenHeader, TextField } from '../../ui';

export default function SignupScreen({ navigation }) {
  const { setPendingReg } = useApp();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    locationName: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  });
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorField, setErrorField] = useState(null);

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

  const { valid, errors } = useMemo(() => validateSignup(form), [form]);

  const useMyLocation = async () => {
    setLocating(true);
    setErrorMessage('');
    try {
      const result = await captureCurrentLocation();
      setCoords({ latitude: result.latitude, longitude: result.longitude });
      setForm((f) => ({
        ...f,
        locationName: result.locationName || f.locationName || '',
      }));
    } catch (e) {
      setErrorMessage(e.message || 'Could not get your location. Please type it instead.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setErrorMessage('');
    setErrorField(null);
    try {
      const res = await api.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        locationName: form.locationName.trim(),
        latitude: coords ? coords.latitude : undefined,
        longitude: coords ? coords.longitude : undefined,
        locationSource: coords ? 'gps' : 'manual',
        referralCode: form.referralCode.trim() || undefined,
      });
      // Role is NOT set here — onboarding asks after OTP verification.
      await setPendingReg({
        userId: res.userId,
        phone: res.phone,
        maskedPhone: res.maskedPhone,
        otpSent: res.otpSent !== false,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      navigation.replace('Otp', { infoNote: res.note || null });
    } catch (e) {
      if (e instanceof ApiError && e.field) setErrorField(e.field);
      setErrorMessage(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key) => (touched || errorField === key ? errors[key] : undefined);

  return (
    <Screen>
      {/* Back-only header row — the title stays in the content (ScreenHeader
          hides the back arrow itself when the stack has nothing behind it). */}
      <ScreenHeader navigation={navigation} />
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>
        We will send a 6-digit code to your phone to verify it. You will pick
        whether you are hiring or looking for work right after.
      </Text>

      <View style={{ marginTop: 20 }}>
        <Banner message={errorMessage} />

        <TextField
          label="Full name"
          value={form.fullName}
          onChangeText={set('fullName')}
          placeholder="e.g. Grace Wanjiku"
          autoCapitalize="words"
          error={fieldError('fullName')}
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={fieldError('email')}
        />
        <TextField
          label="Phone number"
          value={form.phone}
          onChangeText={set('phone')}
          placeholder="0712 345 678"
          keyboardType="phone-pad"
          autoComplete="tel"
          error={fieldError('phone')}
          hint="Kenyan number — we will send a 6-digit code to it."
        />

        <TextField
          label="Location"
          value={form.locationName}
          onChangeText={set('locationName')}
          placeholder="e.g. Nairobi, Utawala"
          autoCapitalize="words"
          error={fieldError('locationName')}
          hint={
            coords
              ? `Captured at ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)} — you can edit the name.`
              : 'Tap "Use my current location" or type it yourself.'
          }
        />
        <Pressable onPress={useMyLocation} style={styles.locateBtn} disabled={locating}>
          <Text style={styles.locateBtnText}>
            {locating ? 'Finding your location…' : '📍 Use my current location'}
          </Text>
        </Pressable>

        <TextField
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          placeholder="At least 8 characters"
          secure
          autoComplete="new-password"
          error={fieldError('password')}
        />
        <TextField
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
          placeholder="Repeat your password"
          secure
          autoComplete="new-password"
          error={fieldError('confirmPassword')}
        />

        {!showReferral ? (
          <Pressable onPress={() => setShowReferral(true)} style={styles.referralLink}>
            <Text style={styles.referralLinkText}>Have a referral code?</Text>
          </Pressable>
        ) : (
          <TextField
            label="Referral code"
            value={form.referralCode}
            onChangeText={set('referralCode')}
            placeholder="Enter the code a friend shared"
            autoCapitalize="characters"
            error={fieldError('referralCode')}
          />
        )}
      </View>

      <View style={{ flex: 1, minHeight: 12 }} />

      {/* Sits directly above the primary button, per spec. */}
      <Text style={styles.legal}>
        By creating an account, you agree with our{' '}
        <Text style={styles.linkText} onPress={() => Linking.openURL(LINKS.terms)}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={styles.linkText} onPress={() => Linking.openURL(LINKS.privacy)}>
          Privacy Policy
        </Text>
        .
      </Text>
      <PrimaryButton title="Create Account" onPress={submit} disabled={!valid} loading={submitting} />

      <Pressable
        onPress={() => navigation.navigate('Login')}
        style={styles.loginRow}
        hitSlop={8}
      >
        <Text style={styles.loginRowText}>
          Already have an account? <Text style={styles.linkText}>Log in</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 6, fontSize: 14.5, color: colors.muted },
  locateBtn: {
    alignSelf: 'flex-start',
    marginTop: -6,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSoft,
  },
  locateBtnText: { color: colors.forest, fontWeight: '700', fontSize: 13.5 },
  referralLink: { alignSelf: 'flex-start', marginBottom: 16, paddingVertical: 4 },
  referralLinkText: { color: colors.forest, fontWeight: '700', fontSize: 14.5, textDecorationLine: 'underline' },
  legal: {
    textAlign: 'center',
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: 12,
  },
  linkText: { color: colors.forest, fontWeight: '700', textDecorationLine: 'underline' },
  loginRow: { alignItems: 'center', marginTop: 18 },
  loginRowText: { color: colors.muted, fontSize: 14.5 },
});
