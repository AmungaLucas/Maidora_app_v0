// Home tab — shared by both roles, content adapts to user.role.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';
import { Screen } from '../ui';

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

export default function HomeScreen({ navigation }) {
  const { user } = useApp();
  const isEmployer = user?.role !== 'househelp';

  return (
    <Screen keyboard={false}>
      <View style={styles.header}>
        <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Karibu, {firstName(user?.fullName)} 👋</Text>
          <Text style={styles.roleLine}>{ROLES[user?.role] || 'Member'} · Maidora Kenya</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8}>
          <Ionicons name="settings-outline" size={24} color={colors.brand} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrow}>
            {isEmployer ? 'Hiring trusted help' : 'Getting discovered'}
          </Text>
        </View>
        <Text style={styles.heroTitle}>
          {isEmployer ? 'Your home deserves trusted hands.' : 'Let families find you.'}
        </Text>
        <Text style={styles.heroBody}>
          {isEmployer
            ? 'Browse verified house helps near you, check reviews from other households and hire with confidence.'
            : 'Complete your profile with your skills and experience so nearby households can find and hire you.'}
        </Text>
        <Pressable
          style={styles.cta}
          onPress={() =>
            navigation.navigate(isEmployer ? 'MaidsTab' : 'FindJobsTab')
          }
        >
          <Text style={styles.ctaText}>
            {isEmployer ? 'Browse Maids' : 'Find Jobs'}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={colors.cream} />
        </Pressable>
      </View>

      <View style={styles.tipCard}>
        <Ionicons name="heart" size={18} color={colors.gold} />
        <Text style={styles.tipText}>
          {isEmployer
            ? 'Posting a job soon? Add clear duties and working days — it attracts better matches.'
            : 'Keep your phone verified and location up to date — families search near you first.'}
        </Text>
      </View>

      <View style={{ flex: 1 }} />
      <Text style={styles.footnote}>
        Marketplace features (listings, chat, hiring) are rolling out next. Your account role is
        permanent — see Settings.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  logo: { width: 46, height: 43, borderRadius: 10 },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.ink },
  roleLine: { marginTop: 2, fontSize: 13, color: colors.muted },
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    backgroundColor: colors.brand,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brandSoft },
  eyebrow: {
    color: colors.cream,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  heroTitle: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 29 },
  heroBody: { color: colors.white, marginTop: 8, fontSize: 14.5, lineHeight: 21, opacity: 0.92 },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  ctaText: { color: colors.brandDark, fontWeight: '800', fontSize: 14.5 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  tipText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.muted },
  footnote: {
    marginTop: 18,
    fontSize: 12.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
