// EMPLOYER HOME — the hiring household's hub (owner request 2026-11-01:
// "can we separate maids homescreen and employers homescreen"). One role,
// one file — no more `isEmployer ? … : …` conditional shared with the
// househelp hub (that lived in the old HomeScreen.js).
//
// Rails (owner's section list): FEATURED MAIDS · MAIDS NEAR ME · VERIFIED
// MAIDS · TOP RATED — all four in ONE /maids/rails call; §10 decay gates
// apply server-side. Featured is the ONLY paid slot (deliberations §9/§11.1
// — "placement is not purchasable any other way").
//
// Kept from the shared era: stats row stays REMOVED (owner), cache +
// skeletons (stale-while-revalidate, hooks/useCachedResource), header
// renders the real avatar photo, and the §8 KYC banner retires itself the
// moment the server says approved (shared.useSessionResync on focus).
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { useCachedResource } from '../../hooks/useCachedResource';
import { ROLES, colors, radius } from '../../theme';
import { Screen } from '../../ui';
import { JobCard, SectionTitle } from '../../components/market/cards';
import {
  CompletenessBanner,
  HomeHeader,
  KycBanner,
  MaidRail,
  hubStyles,
  useSessionResync,
} from './shared';

export default function EmployerHomeScreen({ navigation }) {
  const { user, token, profileCompleteness: completeness, refreshCompleteness } = useApp();

  // This screen is mounted ONLY inside EmployerTabs; the role check is cheap
  // insurance for the instant the session flips before the navigator swaps.
  const enabled = user?.role === 'employer' && !!token;
  const cacheScope = user?.id || 'anon';

  // ── Cached hub data (stale-while-revalidate) ────────────────────────────
  const maidRailsRes = useCachedResource(
    `v1/maids-rails/${cacheScope}`, api.maidsRails, token, { enabled }
  );
  const myJobsRes = useCachedResource(
    `v1/my-jobs/${cacheScope}`, api.myJobs, token, { enabled }
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
        maidRailsRes.refresh();
        myJobsRes.refresh();
      }
    }, [enabled, refreshCompleteness, maidRailsRes.refresh, myJobsRes.refresh])
  );

  const rails = maidRailsRes.data;
  const railsLoading = maidRailsRes.loading;
  const myJobs = myJobsRes.data?.jobs || [];
  const openJobs = myJobs.filter((j) => j.status === 'open').length;
  const roleLine = `${ROLES.employer}${
    openJobs ? ` · ${openJobs} open job${openJobs === 1 ? '' : 's'}` : ' · Maidora Kenya'
  }`;

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <HomeHeader user={user} roleLine={roleLine} navigation={navigation} />

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
        navigation={navigation}
        title="Featured maids"
        subtitle="Boosted placement — the top spot, bought fairly."
        maids={rails?.featured}
        loading={railsLoading}
      />
      {/* MAIDS NEAR ME — the caller's county; nationwide fallback is flagged
          so the heading never lies about "near". */}
      <MaidRail
        navigation={navigation}
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
      <MaidRail navigation={navigation} title="Verified maids" maids={rails?.verified} loading={railsLoading} />
      {/* TOP RATED — Maidora score (verification, experience, profile depth,
          recency) until a real ratings feature exists. */}
      <MaidRail navigation={navigation} title="Top rated maids" maids={rails?.topRated} loading={railsLoading} />

      {/* §7 — PROFILE COMPLETENESS banner FIRST (spec §7 → §8 order) */}
      <CompletenessBanner completeness={completeness} onPress={() => navigation.navigate('ProfileTab')} />

      {/* §8 — non-blocking KYC banner — GONE once approved. */}
      <KycBanner user={user} onPress={() => navigation.navigate('KycIntro')} />

      <View style={{ flex: 1 }} />
      <Text style={hubStyles.footnote}>
        House helps never see your phone number until you message them. Report anything suspicious
        from a profile.
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
});
