// KYC step 1 — personal details (§33.1 step 2). Prefills from the signup
// name; autosaves the server draft with a 1.5 s debounce; DOB drives the
// age gate (≥ 18, §39.1); gender optional and withholdable.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme';
import { Banner, PrimaryButton, SecondaryButton, TextField } from '../../ui';
import {
  KycShell,
  calcAge,
  formatDate,
  normalizeDobInput,
  normalizeDraft,
} from './kycShared';

export default function KycPersonalScreen({ navigation, route }) {
  const { token } = useApp();
  const draft = normalizeDraft(route.params?.draft);
  const { user } = useApp();

  const [name, setName] = useState(draft.fullNameAsOnId || user?.fullName || '');
  const [idNumber, setIdNumber] = useState(draft.idNumber || '');
  const [dob, setDob] = useState(
    draft.dateOfBirth ? formatDate(draft.dateOfBirth) : ''
  ); // typed as DD-MM-YYYY, normalised on save
  const [gender, setGender] = useState(draft.gender || null);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [busy, setBusy] = useState(false);

  const saveTimer = useRef(null);
  const dirtyRef = useRef(false);

  // Autosave — MPS §33.2: every change written with a short debounce so an
  // abandoned flow always resumes. Fire-and-forget; never blocks typing.
  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const iso = normalizeDobInput(dob);
        await api.kycSaveDraft(
          {
            fullNameAsOnId: name,
            idNumber,
            ...(iso ? { dateOfBirth: iso } : {}),
            ...(gender !== undefined ? { gender } : {}),
          },
          token
        );
        setSaveNote('Saved');
        setTimeout(() => setSaveNote(''), 1500);
      } catch {
        /* silent — validated again on Continue and on submit */
      }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [name, idNumber, dob, gender, token]);

  function touch() {
    dirtyRef.current = true;
  }

  async function onContinue() {
    const errs = {};
    const trimmedName = name.trim().replace(/\s+/g, ' ');
    if (trimmedName.length < 3 || !trimmedName.includes(' ')) {
      errs.name = 'Enter your full name exactly as it appears on your ID.';
    }
    if (!/^[A-Z0-9]{5,16}$/i.test(idNumber.trim())) {
      errs.idNumber = 'Enter your ID or passport number (5–16 characters).';
    }
    const iso = normalizeDobInput(dob);
    if (!iso) {
      errs.dob = 'Enter your date of birth as DD-MM-YYYY.';
    } else {
      const age = calcAge(iso);
      if (age === null || age < 18) {
        errs.dob = 'You must be at least 18 years old to verify your identity.';
      } else if (age > 100) {
        errs.dob = 'Check the year — that age looks incorrect.';
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setBanner('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await api.kycSaveDraft(
        { fullNameAsOnId: trimmedName, idNumber: idNumber.trim(), dateOfBirth: iso, gender },
        token
      );
      navigation.navigate(
        draft.idType ? 'KycDocFront' : 'KycDocType',
        { draft: { ...draft, fullNameAsOnId: trimmedName, idNumber: idNumber.trim(), dateOfBirth: iso, gender } }
      );
    } catch (e) {
      setBanner(e.message || 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const genders = [
    { key: 'female', label: 'Female' },
    { key: 'male', label: 'Male' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
      <KycShell
        step={1}
        title="Personal details"
        subtitle="Exactly as they appear on your ID"
      >
        <Banner kind="error" message={banner} />
        <TextField
          label="Full name as on ID"
          value={name}
          onChangeText={(v) => {
            touch();
            setName(v);
          }}
          error={errors.name}
          autoCapitalize="words"
          placeholder="e.g. Grace Wanjiku Kamau"
        />
        <TextField
          label="ID / passport number"
          value={idNumber}
          onChangeText={(v) => {
            touch();
            setIdNumber(v.toUpperCase());
          }}
          error={errors.idNumber}
          autoCapitalize="characters"
          keyboardType="default"
          placeholder="e.g. 12345678"
        />
        <TextField
          label="Date of birth"
          value={dob}
          onChangeText={(v) => {
            touch();
            setDob(v);
          }}
          error={errors.dob}
          keyboardType="number-pad"
          placeholder="DD-MM-YYYY"
          hint={dob && !errors.dob ? `Used for age filtering — employers see your age only.` : 'Why? Employers filter by age; your full birth date stays private.'}
        />

        <Text style={labelStyle}>Gender (optional)</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          {genders.map((g) => (
            <SecondaryButton
              key={g.key}
              title={g.label}
              onPress={() => {
                touch();
                setGender(g.key);
              }}
              style={[
                chipStyle,
                gender === g.key && chipSelected,
              ]}
            />
          ))}
        </View>
        <Text style={hintStyle}>Withheld by default from employers if you skip it.</Text>

        {saveNote ? <Text style={savedStyle}>{saveNote}</Text> : null}

        <PrimaryButton title="Continue" onPress={onContinue} loading={busy} style={{ marginTop: 14 }} />
      </KycShell>
    </ScrollView>
  );
}

const labelStyle = { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 };
const hintStyle = { fontSize: 12, color: colors.muted, marginBottom: 8 };
const savedStyle = { fontSize: 12, color: colors.forest, alignSelf: 'flex-end', marginTop: 4 };
const chipStyle = { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 };
const chipSelected = { backgroundColor: colors.forest };
