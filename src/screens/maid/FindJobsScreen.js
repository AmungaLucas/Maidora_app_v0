// Find Jobs (Househelp tab) — open jobs feed with search + filters.
// Card shows whether you already applied (myApplicationStatus from the API).
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
import { ChipRow, JobCard, StatusChip } from '../../components/market/cards';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

export default function FindJobsScreen({ navigation }) {
  const { token } = useApp();
  const [q, setQ] = useState('');
  const [county, setCounty] = useState('');
  const [jobType, setJobType] = useState('');
  const [counties, setCounties] = useState([]);
  const [jobs, setJobs] = useState([]);
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
      const res = await api.jobs(
        { q, county, job_type: jobType, page: targetPage, per_page: 10 },
        token
      );
      setJobs((prev) => (reset ? res.jobs : [...prev, ...res.jobs]));
      setTotal(res.total);
      setHasMore(res.hasMore);
      setPage(targetPage);
      if (res.counties?.length) setCounties(res.counties);
    } catch (e) {
      setError(e?.message || 'Could not load jobs. Pull down to try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load({ reset: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, county, jobType])
  );

  const onSearch = useCallback(() => load({ reset: true }), [q, county, jobType]);

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Househelp · Find work"
        title="Find Jobs"
        subtitle={`${total} open job${total === 1 ? '' : 's'} ${county || jobType ? 'match your filters' : 'across Kenya'}`}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={onSearch}
            returnKeyType="search"
            placeholder="Search job, duty or area…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

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
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error && !jobs.length ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load" body={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="No jobs match"
          body="Try clearing a filter or checking another county. New jobs are posted every week."
        />
      ) : (
        <>
          {jobs.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              right={j.myApplicationStatus ? <StatusChip status={j.myApplicationStatus} /> : null}
              onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}
            />
          ))}
          {hasMore ? (
            <Pressable style={styles.moreBtn} onPress={() => load({ reset: false })} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.moreText}>Show more</Text>}
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
