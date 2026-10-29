// AppDrawer — lightweight slide-in navigation drawer (built-in Animated —
// no new native deps, Expo Go safe). Used by the Profile screen to separate
// account destinations (verification, payments, settings) from the profile
// content itself.
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_W = Math.min(320, SCREEN_W * 0.82);

export default function AppDrawer({ visible, onClose, userName, roleLabel, items }) {
  const progress = useRef(new Animated.Value(0)).current; // 0 = closed, 1 = open

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      progress.setValue(0);
    }
  }, [visible, progress]);

  const panelX = progress.interpolate({ inputRange: [0, 1], outputRange: [-PANEL_W - 12, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const initials = useMemo(
    () =>
      String(userName || 'M')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase(),
    [userName]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,38,29,0.45)', opacity: backdropOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.panel, { transform: [{ translateX: panelX }] }]}>
          {/* Header — identity */}
          <View style={styles.head}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{userName || 'Member'}</Text>
              {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}
            </View>
          </View>

          {/* Navigation items */}
          <View style={styles.items}>
            {(items || []).map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => {
                  onClose();
                  // Defer so the drawer animation doesn't fight the transition.
                  if (item.onPress) setTimeout(item.onPress, 60);
                }}
              >
                <View style={[styles.itemIcon, item.danger && styles.itemIconDanger]}>
                  <Ionicons name={item.icon} size={19} color={item.danger ? colors.danger : colors.brand} />
                </View>
                <Text style={[styles.itemLabel, item.danger && { color: colors.danger }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.footer}>
            <Text style={{ color: colors.gold }}>♥ </Text>Maidora Kenya
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_W,
    backgroundColor: colors.card,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
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
  itemPressed: { backgroundColor: colors.cream },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconDanger: { backgroundColor: colors.dangerSoft },
  itemLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  footer: { marginTop: 'auto', textAlign: 'center', fontSize: 12.5, color: colors.muted },
});
