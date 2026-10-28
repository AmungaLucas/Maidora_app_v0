// Shared UI primitives for Maidora Kenya.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BrandLoader from './components/brand/BrandLoader';
import { colors, radius } from './theme';

// Screen — safe-area wrapper used by every screen.
//   scroll   : wrap children in a ScrollView (default) or a plain View
//   keyboard : wrap in a KeyboardAvoidingView (iOS padding)
//   edges    : safe-area edges applied (tab screens pass without 'bottom' —
//              the bottom tab bar owns that inset)
// Every path below applies the shared 24px horizontal padding so no screen
// ever renders edge-to-edge, regardless of scroll/keyboard combination.
export function Screen({ children, scroll = true, keyboard = true, style, edges }) {
  const offline = useIsOffline();
  const Container = scroll ? ScrollView : View;
  const contentStyle = scroll ? styles.scrollContent : styles.content;
  const body = scroll ? (
    <Container
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      {children}
    </Container>
  ) : (
    <Container style={[{ flex: 1 }, contentStyle]}>{children}</Container>
  );
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges ?? ['top', 'left', 'right', 'bottom']}>
      <StatusBarDark />
      {offline ? <OfflineNote /> : null}
      {keyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

function StatusBarDark() {
  const { StatusBar } = require('expo-status-bar');
  return <StatusBar style="dark" />;
}

// True when the device has no connection (Wi-Fi/data off or unreachable).
// `isInternetReachable` null = unknown — never treated as offline.
export function useIsOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const check = (s) =>
      setOffline(Boolean(s) && (s.isConnected === false || s.isInternetReachable === false));
    const sub = NetInfo.addEventListener(check);
    NetInfo.fetch().then(check).catch(() => {});
    return () => sub && sub();
  }, []);
  return offline;
}

export function OfflineNote() {
  return (
    <View style={styles.offlineNote}>
      <Ionicons name="wifi-outline" size={16} color={colors.goldDark} />
      <Text style={styles.offlineText}>
        No internet connection — check your Wi-Fi or mobile data. Maidora will
        reconnect automatically.
      </Text>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  success = false,
  loadingLabel,
  successLabel,
  style,
}) {
  const blocked = disabled || loading || success;
  const bg = success ? colors.brandSoft : colors.forest;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: bg },
        blocked && !success && styles.primaryButtonDisabled,
        pressed && !blocked && !success && styles.primaryButtonPressed,
        style,
      ]}
    >
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BrandLoader
            variant="radar"
            size={22}
            color={colors.brandSoftLight}
            track="rgba(255,255,255,0.25)"
          />
          {loadingLabel ? (
            <Text style={styles.primaryButtonTextSmall}>{loadingLabel}</Text>
          ) : null}
        </View>
      ) : (
        <Text
          style={[styles.primaryButtonText, success && { color: colors.ink }]}
        >
          {success ? successLabel || title : title}
        </Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, style }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.8 }, style]}>
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  secure = false,
  hint,
  ...rest
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = secure;
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword && !visible}
          placeholderTextColor={colors.muted}
          style={styles.input}
          {...rest}
        />
        {isPassword ? (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

export function Banner({ kind = 'error', message }) {
  if (!message) return null;
  const isError = kind === 'error';
  return (
    <View style={[styles.banner, isError ? styles.bannerError : styles.bannerInfo]}>
      <Ionicons
        name={isError ? 'alert-circle' : 'information-circle'}
        size={18}
        color={isError ? colors.danger : colors.forest}
      />
      <Text style={[styles.bannerText, isError ? { color: colors.danger } : { color: colors.forest }]}>
        {message}
      </Text>
    </View>
  );
}

export function RoleChip({ label, onChange }) {
  return (
    <View style={styles.roleChip}>
      <Text style={styles.roleChipText}>
        Signing up as: <Text style={styles.roleChipStrong}>{label}</Text>
      </Text>
      {onChange ? (
        <Pressable onPress={onChange} hitSlop={8}>
          <Text style={styles.roleChipChange}>Change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BottomSheetModal({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheetCard}>{children}</View>
      </View>
    </Modal>
  );
}

export function ScreenHeader({ eyebrow, title, subtitle, right }) {
  return (
    <View style={styles.headerWrap}>
      {eyebrow ? <Text style={styles.headerEyebrow}>{eyebrow}</Text> : null}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, body, badge }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {badge ? (
        <View style={styles.emptyBadge}>
          <Text style={styles.emptyBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  primaryButton: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonDisabled: { backgroundColor: colors.green, opacity: 0.55 },
  primaryButtonPressed: { backgroundColor: colors.forestDark },
  primaryButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  primaryButtonTextSmall: { color: colors.white, fontSize: 15, fontWeight: '700' },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 4,
  },
  offlineText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.goldDark, fontWeight: '600' },
  secondaryButton: {
    borderRadius: radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.forest,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: { color: colors.forest, fontSize: 17, fontWeight: '600' },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 52, fontSize: 16, color: colors.ink },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 6 },
  hintText: { color: colors.muted, fontSize: 13, marginTop: 6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  bannerError: { backgroundColor: colors.dangerSoft },
  bannerInfo: { backgroundColor: colors.greenSoft },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '500' },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
  },
  roleChipText: { color: colors.forest, fontSize: 14 },
  roleChipStrong: { fontWeight: '700' },
  roleChipChange: { color: colors.forest, fontWeight: '700', textDecorationLine: 'underline' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(22,38,29,0.45)', justifyContent: 'flex-end' },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 24,
    paddingBottom: 36,
  },
  headerWrap: { marginTop: 18, marginBottom: 18 },
  headerEyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.goldDark,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.ink },
  headerSubtitle: { marginTop: 4, fontSize: 14, color: colors.muted, lineHeight: 20 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 320,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyBadge: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  emptyBadgeText: { color: colors.goldDark, fontSize: 12.5, fontWeight: '700' },
});
