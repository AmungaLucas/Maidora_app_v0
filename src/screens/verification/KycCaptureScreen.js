// KYC step 3 — the photo checklist (§33.1 steps 4–6) on ONE screen.
//
// 2026-10-31 rebuild (owner request): "this screen should show the three
// items needed — don't separate them into different screens". The old
// KycDocFront / KycDocBack / KycSelfie screens (and DocCaptureScreen) are
// gone; every capture now happens from this checklist:
//   • ID front, ID back (when the doc type needs it) and the live selfie are
//     listed as cards with thumbnails and per-item status.
//   • Tapping a card opens the guided camera (GuidedCapture) — rect frame
//     for documents, oval for the selfie — which crops the shot to the
//     exact frame before we upload it as WebP (POST /media/kyc/:field).
//   • Documents can also come from the gallery via the brand ActionSheet
//     (the old OS Alert chooser is gone); selfies are live-only.
//   • Uploads stay immediate (the server draft always holds the latest
//     image), so an abandoned flow resumes from the banner with kyc://
//     markers — same contract as before.
// KycReview retakes land here with { focus: 'selfie' | ... } and are sent
// straight into that item's capture; returnTo jumps back to the review.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen } from '../../ui';
import ActionSheet from '../../components/common/ActionSheet';
import {
  IMG_KEY,
  KycShell,
  kycImageSource,
  normalizeDraft,
  s as ks,
} from './kycShared';
import GuidedCapture from './GuidedCapture';
import { kbOf, kycLog } from '../../kycLog';

const ITEM_COPY = {
  id_front: {
    label: 'ID front',
    idSub: 'Front of your document',
    passportSub: 'Photo page of your passport',
  },
  id_back: {
    label: 'ID back',
    idSub: 'Back of the same document',
  },
  selfie: {
    label: 'Live selfie',
    sub: 'Taken now — gallery photos are not accepted',
  },
};

function itemsFor(idType) {
  const items = [{ field: 'id_front' }];
  // The flow always sets a doc type before this screen opens (personal →
  // doc type → capture; retakes carry the draft). If a stale draft ever
  // arrives without one, list the back too (national_id default) so the
  // review step can never be blocked by a hidden, missing image.
  if (idType !== 'passport') items.push({ field: 'id_back' });
  items.push({ field: 'selfie' });
  return items;
}

