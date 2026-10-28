// Role selector — freely changeable BEFORE account creation.
// Pre-selects `currentRole` when navigated from the signup screen ("Change" link).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ROLES, colors, radius } from '../theme';
import { PrimaryButton, Screen } from '../ui';

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
  const currentRole = route?.params?.currentRole || null;
  const [selected, setSelected] = useState(currentRole);

  const continueToSignup = () => {
    navigation.navigate('Signup', { role: selected });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>How will you use Maidora?</Text>
        <Text style={styles.subtitle}>
          Pick the role that fits you. You can always tell us later if it changes — before your
          account is created.
        </Text>
      </View>

      <View style={styles.options}>
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

      <View style={{ flex: 1 }} />
      <PrimaryButton
        title="Continue"
        onPress={continueToSignup}
        disabled={!selected}
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
  cta: { marginTop: 24 },
});
