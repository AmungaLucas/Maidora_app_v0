// Full-screen transition overlay — locked to the Radar loader.
// Renders above everything (Modal). The veil fades IN when `visible` turns
// true — and, just as importantly, fades OUT *before* the Modal unmounts:
// flipping `visible={false}` on an RN Modal kills the Android window
// instantly, which used to hard-cut the overlay (the old opacity animation
// never got to play on exit). We keep the Modal mounted one beat longer
// while the veil fades to 0, then unmount for real.
import React, { useEffect, useState } from 'react';
import { Modal, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import BrandLoader from './BrandLoader';
import { colors, fonts, brandSoftLight, loaderTrack } from '../../theme';

const FADE_IN_MS = 200;
const FADE_OUT_MS = 240;

export default function FullScreenLoader({
  visible,
  label,
  theme = 'dark',
}) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, { duration: FADE_IN_MS });
      return;
    }
    // Fade the veil out while the Modal is still mounted, then unmount.
    opacity.value = withTiming(0, { duration: FADE_OUT_MS });
    const t = setTimeout(() => setMounted(false), FADE_OUT_MS + 20);
    return () => clearTimeout(t);
  }, [visible, opacity]);

  const veil = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const veilColor =
    theme === 'dark' ? 'rgba(33,78,59,0.96)' : 'rgba(247,243,233,0.96)';

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[styles.fill, { backgroundColor: veilColor }, veil]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <BrandLoader
          variant="radar"
          size={120}
          color={theme === 'dark' ? brandSoftLight : colors.brandSoft}
          track={theme === 'dark' ? 'rgba(247,243,233,0.16)' : loaderTrack}
        />
        {label ? (
          <Text
            style={[
              styles.label,
              { color: theme === 'dark' ? colors.cream : colors.brand },
            ]}
          >
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.medium,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
