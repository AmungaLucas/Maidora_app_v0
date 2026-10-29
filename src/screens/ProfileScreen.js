// Profile — shared by both roles. "Change my role" stays ONLY inside Settings.
// Househelp accounts additionally get the §7 profile-completeness card:
// non-blocking banner + inline editor (DOB, languages, job type, experience,
// next of kin). Filled fields autofill into KYC later (spec §7 → §8 order).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader, TextField } from '../ui';

const LANGUAGES = [
  'English', 'Kiswahili', 'Kikuyu', 'Luo', 'Luhya', 'Kamba', 'Kisii',
  'Meru', 'Mijikenda', 'Maasai', 'Somali', 'Taita', 'Turkana', 'Other',
];
const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

export default function ProfileScreen({ navigation }) {
  const { user, token, signOut } = useApp();
  const isHousehelp = user?.role === 'househelp';

  const [profile, setProfile] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [form, setForm] = useState({
    dateOfBirth: '',
    gender: '',
    languages: [],
    jobType: null,
    yearsExperience: '',
    wageExpectation: '',
    bio: '',
    nokName: '',
    nokPhone: '',
    nokRelationship: '',
  });

  useEffect(() => {
    if (!isHousehelp || !token) return;
    (async () => {
      try {
        const res = await api.getProfile(token);
        setProfile(res.profile);
        setCompleteness(res.completeness);
        hydrateForm(res.profile);
      } catch {
        // Non-blocking: the profile card simply shows the default state.
      }
    })();
  }, [isHousehelp, token]);

  const hydrateForm = (p) => {
    if (!p) return;
    setForm({
      dateOfBirth: p.dateOfBirth || '',
      gender: p.gender || '',
      languages: p.languages || [],
      jobType: p.jobType || null,
      yearsExperience: p.yearsExperience === null || p.yearsExperience === undefined ? '' : String(p.yearsExperience),
      wageExpectation: p.wageExpectation === null || p.wageExpectation === undefined ? '' : String(p.wageExpectation),
      bio: p.bio || '',
      nokName: p.nextOfKin?.name || '',
      nokPhone: p.nextOfKin?.phone || '',
      nokRelationship: p.nextOfKin?.relationship || '',
    });
  };

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const toggleLanguage = (lang) =>
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(lang)
        ? f.languages.filter((l) => l !== lang)
        : f.languages.length >= 8
          ? f.languages
          : [...f.languages, lang],
    }));

  const saveProfile = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMessage('');
    setSavedNote('');
    try {
      const res = await api.saveProfile(
        {
          dateOfBirth: form.dateOfBirth.trim(),
          gender: form.gender || undefined,
          languages: form.languages,
          jobType: form.jobType || undefined,
          yearsExperience: form.yearsExperience.trim(),
          wageExpectation: form.wageExpectation.trim() || undefined,
          bio: form.bio.trim() || undefined,
          nextOfKin: {
            name: form.nokName.trim(),
            phone: form.nokPhone.trim(),
            relationship: form.nokRelationship.trim(),
          },
        },
        token
      );
      setProfile(res.profile);
      setCompleteness(res.completeness);
      hydrateForm(res.profile);
      setEditing(false);
      setSavedNote(
        res.completeness.complete
          ? 'Your profile is complete. Employers can see everything they need.'
          : `Saved. ${res.completeness.done} of ${res.completeness.total} done.`
      );
    } catch (e) {
      setErrorMessage(e.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initials = String(user?.fullName || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader eyebrow="Account" title="Profile" />

        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
            <View style={styles.avatarRing} />
          </View>
          <Text style={styles.name}>{user?.fullName}</Text>
          <View style={styles.roleBadge}>
            <Ionicons
              name={user?.role === 'househelp' ? 'sparkles' : 'home'}
              size={12}
              color={colors.goldDark}
            />
            <Text style={styles.roleBadgeText}>{ROLES[user?.role] || 'Member'}</Text>
          </View>
          <Text style={styles.contact}>{user?.phone}</Text>
          <Text style={styles.contact}>{user?.email}</Text>
          <View style={styles.verificationRow}>
            <View style={[styles.vChip, user?.phoneVerified && styles.vChipOk]}>
              <Ionicons
                name={user?.phoneVerified ? 'checkmark-circle' : 'alert-circle'}
                size={13}
                color={user?.phoneVerified ? colors.forest : colors.goldDark}
              />
              <Text style={[styles.vChipText, user?.phoneVerified && styles.vChipTextOk]}>
                {user?.phoneVerified ? 'Phone verified' : 'Phone unverified'}
              </Text>
            </View>
            <View style={[styles.vChip, user?.emailVerified && styles.vChipOk]}>
              <Ionicons
                name={user?.emailVerified ? 'checkmark-circle' : 'alert-circle'}
                size={13}
                color={user?.emailVerified ? colors.forest : colors.goldDark}
              />
              <Text style={[styles.vChipText, user?.emailVerified && styles.vChipTextOk]}>
                {user?.emailVerified ? 'Email verified' : 'Email unverified'}
              </Text>
            </View>
          </View>
        </View>

        {isHousehelp ? (
          <View style={styles.completenessCard}>
            <View style={styles.completenessHead}>
              <Ionicons name="ribbon-outline" size={20} color={colors.brand} />
              <Text style={styles.completenessTitle}>Profile strength</Text>
              <Text style={styles.completenessCount}>
                {completeness ? `${completeness.done}/${completeness.total}` : '–/5'}
              </Text>
            </View>
            <Text style={styles.completenessBody}>
              {completeness && completeness.complete
                ? 'Complete. Employers see everything they need to trust and hire you.'
                : 'Add a few details so employers can find and trust you. This never blocks you from applying.'}
            </Text>
            {completeness && !completeness.complete ? (
              <View style={styles.missingWrap}>
                {completeness.missing.map((m) => (
                  <View key={m} style={styles.missingChip}>
                    <Text style={styles.missingChipText}>{m}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {savedNote ? <Banner kind="info" message={savedNote} /> : null}

            {!editing ? (
              <PrimaryButton
                title={completeness && completeness.complete ? 'Edit my details' : 'Complete my profile'}
                onPress={() => {
                  hydrateForm(profile);
                  setEditing(true);
                }}
              />
            ) : (
              <View style={styles.editor}>
                <Banner message={errorMessage} />
                <TextField
                  label="Date of birth"
                  value={form.dateOfBirth}
                  onChangeText={set('dateOfBirth')}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  hint="Used for age filtering. e.g. 1998-04-23"
                />
                <Text style={styles.groupLabel}>Gender (optional)</Text>
                <View style={styles.chipRow}>
                  {['female', 'male', 'other'].map((g) => (
                    <Chip key={g} label={g} active={form.gender === g} onPress={() => set('gender')(g)} />
                  ))}
                </View>
                <Text style={styles.groupLabel}>Languages spoken</Text>
                <View style={styles.chipRow}>
                  {LANGUAGES.map((l) => (
                    <Chip
                      key={l}
                      label={l}
                      active={form.languages.includes(l)}
                      onPress={() => toggleLanguage(l)}
                    />
                  ))}
                </View>
                <Text style={styles.groupLabel}>Job type</Text>
                <View style={styles.chipRow}>
                  {JOB_TYPES.map((j) => (
                    <Chip
                      key={j.value}
                      label={j.label}
                      active={form.jobType === j.value}
                      onPress={() => set('jobType')(j.value)}
                    />
                  ))}
                </View>
                <TextField
                  label="Years of experience"
                  value={form.yearsExperience}
                  onChangeText={(v) => set('yearsExperience')(v.replace(/\D/g, '').slice(0, 2))}
                  placeholder="e.g. 4"
                  keyboardType="number-pad"
                />
                <TextField
                  label="Wage expectation (KES, optional)"
                  value={form.wageExpectation}
                  onChangeText={(v) => set('wageExpectation')(v.replace(/\D/g, '').slice(0, 7))}
                  placeholder="e.g. 15000"
                  keyboardType="number-pad"
                  hint="Per month. You can change this any time."
                />
                <Text style={styles.groupLabel}>Next of kin / contact person</Text>
                <TextField
                  label="Full name"
                  value={form.nokName}
                  onChangeText={set('nokName')}
                  placeholder="e.g. Mary Achieng"
                  autoCapitalize="words"
                />
                <TextField
                  label="Phone number"
                  value={form.nokPhone}
                  onChangeText={set('nokPhone')}
                  placeholder="0712 345 678"
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Relationship"
                  value={form.nokRelationship}
                  onChangeText={set('nokRelationship')}
                  placeholder="e.g. sister"
                  autoCapitalize="words"
                />
                <View style={styles.editorButtons}>
                  <Pressable onPress={() => setEditing(false)} style={styles.cancelBtn} hitSlop={8}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Save profile" onPress={saveProfile} loading={saving} />
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : null}

        <Pressable style={styles.row} onPress={() => navigation.navigate('Settings')}>
          <View style={styles.rowIcon}>
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
          </View>
          <Text style={styles.rowTitle}>Account settings</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Pressable
          style={styles.row}
          onPress={() => {
            signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          }}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          </View>
          <Text style={[styles.rowTitle, { color: colors.danger }]}>Log out</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          <Text style={{ color: colors.gold }}>♥ </Text>
          Maidora Kenya — Trusted help for your household.
        </Text>
    </Screen>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} hitSlop={4}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    marginBottom: 16,
  },
  avatar: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  avatarRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.brand },
  name: { marginTop: 12, fontSize: 19, fontWeight: '800', color: colors.ink },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleBadgeText: { color: colors.goldDark, fontSize: 12.5, fontWeight: '700' },
  contact: { marginTop: 6, fontSize: 14, color: colors.muted },
  verificationRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  vChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  vChipOk: { borderColor: colors.forest },
  vChipText: { color: colors.goldDark, fontSize: 11.5, fontWeight: '700' },
  vChipTextOk: { color: colors.forest },
  completenessCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginBottom: 16,
  },
  completenessHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completenessTitle: { flex: 1, fontSize: 16.5, fontWeight: '800', color: colors.ink },
  completenessCount: { fontSize: 16, fontWeight: '800', color: colors.goldDark },
  completenessBody: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.muted },
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 4 },
  missingChip: {
    backgroundColor: colors.goldSoft || '#FBF3E3',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  missingChipText: { color: colors.goldDark, fontSize: 12, fontWeight: '700' },
  editor: { marginTop: 14 },
  groupLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.cream,
  },
  chipActive: { borderColor: colors.forest, backgroundColor: colors.greenSoft },
  chipText: { fontSize: 13.5, color: colors.muted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: colors.forest, fontWeight: '800' },
  editorButtons: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  cancelText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { flex: 1, fontSize: 15.5, fontWeight: '700', color: colors.ink },
  footerNote: { textAlign: 'center', fontSize: 12.5, color: colors.muted, paddingVertical: 14 },
});
