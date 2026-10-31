// KYC step 1 — personal details (§33.1 step 2). Prefills from the signup
// name and, when the KYC draft is empty, from the §7 profile (DOB + gender
// live there too — same lowercase enum, so they map 1:1). Autosaves the
// server draft with a 1.5 s debounce; DOB drives the age gate (≥ 18, §39.1);
// gender optional and withholdable.
//
// 2026-10-31 fixes (owner live report):
//  - DOB was never FETCHED: the screen only read the KYC draft, while the
//    §7 profile wizard stores DOB/gender in the profile tables. Now both
//    prefills flow in (draft wins, profile fills the gaps).
//  - DOB state is now the ISO string (YYYY-MM-DD) and only RENDERED via
//    formatDate — previously the display string ("12 Mar 2002") was fed
//    back into normalizeDobInput (which parses DD-MM-YYYY / YYYY-MM-DD
//    only), so EVERY picker-chosen or prefilled DOB failed Continue with
//    an error that was never rendered — the screen looked dead. ISO is now
//    the single source of truth and validation is a straight regex.
//  - errors.dob is now actually rendered (red text + red field border).
//  - Gender pills rebuilt: the old SecondaryButton chips turned dark
//    forest-on-dark-forest when selected (unreadable). New pills: icon +
//    label, forest fill + cream text + check when selected, tap again to
//    un-select (withhold).
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen, TextField } from '../../ui';
import DatePickerModal from '../../components/common/DatePickerModal';
import {
  KycShell,
  calcAge,
  formatDate,
  normalizeDraft,
} from './kycShared';

export default function KycPersonalScreen({ navigation, route }) {
  const { token } = useApp();
  const draft = normalizeDraft(route.params?.draft);
  const { user } = useApp();

  const [name, setName] = useState(draft.fullNameAsOnId || user?.fullName || '');
  const [idNumber, setIdNumber] = useState(draft.idNumber || '');
  // DOB — single source of truth is the ISO string; the field only DISPLAYS
  // formatDate(iso). Never round-trip the display string through the parser.
  const [dob, setDob] = useState(draft.dateOfBirth || '');
  const [gender, setGender] = useState(draft.gender || null);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);

  const saveTimer = useRef(null);
  const dirtyRef = useRef(false);

  // §7 profile prefill — when the KYC draft lacks DOB/gender, the profile
  // wizard may already hold them (same lowercase enum). Fills ONLY empty
  // fields and never marks the form dirty (the autosave stays quiet until
  // the user actually edits; Continue persists the prefill).
  useEffect(() => {
    let alive = true;
    if (draft.dateOfBirth && draft.gender) return undefined; // draft is complete
    (async () => {
      try {
        const res = await api.getProfile(token);
        const p = res && res.profile;
        if (!p || !alive) return;
        if (!draft.dateOfBirth && p.dateOfBirth) {
          setDob((cur) => cur || p.dateOfBirth);
        }
        if (!draft.gender && p.gender) {
          setGender((cur) => cur || p.gender);
        }
      } catch {
        /* prefill is a convenience — validation still guards the flow */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Autosave — MPS §33.2: every change written with a short debounce so an
  // abandoned flow always resumes. Fire-and-forget; never blocks typing.
  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.kycSaveDraft(
          {
            fullNameAsOnId: name,
            idNumber,
            ...(dob ? { dateOfBirth: dob } : {}),
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
    // dob IS the ISO string — no parsing of display text here (that was the
    // silent-Continue bug). The regex mirrors the server's own check.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errs.dob = 'Pick your date of birth to continue.';
    } else {
      const age = calcAge(dob);
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
        { fullNameAsOnId: trimmedName, idNumber: idNumber.trim(), dateOfBirth: dob, gender },
        token
      );
      navigation.navigate(
        draft.idType ? 'KycCapture' : 'KycDocType',
        { draft: { ...draft, fullNameAsOnId: trimmedName, idNumber: idNumber.trim(), dateOfBirth: dob, gender } }
      );
    } catch (e) {
      setBanner(e.message || 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const genders = [
    { key: 'female', label: 'Female', icon: 'female-outline' },
    { key: 'male', label: 'Male', icon: 'male-outline' },
    { key: 'other', label: 'Other', icon: 'person-outline' },
  ];

  return (
    // Screen = SafeAreaView + status-bar/nav-bar insets — the KYC screens
    // used to render raw ScrollViews and sat edge-to-edge under both bars.
    <Screen>
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
        {/* DOB — 3-step picker popup (year → month → day), consistent with §7.
            The field displays formatDate(iso); the ISO string is the state. */}
        <Text style={labelStyle}>Date of birth</Text>
        <Pressable
          style={[styles.pickerField, errors.dob && styles.pickerFieldError]}
          onPress={() => setDobPickerOpen(true)}
        >
          <Text style={[styles.pickerFieldText, !dob && styles.pickerFieldPlaceholder]}>
            {dob ? formatDate(dob) : 'Pick your date of birth'}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={errors.dob ? colors.danger : colors.brand} />
        </Pressable>
        {errors.dob ? (
          <Text style={dobErrorStyle}>{errors.dob}</Text>
        ) : (
          <Text style={hintStyle}>
            {dob
              ? 'Used for identity verification and age checks.'
              : 'Your full birth date stays private — others see only your age.'}
          </Text>
        )}

        <Text style={labelStyle}>Gender (optional)</Text>
        <View style={styles.genderRow}>
          {genders.map((g) => {
            const selected = gender === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => {
                  touch();
                  // tap the selected pill again to withhold
                  setGender((cur) => (cur === g.key ? null : g.key));
                }}
                style={({ pressed }) => [
                  styles.genderPill,
                  selected && styles.genderPillSelected,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Gender: ${g.label}`}
              >
                <Ionicons
                  name={g.icon}
                  size={18}
                  color={selected ? colors.cream : colors.forest}
                />
                <Text style={[styles.genderPillText, selected && styles.genderPillTextSelected]}>
                  {g.label}
                </Text>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={17}
                  color={selected ? colors.cream : colors.line}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={hintStyle}>
          {gender
            ? 'Tap the selected option again to withhold it from employers.'
            : 'Withheld by default from employers if you skip it.'}
        </Text>

        {saveNote ? <Text style={savedStyle}>{saveNote}</Text> : null}

        <PrimaryButton title="Continue" onPress={onContinue} loading={busy} style={{ marginTop: 14 }} />
      </KycShell>

      <DatePickerModal
        visible={dobPickerOpen}
        initialDate={dob}
        title="Your date of birth"
        minAge={18}
        maxAge={100}
        onClose={() => setDobPickerOpen(false)}
        onConfirm={(iso) => {
          touch();
          setDob(iso); // ISO stays the state — display goes through formatDate
          setErrors((e) => ({ ...e, dob: undefined }));
          setDobPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 8,
  },
  pickerFieldError: { borderColor: colors.danger, borderWidth: 1.5 },
  pickerFieldText: { flex: 1, fontSize: 16, color: colors.ink },
  pickerFieldPlaceholder: { color: colors.muted },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  genderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  genderPillSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  genderPillText: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  genderPillTextSelected: { color: colors.cream },
});

const labelStyle = { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 };
const hintStyle = { fontSize: 12, color: colors.muted, marginBottom: 8 };
const dobErrorStyle = { fontSize: 12.5, fontWeight: '600', color: colors.danger, marginBottom: 8 };
const savedStyle = { fontSize: 12, color: colors.forest, alignSelf: 'flex-end', marginTop: 4 };
