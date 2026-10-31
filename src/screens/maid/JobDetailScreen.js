// JobDetail — one screen, two lives:
//   • househelp: full job info + Apply (§9 — 2 lifetime free, then the
//     paywall sheet) + withdraw while pending.
//   • employer (owner): same info + the applicant list with Accept / Reject —
//     keeps the whole hiring loop in one place.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, BottomSheetModal, PrimaryButton, Screen, SecondaryButton } from '../../ui';
import {
  APPLICATION_STATUS,
  Avatar,
  BoostChip,
  StatusChip,
  TrustBadge,
  formatKes,
  timeAgo,
} from '../../components/market/cards';

export default function JobDetailScreen({ route, navigation }) {
  const { jobId } = route.params || {};
  const { token, user } = useApp();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // {kind, message}
  const [applying, setApplying] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [actBusy, setActBusy] = useState(null);

  const load = useCallback(async () => {
    if (!token || !jobId) return;
    setLoading(true);
    try {
      const res = await api.jobDetail(jobId, token);
      setJob(res.job);
      setIsOwner(res.isOwner);
      setApplications(res.applications);
    } catch (e) {
      setError(e?.message || 'This job is no longer listed.');
    } finally {
      setLoading(false);
    }
  }, [token, jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function apply() {
    setApplying(true);
    setNotice(null);
    try {
      const res = await api.applyToJob(jobId, null, token);
      setNotice({ kind: 'ok', message: res.message || 'Application sent.' });
      await load();
    } catch (e) {
      if (e?.status === 402 || e?.code === 'paywall_required') {
        setPaywallOpen(true);
      } else {
        setNotice({ kind: 'error', message: e?.message || 'Could not apply. Try again.' });
      }
    } finally {
      setApplying(false);
    }
  }

  async function withdraw() {
    setActBusy('withdraw');
    try {
      // PATCH needs the application id — the maid's own list carries it.
      const res = await api.applications(token);
      const mineApp = (res.applications || []).find((a) => a.job?.id === jobId && a.status === 'pending');
      if (mineApp) await api.updateApplication(mineApp.id, 'withdrawn', token);
      setNotice({ kind: 'ok', message: 'Application withdrawn.' });
      await load();
    } catch (e) {
      setNotice({ kind: 'error', message: e?.message || 'Could not withdraw.' });
    } finally {
      setActBusy(null);
    }
  }

  async function decide(appId, status) {
    setActBusy(`${appId}:${status}`);
    try {
      await api.updateApplication(appId, status, token);
      await load();
    } catch (e) {
      setNotice({ kind: 'error', message: e?.message || 'Could not update the application.' });
    } finally {
      setActBusy(null);
    }
  }

  async function messageEmployer() {
    try {
      const res = await api.chatStart(job.employer.id, token);
      navigation.navigate('ChatThread', { threadId: res.threadId, peerName: job.employer.fullName });
    } catch (e) {
      setNotice({ kind: 'error', message: e?.status === 403
        ? 'Messaging opens once your account is verified.'
        : e?.message || 'Could not start the chat.' });
    }
  }

  if (loading && !job) {
    return (
      <Screen keyboard={false}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      </Screen>
    );
  }
  if (error && !job) {
    return (
      <Screen keyboard={false}>
        <View style={styles.center}>
          <Ionicons name="briefcase-outline" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Job unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      </Screen>
    );
  }
  if (!job) return null;

  const mine = job.myApplicationStatus; // pending | accepted | rejected | withdrawn | null
  const isMaid = user?.role === 'househelp';

  return (
    <Screen keyboard={false}>
      <View style={styles.headCard}>
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.typeChip}><Text style={styles.typeChipText}>{job.jobTypeLabel}</Text></View>
          {job.status === 'closed' ? (
            <View style={[styles.typeChip, { backgroundColor: colors.dangerSoft }]}><Text style={[styles.typeChipText, { color: colors.danger }]}>Closed</Text></View>
          ) : null}
        </View>
        <View style={styles.employerRow}>
          <Avatar url={job.employer?.avatarUrl} name={job.employer?.fullName} size={38} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.employerName}>{job.employer?.fullName || 'Household'}</Text>
              {job.employer?.trustBadge ? <TrustBadge compact /> : null}
            </View>
            <Text style={styles.employerSub}>
              {[job.area, job.county].filter(Boolean).join(', ') || 'Kenya'} · posted {timeAgo(job.createdAt)} ago
            </Text>
          </View>
          {job.salaryAmount ? (
            <View style={styles.salaryWrap}>
              <Text style={styles.salary}>{formatKes(job.salaryAmount)}</Text>
              <Text style={styles.salaryPer}>per month</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About the job</Text>
        <Text style={styles.description}>{job.description}</Text>
      </View>

      {notice ? <Banner kind={notice.kind === 'ok' ? 'success' : 'error'} message={notice.message} /> : null}

      {/* ── Maid actions ──────────────────────────────────────────────────── */}
      {isMaid && !isOwner ? (
        <>
          {mine ? (
            <View style={styles.mineCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.mineTitle}>Your application</Text>
                <StatusChip status={mine} />
              </View>
              <Text style={styles.mineBody}>
                {mine === 'pending'
                  ? 'The household has been notified. You can withdraw while you wait.'
                  : mine === 'accepted'
                  ? 'Congratulations! Message the household to arrange a start date.'
                  : mine === 'rejected'
                  ? 'This household went another way — keep going, your next match is coming.'
                  : 'You withdrew this application.'}
              </Text>
              {mine === 'pending' ? (
                <SecondaryButton title="Withdraw application" onPress={withdraw} style={{ marginTop: 8 }} />
              ) : null}
              {mine === 'accepted' ? (
                <PrimaryButton title="Message the household" onPress={messageEmployer} style={{ marginTop: 8 }} />
              ) : null}
            </View>
          ) : job.status === 'open' ? (
            <>
              <PrimaryButton title="Apply for this job" onPress={apply} loading={applying} loadingLabel="Sending application…" />
              <Text style={styles.applyHint}>Free — your first two applications are on us.</Text>
            </>
          ) : null}
        </>
      ) : null}

      {/* ── Employer (owner) — applicants ─────────────────────────────────── */}
      {isOwner ? (
        <View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Applicants {applications?.length ? `(${applications.length})` : ''}</Text>
            {applications?.some((a) => a.boosted) ? (
              <Text style={styles.boostNote}>
                Applications boosted with KES 30 sit at the top of this list.
              </Text>
            ) : null}
          </View>
          {applications && applications.length === 0 ? (
            <Text style={styles.emptyApps}>
              No applications yet. Applicants see your job under Find Jobs — give it a day or two.
            </Text>
          ) : null}
          {(applications || []).map((a) => {
            const deciding = actBusy?.startsWith(String(a.id));
            return (
              <View key={a.id} style={styles.appCard}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                  onPress={() => navigation.navigate('MaidProfile', { maidId: a.maid.id })}
                >
                  <Avatar url={a.maid.avatarUrl} name={a.maid.fullName} size={44} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.appName} numberOfLines={1}>{a.maid.fullName}</Text>
                      {a.maid.trustBadge ? <TrustBadge compact /> : null}
                      {a.boosted ? <BoostChip /> : null}
                    </View>
                    <Text style={styles.appMeta} numberOfLines={1}>
                      {[
                        a.maid.yearsExperience !== null ? `${a.maid.yearsExperience} yr exp` : null,
                        a.maid.expectedSalary ? `${formatKes(a.maid.expectedSalary)}/mo` : null,
                        [a.maid.locationArea, a.maid.locationCounty].filter(Boolean).join(', '),
                      ].filter(Boolean).join(' · ') || 'Profile in progress'}
                    </Text>
                  </View>
                  <StatusChip status={a.status} />
                </Pressable>
                {a.message ? <Text style={styles.appMessage}>“{a.message}”</Text> : null}
                {a.status === 'pending' ? (
                  <View style={styles.appActions}>
                    <Pressable
                      style={[styles.decideBtn, { backgroundColor: colors.brand }]}
                      disabled={deciding}
                      onPress={() => decide(a.id, 'accepted')}
                    >
                      <Text style={styles.decideTextAccept}>
                        {deciding && actBusy === `${a.id}:accepted` ? '…' : 'Accept'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.decideBtn, { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger }]}
                      disabled={deciding}
                      onPress={() => decide(a.id, 'rejected')}
                    >
                      <Text style={styles.decideTextReject}>
                        {deciding && actBusy === `${a.id}:rejected` ? '…' : 'Not this time'}
                      </Text>
                    </Pressable>
                  </View>
                ) : a.status === 'accepted' ? (
                  <PrimaryButton
                    title="Message"
                    onPress={() =>
                      api.chatStart(a.maid.id, token).then((r) =>
                        navigation.navigate('ChatThread', { threadId: r.threadId, peerName: a.maid.fullName })
                      )
                    }
                    style={{ marginTop: 10, paddingVertical: 10 }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ── §9 paywall sheet ──────────────────────────────────────────────── */}
      <BottomSheetModal visible={paywallOpen} onClose={() => setPaywallOpen(false)}>
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          <Ionicons name="gift-outline" size={34} color={colors.goldDark} />
          <Text style={styles.paywallTitle}>You have used your 2 free applications</Text>
          <Text style={styles.paywallBody}>
            Browsing and chatting stay free. To keep applying, a small top-up via M-Pesa is on the
            way in the next release — we will notify you the moment it is live.
          </Text>
          <PrimaryButton title="Got it" onPress={() => setPaywallOpen(false)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      </BottomSheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  errorTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 6 },
  errorBody: { color: colors.muted, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
  headCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink, lineHeight: 25 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  typeChip: {
    backgroundColor: colors.brandSoftBg,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeChipText: { fontSize: 11.5, fontWeight: '800', color: colors.brandDark },
  employerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  employerName: { fontSize: 13.5, fontWeight: '800', color: colors.ink },
  employerSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  salaryWrap: { alignItems: 'flex-end' },
  salary: { fontSize: 15, fontWeight: '800', color: colors.goldDark },
  salaryPer: { fontSize: 10.5, color: colors.muted },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 22, color: colors.ink },
  mineCard: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  mineTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  mineBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.muted },
  applyHint: { marginTop: 8, fontSize: 12, color: colors.muted, textAlign: 'center' },
  emptyApps: { fontSize: 13.5, color: colors.muted, lineHeight: 20 },
  boostNote: {
    marginTop: -4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.brandDark,
  },
  appCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginBottom: 10,
  },
  appName: { fontSize: 14.5, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  appMeta: { marginTop: 2, fontSize: 12, color: colors.muted },
  appMessage: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    padding: 10,
  },
  appActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  decideBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  decideTextAccept: { color: colors.cream, fontWeight: '800', fontSize: 13.5 },
  decideTextReject: { color: colors.danger, fontWeight: '800', fontSize: 13.5 },
  paywallTitle: { fontSize: 16.5, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  paywallBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
