// KYC step 2 — document type (§33.1 step 3). national_id is the default and
// the only type that requires the back side (step 5 skipped otherwise).
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { Banner, PrimaryButton } from '../../ui';
import { KycShell, OptionCard, normalizeDraft } from './kycShared';

const OPTIONS = [
  {
    key: 'national_id',
    icon: 'card-outline',
    title: 'National ID',
    body: 'Recommended — fastest to review. Front and back required.',
  },
  {
    key: 'passport',
    icon: 'airplane-outline',
    title: 'Passport',
    body: 'Photo page only — no back side needed.',
  },
  {
    key: 'drivers_license',
    icon: 'car-sport-outline',
    title: "Driver's license",
    body: 'Both sides required.',
  },
];

export default function KycDocTypeScreen({ navigation, route }) {
  const { token } = useApp();
  const draft = normalizeDraft(route.params?.draft);
  const [idType, setIdType] = useState(draft.idType || 'national_id');
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    setBusy(true);
    setBanner('');
    try {
      await api.kycSaveDraft({ idType }, token);
      navigation.navigate('KycDocFront', { draft: { ...draft, idType } });
    } catch (e) {
      setBanner(e.message || 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <KycShell
        step={2}
        title="Your document type"
        subtitle="What identity document will you use?"
      >
        <Banner kind="error" message={banner} />
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.key}
            icon={o.icon}
            title={o.title}
            body={o.body}
            selected={idType === o.key}
            onPress={() => setIdType(o.key)}
          />
        ))}
        <PrimaryButton title="Continue" onPress={onContinue} loading={busy} style={{ marginTop: 8 }} />
      </KycShell>
    </ScrollView>
  );
}
