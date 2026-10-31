// MaidProfile — public profile of one house help (employer taps from search
// or home rails). No contact details here by design: the only way in is the
// gated Message action (POST /chat/threads, §5 verified gate).
//
// Owner redesign 2026-11-01 ("lets design good uis … maids details", "distance
// in km, star rating etc"):
//   • Hero — brand-green stage card, gold-ringed avatar, name + Trust Badge +
//     Featured chip (§15.5 paid boost), age/gender + last-active line.
//   • Score row — StarRating (server quality-score proxy → 5 stars; labelled
//     "Maidora score" because NO reviews table exists in any spec) + the
//     haversine distance from the caller (server-computed; hidden when either
//     side has no GPS) + location.
//   • Facts grid, languages, bio — content unchanged, visual pass.
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen } from '../../ui';
import { Avatar, DistanceLabel, FeaturedChip, StarRating, TrustBadge, formatKes } from '../../components/market/cards';
import { Skeleton } from '../../components/market/skeletons';

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
    // Skeleton hero — mirrors the real layout so nothing jumps when the
    // profile arrives (owner: "have cache and skeletal loaders").
    return (
      <Screen keyboard={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Skeleton style={{ width: 84, height: 84, borderRadius: 42 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 18, width: '60%' }} />
              <Skeleton style={{ height: 12, width: '40%' }} />
              <Skeleton style={{ height: 12, width: '30%' }} />
            </View>
          </View>
          <Skeleton style={{ height: 14, width: '80%', marginTop: 16 }} />
        </View>
        <View style={styles.factsGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.fact}>
              <Skeleton style={{ height: 12, width: '70%' }} />
              <Skeleton style={{ height: 14, width: '55%' }} />
            </View>
          ))}
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
      {/* ── Hero — brand stage with the identity + paid placement ────────── */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.avatarRing}>
            <Avatar url={maid.avatarUrl} name={maid.fullName} size={84} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.name} numberOfLines={2}>{maid.fullName}</Text>
            <View style={styles.heroChips}>
              {maid.trustBadge ? <TrustBadge /> : null}
              {maid.featured ? <FeaturedChip /> : null}
            </View>
            <Text style={styles.heroSub}>
              {maid.age ? `${maid.age} years` : 'Age not shared'}
              {maid.gender ? ` · ${maid.gender}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.heroMetaRow}>
          {/* Star rating — Maidora score (server quality proxy), "New" until
              there is real signal (badge, experience or ≥2 profile fields). */}
          <StarRating rating={maid.rating} basis={maid.ratingBasis} />
          {/* Haversine distance from the caller — only when both sides have
              coordinates (server hides it otherwise; never guessed). */}
          {maid.distanceKm !== null && maid.distanceKm !== undefined ? (
            <DistanceLabel km={maid.distanceKm} style={styles.heroDistance} />
          ) : null}
          <View style={styles.lastActiveRow}>
            <Ionicons name="time-outline" size={11} color={colors.brandSoft} />
            <Text style={styles.lastActiveText}>{maid.lastActiveLabel}</Text>
          </View>
        </View>
      </View>

      {/* ── Facts grid ───────────────────────────────────────────────────── */}
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
  hero: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: 18,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: 'rgba(247, 243, 233, 0.12)',
  },
  name: { fontSize: 20, fontWeight: '800', color: colors.white, lineHeight: 25 },
  heroChips: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  heroSub: { fontSize: 12.5, color: colors.cream, opacity: 0.85 },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(247, 243, 233, 0.22)',
  },
  heroDistance: { color: colors.cream },
  lastActiveRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lastActiveText: { fontSize: 11, fontWeight: '700', color: colors.brandSoft },
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
