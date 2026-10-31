// Applications (Househelp tab) — my applications with live status, §9 credits
// left, withdraw for pending ones, quick access to the job — and the §15.5
// APPLICATION BOOST (KES 30): a boosted application carries a Boosted chip and
// pins to the TOP of the household's applicant list (server-ordered). Boosts
// you've paid for are banked (payments.consumed_at IS NULL) and spent here
// with one tap; when nothing is banked the button routes to M-Pesa checkout.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';
import {
  APPLICATION_STATUS,
  BoostChip,
  StatusChip,
  formatKes,
  timeAgo,
} from '../../components/market/cards';

export default function ApplicationsScreen({ navigation }) {
  const { token } = useApp();
  const [apps, setApps] = useState([]);
  const [creditsLeft, setCreditsLeft] = useState(null);
  const [boostsBanked, setBoostsBanked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.applications(token);
      setApps(res.applications || []);
      setCreditsLeft(res.creditsLeft);
      setBoostsBanked(Number(res.applicationBoostsBanked) || 0);
    } catch (e) {
      setError(e?.message || 'Could not load your applications.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function withdraw(id) {
    setBusyId(id);
    try {
      await api.updateApplication(id, 'withdrawn', token);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not withdraw.');
    } finally {
      setBusyId(null);
    }
  }

  // §15.5 — spend one BANKED application boost on this pending application.
  // 402 paywall_required → M-Pesa checkout preselected on application_boost.
  async function boost(a) {
    if (busyId === a.id) return;
    setBusyId(a.id);
    try {
      const res = await api.boostApplication(a.id, token);
      Alert.alert('Application boosted', res?.message || 'It now sits at the top of the list.');
      await load();
    } catch (e) {
      if (e?.status === 402 || e?.code === 'paywall_required') {
        navigation.navigate('Payment', { purpose: 'application_boost' });
      } else {
        Alert.alert('Boost', e?.message || 'Could not boost this application.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Househelp · Your applications"
        title="Applications"
        subtitle="Track each one — households respond within a few days."
      />

      {creditsLeft !== null ? (
        <View style={styles.creditsCard}>
          <Ionicons name="gift-outline" size={18} color={colors.goldDark} />
          <Text style={styles.creditsText}>
            <Text style={styles.creditsNum}>{creditsLeft}</Text> of 2 free applications left
            {boostsBanked > 0 ? ` · ${boostsBanked} application boost${boostsBanked === 1 ? '' : 's'} banked` : ''}
            {creditsLeft === 0 && boostsBanked === 0 ? ' — top-up via M-Pesa lands with the next release.' : ''}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load" body={error} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No applications yet"
          body="Find a job that fits your skills and apply — the household is notified instantly."
          badge="Your first two applications are free"
        />
      ) : (
        apps.map((a) => {
          const s = APPLICATION_STATUS[a.status] || APPLICATION_STATUS.pending;
          return (
            <Pressable
              key={a.id}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              onPress={() => navigation.navigate('JobDetail', { jobId: a.job.id })}
            >
              <View style={[styles.iconWrap, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{a.job.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[a.job.employer?.fullName, [a.job.area, a.job.county].filter(Boolean).join(', ')]
                    .filter(Boolean).join(' · ')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <StatusChip status={a.status} />
                  {a.boosted ? <BoostChip /> : null}
                  <Text style={styles.meta}>
                    {[
                      a.job.jobTypeLabel,
                      a.job.salaryAmount ? formatKes(a.job.salaryAmount) : null,
                      `applied ${timeAgo(a.createdAt)} ago`,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              {a.status === 'pending' && !a.boosted && boostsBanked > 0 ? (
                <Pressable
                  onPress={() => boost(a)}
                  disabled={busyId === a.id}
                  hitSlop={8}
                  style={styles.boostBtn}
                >
                  {busyId === a.id ? (
                    <ActivityIndicator size="small" color={colors.brandDark} />
                  ) : (
                    <Ionicons name="rocket-outline" size={14} color={colors.brandDark} />
                  )}
                  <Text style={styles.boostText}>Boost</Text>
                </Pressable>
              ) : a.status === 'pending' ? (
                <Pressable
                  onPress={() => withdraw(a.id)}
                  disabled={busyId === a.id}
                  hitSlop={8}
                  style={styles.withdrawBtn}
                >
                  <Text style={styles.withdrawText}>{busyId === a.id ? '…' : 'Withdraw'}</Text>
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 12,
    marginBottom: 14,
  },
  creditsText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.ink },
  creditsNum: { fontSize: 15, fontWeight: '800', color: colors.goldDark },
  center: { paddingVertical: 40, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  sub: { marginTop: 2, fontSize: 12, color: colors.muted },
  meta: { fontSize: 11, fontWeight: '700', color: colors.goldDark },
  withdrawBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  withdrawText: { fontSize: 11.5, fontWeight: '800', color: colors.muted },
  boostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldDark,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  boostText: { fontSize: 11.5, fontWeight: '800', color: colors.brandDark },
});
