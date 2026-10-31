// SuccessMark — the Maidora mark DRAWS ITSELF (brand-true success animation).
// Instead of the generic checkmark, success is the brand mark materialising:
// the same radar the user watched while the payment was processing fires one
// final ping that "locks on", then the house draws itself stroke-by-stroke,
// the pillar settles in as a soft fill, and the gold seam — the brand's
// signature accent — draws last, finished by a spark and one restrained
// burst of brand-coloured sparks (gold / fresh green / deep gold).
//
// Choreography (one-shot, ~1.75s, then rests on the finished mark):
//   0.00–0.34   radar lock-on: one soft brand ring expands and fades
//   0.10–0.52   house outline (p3) draws in brand green
//   0.30–0.60   inner right stroke (p2) draws
//   0.55–0.72   pillar (p1) fades in as a soft fill (28% like BrandMark)
//   0.62–0.78   gold seam (p4) draws
//   0.78–0.92   gold spark pops at the seam end, halo breathing out
//   0.80–1.00   8-particle spark burst, staggered in two groups
//
// The final resting frame is the finished brand mark plus the tiny gold
// spark at the seam end — a deliberate echo of BrandLoader's gold comet
// head; the halo, burst and lock-on ring all fade to zero.
//
// Implementation notes:
//  - strokeDashoffset is a non-transform SVG prop, so the paths ride a
//    JS-driven master clock (classic RN Animated); every interpolation is
//    clamped so nothing leaks before/after its window.
//  - View layers (lock-on rings, spark, particles, badge spring) are pure
//    transform/opacity and ride a parallel NATIVE-driven clock — smooth on
//    low-end Android even while the JS clock paints the stroke draw.
//  - Dash lengths were measured from the real path data in
//    scripts/mark_path_lengths.js (×1.02 headroom) so the reveal speed is
//    proportional to each stroke's true length.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MARK_PATHS } from './BrandMark';
import { colors } from '../../theme';

const APath = Animated.createAnimatedComponent(Path);

// Measured stroke lengths (see header).
const LEN = { p2: 433, p3: 1755, p4: 125 };

// Spark burst — 8 particles on two staggered windows, alternating angles.
const P_COLORS = [
  colors.gold, colors.brandSoft, colors.goldDark, colors.brandSoft,
  colors.gold, colors.brandSoft, colors.goldDark, colors.brandSoft,
];
const P_SIZES = [6, 4.5, 5, 4, 6.5, 4.5, 5, 4];
const P_WINDOWS = [
  [0.8, 0.98], [0.84, 1.0], [0.8, 0.98], [0.84, 1.0],
  [0.84, 1.0], [0.8, 0.98], [0.84, 1.0], [0.8, 0.98],
];
const P_ANGLES = P_COLORS.map((_, i) => (-90 + i * 45 + (i % 2 ? 10 : -8)) * (Math.PI / 180));

