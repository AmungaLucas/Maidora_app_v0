// Profile — shared by both roles. "Change my role" stays ONLY inside Settings.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';
import { Screen, ScreenHeader } from '../ui';

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useApp();
  const initials = String(user?.fullName || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <Screen keyboard={false}>
      <ScreenHeader eyebrow="Account" title="Profile" />

      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
          <View style={styles.avatarRing} />
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <View style={styles.roleBadge}>
          <Ionicons
            name={user?.role === 'househelp' ? 'sparkles' : 'home'}
            size={12}
            color={colors.goldDark}
          />
          <Text style={styles.roleBadgeText}>{ROLES[user?.role] || 'Member'}</Text>
        </View>
        <Text style={styles.contact}>{user?.phone}</Text>
        <Text style={styles.contact}>{user?.email}</Text>
      </View>

      <Pressable style={styles.row} onPress={() => navigation.navigate('Settings')}>
        <View style={styles.rowIcon}>
          <Ionicons name="settings-outline" size={20} color={colors.brand} />
        </View>
        <Text style={styles.rowTitle}>Account settings</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => {
          signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        </View>
        <Text style={[styles.rowTitle, { color: colors.danger }]}>Log out</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Text style={styles.footerNote}>
        <Text style={{ color: colors.gold }}>♥ </Text>
        Maidora Kenya — Trusted help for your household.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    marginBottom: 16,
  },
  avatar: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  avatarRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.brand },
  name: { marginTop: 12, fontSize: 19, fontWeight: '800', color: colors.ink },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleBadgeText: { color: colors.goldDark, fontSize: 12.5, fontWeight: '700' },
  contact: { marginTop: 6, fontSize: 14, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { flex: 1, fontSize: 15.5, fontWeight: '700', color: colors.ink },
  footerNote: { textAlign: 'center', fontSize: 12.5, color: colors.muted, paddingVertical: 14 },
});
