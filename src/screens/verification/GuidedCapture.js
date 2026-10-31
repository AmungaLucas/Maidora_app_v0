// In-app guided capture modal — the camera flow for KYC documents, selfies
// and profile photos. Replaces expo-image-picker's launchCameraAsync +
// allowsEditing pipeline, which (a) handed control to a foreign camera
// activity and OS crop editor — Expo Go reloads after every capture ("app
// restarts on OK") — and (b) cropped only approximately to a fixed aspect.
//
// What this component does instead:
//  1. Renders a real in-app CameraView (expo-camera) with a scrim + guide
//     frame: rounded rect (ID document), oval (live selfie), circle (avatar).
//  2. On shutter, maps the guide frame from preview coordinates into the
//     photo's pixel space (cover-fit math in kycShared.frameCropForPhoto)
//     and crops EXACTLY what the user saw inside the frame.
//  3. Encodes WebP via cropToWebp and shows a confirm stage — Retake or
//     Use photo. The result ({ uri, base64, mime }) goes to the caller;
//     uploading stays with the caller.
//  4. Documents and avatars can also come from the gallery: picks are
//     center-cropped to the same aspect and pass through the same confirm
//     stage, so every accepted photo — camera or gallery — fits the frame.
//  5. Camera permission is requested in place; a denial renders an inline
//     explainer with an "Open phone settings" shortcut (no OS popup).
//
// Modes: 'doc' (back camera, torch, gallery) · 'selfie' (front camera,
// no gallery — §33.1 live capture only) · 'avatar' (front camera, gallery).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../../theme';
import BrandLoader from '../../components/brand/BrandLoader';
import {
  centerCropForAspect,
  cropToWebp,
  frameCropForPhoto,
} from './kycShared';

const MODES = {
  doc: {
    facing: 'back',
    shape: 'rect',
    aspect: 16 / 10,
    gallery: true,
    torch: true,
    maxW: 1400,
    title: 'Capture your document',
    hint: 'Position the ID inside the frame — all four corners visible',
    galleryHint: 'Pick a clear, well-lit photo of the document',
  },
  selfie: {
    facing: 'front',
    shape: 'oval',
    aspect: 3 / 4,
    gallery: false,
    torch: false,
    maxW: 900,
    title: 'Take a live selfie',
    hint: 'Center your face in the oval — no hat, no sunglasses',
    galleryHint: '',
  },
  avatar: {
    facing: 'front',
    shape: 'circle',
    aspect: 1,
    gallery: true,
    torch: false,
    maxW: 600,
    title: 'Profile photo',
    hint: 'Center yourself in the circle',
    galleryHint: 'Pick a clear photo where your face is easy to see',
  },
};

// Guide-frame geometry for a container of W×H — a centered rect/oval/circle
// sitting slightly above the middle so the shutter row has room below.
function frameFor(container, mode) {
  if (!container?.width || !container?.height) return null;
  const { width: W, height: H } = container;
  const cfg = MODES[mode];
  const cy = H * (mode === 'doc' ? 0.42 : 0.4);
  if (cfg.shape === 'rect') {
    let w = Math.min(W - 36, 640);
    let h = w / cfg.aspect;
    const maxH = H * 0.52;
    if (h > maxH) {
      h = maxH;
      w = h * cfg.aspect;
    }
    return { x: (W - w) / 2, y: cy - h / 2, width: w, height: h, cx: W / 2, cy };
  }
  let h = Math.min(H * 0.5, 470);
  let w = h * cfg.aspect;
  const maxW = W - 48;
  if (w > maxW) {
    w = maxW;
    h = w / cfg.aspect;
  }
  return { x: (W - w) / 2, y: cy - h / 2, width: w, height: h, cx: W / 2, cy };
}

