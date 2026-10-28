// Full-screen transition overlay — locked to the Radar loader.
// Renders above everything (Modal) with a soft fade.
// Built-in Animated only — no native worklets runtime required.
import React, { useEffect, useRef } from 'react';
import { Modal, Text, StyleSheet, Animated } from 'react-native';
import BrandLoader from './BrandLoader';
import { colors, fonts, brandSoftLight, loaderTrack } from '../../theme';

export default function FullScreenLoader({
  visible,
  label,
  theme = 'dark',
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, opacity]);

  const veilColor =
    theme === 'dark' ? 'rgba(33,78,59,0.96)' : 'rgba(247,243,233,0.96)';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.fill, { backgroundColor: veilColor, opacity }]}>
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
