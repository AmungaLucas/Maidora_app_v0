// Home tab — shared by both roles, content adapts to user.role.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';
import { Screen } from '../ui';
import { REASON_LABELS } from './kyc/kycShared';

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

function kycBannerTitle(user) {
  switch (user?.kycStatus) {
    case 'draft':
      return 'Continue your verification';
    case 'rejected':
      return `Action needed: ${REASON_LABELS[user?.kycRejectionReason] || 'Your submission needs attention'}`;
    case 'submitted':
    case 'under_review':
      return 'Verification in review';
    default:
      return 'Get your Trust Badge';
  }
}

function kycBannerBody(user) {
  switch (user?.kycStatus) {
    case 'draft':
      return 'Your progress is saved — pick up where you left off.';
    case 'rejected':
      return 'Retake the failed step and submit again — it is free.';
    case 'submitted':
    case 'under_review':
      return 'We will notify you within 72 hours.';
    default:
      return 'Verify your ID with a quick selfie — free, reviewed in 48–72 hours. Verified members get hired more.';
  }
}

export default function HomeScreen({ navigation }) {
  const { user } = useApp();
  const isEmployer = user?.role !== 'househelp';

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
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

      {/* §8 — non-blocking KYC banner (househelp, until approved) */}
      {!isEmployer && user?.kycStatus !== 'approved' ? (
        <Pressable style={styles.kycCard} onPress={() => navigation.navigate('KycIntro')}>
          <View style={styles.kycIconWrap}>
            <Ionicons
              name={
                user?.kycStatus === 'submitted' || user?.kycStatus === 'under_review'
                  ? 'time-outline'
                  : user?.kycStatus === 'rejected'
                  ? 'alert-circle'
                  : 'shield-checkmark-outline'
              }
              size={20}
              color={colors.goldDark}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kycTitle}>{kycBannerTitle(user)}</Text>
            <Text style={styles.kycBody}>{kycBannerBody(user)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <Pressable style={styles.mpesaCard} onPress={() => navigation.navigate('Payment')}>
        <View style={styles.mpesaIconWrap}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.goldDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.mpesaTitle}>Try an M-Pesa payment</Text>
          <Text style={styles.mpesaBody}>
            Live STK Push is wired up. Send a KES 1 test payment to see the full flow.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

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
  mpesaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    borderLeftWidth: 4,
    padding: 14,
  },
  mpesaIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpesaTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  mpesaBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  kycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    padding: 14,
  },
  kycIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(214, 166, 79, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  kycBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  footnote: {
    marginTop: 18,
    fontSize: 12.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
