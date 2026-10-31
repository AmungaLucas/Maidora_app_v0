// MyJobs (Employer tab) — the employer's own postings with applicant counts,
// open/close toggle and the Post a Job entry.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { EmptyState, PrimaryButton, Screen, ScreenHeader } from '../../ui';
import { JobCard } from '../../components/market/cards';

export default function MyJobsScreen({ navigation }) {
  const { token } = useApp();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.myJobs(token);
      setJobs(res.jobs || []);
    } catch (e) {
      setError(e?.message || 'Could not load your postings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleStatus(job) {
    setBusyId(job.id);
    try {
      await api.updateJob(job.id, { status: job.status === 'open' ? 'closed' : 'open' }, token);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not update the posting.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Employer · Your listings"
        title="My Jobs"
        subtitle="Open jobs collect applicants — closed ones stay on your history."
      />

      <PrimaryButton
        title="Post a new job"
        onPress={() => navigation.navigate('PostJob')}
        style={{ marginBottom: 16 }}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load" body={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="No postings yet"
          body="Post your first job — describe the duties, the days and the pay. Verified house helps apply directly."
          badge="Posting is free during the launch period"
        />
      ) : (
        jobs.map((j) => (
          <View key={j.id}>
            <JobCard
              job={j}
              onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}
              right={
                <View
                  style={[
                    styles.stateChip,
                    { backgroundColor: j.status === 'open' ? colors.brandSoftBg : '#F0EFE9' },
                  ]}
                >
                  <Text
                    style={[
                      styles.stateChipText,
                      { color: j.status === 'open' ? colors.brandDark : colors.muted },
                    ]}
                  >
                    {j.status === 'open' ? 'Open' : 'Closed'}
                  </Text>
                </View>
              }
            />
            <Pressable
              style={styles.toggleRow}
              disabled={busyId === j.id}
              onPress={() => toggleStatus(j)}
            >
              <Ionicons
                name={j.status === 'open' ? 'pause-circle-outline' : 'play-circle-outline'}
                size={16}
                color={colors.muted}
              />
              <Text style={styles.toggleText}>
                {busyId === j.id
                  ? 'Updating…'
                  : j.status === 'open'
                  ? 'Stop receiving applications'
                  : 'Reopen this job'}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  stateChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stateChipText: { fontSize: 10.5, fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  toggleText: { fontSize: 12, fontWeight: '700', color: colors.muted },
});
