// KYC steps 3–5 — image capture (§33.1 steps 4–6), one parameterised screen
// for document front / document back / selfie. Captures, converts to WebP,
// uploads immediately (so the server draft always has the latest image) and
// keeps a local preview for the review step. `returnTo: 'KycReview'` jumps
// back after a retake instead of walking the whole chain again.
//
// FIELD CONTRACT (fixed 2026-10-31): the wrapper screens (KycDocFront /
// KycDocBack / KycSelfie) pass the capture target as a PROP — the root
// navigator's route params only ever carry `{ draft }`. This screen used to
// read `route.params?.field`, got `undefined` on the normal forward flow and
// crashed with "Cannot read property 'step' of undefined" the moment the
// user reached step 3. It now reads the prop first with a params fallback,
// and an unknown field renders a graceful fallback instead of crashing.
//
// DRAFT IMAGE KEYS: the draft stores images under camelCase keys
// (idFront/idBack/selfie — see emptyDraft()) while the SERVER field names
// are snake_case (id_front/id_back/selfie — the /kyc/images and /media/kyc
// contracts and the `kyc://field` markers). IMG_KEY in kycShared maps
// between them; the raw `field` is used only for API calls and markers.
import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton } from '../../ui';
import {
  IMG_KEY,
  KycShell,
  captureDocument,
  captureSelfie,
  kycImageSource,
  normalizeDraft,
  s as ks,
} from './kycShared';

const CONFIG = {
  id_front: {
    step: 3,
    title: 'Document front',
    body: 'Place your document on a flat surface and capture the front.',
    tips: ['Fill the frame — all four corners visible', 'Good light, no flash glare', 'Hold steady until the photo is sharp'],
    next: (draft) =>
      ['national_id', 'drivers_license'].includes(draft.idType) ? 'KycDocBack' : 'KycSelfie',
  },
  id_back: {
    step: 4,
    title: 'Document back',
    body: 'Now capture the back of your document.',
    tips: ['Same lighting as the front', 'All details readable'],
    next: () => 'KycSelfie',
  },
  selfie: {
    step: 5,
    title: 'Live selfie',
    body: 'Look straight into the camera in good light. This matches your face to your ID.',
    tips: ['No hats or sunglasses', 'Face the camera directly', 'Taken live — gallery photos are not accepted'],
    // Selfie is the last capture — Continue lands on the review step.
    next: () => 'KycReview',
  },
};

export default function DocCaptureScreen({ navigation, route, field: fieldProp }) {
  const { token } = useApp();
  // Prop first (the wrappers), route params as a fallback for deep links.
  const field = fieldProp || route.params?.field || null;
  const cfg = field ? CONFIG[field] : null;
  const draft = normalizeDraft(route.params?.draft);
  const returnTo = route.params?.returnTo || null;
  const imgKey = field ? IMG_KEY[field] : null;

  const [localUri, setLocalUri] = useState(
    imgKey && draft.images[imgKey] && !draft.images[imgKey].startsWith('kyc://')
      ? draft.images[imgKey]
      : null
  );
  const [hasRemote, setHasRemote] = useState(!!(imgKey && draft.images[imgKey]));
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState('');

  // Graceful fallback — never crash on a bad field (defence in depth; the
  // wrappers always pass a valid one).
  if (!cfg) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.cream }}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.goldDark} />
        <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
          This capture step could not be opened
        </Text>
        <Text style={{ marginTop: 6, fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
          Go back and continue your verification from the start of the photo steps.
        </Text>
        <PrimaryButton title="Go back" onPress={() => navigation.goBack()} style={{ marginTop: 18, alignSelf: 'stretch' }} />
      </View>
    );
  }

  async function onCapture() {
    setBanner('');
    const shot = field === 'selfie' ? await captureSelfie() : await captureDocument();
    if (!shot) return;
    setLocalUri(shot.uri);
    setUploading(true);
    try {
      await api.mediaKycUpload(field, shot.base64, shot.mime, token);
      setHasRemote(true);
    } catch (e) {
      setBanner(e.message || 'Upload failed. Check your connection and try again.');
      setHasRemote(false);
    } finally {
      setUploading(false);
    }
  }

  function onContinue() {
    if (!hasRemote) {
      setBanner(field === 'selfie'
        ? 'Take your selfie first — we upload it before continuing.'
        : 'Capture the photo first — we upload it before continuing.');
      return;
    }
    const nextDraft = {
      ...draft,
      images: { ...draft.images, [imgKey]: localUri || draft.images[imgKey] },
    };
    if (returnTo) return navigation.navigate(returnTo, { draft: nextDraft });
    navigation.navigate(cfg.next(nextDraft), { draft: nextDraft });
  }

  const remoteUri = imgKey ? draft.images[imgKey] : null;
  const previewSource = localUri
    ? { uri: localUri }
    : hasRemote
    ? kycImageSource(remoteUri, field, token)
    : null;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <KycShell step={cfg.step} title={cfg.title} subtitle={cfg.body}>
        <Banner kind="error" message={banner} />

        <View style={ks.captureFrame}>
          {previewSource ? (
            <Image
              source={previewSource}
              style={[ks.capturePreview, field === 'selfie' && { resizeMode: 'cover' }]}
            />
          ) : (
            <>
              <Ionicons
                name={field === 'selfie' ? 'person-circle-outline' : 'scan-outline'}
                size={64}
                color={colors.brandSoft}
              />
              <Text style={ks.captureTitle}>{field === 'selfie' ? 'Take a live selfie' : 'Capture the document'}</Text>
              <Text style={ks.captureBody}>
                {field === 'selfie'
                  ? 'Your selfie is compared with your ID photo during review.'
                  : 'Lay the document flat and fill the frame.'}
              </Text>
            </>
          )}
        </View>

        <View style={ks.tipsCard}>
          <Text style={ks.tipsTitle}>Tips</Text>
          {cfg.tips.map((t) => (
            <Text key={t} style={ks.tipsText}>• {t}</Text>
          ))}
        </View>

        <SecondaryButton
          title={previewSource ? 'Retake photo' : field === 'selfie' ? 'Open camera' : 'Add photo'}
          onPress={onCapture}
          style={{ marginBottom: 10 }}
        />
        {uploading ? <Text style={uploadStyle}>Uploading…</Text> : null}
        <PrimaryButton title="Continue" onPress={onContinue} disabled={uploading} />
      </KycShell>
    </ScrollView>
  );
}

const uploadStyle = { fontSize: 12.5, color: colors.muted, alignSelf: 'center', marginBottom: 8 };
