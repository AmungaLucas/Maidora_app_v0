// AvatarAdjust — interactive crop stage for the PROFILE PHOTO (owner request
// 2026-10-31: "the camera needs to be different where we can crop, zoom or
// reposition the image within that circle").
//
// Replaces the auto center-crop for avatar mode in GuidedCapture: after a
// camera shot or a gallery pick, the FULL photo is shown in a square
// viewport with a circular gold ring; the user drags to reposition and
// pinches to zoom, and "Use photo" maps the visible circle back into the
// image's pixel space and crops exactly that region (cropToWebp in
// GuidedCapture does the WebP encode).
//
//   · Pan + pinch run on the UI thread (RNGH Gesture API + Reanimated
//     shared values) — no JS-thread jank.
//   · Translations are CLAMPED so the circle is always fully covered by the
//     photo (no empty gaps), zoom is 1×–4×.
//   · flipDisplay: Android stores front-camera shots un-mirrored vs the
//     preview — the stage mirrors the image (scaleX −1) so what the user
//     positions is what they saw; the crop rect stays in that MIRRORED
//     space and GuidedCapture passes flipH to cropToWebp, which flips the
//     original first and then crops with the same rect — WYSIWYG with zero
//     extra encode passes.
//   · Wrapped in its own GestureHandlerRootView: RN Modals render in a
//     separate Android view hierarchy, where the app-root handler doesn't
//     reach.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '../../theme';
import BrandLoader from '../../components/brand/BrandLoader';

const MAX_ZOOM = 4;

// Circle hole for the scrim (same evenodd trick as the camera guide frame).
function circlePath(cx, cy, r) {
  return [
    `M ${cx - r} ${cy}`,
    `A ${r} ${r} 0 1 0 ${cx + r} ${cy}`,
    `A ${r} ${r} 0 1 0 ${cx - r} ${cy}`,
    'Z',
  ].join(' ');
}

