// Skeleton loaders — brand-styled placeholders (owner request 2026-11-01:
// "have cache and skeletal loaders"). A gentle opacity pulse (Animated loop,
// native driver) instead of spinners: the layout is visible before the data
// is, so the hub never jumps when content arrives.
//
//   <MaidCardSkeleton />        one maid row
//   <JobCardSkeleton />         one job row
//   <RailSkeleton count={3} />  a whole home rail
//   <Skeleton style={...} />    raw block
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';

const usePulse = () => {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
};

export function Skeleton({ style }) {
  const opacity = usePulse();
  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

export function MaidCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.avatar} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton style={{ height: 14, width: '55%' }} />
        <Skeleton style={{ height: 11, width: '40%' }} />
        <Skeleton style={{ height: 11, width: '70%' }} />
      </View>
    </View>
  );
}

export function JobCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton style={{ height: 14, width: '60%' }} />
        <Skeleton style={{ height: 11, width: '45%' }} />
        <Skeleton style={{ height: 11, width: '65%' }} />
      </View>
    </View>
  );
}

export function RailSkeleton({ count = 3, kind = 'maid' }) {
  const Row = kind === 'job' ? JobCardSkeleton : MaidCardSkeleton;
  return (
    <View>
      <Skeleton style={{ height: 16, width: 140, marginBottom: 10, marginTop: 20 }} />
      {Array.from({ length: count }).map((_, i) => (
        <Row key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.line,
    borderRadius: radius.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginBottom: 10,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
});
