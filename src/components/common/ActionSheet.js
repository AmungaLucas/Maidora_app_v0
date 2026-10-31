// Brand-styled bottom action sheet — replaces the OS Alert popups for
// choices ("Take photo / Choose from gallery"), permission guidance and
// similar pickers. One component so every chooser in the app looks and
// behaves the same (owner request: no raw system popups).
//
//   <ActionSheet
//     visible={open}
//     title="Add photo"
//     subtitle="How would you like to add it?"
//     options={[
//       { key: 'camera', icon: 'camera-outline', label: 'Take photo', onPress: ... },
//       { key: 'gallery', icon: 'images-outline', label: 'Choose from gallery', onPress: ... },
//     ]}
//     onClose={() => setOpen(false)}
//   />
//
// Options are single-fire: pressing one calls onPress and closes the sheet.
// The sheet respects the bottom navigation-bar inset (edge-to-edge safe).
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../../theme';

export default function ActionSheet({
  visible,
  title,
  subtitle,
  options = [],
  onClose,
  cancelLabel = 'Cancel',
}) {
  const insets = useSafeAreaInsets();

  function pick(option) {
    onClose?.();
    // Fire after the close so a sheet that triggers another modal (e.g. the
    // camera) never races its own unmount.
    if (option?.onPress) setTimeout(() => option.onPress(), 60);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.card, { paddingBottom: (insets.bottom || 12) + 12 }]}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={{ marginTop: subtitle ? 12 : 6 }}>
            {options.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => pick(o)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cream }]}
                accessibilityRole="button"
                accessibilityLabel={o.label}
              >
                <View style={[styles.iconWrap, o.danger && styles.iconWrapDanger]}>
                  <Ionicons name={o.icon} size={21} color={o.danger ? colors.danger : colors.forest} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, o.danger && { color: colors.danger }]}>{o.label}</Text>
                  {o.sub ? <Text style={styles.rowSub}>{o.sub}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.line} />
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,38,29,0.45)',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4.5,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 3, fontSize: 13.5, color: colors.muted, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoftBg,
  },
  iconWrapDanger: { backgroundColor: colors.dangerSoft },
  rowLabel: { fontSize: 15.5, fontWeight: '700', color: colors.ink },
  rowSub: { marginTop: 1, fontSize: 12.5, color: colors.muted },
  cancel: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.muted },
});