export default function AvatarAdjust({ photo, flipDisplay = false, busy = false, onRetake, onUse }) {
  const win = useWindowDimensions();
  // Viewport = the circle: full-bleed circle inside a square viewport.
  const S = Math.max(200, Math.min(win.width - 36, 400));
  const iw = photo?.width || S;
  const ih = photo?.height || S;
  // Cover-fit scale at zoom 1 — the image always covers the viewport.
  const baseFit = Math.max(S / iw, S / ih);
  const dw0 = iw * baseFit;
  const dh0 = ih * baseFit;

  const [wrap, setWrap] = useState(null); // stage area W×H — centers viewport + scrim
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const z = useSharedValue(1);
  const start = useRef({ tx: 0, ty: 0, z: 1 }).current;

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.tx = tx.value;
      start.ty = ty.value;
    })
    .onUpdate((e) => {
      // Clamp inline (worklet): |t| ≤ (displayed − viewport) / 2.
      const mx = Math.max(0, (dw0 * z.value - S) / 2);
      const my = Math.max(0, (dh0 * z.value - S) / 2);
      tx.value = Math.min(mx, Math.max(-mx, start.tx + e.translationX));
      ty.value = Math.min(my, Math.max(-my, start.ty + e.translationY));
    });
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      start.z = z.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, start.z * e.scale));
      z.value = next;
      const mx = Math.max(0, (dw0 * next - S) / 2);
      const my = Math.max(0, (dh0 * next - S) / 2);
      tx.value = Math.min(mx, Math.max(-mx, tx.value));
      ty.value = Math.min(my, Math.max(-my, ty.value));
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: z.value },
      { scaleX: flipDisplay ? -1 : 1 },
    ],
  }));

  // Map the visible circle back into the DISPLAYED image's pixel space.
  // Visual center (S/2, S/2) + translation → image point via ÷(baseFit·z);
  // circle side in image px = S ÷ (baseFit·z) — always ≤ min(iw, ih).
  const cropRect = () => {
    const fitZ = baseFit * z.value;
    const side = S / fitZ;
    const cx = iw / 2 - tx.value / fitZ;
    const cy = ih / 2 - ty.value / fitZ;
    const ox = Math.min(iw - side, Math.max(0, cx - side / 2));
    const oy = Math.min(ih - side, Math.max(0, cy - side / 2));
    return {
      originX: Math.round(ox),
      originY: Math.round(oy),
      width: Math.round(side),
      height: Math.round(side),
    };
  };

  const W2 = wrap?.width || 0;
  const H2 = wrap?.height || 0;
  const hole = W2 && H2 ? circlePath(W2 / 2, H2 / 2, S / 2 - 1) : '';
  const ring = W2 && H2 ? circlePath(W2 / 2, H2 / 2, S / 2 - 2.5) : '';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.fill}>
        {/* top bar — back to the camera */}
        <View style={styles.topBar}>
          <Pressable onPress={onRetake} disabled={busy} style={styles.roundBtn} accessibilityLabel="Back to camera">
            <Ionicons name="arrow-back" size={22} color={colors.cream} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            Position your photo
          </Text>
          <View style={styles.roundBtnInvisible} />
        </View>

        {/* stage — draggable/zoomable image + circular scrim */}
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          <View
            style={styles.stageWrap}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setWrap((w) => (w && w.width === width && w.height === height ? w : { width, height }));
            }}
          >
            <View style={[styles.viewport, { width: S, height: S, borderRadius: S / 2 }]}>
              {photo ? (
                <Animated.Image
                  source={{ uri: photo.uri }}
                  style={[
                    {
                      position: 'absolute',
                      left: (S - dw0) / 2,
                      top: (S - dh0) / 2,
                      width: dw0,
                      height: dh0,
                    },
                    imageStyle,
                  ]}
                  resizeMode="cover"
                />
              ) : null}
            </View>
            {hole ? (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                <Path
                  d={`M 0 0 H ${W2} V ${H2} H 0 Z ${hole}`}
                  fill="rgba(10,18,13,0.66)"
                  fillRule="evenodd"
                />
                <Path d={ring} stroke={colors.gold} strokeWidth={2.5} fill="none" />
              </Svg>
            ) : null}
            {busy ? (
              <View style={styles.busyOverlay} pointerEvents="auto">
                <BrandLoader variant="radar" size={54} color={colors.brandSoftLight} track="rgba(247,243,239,0.25)" />
                <Text style={styles.busyText}>Cropping…</Text>
              </View>
            ) : null}
          </View>
        </GestureDetector>

        <Text style={styles.hint}>Drag to reposition · Pinch to zoom</Text>

        {/* action row — same brand pair as the confirm stage */}
        <View style={styles.row}>
          <Pressable style={styles.retakeBtn} onPress={onRetake} disabled={busy}>
            <Ionicons name="camera-outline" size={19} color={colors.cream} />
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
          <Pressable
            style={styles.useBtn}
            onPress={() => photo && onUse(cropRect())}
            disabled={busy || !photo}
          >
            <Ionicons name="checkmark" size={21} color={colors.ink} />
            <Text style={styles.useText}>Use photo</Text>
          </Pressable>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0E1712' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,23,18,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(247,243,239,0.25)',
  },
  roundBtnInvisible: { width: 46, height: 46 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.cream, paddingHorizontal: 10 },
  stageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewport: { overflow: 'hidden', backgroundColor: 'rgba(247,243,239,0.06)' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(14,23,18,0.6)',
  },
  busyText: { color: colors.cream, fontSize: 14.5, fontWeight: '700' },
  hint: {
    alignSelf: 'center',
    color: 'rgba(247,243,239,0.72)',
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 18,
  },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingBottom: 26 },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(247,243,239,0.4)',
  },
  retakeText: { color: colors.cream, fontSize: 15, fontWeight: '700' },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 52,
    paddingHorizontal: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  useText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
});
