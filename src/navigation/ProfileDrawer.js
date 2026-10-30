// Profile drawer — REAL React Navigation drawer (@react-navigation/drawer v7)
// per owner direction. The Profile tab is its own drawer navigator, so the
// account destinations are proper screens that live INSIDE the drawer and
// keep it swipeable:
//   ProfileMain (personal details) · Verification (Trust Badge) ·
//   Payments & receipts · Account settings · Log out (footer).
// Custom drawerContent keeps the branded look (identity header, gold ring
// avatar, item cards) that the previous in-house modal had.
//
// WIDTH BUG (2026-10-30): the width used to be `Math.min(320, 0.82)` — that
// evaluates to 0.82 PIXELS, so the panel was sub-pixel wide and the drawer
// looked dead (hamburger/swipe showed nothing). Width is now computed from
// the real window width (82%, capped at 320) and recomputed on rotation.
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createDrawerNavigator,
} from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '../screens/profile/ProfileScreen';
import KycIntroScreen from '../screens/verification/KycIntroScreen';
import PaymentScreen from '../screens/payments/PaymentScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';

const Drawer = createDrawerNavigator();

// Drawer width: 82% of the window, capped at 320 — recomputed on rotation
// so landscape never ends up with a stale or collapsed panel.
const drawerWidth = () => Math.min(320, Math.round(Dimensions.get('window').width * 0.82));

const ITEMS = [
  { route: 'ProfileMain', icon: 'person-circle-outline', label: 'Personal details' },
  { route: 'Verification', icon: 'shield-checkmark-outline', label: 'Verification (Trust Badge)' },
  { route: 'Payments', icon: 'cash-outline', label: 'Payments & receipts' },
  { route: 'Settings', icon: 'settings-outline', label: 'Account settings' },
];

function BrandDrawerContent({ navigation, state }) {
  const { user, signOut } = useApp();
  const insets = useSafeAreaInsets();

  const initials = String(user?.fullName || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const activeRoute = state.routes[state.index]?.name;

  const go = (route) => navigation.navigate(route);

  // resetRoot acts on the ROOT stack (drawer → tabs → root), landing the
  // signed-out user back on Login regardless of where the drawer was open.
  const logOut = () => {
    signOut();
    navigation.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View
      style={[
        styles.panel,
        { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 20) },
      ]}
    >
      {/* Identity header */}
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.fullName || 'Member'}
          </Text>
          <Text style={styles.role}>{ROLES[user?.role] || 'Member'}</Text>
        </View>
      </View>

      {/* Destination items */}
      <View style={styles.items}>
        {ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <Pressable
              key={item.route}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
              onPress={() => go(item.route)}
            >
              <View style={[styles.itemIcon, active && styles.itemIconActive]}>
                <Ionicons name={item.icon} size={19} color={active ? colors.brand : colors.muted} />
              </View>
              <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>

      {/* Log out — destructive, kept at the bottom like before */}
      <Pressable style={({ pressed }) => [styles.item, pressed && styles.itemPressed]} onPress={logOut}>
        <View style={[styles.itemIcon, styles.itemIconDanger]}>
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
        </View>
        <Text style={[styles.itemLabel, { color: colors.danger }]}>Log out</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>

      <Text style={styles.footer}>
        <Text style={{ color: colors.gold }}>♥ </Text>Maidora Kenya
      </Text>
    </View>
  );
}

export default function ProfileDrawer() {
  // Keep the panel width honest across rotations / split-screen.
  const [width, setWidth] = useState(drawerWidth());
  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => setWidth(drawerWidth()));
    return () => sub?.remove?.();
  }, []);

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false, // each screen renders its own branded header
        drawerType: 'front',
        drawerPosition: 'left',
        swipeEnabled: true,
        swipeEdgeWidth: 60,
        drawerStyle: { width: width, backgroundColor: colors.card },
        overlayColor: 'rgba(22, 38, 29, 0.45)',
      }}
      drawerContent={(props) => <BrandDrawerContent {...props} />}
    >
      <Drawer.Screen name="ProfileMain" component={ProfileScreen} />
      <Drawer.Screen name="Verification" component={KycIntroScreen} />
      <Drawer.Screen name="Payments" component={PaymentScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.card,
    paddingHorizontal: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.brand },
  name: { fontSize: 16.5, fontWeight: '800', color: colors.ink },
  role: { marginTop: 2, fontSize: 12.5, color: colors.goldDark, fontWeight: '700' },
  items: { marginTop: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  itemActive: { backgroundColor: colors.brandSoftBg },
  itemPressed: { backgroundColor: colors.cream },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.brand },
  itemIconDanger: { backgroundColor: colors.dangerSoft },
  itemLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  itemLabelActive: { color: colors.brand, fontWeight: '800' },
  footer: { marginTop: 'auto', textAlign: 'center', fontSize: 12.5, color: colors.muted },
});
