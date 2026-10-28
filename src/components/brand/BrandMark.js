// Maidora mark — exact original 720x680 paths (no redraws).
// p1 = pillar (soft fill) · p2+p3 = house strokes · p4 = gold seam accent.
import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

export const MARK_PATHS = {
  p1: 'M70 400C70 361.34 101.34 330 140 330H150C188.66 330 220 361.34 220 400V670H70V400Z',
  p2: 'M330.229 600H517.913C556.573 600 587.913 568.66 587.913 530V364.12',
  p3: 'M587.913 364.12V257.53C587.913 235.765 577.788 215.238 560.518 201.99L339.07 32.1148C314.286 13.1029 279.905 12.8124 254.803 31.4026L38.3393 191.716C20.5136 204.918 10 225.787 10 247.969V530C10 568.66 41.3401 600 80 600H212.234C227.745 600 242.817 594.848 255.083 585.353L521.958 378.767C534.224 369.272 549.296 364.12 564.807 364.12H587.913Z',
  p4: 'M587.913 364.12H710',
};

export default function BrandMark({
  size = 132,
  ink = '#7BC08B',
  pillar,
  accent,
}) {
  const P = pillar ?? ink;
  const A = accent ?? ink;
  return (
    <Svg width={size} height={(size * 680) / 720} viewBox="0 0 720 680" fill="none">
      <Path d={MARK_PATHS.p1} fill={P} opacity={0.28} />
      <G
        stroke={ink}
        strokeWidth={24}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <Path d={MARK_PATHS.p2} />
        <Path d={MARK_PATHS.p3} />
        <Path d={MARK_PATHS.p4} stroke={A} />
      </G>
    </Svg>
  );
}