// SVG path helpers for the scrim (evenodd hole) + outlines.
function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `H ${x + w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V ${y + h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H ${x + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V ${y + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}

function ellipsePath(cx, cy, rx, ry) {
  return [
    `M ${cx - rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`,
    'Z',
  ].join(' ');
}

function holePath(shape, f) {
  if (!f) return '';
  if (shape === 'rect') return roundedRectPath(f.x, f.y, f.width, f.height, 18);
  const rx = f.width / 2;
  const ry = f.height / 2;
  return ellipsePath(f.cx, f.cy, rx, ry);
}

// Gold corner ticks for the document rect — drawn just outside each corner.
function cornerTicksPath(f) {
  if (!f) return '';
  const o = 9; // offset outside the frame
  const l = 26; // tick length
  const { x, y, width: w, height: h } = f;
  return [
    // top-left
    `M ${x - o} ${y - o + l} L ${x - o} ${y - o} L ${x - o + l} ${y - o}`,
    // top-right
    `M ${x + w + o - l} ${y - o} L ${x + w + o} ${y - o} L ${x + w + o} ${y - o + l}`,
    // bottom-right
    `M ${x + w + o} ${y + h + o - l} L ${x + w + o} ${y + h + o} L ${x + w + o - l} ${y + h + o}`,
    // bottom-left
    `M ${x - o + l} ${y + h + o} L ${x - o} ${y + h + o} L ${x - o} ${y + h + o - l}`,
  ].join(' ');
}

export default function GuidedCapture({ visible, mode = 'doc', startWithGallery = false, onClose, onResult }) {
  const cfg = MODES[mode] || MODES.doc;
  const insets = useSafeAreaInsets();
  const camRef = useRef(null);

  const [stage, setStage] = useState('camera'); // camera | confirm
  const [perm, setPerm] = useState(null); // 'granted' | 'denied' | 'undetermined'
  const [container, setContainer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState(null);
  const galleryRef = useRef(startWithGallery);

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setStage('camera');
    setResult(null);
    setError('');
    setTorch(false);
    setBusy(false);
    galleryRef.current = startWithGallery;
    (async () => {
      try {
        const p = await Camera.requestCameraPermissionsAsync();
        const state = p.granted ? 'granted' : 'denied';
        setPerm(state);
        // Gallery auto-start: wait out the modal slide-in so the OS picker
        // never races the animation on Android.
        if (state === 'granted' && galleryRef.current) {
          setTimeout(() => runGallery(), 350);
        }
      } catch {
        setPerm('denied');
      }
    })();
    return undefined;
  }, [visible, mode, startWithGallery]);

  const frame = useMemo(() => frameFor(container, mode), [container, mode]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      /* settings unavailable on this device — ignore */
    }
  }, []);

  async function runGallery() {
    if (busy) return;
    setError('');
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        setError('Photo access is off for Maidora. Enable it in Settings to pick from the gallery.');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // we crop to the guide frame ourselves
        quality: 0.95,
      });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      setBusy(true);
      const rect = centerCropForAspect(a, cfg.aspect);
      const out = await cropToWebp(a, rect, cfg.maxW);
      setResult(out);
      setStage('confirm');
    } catch (e) {
      setError(e?.message || 'Could not load that photo. Try another one.');
    } finally {
      setBusy(false);
    }
  }

  async function shoot() {
    if (busy || !camRef.current) return;
    setError('');
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.95,
        shutterSound: true,
        skipProcessing: false, // keep EXIF orientation handling
      });
      if (!photo?.uri) throw new Error('The camera did not return a photo. Try again.');
      const crop =
        frameCropForPhoto(frame, container, photo) || centerCropForAspect(photo, cfg.aspect);
      if (!crop) throw new Error('Could not crop to the frame. Try again.');
      const out = await cropToWebp(photo, crop, cfg.maxW);
      setResult(out);
      setStage('confirm'); // unmounts the CameraView
    } catch (e) {
      setError(e?.message || 'Capture failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function usePhoto() {
    if (!result) return;
    onClose?.();
    if (onResult) setTimeout(() => onResult(result), 60);
  }

  function backToCamera() {
    setStage('camera');
    setResult(null);
    setShotDims(null);
    setError('');
  }

  function onRequestClose() {
    if (busy) return;
    if (stage === 'confirm') backToCamera();
    else onClose?.();
  }

  const scr = {
    W: container?.width || 0,
    H: container?.height || 0,
    hole: holePath(cfg.shape, frame),
    ticks: cornerTicksPath(frame),
  };

  const confirmW = container ? Math.min(container.width - 36, 430) : 320;
  const confirmH = confirmW / cfg.aspect;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onRequestClose}>
      <StatusBar style="light" />
      <View style={styles.root}>
        {/* ---- camera stage ---- */}
        {stage === 'camera' && perm === 'granted' ? (
          <View
            style={styles.previewWrap}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setContainer((c) => (c && c.width === width && c.height === height ? c : { width, height }));
            }}
          >
            <CameraView
              ref={camRef}
              style={StyleSheet.absoluteFill}
              facing={cfg.facing}
              enableTorch={cfg.torch && torch}
            />

            {/* scrim + guide frame (non-interactive) */}
            {frame ? (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                <Path
                  d={`M 0 0 H ${scr.W} V ${scr.H} H 0 Z ${scr.hole}`}
                  fill="rgba(10,18,13,0.62)"
                  fillRule="evenodd"
                />
                {cfg.shape === 'rect' ? (
                  <>
                    <Path
                      d={scr.hole}
                      stroke="rgba(247,243,239,0.85)"
                      strokeWidth={1.5}
                      fill="none"
                    />
                    <Path d={scr.ticks} stroke={colors.gold} strokeWidth={3.5} fill="none" strokeLinecap="round" />
                  </>
                ) : (
                  <Path
                    d={scr.hole}
                    stroke={colors.gold}
                    strokeWidth={2.5}
                    strokeDasharray="12 9"
                    fill="none"
                  />
                )}
              </Svg>
            ) : null}

            {/* top bar — close / torch */}
            <View style={[styles.topBar, { paddingTop: (insets.top || 12) + 6 }]} pointerEvents="box-none">
              <Pressable style={styles.circleBtn} onPress={() => !busy && onClose?.()} accessibilityLabel="Close camera">
                <Ionicons name="close" size={24} color={colors.cream} />
              </Pressable>
              {cfg.torch ? (
                <Pressable
                  style={[styles.circleBtn, torch && styles.circleBtnActive]}
                  onPress={() => setTorch((t) => !t)}
                  accessibilityLabel="Toggle torch"
                >
                  <Ionicons name="flashlight" size={22} color={colors.cream} />
                </Pressable>
              ) : null}
            </View>

            {/* hint under the frame */}
            {frame ? (
              <View style={[styles.hintPill, { top: frame.y + frame.height + 14 }]} pointerEvents="none">
                <Text style={styles.hintText}>{cfg.hint}</Text>
              </View>
            ) : null}

            {error ? (
              <View style={[styles.hintPill, { top: (frame ? frame.y + frame.height + 52 : container?.height * 0.78), backgroundColor: 'rgba(196,69,60,0.92)' }]} pointerEvents="none">
                <Text style={styles.hintText}>{error}</Text>
              </View>
            ) : null}

            {/* shutter row */}
            <View style={[styles.shutterRow, { paddingBottom: (insets.bottom || 16) + 14 }]} pointerEvents="box-none">
              {cfg.gallery ? (
                <Pressable
                  style={styles.circleBtn}
                  onPress={runGallery}
                  disabled={busy}
                  accessibilityLabel="Choose from gallery"
                >
                  <Ionicons name="images-outline" size={23} color={colors.cream} />
                </Pressable>
              ) : (
                <View style={styles.circleBtnInvisible} />
              )}
              <Pressable
                onPress={shoot}
                disabled={busy}
                style={({ pressed }) => [styles.shutter, busy && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityLabel="Take photo"
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.circleBtnInvisible} />
            </View>

            {busy ? (
              <View style={styles.busyOverlay} pointerEvents="auto">
                <BrandLoader variant="radar" size={54} color={colors.brandSoftLight} track="rgba(247,243,239,0.25)" />
                <Text style={styles.busyText}>Processing…</Text>
              </View>
            ) : null}
          </View>
        ) : stage === 'camera' ? (
          /* permission not granted yet / denied — inline explainer */
          <View style={[styles.centerFill, { paddingTop: insets.top || 12, paddingBottom: insets.bottom || 12 }]}>
            <StatusBar style="light" />
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={34} color={colors.gold} />
            </View>
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permBody}>
              {perm === 'denied'
                ? 'Camera access is off for Maidora. Enable it in phone Settings, then come back and continue.'
                : 'Maidora needs your camera to capture your document and verification selfie.'}
            </Text>
            {perm === 'denied' ? (
              <Pressable style={styles.settingsBtn} onPress={openSettings}>
                <Text style={styles.settingsBtnText}>Open phone settings</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={({ pressed }) => [styles.permCancel, pressed && { opacity: 0.7 }]}>
              <Text style={styles.permCancelText}>Not now</Text>
            </Pressable>
          </View>
        ) : (
          /* ---- confirm stage ---- */
          <View style={[styles.centerFill, { paddingTop: insets.top || 12, paddingBottom: insets.bottom || 12 }]}>
            <Text style={styles.confirmTitle}>Check the photo</Text>
            <Text style={styles.confirmBody}>This is exactly what we will review — cropped to the frame.</Text>

            <View style={[styles.confirmWrap, { width: confirmW, height: confirmH }]}>
              {result ? (
                <Image
                  source={{ uri: result.uri }}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: cfg.shape === 'rect' ? 18 : cfg.shape === 'circle' ? confirmW / 2 : 12,
                  }}
                  resizeMode="cover"
                />
              ) : null}
              {cfg.shape === 'oval' ? (
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Path
                    d={ellipsePath(confirmW / 2, confirmH / 2, confirmW / 2 - 2, confirmH / 2 - 2)}
                    stroke={colors.gold}
                    strokeWidth={2.5}
                    strokeDasharray="12 9"
                    fill="none"
                  />
                </Svg>
              ) : cfg.shape === 'circle' ? (
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Path
                    d={ellipsePath(confirmW / 2, confirmH / 2, confirmW / 2 - 2, confirmH / 2 - 2)}
                    stroke={colors.gold}
                    strokeWidth={2.5}
                    fill="none"
                  />
                </Svg>
              ) : (
                <View style={styles.confirmRectOutline} pointerEvents="none" />
              )}
            </View>

            {error ? <Text style={styles.confirmError}>{error}</Text> : null}

            <View style={styles.confirmRow}>
              <Pressable style={styles.retakeBtn} onPress={backToCamera} disabled={busy}>
                <Ionicons name="camera-outline" size={19} color={colors.cream} />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.useBtn} onPress={usePhoto} disabled={busy}>
                <Ionicons name="checkmark" size={21} color={colors.ink} />
                <Text style={styles.useText}>Use photo</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1712' },
  previewWrap: { flex: 1, overflow: 'hidden' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,23,18,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(247,243,239,0.25)',
  },
  circleBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  circleBtnInvisible: { width: 46, height: 46 },
  hintPill: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    backgroundColor: 'rgba(14,23,18,0.66)',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  hintText: { color: colors.cream, fontSize: 13.5, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  shutterRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 34,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247,243,239,0.22)',
    borderWidth: 3,
    borderColor: colors.gold,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.cream,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,23,18,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: { color: colors.cream, fontSize: 14.5, fontWeight: '700' },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(214,166,79,0.16)',
    marginBottom: 16,
  },
  permTitle: { fontSize: 19, fontWeight: '800', color: colors.cream, textAlign: 'center' },
  permBody: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(247,243,239,0.75)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  settingsBtn: {
    marginTop: 20,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 26,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  permCancel: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 20 },
  permCancelText: { color: 'rgba(247,243,239,0.7)', fontSize: 14.5, fontWeight: '700' },
  confirmTitle: { fontSize: 20, fontWeight: '800', color: colors.cream },
  confirmBody: {
    marginTop: 6,
    fontSize: 13.5,
    color: 'rgba(247,243,239,0.72)',
    textAlign: 'center',
    marginBottom: 22,
  },
  confirmWrap: {
    borderColor: 'rgba(247,243,239,0.2)',
    borderWidth: 1,
  },
  confirmRectOutline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(214,166,79,0.8)',
  },
  confirmError: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 12 },
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 26,
  },
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
