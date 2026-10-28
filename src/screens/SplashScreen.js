// Splash — brand moment shown while auth/onboarding state loads.
// (Animation pass comes later; static for now.)
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.name}>Maidora Kenya</Text>
      <Text style={styles.tagline}>Trusted help for your household.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: { width: 190, height: 177, marginBottom: 26 },
  name: { fontSize: 30, fontWeight: '800', color: colors.forest, letterSpacing: 0.3 },
  tagline: { marginTop: 8, fontSize: 16, color: colors.muted },
});
