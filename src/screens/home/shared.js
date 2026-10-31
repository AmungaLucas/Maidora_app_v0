// Shared pieces of the two role hubs (owner request 2026-11-01:
// "can we separate maids homescreen and employers homescreen —
// src/screens/home/**"). The former single HomeScreen.js carried a big
// `isEmployer ? … : …` conditional; it is now two dedicated screens:
//
//   EmployerHomeScreen.js — employer hub (maids rails + own postings)
//   MaidHomeScreen.js     — househelp hub (job rails + credits + boosts)
//
// This file holds what BOTH hubs share so neither screen drifts apart
// silently: the greeting header, the §7 completeness banner, the §8 KYC
// banner (auto-clears on approval via the focus session re-sync), the
// Maid/Job rails with their skeletons, and the hub stylesheet.
//
// Rails are MODULE-level components now (they used to be defined inside the
// render body — a new component identity every render remounts the whole
// subtree and restarts the skeleton pulse on each parent render).
//
// Placement logic (Initial_app_deliberations §9/§11.1) is untouched:
// "placement is not purchasable any other way" — Featured rails are the
// ONLY paid slots; everything else is earned (verification, freshness, §10
// decay) and gated server-side.
import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Avatar, JobCard, MaidCard, SectionTitle } from '../../components/market/cards';
import { RailSkeleton } from '../../components/market/skeletons';
import { REASON_LABELS } from '../verification/kycShared';

export function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

export function dayLabel(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

// ── Session re-sync (focus) ────────────────────────────────────────────────
// Retires the §8 KYC banner + refreshes the avatar the moment the server
// disagrees with the local snapshot. CRITICAL loop-guard: `updateUser`'s
// identity changes whenever the user state changes, and THIS effect itself
// updates the user — so the deps must NOT track the user snapshot (that
// re-ran api.me in a loop once; deps track token + role only).
export function useSessionResync() {
  const { user, token, updateUser } = useApp();
  const updateUserRef = useRef(updateUser);
  useEffect(() => {
    updateUserRef.current = updateUser;
  });

  useFocusEffect(
    useCallback(() => {
      if (!token || !user?.role) return;
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
    }, [token, user?.role])
  );
}

// ── Greeting header — real avatar photo → Profile (initials fallback). ─────
export function HomeHeader({ user, roleLine, navigation }) {
  return (
    <View style={hubStyles.header}>
      <View style={{ flex: 1 }}>
        <Text style={hubStyles.greeting}>Karibu, {firstName(user?.fullName)} 👋</Text>
        <Text style={hubStyles.roleLine}>{roleLine}</Text>
      </View>
      <Pressable onPress={() => navigation.navigate('ProfileTab')} hitSlop={8} accessibilityLabel="Open my profile">
        <Avatar url={user?.avatarUrl} name={user?.fullName} size={44} />
      </Pressable>
    </View>
  );
}

// ── §7 PROFILE COMPLETENESS banner (both roles — spec §7 → §8 order). ──────
export function CompletenessBanner({ completeness, onPress }) {
  const show =
    completeness && (completeness.done < completeness.total || completeness.total === 0);
  if (!show) return null;
  return (
    <Pressable style={hubStyles.completenessCard} onPress={onPress}>
      <View style={hubStyles.completenessIconWrap}>
        <Ionicons name="sparkles-outline" size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={hubStyles.completenessTitle}>
          Profile strength — {completeness.done}/{completeness.total}
        </Text>
        <Text style={hubStyles.completenessBody} numberOfLines={2}>
          Add: {(completeness.missing || []).join(', ')}. This never blocks you.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

// ── §8 KYC banner — GONE once approved (both roles). ───────────────────────
export function KycBanner({ user, onPress }) {
  if (user?.kycStatus === 'approved') return null;
  const title = (() => {
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
  })();
  const body = (() => {
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
  })();
  return (
    <Pressable style={hubStyles.kycCard} onPress={onPress}>
      <View style={hubStyles.kycIconWrap}>
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
        <Text style={hubStyles.kycTitle}>{title}</Text>
        <Text style={hubStyles.kycBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

// ── Maid rail — title + subtitle + up to four maid cards; skeleton rows on
// a true first load, hidden entirely when the server returns nothing. ──────
export function MaidRail({ navigation, title, subtitle, maids, loading }) {
  const list = maids || [];
  if (loading) {
    return (
      <>
        <SectionTitle title={title} />
        {subtitle ? <Text style={hubStyles.railSub}>{subtitle}</Text> : null}
        <RailSkeleton count={2} />
      </>
    );
  }
  if (!list.length) return null;
  return (
    <>
      <SectionTitle title={title} actionLabel="See all" onAction={() => navigation.navigate('MaidsTab')} />
      {subtitle ? <Text style={hubStyles.railSub}>{subtitle}</Text> : null}
      {list.slice(0, 4).map((m) => (
        <MaidCard key={m.id} maid={m} onPress={() => navigation.navigate('MaidProfile', { maidId: m.id })} />
      ))}
    </>
  );
}

// ── Job rail — mirror for the househelp hub (§15.5 job boost placement). ───
export function JobRail({ navigation, title, subtitle, jobs, loading }) {
  const list = jobs || [];
  if (loading) {
    return (
      <>
        <SectionTitle title={title} />
        {subtitle ? <Text style={hubStyles.railSub}>{subtitle}</Text> : null}
        <RailSkeleton count={2} kind="job" />
      </>
    );
  }
  if (!list.length) return null;
  return (
    <>
      <SectionTitle title={title} actionLabel="See all" onAction={() => navigation.navigate('FindJobsTab')} />
      {subtitle ? <Text style={hubStyles.railSub}>{subtitle}</Text> : null}
      {list.slice(0, 4).map((j) => (
        <JobCard key={j.id} job={j} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })} />
      ))}
    </>
  );
}

// Styles both hubs share (each screen adds its own hero/CTA card styles).
export const hubStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.ink },
  roleLine: { marginTop: 2, fontSize: 13, color: colors.muted },
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