export default function SuccessMark({ size = 148 }) {
  const W = size;
  const H = (size * 680) / 720;
  const box = size * 1.3; // room for rings + burst, keeps the card layout stable

  const clock = useRef(new Animated.Value(0)).current; // JS — SVG stroke draw
  const fx = useRef(new Animated.Value(0)).current; // native — view effects
  const pop = useRef(new Animated.Value(0)).current; // native — badge spring

  useEffect(() => {
    Animated.parallel([
      Animated.timing(clock, { toValue: 1, duration: 1750, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(fx, { toValue: 1, duration: 1750, easing: Easing.linear, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6.5, tension: 52, useNativeDriver: true }),
    ]).start();
  }, [clock, fx, pop]);

  // --- SVG stroke choreography (JS clock, all clamped) ---
  const dash = (len, from, to) => ({
    strokeDashoffset: clock.interpolate({ inputRange: [from, to], outputRange: [len, 0], extrapolate: 'clamp' }),
  });
  const reveal = (from) => ({
    opacity: clock.interpolate({ inputRange: [Math.max(0, from - 0.004), from], outputRange: [0, 1], extrapolate: 'clamp' }),
  });
  const pillarOpacity = clock.interpolate({
    inputRange: [0.55, 0.72],
    outputRange: [0, 0.28],
    extrapolate: 'clamp',
  });

  // --- View choreography (native clock) ---
  const ringScale = fx.interpolate({ inputRange: [0.02, 0.34], outputRange: [0.4, 1.3], extrapolate: 'clamp' });
  const ringOpacity = fx.interpolate({
    inputRange: [0.02, 0.08, 0.34],
    outputRange: [0, 0.75, 0],
    extrapolate: 'clamp',
  });
  const sparkScale = fx.interpolate({ inputRange: [0.78, 0.86, 0.92], outputRange: [0, 1.3, 1], extrapolate: 'clamp' });
  const haloScale = fx.interpolate({ inputRange: [0.78, 0.96], outputRange: [0.4, 1.6], extrapolate: 'clamp' });
  const haloOpacity = fx.interpolate({ inputRange: [0.78, 0.92], outputRange: [0.5, 0], extrapolate: 'clamp' });
  const badgeScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });

  // Spark sits at the seam end (viewBox 706, 364.12) in px coords.
  const sparkX = (706 / 720) * W;
  const sparkY = (364.12 / 680) * H;
  const sparkSize = Math.max(9, Math.round(size * 0.075));

  const particles = P_COLORS.map((c, i) => {
    const [s0, s1] = P_WINDOWS[i];
    const cos = Math.cos(P_ANGLES[i]);
    const sin = Math.sin(P_ANGLES[i]);
    const r0 = size * 0.4;
    const r1 = size * 0.62;
    return {
      key: i,
      color: c,
      s: P_SIZES[i],
      style: {
        opacity: fx.interpolate({ inputRange: [s0, s0 + 0.05, s1], outputRange: [0, 0.95, 0], extrapolate: 'clamp' }),
        transform: [
          { translateX: fx.interpolate({ inputRange: [s0, s1], outputRange: [cos * r0, cos * r1], extrapolate: 'clamp' }) },
          { translateY: fx.interpolate({ inputRange: [s0, s1], outputRange: [sin * r0, sin * r1], extrapolate: 'clamp' }) },
          { scale: fx.interpolate({ inputRange: [s0, s1], outputRange: [0.7, 1.05], extrapolate: 'clamp' }) },
        ],
      },
    };
  });

  return (
    <View style={[styles.box, { width: box, height: box }]}>
      {/* radar lock-on ring (behind the mark) */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.98,
            height: size * 0.98,
            borderRadius: (size * 0.98) / 2,
            borderColor: colors.brandSoft,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      {/* the mark itself — springs in while its strokes draw */}
      <Animated.View style={[styles.markBox, { width: W, height: H }, { transform: [{ scale: badgeScale }] }]}>
        <Svg width={W} height={H} viewBox="0 0 720 680" fill="none">
          <APath d={MARK_PATHS.p1} fill={colors.brandSoft} opacity={pillarOpacity} />
          <APath
            d={MARK_PATHS.p3}
            stroke={colors.brand}
            strokeWidth={24}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${LEN.p3} ${LEN.p3}`}
            {...dash(LEN.p3, 0.1, 0.52)}
            {...reveal(0.1)}
          />
          <APath
            d={MARK_PATHS.p2}
            stroke={colors.brand}
            strokeWidth={24}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${LEN.p2} ${LEN.p2}`}
            {...dash(LEN.p2, 0.3, 0.6)}
            {...reveal(0.3)}
          />
          <APath
            d={MARK_PATHS.p4}
            stroke={colors.gold}
            strokeWidth={24}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${LEN.p4} ${LEN.p4}`}
            {...dash(LEN.p4, 0.62, 0.78)}
            {...reveal(0.62)}
          />
        </Svg>
        {/* gold spark at the seam end + breathing halo */}
        <Animated.View
          style={[styles.halo, { left: sparkX, top: sparkY }, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
        />
        <Animated.View
          style={[styles.spark, { left: sparkX, top: sparkY }, { transform: [{ scale: sparkScale }] }]}
        />
      </Animated.View>
      {/* one-shot brand spark burst */}
      {particles.map((p) => (
        <Animated.View
          key={p.key}
          style={[
            styles.particle,
            {
              width: p.s,
              height: p.s,
              borderRadius: p.s / 2,
              backgroundColor: p.color,
            },
            p.style,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  markBox: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  spark: {
    position: 'absolute',
    width: 11,
    height: 11,
    marginLeft: -5.5,
    marginTop: -5.5,
    borderRadius: 6,
    backgroundColor: colors.gold,
  },
  halo: {
    position: 'absolute',
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: 13,
    backgroundColor: 'rgba(214, 166, 79, 0.35)',
  },
  particle: { position: 'absolute' },
});
