// Shared UI primitives for Maidora Kenya.
import React, { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from './theme';

export function Screen({ children, scroll = true, keyboard = true, style }) {
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.screen, style]}>
      <StatusBarDark />
      {keyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Container
            contentContainerStyle={scroll ? styles.scrollContent : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            {children}
          </Container>
        </KeyboardAvoidingView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

function StatusBarDark() {
  const { StatusBar } = require('expo-status-bar');
  return <StatusBar style="dark" />;
}

export function PrimaryButton({ title, onPress, disabled = false, loading = false, style }) {
  const blocked = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.primaryButton,
        blocked && styles.primaryButtonDisabled,
        pressed && !blocked && styles.primaryButtonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryButtonText}>{title}</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
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
});
