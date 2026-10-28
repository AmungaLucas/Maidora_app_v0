// Role-based home. One route, content adapts to the signed-in user's role.
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
          <Ionicons name="settings-outline" size={24} color={colors.forest} />
        </Pressable>
      </View>

      {isEmployer ? <EmployerBody /> : <HousehelpBody />}

      <Text style={styles.footnote}>
        You are signed in. Your account role is permanent — see Settings for details.
      </Text>
    </Screen>
  );
}

function EmployerBody() {
  return (
    <View style={styles.bodyWrap}>
      <View style={[styles.hero, { backgroundColor: colors.forest }]}>
        <Text style={styles.heroTitle}>Find trusted help near you</Text>
        <Text style={styles.heroBody}>
          Browse verified house helps in your area, see reviews from other households and hire
          with confidence.
        </Text>
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>Search & hiring — coming in the next release</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Coming soon</Text>
      <PlaceholderRow icon="people-outline" label="Nearby house helps" />
      <PlaceholderRow icon="star-outline" label="Reviews & ratings" />
      <PlaceholderRow icon="chatbubble-outline" label="Chat & interview requests" />
    </View>
  );
}

function HousehelpBody() {
  return (
    <View style={styles.bodyWrap}>
      <View style={[styles.hero, { backgroundColor: colors.green }]}>
        <Text style={[styles.heroTitle, { color: colors.forestDark }]}>Get discovered by families</Text>
        <Text style={[styles.heroBody, { color: colors.forestDark }]}>
          Complete your profile with your skills, experience and location so nearby households
          can find and hire you.
        </Text>
        <View style={[styles.soonPill, { backgroundColor: colors.cream }]}>
          <Text style={[styles.soonText, { color: colors.forest }]}>
            Profile builder — coming in the next release
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Coming soon</Text>
      <PlaceholderRow icon="briefcase-outline" label="Jobs near you" />
      <PlaceholderRow icon="ribbon-outline" label="Skills & verification badges" />
      <PlaceholderRow icon="cash-outline" label="Payments & earnings" />
    </View>
  );
}

function PlaceholderRow({ icon, label }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.forest} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.line} />
    </View>
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
  bodyWrap: { gap: 12, marginTop: 6 },
  hero: {
    borderRadius: radius.lg,
    padding: 20,
  },
  heroTitle: { color: colors.white, fontSize: 21, fontWeight: '800', lineHeight: 28 },
  heroBody: { color: colors.white, marginTop: 8, fontSize: 14.5, lineHeight: 21, opacity: 0.92 },
  soonPill: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  soonText: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  footnote: {
    marginTop: 18,
    fontSize: 12.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
