// FailMark — the radar LOSES THE SIGNAL (brand-true failure animation).
// The exact inverse of the success choreography: instead of a generic close
// icon, the three BrandLoader radar rings collapse INWARD (the ping that
// found nothing) onto a ghost of the Maidora mark rendered in the muted line
// colour — the home was never reached. A danger dot pops at the centre, one
// soft danger pulse breathes out (an alarm ping, not an alarm bell), and the
// whole badge gives one gentle, keyframed shake. Then everything rests.
//
// Choreography (one-shot, ~1.15s):
//   0.00–0.58   three rings collapse inward onto the ghost mark (staggered)
//   0.50–0.63   ghost mark fades up to full ghost opacity
//   0.50–0.63   danger dot pops at the centre (slight overshoot)
//   0.64–1.00   one soft danger pulse expands and fades
//   0.60–1.00   keyframed shake: 0 → −9 → +8 → −6 → +4 → 0 px
//
// Implementation: every layer is transform/opacity only, so the whole
// animation runs on a single NATIVE-driven clock — zero JS frame work, safe
// on low-end Android. The ghost mark is a static BrandMark (same exact paths,
// line colour, no gold seam — the accent only appears on success).
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import BrandMark from './BrandMark';
import { colors } from '../../theme';

export default function FailMark({ size = 122 }) {
  const box = size * 1.3; // room for rings + shake, keeps card layout stable

  const fx = useRef(new Animated.Value(0)).current; // native clock
  const pop = useRef(new Animated.Value(0)).current; // native badge spring

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fx, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6.5, tension: 52, useNativeDriver: true }),
    ]).start();
  }, [fx, pop]);

  // Collapsing radar rings — staggered starts, shared collapse window, and a
  // full fade-out so the resting frame is just ghost + dot + pulse.
  const ring = (delay) => ({
    opacity: fx.interpolate({
      inputRange: [delay, delay + 0.06, delay + 0.3, delay + 0.44],
      outputRange: [0, 0.85, 0.35, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: fx.interpolate({ inputRange: [delay, delay + 0.42], outputRange: [1.18, 0.22], extrapolate: 'clamp' }),
      },
    ],
  });
  const ghostOpacity = fx.interpolate({ inputRange: [0.5, 0.63], outputRange: [0.18, 0.55], extrapolate: 'clamp' });
  const dotScale = fx.interpolate({ inputRange: [0.5, 0.57, 0.63], outputRange: [0, 1.25, 1], extrapolate: 'clamp' });
  const pulseScale = fx.interpolate({ inputRange: [0.64, 1], outputRange: [0.5, 1.12], extrapolate: 'clamp' });
  const pulseOpacity = fx.interpolate({ inputRange: [0.64, 0.72, 1], outputRange: [0, 0.5, 0], extrapolate: 'clamp' });
  const shakeX = fx.interpolate({
    inputRange: [0.6, 0.68, 0.76, 0.84, 0.92, 1],
    outputRange: [0, -9, 8, -6, 4, 0],
    extrapolate: 'clamp',
  });
  const badgeScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  const ringBase = size * 0.98;

  return (
    <Animated.View
      style={[
        styles.box,
        { width: box, height: box },
        { transform: [{ translateX: shakeX }, { scale: badgeScale }] },
      ]}
    >
      {/* ghost of the brand mark — muted line colour, no gold seam */}
      <Animated.View style={[styles.ghost, { opacity: ghostOpacity }]}>
        <BrandMark size={size * 0.86} ink={colors.line} pillar={colors.line} accent={colors.line} />
      </Animated.View>
      {/* three collapsing radar rings (inverse of BrandLoader radar) */}
      {[0, 0.07, 0.14].map((d) => (
        <Animated.View
          key={d}
          style={[
            styles.ring,
            { width: ringBase, height: ringBase, borderRadius: ringBase / 2, borderColor: colors.danger },
            ring(d),
          ]}
        />
      ))}
      {/* soft alarm pulse breathing outward from the dot */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: (size * 0.62) / 2,
            borderColor: colors.danger,
            borderWidth: 2,
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
      {/* danger dot */}
      <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ghost: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2.5 },
  dot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.danger,
  },
});
