// MaidProfile — public profile of one house help (employer taps from search
// or home preview). No contact details here by design: the only way in is the
// gated Message action (POST /chat/threads, §5 verified gate).
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen } from '../../ui';
import { Avatar, TrustBadge, formatKes } from '../../components/market/cards';

export default function MaidProfileScreen({ route, navigation }) {
  const { maidId } = route.params || {};
  const { token, user } = useApp();
  const [maid, setMaid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!token || !maidId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.maidProfile(maidId, token);
      setMaid(res.maid);
    } catch (e) {
      setError(e?.message || 'This profile is not available.');
    } finally {
      setLoading(false);
    }
  }, [token, maidId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function startChat() {
    if (!maid) return;
    setStarting(true);
    setNotice('');
    try {
      const res = await api.chatStart(maid.id, token);
      navigation.navigate('ChatThread', { threadId: res.threadId, peerName: maid.fullName });
    } catch (e) {
      if (e?.status === 403) {
        setNotice('Messaging opens once your phone is verified and your account is active.');
      } else {
        setNotice(e?.message || 'Could not start the chat. Try again.');
      }
    } finally {
      setStarting(false);
    }
  }

  if (loading && !maid) {
    return (
      <Screen keyboard={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      </Screen>
    );
  }
  if (error && !maid) {
    return (
      <Screen keyboard={false}>
        <View style={styles.center}>
          <Ionicons name="person-remove-outline" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Profile unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      </Screen>
    );
  }
  if (!maid) return null;

  const facts = [
    { icon: 'briefcase-outline', label: 'Experience', value: maid.yearsExperience !== null ? `${maid.yearsExperience} year${maid.yearsExperience === 1 ? '' : 's'}` : '—' },
    { icon: 'home-outline', label: 'Looking for', value: maid.jobTypeLabel || '—' },
    { icon: 'cash-outline', label: 'Expected pay', value: maid.expectedSalary ? `${formatKes(maid.expectedSalary)}/mo` : 'Flexible' },
    { icon: 'location-outline', label: 'Based in', value: [maid.locationArea, maid.locationCounty].filter(Boolean).join(', ') || '—' },
  ];

  return (
    <Screen keyboard={false}>
      <View style={styles.heroCard}>
        <Avatar url={maid.avatarUrl} name={maid.fullName} size={78} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.name}>{maid.fullName}</Text>
            {maid.trustBadge ? <TrustBadge /> : null}
          </View>
          <Text style={styles.sub}>
            {maid.age ? `${maid.age} years` : 'Age not shared'}
            {maid.gender ? ` · ${maid.gender}` : ''}
          </Text>
          <Text style={styles.lastActive}>{maid.lastActiveLabel}</Text>
        </View>
      </View>

      <View style={styles.factsGrid}>
        {facts.map((f) => (
          <View key={f.label} style={styles.fact}>
            <Ionicons name={f.icon} size={17} color={colors.goldDark} />
            <Text style={styles.factLabel}>{f.label}</Text>
            <Text style={styles.factValue} numberOfLines={2}>{f.value}</Text>
          </View>
        ))}
      </View>

      {maid.languages?.length ? (
        <View style={styles.langRow}>
          {maid.languages.map((l) => (
            <View key={l} style={styles.langChip}>
              <Text style={styles.langChipText}>{l}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {maid.bio ? (
        <View style={styles.bioCard}>
          <Text style={styles.bioTitle}>About {maid.fullName.split(' ')[0]}</Text>
          <Text style={styles.bioBody}>{maid.bio}</Text>
        </View>
      ) : null}

      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
        <Text style={styles.privacyText}>
          Contact details stay private until a conversation starts.
        </Text>
      </View>

      <Banner kind="error" message={notice} />

      <PrimaryButton
        title={user?.id === maid.id ? 'This is your profile' : 'Message'}
        onPress={startChat}
        disabled={user?.id === maid.id}
        loading={starting}
        loadingLabel="Opening chat…"
        style={{ marginTop: 6 }}
      />
      <Text style={styles.messageHint}>
        Chat is free. Introduce your household and the work you need.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  errorTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 6 },
  errorBody: { color: colors.muted, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  name: { fontSize: 19, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted },
  lastActive: { fontSize: 11.5, fontWeight: '700', color: colors.goldDark },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  fact: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 3,
  },
  factLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  factValue: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  langChip: {
    backgroundColor: colors.brandSoftBg,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  langChipText: { fontSize: 12, fontWeight: '700', color: colors.brandDark },
  bioCard: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  bioTitle: { fontSize: 13.5, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  bioBody: { fontSize: 14, lineHeight: 21, color: colors.ink },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  privacyText: { flex: 1, fontSize: 12, color: colors.muted },
  messageHint: { marginTop: 8, fontSize: 12, color: colors.muted, textAlign: 'center' },
});
