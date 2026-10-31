// KYC step 6 — review (§33.1 step 7): every field and image, retake per
// item (returns straight back here), then submit → /kyc/submit.
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton } from '../../ui';
import {
  ID_TYPE_LABELS,
  IMG_KEY,
  KycShell,
  formatDate,
  kycImageSource,
  normalizeDraft,
  s as ks,
} from './kycShared';

export default function KycReviewScreen({ navigation, route }) {
  const { token, user, updateUser } = useApp();
  const draft = normalizeDraft(route.params?.draft);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState('');

  async function onSubmit() {
    setSubmitting(true);
    setBanner('');
    try {
      await api.kycSubmit(token);
      // Optimistically reflect the new state (server truth on next /me).
      await updateUser({ ...user, kycStatus: 'submitted', kycRejectionReason: null }, token);
      // Replace (not push) so Android back doesn't land on the review form.
      navigation.replace('KycDone', { urgent: draft.urgent });
    } catch (e) {
      setBanner(e.message || 'Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function retake(target) {
    navigation.navigate(target, { draft, returnTo: 'KycReview' });
  }

  const rows = [
    { label: 'Full name', value: draft.fullNameAsOnId, target: 'KycPersonal' },
    { label: 'ID number', value: draft.idNumber, target: 'KycPersonal' },
    {
      label: 'Date of birth',
      value: draft.dateOfBirth ? formatDate(draft.dateOfBirth) : null,
      target: 'KycPersonal',
    },
    { label: 'Gender', value: draft.gender ? draft.gender[0].toUpperCase() + draft.gender.slice(1) : 'Withheld', target: 'KycPersonal' },
    { label: 'Document', value: ID_TYPE_LABELS[draft.idType] || null, target: 'KycDocType' },
  ];

  const images = [
    { label: 'Document front', field: 'id_front', target: 'KycDocFront', thumb: ks.reviewThumb },
    { label: 'Document back', field: 'id_back', target: 'KycDocBack', thumb: ks.reviewThumb },
    { label: 'Selfie', field: 'selfie', target: 'KycSelfie', thumb: ks.reviewThumbSelfie },
  ].filter((i) => i.field !== 'id_back' || draft.idType === 'national_id' || draft.images[IMG_KEY.id_back]);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <KycShell
        step={6}
        title="Review your submission"
        subtitle="Check everything — retake any item before submitting"
      >
        <Banner kind="error" message={banner} />

        <View style={ks.reviewCard}>
          {rows.map((r, i) => (
            <View key={r.label}>
              {i > 0 ? <View style={ks.reviewDivider} /> : null}
              <View style={ks.reviewRow}>
                <Text style={ks.reviewLabel}>{r.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={ks.reviewValue} numberOfLines={1}>
                    {r.value || '—'}
                  </Text>
                  {r.target === 'KycPersonal' ? (
                    <Pressable hitSlop={8} onPress={() => navigation.navigate('KycPersonal', { draft })}>
                      <Text style={ks.retakeLink}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={ks.reviewCard}>
          {images.map((img, i) => (
            <View key={img.field}>
              {i > 0 ? <View style={ks.reviewDivider} /> : null}
              <View style={ks.reviewImgRow}>
                <Image source={kycImageSource(draft.images[IMG_KEY[img.field]], img.field, token)} style={img.thumb} resizeMode="cover" />
                <Text style={[ks.reviewLabel, { flex: 1 }]}>{img.label}</Text>
                <Pressable hitSlop={8} onPress={() => retake(img.target)}>
                  <Text style={ks.retakeLink}>Retake</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <PrimaryButton
          title="Submit for review"
          onPress={onSubmit}
          loading={submitting}
          loadingLabel="Submitting"
          success={submitting}
          successLabel="Submitting"
        />
        <Text style={footnote}>
          By submitting you confirm the details match your genuine identity document. False
          submissions can permanently lose the Trust Badge.
        </Text>
      </KycShell>
    </ScrollView>
  );
}

const footnote = {
  fontSize: 12,
  color: colors.muted,
  textAlign: 'center',
  marginTop: 12,
  lineHeight: 18,
  paddingHorizontal: 8,
};