export default function KycCaptureScreen({ navigation, route }) {
  const { token } = useApp();
  const [draft, setDraft] = useState(() => normalizeDraft(route.params?.draft));
  const returnTo = route.params?.returnTo || null;

  // Per-field capture state: the pending local shot (kept for upload retry)
  // and the upload lifecycle.
  const [shots, setShots] = useState({}); // field -> { uri, base64, mime }
  const [uploadState, setUploadState] = useState({}); // field -> 'uploading' | 'failed'
  const [banner, setBanner] = useState('');

  const [sheetField, setSheetField] = useState(null); // doc item whose chooser is open
  const [cam, setCam] = useState(null); // { mode, startWithGallery }
  const openedFocus = useRef(false);

  const items = itemsFor(draft.idType);

  useEffect(() => {
    kycLog(
      `step 3 · photos checklist — ${items.map((it) => it.field).join(' + ')}` +
        `${returnTo ? ` · returnTo=${returnTo}` : ''}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retake from KycReview: open the focused item's capture immediately.
  useEffect(() => {
    const focus = route.params?.focus;
    if (!focus || openedFocus.current) return;
    openedFocus.current = true;
    navigation.setParams({ focus: null });
    kycLog(`review retake → ${focus} (opening capture)`);
    openCapture(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.focus]);

  function openCapture(field) {
    setBanner('');
    kycLog(
      `capture open · ${field}` + (field === 'selfie' ? ' (live selfie — gallery off)' : ' (source sheet)')
    );
    if (field === 'selfie') {
      setCam({ field, mode: 'selfie', startWithGallery: false });
    } else {
      setSheetField(field);
    }
  }

  async function upload(field, shot) {
    setUploadState((m) => ({ ...m, [field]: 'uploading' }));
    setBanner('');
    const t0 = Date.now();
    try {
      await api.mediaKycUpload(field, shot.base64, shot.mime, token);
      kycLog(`upload OK · ${field} in ${Date.now() - t0}ms (${kbOf(shot.base64)} ${shot.mime})`);
      setDraft((d) => ({ ...d, images: { ...d.images, [IMG_KEY[field]]: shot.uri } }));
      setUploadState((m) => ({ ...m, [field]: 'idle' }));
      return true;
    } catch (e) {
      kycLog(`upload FAILED · ${field} after ${Date.now() - t0}ms — ${e.message || e}`);
      setUploadState((m) => ({ ...m, [field]: 'failed' }));
      setBanner(
        (e.message || 'Upload failed. Check your connection and try again.') +
          ' Your photo is kept on this screen — tap the item to retry.'
      );
      return false;
    }
  }

  function onGuidedResult(shot) {
    const field = cam?.field;
    if (!field || !shot) return;
    kycLog(`shot ready · ${field} ${shot.mime || '?'} ${kbOf(shot.base64)} → upload`);
    setShots((m) => ({ ...m, [field]: shot }));
    upload(field, shot);
  }

  function statusFor(field) {
    if (uploadState[field] === 'uploading') return 'uploading';
    const uploaded = !!draft.images[IMG_KEY[field]] && uploadState[field] !== 'failed';
    if (uploaded) return 'done';
    if (uploadState[field] === 'failed' && shots[field]) return 'failed';
    return 'todo';
  }

  const allDone = items.every((it) => statusFor(it.field) === 'done');
  const anyUploading = items.some((it) => statusFor(it.field) === 'uploading');

  function onContinue() {
    if (!allDone) {
      kycLog(`photos: continue blocked — not done: ${items.filter((it) => statusFor(it.field) !== 'done').map((it) => it.field).join(', ')}`);
      setBanner('Capture every photo above — we upload each one before the review.');
      return;
    }
    kycLog(`photos: all done → ${returnTo || 'KycReview'}`);
    if (returnTo) navigation.navigate(returnTo, { draft });
    else navigation.navigate('KycReview', { draft });
  }

  function subFor(field) {
    if (field === 'id_front') {
      return draft.idType === 'passport' ? ITEM_COPY.id_front.passportSub : ITEM_COPY.id_front.idSub;
    }
    if (field === 'id_back') return ITEM_COPY.id_back.idSub;
    return ITEM_COPY.selfie.sub;
  }

  return (
    <Screen keyboard={false}>
      <KycShell
        step={3}
        title="Your photos"
        subtitle="Front and back of your ID, then a live selfie — all in one place"
      >
        <Banner kind="error" message={banner} />

        <View style={styles.listCard}>
          {items.map((it, i) => (
            <CaptureItem
              key={it.field}
              field={it.field}
              label={ITEM_COPY[it.field].label}
              sub={subFor(it.field)}
              status={statusFor(it.field)}
              source={kycImageSource(draft.images[IMG_KEY[it.field]], it.field, token)}
              isLast={i === items.length - 1}
              onPress={() => openCapture(it.field)}
              onRetryUpload={() => shots[it.field] && upload(it.field, shots[it.field])}
            />
          ))}
        </View>

        <View style={ks.tipsCard}>
          <Text style={ks.tipsTitle}>Tips</Text>
          <Text style={ks.tipsText}>• Good light, no flash glare — every detail readable</Text>
          <Text style={ks.tipsText}>• Fill the frame — the guide crops the photo exactly</Text>
          <Text style={ks.tipsText}>• Selfie: face the camera directly, no hat or sunglasses</Text>
        </View>

        <PrimaryButton
          title={returnTo ? 'Back to review' : 'Continue to review'}
          onPress={onContinue}
          disabled={anyUploading || !allDone}
          style={{ marginTop: 4 }}
        />
        {!allDone ? (
          <Text style={styles.footnote}>All photos are uploaded before the review step opens.</Text>
        ) : null}
      </KycShell>

      {/* chooser for document items — replaces the old OS Alert popup */}
      <ActionSheet
        visible={!!sheetField}
        title="Add photo"
        subtitle="How would you like to add it?"
        onClose={() => setSheetField(null)}
        options={[
          {
            key: 'camera',
            icon: 'camera-outline',
            label: 'Take photo',
            sub: 'Follow the on-screen guide frame',
            onPress: () => {
              kycLog(`source · ${sheetField} → camera`);
              setCam({ field: sheetField, mode: 'doc', startWithGallery: false });
            },
          },
          {
            key: 'gallery',
            icon: 'images-outline',
            label: 'Choose from gallery',
            sub: 'Center-cropped to the same frame',
            onPress: () => {
              kycLog(`source · ${sheetField} → gallery`);
              setCam({ field: sheetField, mode: 'doc', startWithGallery: true });
            },
          },
        ]}
      />

      {/* guided in-app camera — doc rect / selfie oval, exact crop, WebP */}
      <GuidedCapture
        visible={!!cam}
        mode={cam?.mode || 'doc'}
        startWithGallery={!!cam?.startWithGallery}
        onClose={() => setCam(null)}
        onResult={onGuidedResult}
      />
    </Screen>
  );
}

function CaptureItem({ field, label, sub, status, source, isLast, onPress, onRetryUpload }) {
  const isSelfie = field === 'selfie';
  const chip =
    status === 'done'
      ? { icon: 'checkmark-circle', text: 'Added', bg: colors.brandSoftBg, fg: colors.forest }
      : status === 'uploading'
      ? { icon: 'cloud-upload-outline', text: 'Uploading', bg: colors.goldSoft, fg: colors.goldDark }
      : status === 'failed'
      ? { icon: 'alert-circle', text: 'Upload failed', bg: colors.dangerSoft, fg: colors.danger }
      : { icon: 'ellipse-outline', text: 'Needed', bg: colors.goldSoft, fg: colors.goldDark };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemRow, !isLast && styles.itemDivider, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${label} — ${chip.text}`}
    >
      <View style={[styles.thumb, isSelfie && styles.thumbRound]}>
        {source ? (
          <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Ionicons name={isSelfie ? 'person-circle-outline' : 'scan-outline'} size={30} color={colors.brandSoft} />
        )}
        {status === 'uploading' ? (
          <View style={styles.thumbBusy}>
            <ActivityIndicator size="small" color={colors.cream} />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemSub}>{sub}</Text>
        {status === 'failed' ? (
          <Pressable hitSlop={6} onPress={onRetryUpload}>
            <Text style={styles.retryLink}>Try upload again</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.chip, { backgroundColor: chip.bg }]}>
        <Ionicons name={chip.icon} size={14} color={chip.fg} />
        <Text style={[styles.chipText, { color: chip.fg }]}>{chip.text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  thumb: {
    width: 86,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(33,78,59,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbRound: { width: 56, height: 56, borderRadius: 28 },
  thumbBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,38,29,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  itemSub: { fontSize: 12.5, color: colors.muted, marginTop: 2, lineHeight: 17 },
  retryLink: { fontSize: 12.5, fontWeight: '800', color: colors.forest, marginTop: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: 11.5, fontWeight: '800' },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});
