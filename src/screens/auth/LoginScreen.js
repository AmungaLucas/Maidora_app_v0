// Login — email OR phone + password.
// §6: best-effort GPS capture at login updates the stored location (a denied
// permission or a failed fix changes nothing — last known location stands).
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { captureCurrentLocation } from '../../location';
import { tabsRouteFor } from '../../navigation/Tabs';
import { colors, radius } from '../../theme';
import { isValidEmail, isValidPhone } from '../../validation';
import { Banner, PrimaryButton, Screen, ScreenHeader, TextField } from '../../ui';

export default function LoginScreen({ navigation }) {
  const { signIn, setPendingReg } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = useMemo(
    () => (isValidEmail(identifier) || isValidPhone(identifier)) && password.length > 0,
    [identifier, password]
  );

  // §6 — location auto-update at login. Silent + best-effort: never blocks
  // the login and never shows an error; permission prompts only appear if
  // the OS still owes one.
  const captureLoginLocation = async () => {
    try {
      const result = await Promise.race([
        captureCurrentLocation(),
        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      if (!result) return undefined;
      return {
        latitude: result.latitude,
        longitude: result.longitude,
        locationName: result.locationName || undefined,
        locationSource: 'gps',
      };
    } catch {
      return undefined; // GPS denied/off — keep last known location
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const location = await captureLoginLocation();
      const res = await api.login({
        identifier: identifier.trim(),
        password,
        location,
      });
      if (res.requiresVerification) {
        // Phone not verified yet — route into the OTP flow (§3.3).
        await setPendingReg({
          userId: res.userId,
          phone: res.phone || null,
          maskedPhone: res.maskedPhone || null,
          otpSent: res.otpSent !== false,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
        navigation.replace('Otp', { infoNote: res.note || null });
        return;
      }
      await signIn(res.token, res.user);
      if (!res.user.role) {
        // Verified but never onboarded → pick the role now (§3.2).
        navigation.reset({ index: 0, routes: [{ name: 'RoleSelect' }] });
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: tabsRouteFor(res.user) }] });
    } catch (e) {
      setErrorMessage(e.message || 'Could not log you in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      {/* Back-only header row — the title stays in the content (ScreenHeader
          hides the back arrow itself when the stack has nothing behind it). */}
      <ScreenHeader navigation={navigation} />
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Log in to your Maidora account.</Text>

      <View style={{ marginTop: 26 }}>
        <Banner message={errorMessage} />
        <TextField
          label="Email or phone number"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="you@example.com or 0712 345 678"
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          error={touched && !identifier ? 'Enter the email or phone you registered with.' : undefined}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secure
          autoComplete="current-password"
        />

        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgotRow}
          hitSlop={8}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, minHeight: 16 }} />

      <PrimaryButton title="Log In" onPress={submit} disabled={!canSubmit} loading={submitting} />

      <Pressable
        onPress={() => navigation.navigate('Signup')}
        style={styles.signupRow}
        hitSlop={8}
      >
        <Text style={styles.signupText}>
          New to Maidora? <Text style={styles.signupLink}>Create an account</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 10 },
  subtitle: { marginTop: 6, fontSize: 14.5, color: colors.muted },
  forgotRow: { alignSelf: 'flex-end', marginTop: 2, marginBottom: 14 },
  forgotText: { color: colors.forest, fontWeight: '700', fontSize: 14 },
  signupRow: { alignItems: 'center', marginTop: 20 },
  signupText: { color: colors.muted, fontSize: 14.5 },
  signupLink: { color: colors.forest, fontWeight: '800' },
});
