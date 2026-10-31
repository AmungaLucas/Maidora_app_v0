// Maids (Employer tab) — search + filters + results list.
// Server drives §10 decay ranking; the app renders county chips from the
// response meta so no filter chip exists without maids behind it.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';
import { ChipRow, MaidCard } from '../../components/market/cards';
import { MaidCardSkeleton } from '../../components/market/skeletons';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

export default function MaidsScreen({ navigation }) {
  const { token } = useApp();
  const [q, setQ] = useState('');
  const [county, setCounty] = useState('');
  const [jobType, setJobType] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [counties, setCounties] = useState([]);
  const [maids, setMaids] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function load({ reset = true } = {}) {
    if (!token) return;
    reset ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const targetPage = reset ? 1 : page + 1;
      const res = await api.maids(
        { q, county, job_type: jobType, verified: verifiedOnly ? '1' : '', featured: featuredOnly ? '1' : '', page: targetPage, per_page: 10 },
        token
      );
      setMaids((prev) => (reset ? res.maids : [...prev, ...res.maids]));
      setTotal(res.total);
      setHasMore(res.hasMore);
      setPage(targetPage);
      if (res.counties?.length) setCounties(res.counties);
    } catch (e) {
      setError(e?.message || 'Could not load maids. Pull down to try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Reload when filters change (the search text submits via the keyboard or
  // the clear button — deliberate, to avoid a request per keystroke).
  useFocusEffect(
    useCallback(() => {
      load({ reset: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, county, jobType, verifiedOnly, featuredOnly])
  );

  const onSearch = useCallback(() => load({ reset: true }), [q, county, jobType, verifiedOnly, featuredOnly]);

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Employer · Find help"
        title="Maids"
        subtitle={`${total} house help${total === 1 ? '' : 's'} ${county || jobType || verifiedOnly ? 'match your filters' : 'active near you'}`}
      />

      {/* Search + verified toggle */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={onSearch}
            returnKeyType="search"
            placeholder="Search name, skill or area…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setFeaturedOnly((v) => !v)}
          style={[styles.starToggle, featuredOnly && styles.starOn]}
          accessibilityLabel="Featured only"
        >
          <Ionicons name="star" size={15} color={featuredOnly ? colors.cream : colors.goldDark} />
        </Pressable>
        <Pressable
          onPress={() => setVerifiedOnly((v) => !v)}
          style={[styles.verifiedToggle, verifiedOnly && styles.verifiedOn]}
          accessibilityLabel="Verified only"
        >
          <Ionicons name="shield-checkmark" size={15} color={verifiedOnly ? colors.cream : colors.goldDark} />
        </Pressable>
      </View>

      {/* Filters — counties come from the server meta (only real ones) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        <ChipRow
          options={counties.map((c) => ({ value: c, label: c }))}
          value={county}
          onChange={setCounty}
          allLabel="All counties"
        />
      </ScrollView>
      <View style={{ marginBottom: 12 }}>
        <ChipRow options={JOB_TYPES} value={jobType} onChange={setJobType} allLabel="Any job type" />
      </View>

      {loading ? (
        <>
          <MaidCardSkeleton />
          <MaidCardSkeleton />
          <MaidCardSkeleton />
          <MaidCardSkeleton />
        </>
      ) : error && !maids.length ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load" body={error} />
      ) : maids.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No maids match"
          body="Try clearing a filter or searching a different area. New house helps join every week."
        />
      ) : (
        <>
          {maids.map((m) => (
            <MaidCard key={m.id} maid={m} onPress={() => navigation.navigate('MaidProfile', { maidId: m.id })} />
          ))}
          {hasMore ? (
            <Pressable style={styles.moreBtn} onPress={() => load({ reset: false })} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Text style={styles.moreText}>Show more</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0 },
  verifiedToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  starToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  starOn: { backgroundColor: colors.goldDark, borderColor: colors.goldDark },
  verifiedOn: { backgroundColor: colors.goldDark, borderColor: colors.goldDark },
  chipScroll: { paddingVertical: 12, paddingRight: 24 },
  center: { paddingVertical: 40, alignItems: 'center' },
  moreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  moreText: { fontWeight: '800', color: colors.brand, fontSize: 13.5 },
});
