// Welcome — first-install onboarding entry.
// Role is chosen AFTER verification (onboarding), so Get Started goes
// straight to Signup (unified spec §3.2).
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import BrandLockup from '../components/brand/BrandLockup';
import { useApp } from '../context/AppContext';
import { LINKS, colors } from '../theme';
import { PrimaryButton, Screen } from '../ui';

export default function WelcomeScreen({ navigation }) {
  const { completeOnboarding } = useApp();

  const go = (target) => {
    // The user has now seen onboarding — flag it so later launches skip Welcome.
    completeOnboarding();
    navigation.navigate(target);
  };

  return (
    <Screen scroll={false} keyboard={false}>
      <View style={styles.body}>
        <BrandLockup markSize={118} wordSize={30} gap={18} />
        <Text style={styles.blurb}>
          A safe, verified marketplace connecting households with trusted house helps across
          Kenya — whether you are hiring or looking for work.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Get Started" onPress={() => go('Signup')} />
        <Pressable onPress={() => go('Login')} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>I already have an account</Text>
        </Pressable>
        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={styles.linkText} onPress={() => Linking.openURL(LINKS.terms)}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={styles.linkText} onPress={() => Linking.openURL(LINKS.privacy)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  blurb: {
    marginTop: 26,
    textAlign: 'center',
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.muted,
    maxWidth: 320,
  },
  footer: { gap: 14, paddingTop: 12 },
  loginLink: { alignItems: 'center', paddingVertical: 6 },
  loginLinkText: { color: colors.forest, fontWeight: '700', fontSize: 15 },
  legal: { textAlign: 'center', fontSize: 12.5, color: colors.muted, lineHeight: 19, paddingHorizontal: 12 },
  linkText: { color: colors.forest, fontWeight: '700', textDecorationLine: 'underline' },
});
