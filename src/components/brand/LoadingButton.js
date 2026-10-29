// Primary action button with the locked button-loader behaviour:
// idle -> (loading: Radar) -> success, exactly like loaders-in-action.html.
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import BrandLoader from './BrandLoader';
import { colors, fonts } from '../../theme';

export default function LoadingButton({
  label,
  onPress,
  loading = false,
  success = false,
  loadingLabel = 'Working…',
  successLabel = 'Done!',
  disabled = false,
  style,
}) {
  const bg = success ? colors.brandSoft : colors.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading || success}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      {loading ? (
        <>
          <BrandLoader
            variant="radar"
            size={22}
            color={colors.brandSoftLight}
            track="rgba(255,255,255,0.25)"
          />
          <Text style={[styles.label, { color: colors.cream }]}>{loadingLabel}</Text>
        </>
      ) : (
        <Text
          style={[
            styles.label,
            { color: success ? colors.ink : colors.cream },
          ]}
        >
          {success ? successLabel : label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 22,
  },
  label: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
