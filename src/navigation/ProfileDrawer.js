// Profile drawer — REAL React Navigation drawer (@react-navigation/drawer v7)
// per owner direction. The Profile tab is its own drawer navigator, so the
// account destinations are proper screens that live INSIDE the drawer and
// keep it swipeable:
//   ProfileMain (personal details) · Verification (Trust Badge) ·
//   Payments & receipts · Account settings · Log out (footer).
// Custom drawerContent keeps the branded look (identity header, gold ring
// avatar, item cards) that the previous in-house modal had.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';

import ProfileScreen from '../screens/profile/ProfileScreen';
import KycIntroScreen from '../screens/verification/KycIntroScreen';
import PaymentScreen from '../screens/payments/PaymentScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';

const Drawer = createDrawerNavigator();

// Drawer width mirrors the previous in-house panel.
const DRAWER_W = Math.min(320, 0.82);

const ITEMS = [
  { route: 'ProfileMain', icon: 'person-circle-outline', label: 'Personal details' },
  { route: 'Verification', icon: 'shield-checkmark-outline', label: 'Verification (Trust Badge)' },
  { route: 'Payments', icon: 'cash-outline', label: 'Payments & receipts' },
  { route: 'Settings', icon: 'settings-outline', label: 'Account settings' },
];

function BrandDrawerContent({ navigation, state }) {
  const { user, signOut } = useApp();

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
    <View style={styles.panel}>
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
              <Text style={styles.itemLabel} numberOfLines={1}>
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
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false, // each screen renders its own branded header
        drawerType: 'front',
        drawerPosition: 'left',
        swipeEnabled: true,
        edgeWidth: 60,
        drawerStyle: { width: DRAWER_W, backgroundColor: colors.card },
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
    paddingTop: 60,
    paddingBottom: 24,
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
