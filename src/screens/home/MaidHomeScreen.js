// HOUSEHELP (MAID) HOME — the job-seeker's hub (owner request 2026-11-01:
// "can we separate maids homescreen and employers homescreen"). One role,
// one file — no more `isEmployer ? … : …` conditional shared with the
// employer hub (that lived in the old HomeScreen.js).
//
// Rails (owner's section list): FEATURED JOBS · JOBS NEAR ME · RECENTLY
// POSTED — all three in ONE /jobs/rails call (§15.5 JOB BOOST placement;
// mirror of the employer hub's maid rails). Featured is the ONLY paid slot
// (deliberations §9/§11.1 — "placement is not purchasable any other way").
//
// Also here: §24.1 credits pill, the §15.5 boost strip (featured now ·
// activate a banked profile boost · buy one), cache + skeletons
// (stale-while-revalidate), §7/§8 banners via ./shared.
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { useCachedResource } from '../../hooks/useCachedResource';
import { ROLES, colors, radius } from '../../theme';
import { Screen } from '../../ui';
import {
  CompletenessBanner,
  HomeHeader,
  JobRail,
  KycBanner,
  dayLabel,
  hubStyles,
  useSessionResync,
} from './shared';

export default function MaidHomeScreen({ navigation }) {
  const { user, token, profileCompleteness: completeness, refreshCompleteness } = useApp();

  // This screen is mounted ONLY inside HousehelpTabs; the role check is
  // cheap insurance for the instant the session flips before the swap.
  const enabled = user?.role === 'househelp' && !!token;
  const cacheScope = user?.id || 'anon';

  // ── Cached hub data (stale-while-revalidate) ────────────────────────────
  const jobRailsRes = useCachedResource(
    `v1/jobs-rails/${cacheScope}`, api.jobsRails, token, { enabled }
  );
  const creditsRes = useCachedResource(
    `v1/credits/${cacheScope}`, api.applications, token, { enabled }
  );
  const boostsRes = useCachedResource(
    `v1/boosts/${cacheScope}`, api.boostsStatus, token, { enabled }
  );

  // §8 banner auto-retire + avatar refresh on focus.
  useSessionResync();

  // Revalidate on every FOCUS (tab screens stay mounted, so a mount-only
  // fetch would go stale for the whole session). The first focus is skipped —
  // the hook already fetched on mount.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      refreshCompleteness();
      if (firstFocus.current) {
        firstFocus.current = false;
      } else {
        jobRailsRes.refresh();
        creditsRes.refresh();
        boostsRes.refresh();
      }
    }, [enabled, refreshCompleteness, jobRailsRes.refresh, creditsRes.refresh, boostsRes.refresh])
  );

  const jobRails = jobRailsRes.data;
  const jobRailsLoading = jobRailsRes.loading;
  const boosts = boostsRes.data;
  const creditsLeft = creditsRes.data ? creditsRes.data.creditsLeft : null;

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

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <HomeHeader
        user={user}
        roleLine={`${ROLES.househelp} · Maidora Kenya`}
        navigation={navigation}
      />

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

      {/* §24.1 — free-application credits pill. */}
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
        navigation={navigation}
        title="Featured jobs"
        subtitle="Households that boosted their listing — answering first pays."
        jobs={jobRails?.featured}
        loading={jobRailsLoading}
      />
      <JobRail
        navigation={navigation}
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
      <JobRail
        navigation={navigation}
        title="Recently posted"
        jobs={jobRails?.recent}
        loading={jobRailsLoading}
      />

      {/* §7 — PROFILE COMPLETENESS banner (spec §7 → §8 order) */}
      <CompletenessBanner completeness={completeness} onPress={() => navigation.navigate('ProfileTab')} />

      {/* §8 — non-blocking KYC banner — GONE once approved. */}
      <KycBanner user={user} onPress={() => navigation.navigate('KycIntro')} />

      <View style={{ flex: 1 }} />
      <Text style={hubStyles.footnote}>
        Employers only see your first activity status — never your phone number until you message
        them.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    backgroundColor: colors.brand,
  },
  heroTitle: { color: colors.white, fontSize: 22, fontWeight: '800', lineHeight: 29 },
  heroBody: { color: colors.white, marginTop: 8, fontSize: 14.5, lineHeight: 21, opacity: 0.92 },
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
});
