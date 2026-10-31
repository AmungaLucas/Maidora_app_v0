// Home tab — role-aware marketplace hub (both roles share the file).
//
// Owner updates 2026-11-01 (v10 pass):
//   • Stats row REMOVED (owner: "remove the stats section from homescreen").
//   • Cache + skeletons — rails/postings/credits/boosts paint instantly from
//     AsyncStorage (stale-while-revalidate, hooks/useCachedResource) and
//     skeleton placeholders cover the very first launch (no cache yet).
//   • Househelp rails from GET /jobs/rails (§15.5 JOB BOOST placement):
//     FEATURED JOBS (paid boost, KES 99/7d) · JOBS NEAR ME (caller county,
//     nationwide fallback flagged) · RECENTLY POSTED — mirrors the employer
//     hub's maid rails.
//   • Maid detail additions (stars, distance km) live on MaidProfileScreen.
//
// Placement logic (Initial_app_deliberations §9/§11.1): "placement is not
// purchasable any other way" — Featured rails are the ONLY paid slots; the
// rest of the ordering is earned (verification, freshness, §10 decay).
//
// Employer hub rails (owner's section list 2026-11-01): FEATURED MAIDS ·
// MAIDS NEAR ME · VERIFIED MAIDS · TOP RATED — all four in ONE /maids/rails
// call; §10 decay gates apply server-side.
//
// Owner fixes 2026-11-01 (kept): header renders the real avatar photo; the
// verification banner retires itself the moment the server says approved
// (session re-sync on focus below).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { useCachedResource } from '../../hooks/useCachedResource';
import { ROLES, colors, radius } from '../../theme';
import { Screen } from '../../ui';
import { Avatar, JobCard, MaidCard, SectionTitle } from '../../components/market/cards';
import { RailSkeleton } from '../../components/market/skeletons';
import { REASON_LABELS } from '../verification/kycShared';

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

