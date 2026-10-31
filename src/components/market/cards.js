// Shared marketplace building blocks — cards, chips, avatar, formatting.
// Used by HomeScreen previews, MaidsScreen, FindJobs, JobDetail, Applications,
// Chats. All visuals ride the brand palette (src/theme.js).
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';

// ─── Formatting helpers ──────────────────────────────────────────────────────
export function formatKes(n) {
  if (n === null || n === undefined) return '';
  return `KES ${Number(n).toLocaleString('en-KE')}`;
}

// "just now / 5m / 3h / 2d / 3w" — for chat + application timestamps.
export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

export const JOB_TYPE_LABELS = { live_in: 'Live-in', live_out: 'Live-out', day_burg: 'Day burg' };

export const APPLICATION_STATUS = {
  pending: { label: 'Pending', color: colors.goldDark, bg: colors.goldSoft, icon: 'time-outline' },
  accepted: { label: 'Accepted', color: '#1D7A46', bg: colors.brandSoftBg, icon: 'checkmark-circle' },
  rejected: { label: 'Not selected', color: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' },
  withdrawn: { label: 'Withdrawn', color: colors.muted, bg: '#F0EFE9', icon: 'arrow-undo' },
};

// ─── Avatar — photo with graceful initials fallback ─────────────────────────
export function Avatar({ url, name, size = 44 }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const showPhoto = url && !failed;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {showPhoto ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: Math.max(11, size * 0.36) }]}>{initials}</Text>
      )}
    </View>
  );
}

// Trust Badge chip (§8 — kyc approved)
export function TrustBadge({ compact = false }) {
  return (
    <View style={[styles.badge, compact && { paddingVertical: 2, paddingHorizontal: 7, gap: 3 }]}>
      <Ionicons name="shield-checkmark" size={compact ? 11 : 13} color={colors.goldDark} />
      <Text style={[styles.badgeText, compact && { fontSize: 10 }]}>
        {compact ? 'Verified' : 'Trust Badge'}
      </Text>
    </View>
  );
}

// Featured chip (§15.5 — paid profile boost, KES 99/7d): gold star pill on
// cards + rails. Only ever rendered for maids with an ACTIVE boost window
// (the server computes `featured` from boosted_until > NOW()).
export function FeaturedChip({ compact = false }) {
  return (
    <View style={[styles.featuredChip, compact && { paddingVertical: 2, paddingHorizontal: 7, gap: 3 }]}>
      <Ionicons name="star" size={compact ? 11 : 13} color={colors.brandDark} />
      <Text style={[styles.featuredText, compact && { fontSize: 10 }]}>Featured</Text>
    </View>
  );
}

// Boosted chip (§15.5 — application boost, KES 30): marks an application the
// maid paid to pin to the top of the household's list.
export function BoostChip() {
  return (
    <View style={styles.boostChip}>
      <Ionicons name="rocket" size={11} color={colors.brandDark} />
      <Text style={styles.boostText}>Boosted</Text>
    </View>
  );
}

// ─── Chips — horizontal filter row ───────────────────────────────────────────
export function ChipRow({ options, value, onChange, allLabel = 'All' }) {
  return (
    <View style={styles.chipRow}>
      <Chip label={allLabel} active={!value} onPress={() => onChange('')} />
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return <Chip key={val} label={label} active={value === val} onPress={() => onChange(value === val ? '' : val)} />;
      })}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Section title with optional action ──────────────────────────────────────
export function SectionTitle({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Maid card (search results + home preview) ───────────────────────────────
export function MaidCard({ maid, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <Avatar url={maid.avatarUrl} name={maid.fullName} size={52} />
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{maid.fullName}</Text>
          {maid.trustBadge ? <TrustBadge compact /> : null}
          {maid.featured ? <FeaturedChip compact /> : null}
        </View>
        <Text style={styles.cardSub} numberOfLines={1}>
          {[maid.locationArea, maid.locationCounty].filter(Boolean).join(', ') || 'Kenya'}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[
            maid.jobTypeLabel,
            maid.yearsExperience !== null ? `${maid.yearsExperience} yr exp` : null,
            maid.expectedSalary ? formatKes(maid.expectedSalary) : null,
          ].filter(Boolean).join(' · ') || 'Profile in progress'}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.lastActive}>{maid.lastActiveLabel}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}

// ─── Job card (feed + home preview) ──────────────────────────────────────────
export function JobCard({ job, onPress, right }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{job.title}</Text>
          {right}
        </View>
        <Text style={styles.cardSub} numberOfLines={1}>
          {[
            job.employer?.fullName,
            [job.area, job.county].filter(Boolean).join(', '),
          ].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[
            job.jobTypeLabel,
            job.salaryAmount ? `${formatKes(job.salaryAmount)}/mo` : null,
            job.applicantCount !== undefined && job.applicantCount > 0
              ? `${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`
              : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

// ─── Status chip (applications) ──────────────────────────────────────────────
export function StatusChip({ status }) {
  const s = APPLICATION_STATUS[status] || APPLICATION_STATUS.pending;
  return (
    <View style={[styles.statusChip, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={11} color={s.color} />
      <Text style={[styles.statusChipText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.brandSoftBg,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontWeight: '800', color: colors.brand },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.goldDark },
  featuredChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  featuredText: { fontSize: 11, fontWeight: '800', color: colors.brandDark },
  boostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandSoftBg,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  boostText: { fontSize: 11, fontWeight: '800', color: colors.brandDark },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.muted },
  chipTextActive: { color: colors.cream },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sectionAction: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
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
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  cardSub: { marginTop: 2, fontSize: 12, color: colors.muted },
  cardMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', color: colors.goldDark },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  lastActive: { fontSize: 10.5, fontWeight: '700', color: colors.muted },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '800' },
});
