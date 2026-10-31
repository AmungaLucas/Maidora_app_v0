// Home tab — role-aware marketplace hub (both roles share the file).
//
// Owner fixes 2026-11-01:
//   • Avatar — the header now renders the user's actual photo (users.avatar_url
//     via publicUser) with the initials fallback; previously initials only.
//   • Verification banner — the context snapshot used to go stale after the
//     owner approved KYC server-side, so "Verification in review" stuck on
//     Home forever. Home now re-syncs the session (/auth/me) on every focus;
//     the moment kycStatus becomes 'approved' the banner is gone (and the
//     Trust Badge shows up in listings everywhere).
//
// Employer hub — the owner's section list (2026-11-01, "refer to the docs"):
//   FEATURED (§15.5 paid profile boost, KES 99/7d — placement is not
//   purchasable any other way) · MAIDS NEAR ME (caller's county) · VERIFIED
//   MAIDS (Trust Badge, §8) · TOP RATED (server quality-score proxy) — all
//   four arrive in ONE /maids/rails call; §10 decay gates apply server-side.
// Househelp hub: find-jobs CTA + §9 credits + boost strip (§15.5: featured
// status / activate a banked boost / buy one via M-Pesa) + latest jobs.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { api } from '../../api';
import { ROLES, colors, radius } from '../../theme';
import { Screen } from '../../ui';
import { Avatar, JobCard, MaidCard, SectionTitle, formatKes } from '../../components/market/cards';
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

  // CRITICAL loop-guard: `updateUser`'s identity changes whenever the user
  // state changes, and THIS effect itself updates the user — putting it in
  // the focus-effect deps would re-run the sync forever (api.me in a loop).
  // Read it through a ref instead; deps stay [token, role] and the effect
  // runs on focus + role flips only.
  const updateUserRef = useRef(updateUser);
  useEffect(() => {
    updateUserRef.current = updateUser;
  });

  // Live hub data (previews + counters) — silent on failure.
  const [hub, setHub] = useState({ jobs: [], openJobs: 0, applicants: 0, creditsLeft: null, unread: 0 });
  // Employer: the four discovery rails (featured / nearby / verified / topRated).
  const [rails, setRails] = useState(null);
  // Househelp: §15.5 boost strip (featured window + banked entitlements).
  const [boosts, setBoosts] = useState(null);
  const [boostBusy, setBoostBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token || !user?.role) return;
      refreshCompleteness();
      let cancelled = false;
      (async () => {
        // 1. Re-sync the session so kycStatus / avatarUrl are never stale —
        //    this is what retires the verification banner the moment the
        //    submission is approved (owner request 2026-11-01). Only write
        //    when something the Home cares about actually changed — the
        //    server returns a fresh token + object identity every time, and
        //    a blind write here would also re-render needlessly.
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
        // 2. Hub content per role.
        try {
          if (isEmployer) {
            const [jobsRes, railsRes] = await Promise.all([
              api.myJobs(token).catch(() => null),
              api.maidsRails(token).catch(() => null),
            ]);
            if (cancelled) return;
            const jobs = jobsRes?.jobs || [];
            setHub((h) => ({
              ...h,
              jobs: jobs.slice(0, 2),
              openJobs: jobs.filter((j) => j.status === 'open').length,
              applicants: jobs.reduce((n, j) => n + (j.applicantCount || 0), 0),
            }));
            if (railsRes) setRails(railsRes);
          } else {
            const [jobsRes, appsRes, boostRes] = await Promise.all([
              api.jobs({ per_page: 2 }, token).catch(() => null),
              api.applications(token).catch(() => null),
              api.boostsStatus(token).catch(() => null),
            ]);
            if (cancelled) return;
            setHub((h) => ({
              ...h,
              jobs: jobsRes?.jobs || [],
              totalJobs: jobsRes?.total || 0,
              creditsLeft: appsRes?.creditsLeft ?? null,
            }));
            if (boostRes) setBoosts(boostRes);
          }
        } catch {
          // previews are best-effort
        }
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, user?.role, isEmployer, refreshCompleteness])
  );

  const showCompletenessBanner =
    completeness && (completeness.done < completeness.total || completeness.total === 0);
  const kycApproved = user?.kycStatus === 'approved';

  // §15.5 — activate a banked profile boost (payment already made): extends
  // the featured window by 7 days. Errors surface inline via window.alert.
  async function activateBoost() {
    if (boostBusy) return;
    setBoostBusy(true);
    try {
      await api.boostProfile(token);
      const fresh = await api.boostsStatus(token).catch(() => null);
      if (fresh) setBoosts(fresh);
    } catch (e) {
      Alert.alert('Boost', e?.message || 'Could not activate the boost.');
    } finally {
      setBoostBusy(false);
    }
  }

  // A discovery rail: title + See all + up to four maid cards. Hidden when
  // the server returned nothing for it (empty featured rail ≠ broken home).
  function Rail({ title, subtitle, maids }) {
    if (!maids?.length) return null;
    return (
      <>
        <SectionTitle title={title} actionLabel="See all" onAction={() => navigation.navigate('MaidsTab')} />
        {subtitle ? <Text style={styles.railSub}>{subtitle}</Text> : null}
        {maids.slice(0, 4).map((m) => (
          <MaidCard key={m.id} maid={m} onPress={() => navigation.navigate('MaidProfile', { maidId: m.id })} />
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
              ? `${ROLES.employer} · ${hub.openJobs ? `${hub.openJobs} open job${hub.openJobs === 1 ? '' : 's'}` : 'Maidora Kenya'}`
              : `${ROLES.househelp} · Maidora Kenya`}
          </Text>
        </View>
        {/* Real avatar photo → Profile (initials fallback when none uploaded).
            Owner fix 2026-11-01 — the header used to show initials only. */}
        <Pressable onPress={() => navigation.navigate('ProfileTab')} hitSlop={8} accessibilityLabel="Open my profile">
          <Avatar url={user?.avatarUrl} name={user?.fullName} size={44} />
        </Pressable>
      </View>

      {/* ── Employer hub ─────────────────────────────────────────────────── */}
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

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{hub.openJobs}</Text>
              <Text style={styles.statLabel}>Open jobs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{hub.applicants}</Text>
              <Text style={styles.statLabel}>Applicants</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statNum, kycApproved && { color: colors.goldDark }]}>{kycApproved ? '✓' : '—'}</Text>
              <Text style={styles.statLabel}>Trust Badge</Text>
            </View>
          </View>

          {hub.jobs.length ? (
            <>
              <SectionTitle title="Your postings" actionLabel="My Jobs" onAction={() => navigation.navigate('MyJobsTab')} />
              {hub.jobs.map((j) => (
                <JobCard key={j.id} job={j} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })} />
              ))}
            </>
          ) : null}

          {rails === null ? (
            <View style={styles.railsLoading}>
              <ActivityIndicator color={colors.brand} size="small" />
            </View>
          ) : (
            <>
              {/* §15.5 FEATURED — the paid-placement rail (KES 99 / 7 days). */}
              <Rail
                title="Featured maids"
                subtitle="Boosted placement — the top spot, bought fairly."
                maids={rails?.featured}
              />
              {/* MAIDS NEAR ME — the caller's county; nationwide fallback is
                  flagged so the heading never lies about "near". */}
              <Rail
                title="Maids near me"
                subtitle={
                  rails?.nearbyFallback
                    ? 'No matches in your county yet — showing active profiles nationwide.'
                    : rails?.nearbyCounty
                    ? `Active in ${rails.nearbyCounty}`
                    : null
                }
                maids={rails?.nearby}
              />
              {/* VERIFIED — Trust Badge holders (§8). */}
              <Rail title="Verified maids" maids={rails?.verified} />
              {/* TOP RATED — server quality score (badge, experience, profile
                  depth, recency) until a real ratings feature exists. */}
              <Rail title="Top rated maids" maids={rails?.topRated} />
            </>
          )}
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

          {hub.creditsLeft !== null ? (
            <View style={styles.creditsCard}>
              <View style={styles.creditsNumWrap}>
                <Text style={styles.creditsNum}>{hub.creditsLeft}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditsTitle}>Free applications left</Text>
                <Text style={styles.creditsBody}>
                  {hub.creditsLeft > 0
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

          {hub.jobs.length ? (
            <>
              <SectionTitle title="Latest jobs" actionLabel="See all" onAction={() => navigation.navigate('FindJobsTab')} />
              {hub.jobs.map((j) => (
                <JobCard key={j.id} job={j} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })} />
              ))}
            </>
          ) : null}
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

      {/* §8 — non-blocking KYC banner (BOTH roles) — GONE once approved.
          The focus re-sync above keeps kycStatus fresh, so approval from the
          review side clears this on the very next visit to Home. */}
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    marginTop: 14,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 20, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11.5, fontWeight: '700', color: colors.muted },
  statDivider: { width: 1, height: 30, backgroundColor: colors.line },
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
  railsLoading: { alignItems: 'center', paddingVertical: 22 },
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
