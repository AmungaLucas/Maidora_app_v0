// Role selector — dual mode (unified spec §3.2):
//   • Onboarding (default when signed in without a role): shown right after
//     OTP verification. Continue SAVES the role on the server — immutable once
//     set — then enters the role tabs.
//   • Legacy param mode: still navigates to Signup with a pre-selected role
//     (kept for direct navigation from Login's "Create an account").
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { tabsRouteFor } from '../../navigation/Tabs';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader } from '../../ui';

const OPTIONS = [
  {
    role: 'employer',
    emoji: '🏡',
    title: 'Employer',
    subtitle: 'I need trusted help for my household — cleaning, childcare, cooking and more.',
  },
  {
    role: 'househelp',
    emoji: '🧹',
    title: 'Househelp',
    subtitle: 'I am looking for house help work with families near me.',
  },
];

export default function RoleSelectScreen({ navigation, route }) {
  const { user, token, updateUser } = useApp();
  const onboardingMode = Boolean(user && token && !user.role);
  const currentRole = route?.params?.currentRole || null;
  const [selected, setSelected] = useState(currentRole);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const continueNext = async () => {
    if (onboardingMode) {
      if (saving) return;
      setSaving(true);
      setErrorMessage('');
      try {
        const res = await api.onboarding(selected, token);
        await updateUser(res.user, res.token); // role now set, immutable
        navigation.reset({ index: 0, routes: [{ name: tabsRouteFor(res.user) }] });
      } catch (e) {
        setErrorMessage(e.message || 'Could not save your role. Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }
    navigation.navigate('Signup', { role: selected });
  };

  return (
    <Screen>
      {/* Back-only header row — the title stays in the content (ScreenHeader
          hides the back arrow itself when the stack has nothing behind it). */}
      <ScreenHeader navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>
          {onboardingMode ? 'Welcome to Maidora!' : 'How will you use Maidora?'}
        </Text>
        <Text style={styles.subtitle}>
          {onboardingMode
            ? 'Your phone is verified. Pick the role that fits you — this cannot be changed later.'
            : 'Pick the role that fits you. You can always tell us later if it changes — before your account is created.'}
        </Text>
      </View>

      <View style={styles.options}>
        <Banner message={errorMessage} />
        {OPTIONS.map((opt) => {
          const active = selected === opt.role;
          return (
            <Pressable
              key={opt.role}
              onPress={() => setSelected(opt.role)}
              style={[styles.card, active && styles.cardActive]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.emoji}>{opt.emoji}</Text>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
              </View>
              <Text style={[styles.cardTitle, active && { color: colors.forest }]}>{opt.title}</Text>
              <Text style={styles.cardSubtitle}>{opt.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      {onboardingMode ? (
        <Pressable
          onPress={() =>
            Alert.alert(
              'Why is this permanent?',
              'Your role shapes your whole app — the jobs you see and the tools you get. If you ever pick the wrong one, contact support and our team will help.'
            )
          }
          hitSlop={8}
          style={styles.whyRow}
        >
          <Text style={styles.whyText}>Why can't I change this later?</Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />
      <PrimaryButton
        title={onboardingMode ? 'Continue' : 'Continue to signup'}
        onPress={continueNext}
        disabled={!selected}
        loading={saving}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 18 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.muted },
  options: { marginTop: 26, gap: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.line,
  },
  cardActive: { borderColor: colors.forest, backgroundColor: colors.greenSoft },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  emoji: { fontSize: 34 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.forest },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.forest },
  cardTitle: { marginTop: 12, fontSize: 19, fontWeight: '800', color: colors.ink },
  cardSubtitle: { marginTop: 5, fontSize: 14, lineHeight: 20, color: colors.muted },
  whyRow: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 4 },
  whyText: { color: colors.muted, fontSize: 13.5, textDecorationLine: 'underline' },
  cta: { marginTop: 24 },
});
