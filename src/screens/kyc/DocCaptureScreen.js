// KYC steps 3–5 — image capture (§33.1 steps 4–6), one parameterised screen
// for document front / document back / selfie. Captures, compresses, uploads
// immediately (so the server draft always has the latest image) and keeps a
// local preview for the review step. `returnTo: 'Review'` jumps back after
// a retake instead of walking the whole chain again.
import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton } from '../../ui';
import {
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
  },
};

export default function DocCaptureScreen({ navigation, route }) {
  const { token } = useApp();
  const field = route.params?.field;
  const cfg = CONFIG[field];
  const draft = normalizeDraft(route.params?.draft);
  const returnTo = route.params?.returnTo || null;

  const [localUri, setLocalUri] = useState(
    draft.images[field] && !draft.images[field].startsWith('kyc://') ? draft.images[field] : null
  );
  const [hasRemote, setHasRemote] = useState(!!draft.images[field]);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState('');

  async function onCapture() {
    setBanner('');
    const shot = field === 'selfie' ? await captureSelfie() : await captureDocument();
    if (!shot) return;
    setLocalUri(shot.uri);
    setUploading(true);
    try {
      await api.kycUploadImage(field, shot.base64, shot.mime, token);
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
    const nextDraft = { ...draft, images: { ...draft.images, [field]: localUri || draft.images[field] } };
    if (returnTo) return navigation.navigate(returnTo, { draft: nextDraft });
    navigation.navigate(cfg.next(nextDraft), { draft: nextDraft });
  }

  const previewSource = localUri
    ? { uri: localUri }
    : hasRemote
    ? kycImageSource(draft.images[field], field, token)
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
