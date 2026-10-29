// Settings — account info, the ONLY "Change my role" entry point (role is
// immutable post-signup; switching requires manual review), and logout.
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { LINKS, ROLES, colors, radius } from '../theme';
import { BottomSheetModal, Screen } from '../ui';

export default function SettingsScreen({ navigation }) {
  const { user, signOut } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openRoleSheet = () => setSheetOpen(true);
  const closeRoleSheet = () => setSheetOpen(false);

  const contactSupport = () => {
    setSheetOpen(false);
    const subject = encodeURIComponent(`Role change request (${(user && user.email) || ''})`);
    Linking.openURL(`mailto:${LINKS.supportEmail}?subject=${subject}`).catch(() => {});
  };

  const logOut = () => {
    signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Screen keyboard={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.forest} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Account</Text>
        <InfoRow icon="person-outline" label="Name" value={user?.fullName} />
        <InfoRow icon="mail-outline" label="Email" value={user?.email} />
        <InfoRow icon="call-outline" label="Phone" value={user?.phone} />
        <InfoRow icon="location-outline" label="Location" value={user?.locationName || 'Not set'} />
        <InfoRow icon="shield-checkmark-outline" label="Role" value={ROLES[user?.role] || '—'} last />
      </View>

      <Pressable style={styles.row} onPress={openRoleSheet}>
        <View style={styles.rowIcon}>
          <Ionicons name="swap-horizontal" size={20} color={colors.forest} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Change my role</Text>
          <Text style={styles.rowSubtitle}>Reviewed manually by our team</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Pressable style={[styles.row, { marginTop: 12 }]} onPress={logOut}>
        <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.danger }]}>Log out</Text>
        </View>
      </Pressable>

      {/* Role-change explainer — exact copy per spec */}
      <BottomSheetModal visible={sheetOpen} onClose={closeRoleSheet}>
        <Text style={styles.sheetTitle}>Change role</Text>
        <Text style={styles.sheetBody}>
          Your account role is permanent.{'\n'}
          To switch between Employer and Househelp, our team will review it manually.
        </Text>
        <View style={styles.sheetActions}>
          <Pressable style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={closeRoleSheet}>
            <Text style={styles.sheetBtnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.sheetBtn, styles.sheetBtnPrimary]} onPress={contactSupport}>
            <Text style={styles.sheetBtnPrimaryText}>Contact support</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </Screen>
  );
}

function InfoRow({ icon, label, value, last = false }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  infoLabel: { color: colors.muted, fontSize: 14.5, width: 78 },
  infoValue: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600', textAlign: 'right' },
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
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15.5, fontWeight: '700', color: colors.ink },
  rowSubtitle: { marginTop: 2, fontSize: 13, color: colors.muted },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  sheetBody: { marginTop: 10, fontSize: 15, lineHeight: 23, color: colors.muted },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 22 },
  sheetBtn: { flex: 1, minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sheetBtnGhost: { borderWidth: 1.5, borderColor: colors.line },
  sheetBtnGhostText: { color: colors.ink, fontWeight: '700', fontSize: 15.5 },
  sheetBtnPrimary: { backgroundColor: colors.forest },
  sheetBtnPrimaryText: { color: colors.white, fontWeight: '700', fontSize: 15.5 },
});
