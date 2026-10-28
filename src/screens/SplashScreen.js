// MAIDORA SPLASH — "Ping Letters" (03 Radar × Letter Spring).
// Presentational only — App/AppContext decide when to move on (the boot gate
// holds the splash for at least SPLASH_MIN_MS so the full timeline plays).
//
// Built on React Native's built-in Animated API (no native worklets runtime),
// so the same animation runs identically in Expo Go and production builds.
//
// Timeline (ms):
//   0    two radar rings start pinging behind the mark (1.5s loop, offset)
//   50   mark drops into place with an overshoot spring (~600ms)
//   350  M-A-I-D-O-R-A springs up letter by letter (+50ms per letter)
//   950  tagline fades in
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import BrandMark from '../components/brand/BrandMark';
import { colors, fonts, splashThemes } from '../theme';

const LETTERS = 'MAIDORA'.split('');
const RING = 300;
const SPRING = { damping: 13, stiffness: 190, mass: 0.7 };
const MARK_SPRING = { damping: 12, stiffness: 165, mass: 0.8 };

/* one radar pulse ring, looping */
function PingRing({ delay, color }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(p, {
          toValue: 1,
          duration: 1500,
          easing: Easing.bezier(0.2, 0.7, 0.3, 1),
          useNativeDriver: true,
        })
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, p]);
  const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.24, 1.4] });
  const opacity = p.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.8, 0] });
  return (
    <Animated.View
      style={[styles.ring, { borderColor: color }, { transform: [{ scale }], opacity }]}
    />
  );
}

/* one springing letter */
function PingLetter({ ch, delay, color }) {
  const ty = useRef(new Animated.Value(44)).current;
  const sc = useRef(new Animated.Value(0.7)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.spring(ty, { toValue: 0, ...SPRING, useNativeDriver: true, delay }),
      Animated.spring(sc, { toValue: 1, ...SPRING, useNativeDriver: true, delay }),
      Animated.timing(op, { toValue: 1, duration: 120, useNativeDriver: true, delay }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ty, sc, op, delay]);

  return (
    <Animated.Text
      style={[
        styles.letter,
        { color },
        { transform: [{ translateY: ty }, { scale: sc }], opacity },
      ]}
    >
      {ch}
    </Animated.Text>
  );
}

export default function SplashScreen({ theme = 'light' }) {
  const t = splashThemes[theme] || splashThemes.light;

  /* mark drop */
  const mTy = useRef(new Animated.Value(-52)).current;
  const mSc = useRef(new Animated.Value(0.92)).current;
  const mOp = useRef(new Animated.Value(0)).current;
  /* tagline fade */
  const tagOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mark = Animated.parallel([
      Animated.timing(mOp, { toValue: 1, duration: 140, useNativeDriver: true, delay: 50 }),
      Animated.spring(mTy, { toValue: 0, ...MARK_SPRING, useNativeDriver: true, delay: 50 }),
      Animated.spring(mSc, { toValue: 1, ...MARK_SPRING, useNativeDriver: true, delay: 50 }),
    ]);
    const tag = Animated.timing(tagOp, {
      toValue: 0.93,
      duration: 500,
      useNativeDriver: true,
      delay: 950,
    });
    mark.start();
    tag.start();
    return () => {
      mark.stop();
      tag.stop();
    };
  }, [mTy, mSc, mOp, tagOp]);

  const markStyle = { transform: [{ translateY: mTy }, { scale: mSc }], opacity: mOp };
  const tagStyle = { opacity: tagOp };

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <View style={styles.center}>
        {/* rings + mark */}
        <View style={[styles.ringBox, { width: RING, height: RING }]}>
          <PingRing delay={200} color={t.ring} />
          <PingRing delay={950} color={t.ring} />
          <Animated.View style={[styles.markWrap, markStyle]}>
            <BrandMark size={132} ink={colors.brandSoft} pillar={colors.brandSoft} accent={colors.gold} />
          </Animated.View>
        </View>

        {/* MAIDORA — letter spring */}
        <View style={styles.wordRow}>
          {LETTERS.map((ch, i) => (
            <PingLetter
              key={`${ch}-${i}`}
              ch={ch}
              delay={350 + i * 50}
              color={t.word}
            />
          ))}
        </View>

        {/* tagline */}
        <Animated.Text style={[styles.tag, { color: t.tag }, tagStyle]}>
          Trusted help for your household
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  ring: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 145,
    borderWidth: 2,
  },
  markWrap: {
    width: 132,
    alignItems: 'center',
  },
  wordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  letter: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fonts.bold,
    fontWeight: '800',
  },
  tag: {
    marginTop: 12,
    fontSize: 10.5,
    fontFamily: fonts.medium,
    fontWeight: '500',
    letterSpacing: 2.9,
    textTransform: 'uppercase',
  },
});
