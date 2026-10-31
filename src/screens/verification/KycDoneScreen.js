// KYC step 7 — confirmation (§33.1 step 8): "Submitted. Notify within 72
// hours." + the urgent upsell when the submission went in without it.
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { PrimaryButton, Screen } from '../../ui';
import { UrgentUpsell } from './KycIntroScreen';
import { kycLog } from '../../kycLog';

export default function KycDoneScreen({ navigation, route }) {
  const { token, user } = useApp();
  const urgent = route.params?.urgent ?? !!user?.kycUrgent;

  useEffect(() => {
    kycLog(`done — submission received${urgent ? ' (urgent)' : ''} · flow complete`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Terminal step — no navigator header (App.js headerShown: false): there
    // is nothing to go back INTO once the submission is in. The heading below
    // is plain content, not chrome.
    <Screen>
      <View style={styles.headWrap}>
        <Text style={styles.headEyebrow}>Identity verification</Text>
        <Text style={styles.headTitle}>Submission received</Text>
      </View>
      <View style={styles.doneCard}>
        <View style={styles.doneIconWrap}>
          <Ionicons name="checkmark" size={34} color={colors.cream} />
        </View>
        <Text style={styles.doneTitle}>Submitted. We will notify you within 72 hours.</Text>
        <Text style={styles.doneBody}>
          Your identity review is in the queue. You can keep using Maidora normally while we
          check your documents — we will notify you as soon as the badge is decisioned.
        </Text>
        {urgent ? (
          <Text style={styles.urgentNote}>Urgent review is active — your submission is at the front of the queue.</Text>
        ) : null}
      </View>

      {!urgent ? <UrgentUpsell token={token} /> : null}

      <PrimaryButton
        title="Done"
        onPress={() => navigation.popToTop()}
        style={{ marginTop: 14 }}
      />
    </Screen>
  );
}

const styles = {
  headWrap: { marginTop: 18, marginBottom: 18 },
  headEyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.goldDark,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headTitle: { fontSize: 24, fontWeight: '800', color: colors.ink },
  doneCard: {
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  doneIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    marginBottom: 2,
  },
  doneTitle: { fontSize: 18, fontWeight: '800', color: colors.cream, textAlign: 'center' },
  doneBody: { fontSize: 13.5, color: colors.brandSoftLight, textAlign: 'center', lineHeight: 20 },
  urgentNote: { fontSize: 13, fontWeight: '700', color: colors.gold, textAlign: 'center' },
};