function dayLabel(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

function kycBannerTitle(user) {
  switch (user?.kycStatus) {
    case 'draft':
      return 'Continue your verification';
    case 'rejected':
      return `Action needed: ${REASON_LABELS[user?.kycRejectionReason] || 'Your submission needs attention'}`;
    case 'submitted':
    case 'under_review':
      return 'Verification in review';
    default:
      return 'Get your Trust Badge';
  }
}

function kycBannerBody(user) {
  switch (user?.kycStatus) {
    case 'draft':
      return 'Your progress is saved — pick up where you left off.';
    case 'rejected':
      return 'Retake the failed step and submit again — it is free.';
    case 'submitted':
    case 'under_review':
      return 'We will notify you within 72 hours.';
    default:
      return 'Verify your ID with a quick selfie — free, reviewed within 72 hours. A Trust Badge builds trust on both sides.';
  }
}

export default function HomeScreen({ navigation }) {
  const { user, token, profileCompleteness: completeness, refreshCompleteness, updateUser } = useApp();
  const isEmployer = user?.role === 'employer';
  const cacheScope = user?.id || 'anon';

  // CRITICAL loop-guard: `updateUser`'s identity changes whenever the user
  // state changes, and THIS effect itself updates the user — putting it in
  // the focus-effect deps would re-run the sync forever (api.me in a loop).
  const updateUserRef = useRef(updateUser);
  useEffect(() => {
    updateUserRef.current = updateUser;
  });

  // ── Cached hub data (stale-while-revalidate) ────────────────────────────
  // Every resource paints its last-good payload instantly; skeletons show
  // only on a true first launch. Enabled flags keep each role to its own
  // calls — one hub, zero wasted round trips.
  const maidRailsRes = useCachedResource(
    `v1/maids-rails/${cacheScope}`, api.maidsRails, token, { enabled: isEmployer && !!token }
  );
  const myJobsRes = useCachedResource(
    `v1/my-jobs/${cacheScope}`, api.myJobs, token, { enabled: isEmployer && !!token }
  );
  const jobRailsRes = useCachedResource(
    `v1/jobs-rails/${cacheScope}`, api.jobsRails, token, { enabled: !isEmployer && !!token }
  );
  const creditsRes = useCachedResource(
    `v1/credits/${cacheScope}`, api.applications, token, { enabled: !isEmployer && !!token }
  );
  const boostsRes = useCachedResource(
    `v1/boosts/${cacheScope}`, api.boostsStatus, token, { enabled: !isEmployer && !!token }
  );

  // Revalidate on every FOCUS (tab screens stay mounted, so a mount-only
  // fetch would go stale for the whole session). The first focus is skipped —
  // the hook already fetched on mount.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!token || !user?.role) return;
      refreshCompleteness();
      if (firstFocus.current) {
        firstFocus.current = false;
      } else {
        maidRailsRes.refresh();
        myJobsRes.refresh();
        jobRailsRes.refresh();
        creditsRes.refresh();
        boostsRes.refresh();
      }
      // Session re-sync — retires the KYC banner + refreshes the avatar the
      // moment the server disagrees with the local snapshot (owner fix).
      let cancelled = false;
      (async () => {
        try {
          const me = await api.me(token);
          if (!cancelled && me?.user) {
            const u = me.user;
            const changed =
              !user ||
              u.kycStatus !== user.kycStatus ||
              u.kycRejectionReason !== user.kycRejectionReason ||
              u.trustBadge !== user.trustBadge ||
              u.accountStatus !== user.accountStatus ||
              u.avatarUrl !== user.avatarUrl ||
              u.fullName !== user.fullName ||
              u.locationCounty !== user.locationCounty ||
              u.locationArea !== user.locationArea;
            if (changed) await updateUserRef.current(u, me.token);
          }
        } catch {
          // offline / transient — keep the cached snapshot
        }
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, user?.role, refreshCompleteness])
  );

  const showCompletenessBanner =
    completeness && (completeness.done < completeness.total || completeness.total === 0);
  const kycApproved = user?.kycStatus === 'approved';

  // §15.5 — activate a banked profile boost (payment already made): extends
  // the featured window by 7 days.
  const [boostBusy, setBoostBusy] = useState(false);
  async function activateBoost() {
    if (boostBusy) return;
    setBoostBusy(true);
    try {
      await api.boostProfile(token);
      await boostsRes.refresh();
    } catch (e) {
      Alert.alert('Boost', e?.message || 'Could not activate the boost.');
    } finally {
      setBoostBusy(false);
    }
  }

  const rails = isEmployer ? maidRailsRes.data : null;
  const railsLoading = isEmployer && maidRailsRes.loading;
  const jobRails = !isEmployer ? jobRailsRes.data : null;
  const jobRailsLoading = !isEmployer && jobRailsRes.loading;
  const boosts = !isEmployer ? boostsRes.data : null;
  const myJobs = (isEmployer ? myJobsRes.data?.jobs : null) || [];
  const openJobs = myJobs.filter((j) => j.status === 'open').length;
  const creditsLeft = !isEmployer && creditsRes.data ? creditsRes.data.creditsLeft : null;

  // Maid rail — title + subtitle + up to four maid cards; skeleton rows on a
  // true first load, hidden entirely when the server returns nothing.
  function MaidRail({ title, subtitle, maids, loading }) {
    const list = maids || [];
    if (loading) {
      return (
        <>
          <SectionTitle title={title} />
          {subtitle ? <Text style={styles.railSub}>{subtitle}</Text> : null}
          <RailSkeleton count={2} />
        </>
      );
    }
    if (!list.length) return null;
    return (
      <>
        <SectionTitle title={title} actionLabel="See all" onAction={() => navigation.navigate('MaidsTab')} />
        {subtitle ? <Text style={styles.railSub}>{subtitle}</Text> : null}
        {list.slice(0, 4).map((m) => (
          <MaidCard key={m.id} maid={m} onPress={() => navigation.navigate('MaidProfile', { maidId: m.id })} />
        ))}
      </>
    );
  }

  // Job rail — mirror for the househelp hub (§15.5 job boost placement).
  function JobRail({ title, subtitle, jobs, loading }) {
    const list = jobs || [];
    if (loading) {
      return (
        <>
          <SectionTitle title={title} />
          {subtitle ? <Text style={styles.railSub}>{subtitle}</Text> : null}
          <RailSkeleton count={2} kind="job" />
        </>
      );
    }
    if (!list.length) return null;
    return (
      <>
        <SectionTitle title={title} actionLabel="See all" onAction={() => navigation.navigate('FindJobsTab')} />
        {subtitle ? <Text style={styles.railSub}>{subtitle}</Text> : null}
        {list.slice(0, 4).map((j) => (
          <JobCard key={j.id} job={j} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })} />
        ))}
      </>
    );
  }

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Karibu, {firstName(user?.fullName)} 👋</Text>
          <Text style={styles.roleLine}>
            {isEmployer
              ? `${ROLES.employer}${openJobs ? ` · ${openJobs} open job${openJobs === 1 ? '' : 's'}` : ' · Maidora Kenya'}`
              : `${ROLES.househelp} · Maidora Kenya`}
          </Text>
        </View>
        {/* Real avatar photo → Profile (initials fallback when none uploaded). */}
        <Pressable onPress={() => navigation.navigate('ProfileTab')} hitSlop={8} accessibilityLabel="Open my profile">
          <Avatar url={user?.avatarUrl} name={user?.fullName} size={44} />
        </Pressable>
      </View>

      {/* ── Employer hub ─────────────────────────────────────────────── */}
      {isEmployer ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Your home deserves trusted hands.</Text>
            <Text style={styles.heroBody}>
              Browse verified house helps near you and hire with confidence — or post a job and let
              them come to you.
            </Text>
            <View style={styles.heroActions}>
              <Pressable style={styles.cta} onPress={() => navigation.navigate('MaidsTab')}>
                <Text style={styles.ctaText}>Browse Maids</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.cream} />
              </Pressable>
              <Pressable style={styles.ctaGhost} onPress={() => navigation.navigate('PostJob')}>
                <Ionicons name="add-circle-outline" size={17} color={colors.cream} />
                <Text style={styles.ctaGhostText}>Post a Job</Text>
              </Pressable>
            </View>
          </View>

          {myJobs.length ? (
            <>
              <SectionTitle title="Your postings" actionLabel="My Jobs" onAction={() => navigation.navigate('MyJobsTab')} />
              {myJobs.slice(0, 2).map((j) => (
                <JobCard key={j.id} job={j} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })} />
              ))}
            </>
          ) : null}

          {/* §15.5 FEATURED — the paid-placement rail (KES 99 / 7 days). */}
          <MaidRail
            title="Featured maids"
            subtitle="Boosted placement — the top spot, bought fairly."
            maids={rails?.featured}
            loading={railsLoading}
          />
          {/* MAIDS NEAR ME — the caller's county; nationwide fallback is
              flagged so the heading never lies about "near". */}
          <MaidRail
            title="Maids near me"
            subtitle={
              rails?.nearbyFallback
                ? 'No matches in your county yet — showing active profiles nationwide.'
                : rails?.nearbyCounty
                ? `Active in ${rails.nearbyCounty}`
                : null
            }
            maids={rails?.nearby}
            loading={railsLoading}
          />
          {/* VERIFIED — Trust Badge holders (§8). */}
          <MaidRail title="Verified maids" maids={rails?.verified} loading={railsLoading} />
          {/* TOP RATED — Maidora score (verification, experience, profile
              depth, recency) until a real ratings feature exists. */}
          <MaidRail title="Top rated maids" maids={rails?.topRated} loading={railsLoading} />
        </>
      ) : (
        /* ── Househelp hub ──────────────────────────────────────────────── */
        <>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Let families find you.</Text>
            <Text style={styles.heroBody}>
              Jobs are posted by households across Kenya every week. Keep your profile complete and
              apply early — your first two applications are free.
            </Text>
            <Pressable style={styles.cta} onPress={() => navigation.navigate('FindJobsTab')}>
              <Text style={styles.ctaText}>Find Jobs</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.cream} />
            </Pressable>
          </View>

          {creditsLeft !== null ? (
            <View style={styles.creditsCard}>
              <View style={styles.creditsNumWrap}>
                <Text style={styles.creditsNum}>{creditsLeft}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditsTitle}>Free applications left</Text>
                <Text style={styles.creditsBody}>
                  {creditsLeft > 0
                    ? 'Apply with one tap — no payment needed until these run out.'
                    : 'Used up — a top-up via M-Pesa is on the way. Browsing stays free.'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* §15.5 boost strip — featured now · activate a banked boost · buy one. */}
          {boosts ? (
            boosts.profileBoostActive ? (
              <View style={[styles.creditsCard, styles.boostActiveCard]}>
                <Ionicons name="star" size={20} color={colors.brandDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.creditsTitle}>You are featured</Text>
                  <Text style={[styles.creditsBody, { color: colors.brandDark, fontWeight: '600' }]}>
                    Your profile sits at the top until {dayLabel(boosts.profileBoostedUntil)}.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.creditsCard}>
                <Ionicons name="trending-up-outline" size={20} color={colors.goldDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.creditsTitle}>Get featured</Text>
                  <Text style={styles.creditsBody}>
                    {boosts.profileBoostsBanked > 0
                      ? `You have ${boosts.profileBoostsBanked} boost${boosts.profileBoostsBanked === 1 ? '' : 's'} paid and ready — go top of the list for 7 days.`
                      : 'Top of search, home rails and feeds for 7 days — KES 99 via M-Pesa.'}
                  </Text>
                  {boosts.profileBoostsBanked > 0 ? (
                    <Pressable onPress={activateBoost} disabled={boostBusy} style={styles.boostActivate} hitSlop={4}>
                      {boostBusy ? (
                        <ActivityIndicator size="small" color={colors.goldDark} />
                      ) : (
                        <Text style={styles.boostActivateText}>Activate my boost</Text>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => navigation.navigate('Payment', { purpose: 'profile_boost' })}
                      style={styles.boostActivate}
                      hitSlop={4}
                    >
                      <Text style={styles.boostActivateText}>Boost my profile</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )
          ) : null}

          {/* §15.5 JOB BOOST — the paid Featured Jobs rail (owner request:
              "featured jobs, recently posted, etc"). */}
          <JobRail
            title="Featured jobs"
            subtitle="Households that boosted their listing — answering first pays."
            jobs={jobRails?.featured}
            loading={jobRailsLoading}
          />
          <JobRail
            title="Jobs near me"
            subtitle={
              jobRails?.nearbyFallback
                ? 'No open jobs in your county yet — showing openings nationwide.'
                : jobRails?.nearbyCounty
                ? `Open in ${jobRails.nearbyCounty}`
                : null
            }
            jobs={jobRails?.nearby}
            loading={jobRailsLoading}
          />
          <JobRail title="Recently posted" jobs={jobRails?.recent} loading={jobRailsLoading} />
        </>
      )}

      {/* §7 — PROFILE COMPLETENESS banner FIRST (both roles, spec §7 → §8 order) */}
      {showCompletenessBanner ? (
        <Pressable style={styles.completenessCard} onPress={() => navigation.navigate('ProfileTab')}>
          <View style={styles.completenessIconWrap}>
            <Ionicons name="sparkles-outline" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.completenessTitle}>
              Profile strength — {completeness.done}/{completeness.total}
            </Text>
            <Text style={styles.completenessBody} numberOfLines={2}>
              Add: {(completeness.missing || []).join(', ')}. This never blocks you.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      {/* §8 — non-blocking KYC banner (BOTH roles) — GONE once approved. */}
      {!kycApproved ? (
        <Pressable style={styles.kycCard} onPress={() => navigation.navigate('KycIntro')}>
          <View style={styles.kycIconWrap}>
            <Ionicons
              name={
                user?.kycStatus === 'submitted' || user?.kycStatus === 'under_review'
                  ? 'time-outline'
                  : user?.kycStatus === 'rejected'
                  ? 'alert-circle'
                  : 'shield-checkmark-outline'
              }
              size={20}
              color={colors.goldDark}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kycTitle}>{kycBannerTitle(user)}</Text>
            <Text style={styles.kycBody}>{kycBannerBody(user)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />
      <Text style={styles.footnote}>
        {isEmployer
          ? 'House helps never see your phone number until you message them. Report anything suspicious from a profile.'
          : 'Employers only see your first activity status — never your phone number until you message them.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.ink },
  roleLine: { marginTop: 2, fontSize: 13, color: colors.muted },
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    backgroundColor: colors.brand,
  },
  heroTitle: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 29 },
  heroBody: { color: colors.white, marginTop: 8, fontSize: 14.5, lineHeight: 21, opacity: 0.92 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  ctaText: { color: colors.brandDark, fontWeight: '800', fontSize: 14.5 },
  ctaGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(247, 243, 233, 0.55)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ctaGhostText: { color: colors.cream, fontWeight: '800', fontSize: 14.5 },
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 14,
  },
  creditsNumWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  creditsNum: { fontSize: 18, fontWeight: '800', color: colors.goldDark },
  creditsTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  creditsBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  boostActiveCard: { backgroundColor: colors.gold },
  boostActivate: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldDark,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  boostActivateText: { fontSize: 12.5, fontWeight: '800', color: colors.goldDark },
  railSub: {
    marginTop: -4,
    marginBottom: 10,
    fontSize: 12,
    color: colors.muted,
  },
  completenessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand,
    padding: 14,
  },
  completenessIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completenessTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  completenessBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  kycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    padding: 14,
  },
  kycIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(214, 166, 79, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  kycBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  footnote: {
    marginTop: 18,
    fontSize: 12.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
