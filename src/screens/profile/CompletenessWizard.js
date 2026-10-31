// §7 profile completeness — MULTISTEP wizard, FULL-SCREEN modal (owner
// redesign 2026-10-30). The wizard used to render inline inside a card on
// the Profile screen — cramped, keyboard covered the fields, Save fell
// below the fold. It now takes the whole screen:
//   · progress header — "Step X of N", % bar, tappable step chips (jump)
//   · scrollable step body with keyboard-safe layout
//   · sticky footer — Back + Save & continue / Save & finish
// One step per completeness check:
//   househelp → 6 steps: DOB · Languages · Job type · Experience & salary ·
//               About yourself · Next of kin
//   employer  → 3 steps: Household size · Children · Monthly budget
// Each step PARTIALLY saves to PUT /profile (server validation is partial
// for both roles) and pushes the fresh `completeness` up through onSaved —
// the AppContext updates so the Home banner reacts instantly. The wizard
// opens at the first incomplete step (step 1 when editing a complete
// profile) and every saved step stays saved (non-blocking: closing
// mid-way keeps whatever was already stored).
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, ProgressBar, TextField } from '../../ui';
import { KENYAN_LANGUAGES } from '../../data/kenya';
import DatePickerModal from '../../components/common/DatePickerModal';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

const emptyForm = (isMaid) =>
  isMaid
    ? {
        dateOfBirth: '',
        gender: '',
        languages: [],
        jobType: null,
        yearsExperience: '',
        expectedSalary: '',
        bio: '',
        nokName: '',
        nokPhone: '',
        nokRelationship: '',
      }
    : { householdSize: '', numChildren: '', budgetAmount: '', languages: [] };

const hydrate = (isMaid, p) =>
  isMaid
    ? {
        dateOfBirth: p?.dateOfBirth || '',
        gender: p?.gender || '',
        languages: p?.languages || [],
        jobType: p?.jobType || null,
        yearsExperience:
          p?.yearsExperience === null || p?.yearsExperience === undefined
            ? ''
            : String(p.yearsExperience),
        expectedSalary:
          p?.expectedSalary === null || p?.expectedSalary === undefined
            ? ''
            : String(p.expectedSalary),
        bio: p?.bio || '',
        nokName: p?.nextOfKin?.name || '',
        nokPhone: p?.nextOfKin?.phone || '',
        nokRelationship: p?.nextOfKin?.relationship || '',
      }
    : {
        // Total form shape for BOTH roles — employers have no languages step,
        // but render-path helpers below read form.languages unconditionally.
        languages: Array.isArray(p?.languages) ? p.languages : [],
        householdSize:
          p?.householdSize === null || p?.householdSize === undefined
            ? ''
            : String(p.householdSize),
        numChildren:
          p?.numChildren === null || p?.numChildren === undefined
            ? ''
            : String(p.numChildren),
        budgetAmount:
          p?.budgetAmount === null || p?.budgetAmount === undefined
            ? ''
            : String(p.budgetAmount),
      };

// Step definitions per role. `done(form)` decides the ✅ chips and the
// entry step; `payload(form)` is the PARTIAL body sent for that step;
// `validate(form)` returns an error message or ''.
const buildSteps = (isMaid) =>
  isMaid
    ? [
        {
          key: 'dob',
          title: 'Your date of birth',
          hint: 'Used for age filtering. Tap the field to pick year, then month, then day.',
          done: (f) => Boolean(f.dateOfBirth),
          validate: (f) => (f.dateOfBirth ? '' : 'Pick your date of birth to continue.'),
          payload: (f) => ({ dateOfBirth: f.dateOfBirth, gender: f.gender || undefined }),
        },
        {
          key: 'languages',
          title: 'Languages you speak',
          hint: 'Pick up to 8. Households often search by language.',
          done: (f) => f.languages.length > 0,
          validate: (f) => (f.languages.length > 0 ? '' : 'Pick at least one language.'),
          payload: (f) => ({ languages: f.languages }),
        },
        {
          key: 'jobType',
          title: 'Type of work you want',
          hint: 'You can change this any time.',
          done: (f) => Boolean(f.jobType),
          validate: (f) => (f.jobType ? '' : 'Choose the type of work you want.'),
          payload: (f) => ({ jobType: f.jobType }),
        },
        {
          key: 'experience',
          title: 'Your experience',
          hint: 'How long you have worked, and the salary you would like.',
          done: (f) => f.yearsExperience !== '' && f.yearsExperience !== null,
          validate: (f) => {
            const yrs = Number(f.yearsExperience);
            if (!Number.isInteger(yrs) || yrs < 0 || yrs > 50) {
              return 'Years of experience must be a number between 0 and 50.';
            }
            if (f.expectedSalary !== '') {
              const w = Number(f.expectedSalary);
              if (!Number.isFinite(w) || w < 1000 || w > 1000000) {
                return 'Expected salary must be between KES 1,000 and 1,000,000.';
              }
            }
            return '';
          },
          payload: (f) => ({
            yearsExperience: f.yearsExperience,
            ...(f.expectedSalary !== '' ? { expectedSalary: f.expectedSalary } : {}),
          }),
        },
        {
          key: 'bio',
          title: 'Tell us a little more about yourself',
          hint: 'At least 10 characters. This is what households read first.',
          done: (f) => f.bio.trim().length >= 10,
          validate: (f) =>
            f.bio.trim().length >= 10 ? '' : 'Write at least 10 characters about yourself.',
          payload: (f) => ({ bio: f.bio.trim() }),
        },
        {
          key: 'nextOfKin',
          title: 'Your next of kin',
          hint: 'A contact person we can reach in an emergency. Never shown to households.',
          done: (f) =>
            Boolean(f.nokName.trim() && f.nokPhone.trim() && f.nokRelationship.trim()),
          validate: (f) => {
            if (f.nokName.trim().length < 3) return "Enter your next of kin's full name.";
            if (f.nokPhone.replace(/\D/g, '').length < 9) {
              return "Enter your next of kin's Kenyan phone number.";
            }
            if (f.nokRelationship.trim().length < 2) {
              return 'Relationship, e.g. sister, uncle, guardian.';
            }
            return '';
          },
          payload: (f) => ({
            nextOfKin: {
              name: f.nokName.trim(),
              phone: f.nokPhone.trim(),
              relationship: f.nokRelationship.trim(),
            },
          }),
        },
      ]
    : [
        {
          key: 'householdSize',
          title: 'People in your home',
          hint: 'Including you. This helps maids prepare before they apply.',
          done: (f) => f.householdSize !== '' && f.householdSize !== null,
          validate: (f) => {
            const n = Number(f.householdSize);
            if (!Number.isInteger(n) || n < 1 || n > 30) {
              return 'How many people live in your home? (1–30)';
            }
            return '';
          },
          payload: (f) => ({ householdSize: f.householdSize }),
        },
        {
          key: 'numChildren',
          title: 'Children at home',
          hint: 'Enter 0 if there are none.',
          done: (f) => f.numChildren !== '' && f.numChildren !== null,
          validate: (f) => {
            const n = Number(f.numChildren);
            if (!Number.isInteger(n) || n < 0 || n > 20) {
              return 'Number of children must be between 0 and 20.';
            }
            return '';
          },
          payload: (f) => ({ numChildren: f.numChildren }),
        },
        {
          key: 'budgetAmount',
          title: 'Monthly budget',
          hint: 'What you plan to pay per month, in KES. You can change this any time.',
          done: (f) => f.budgetAmount !== '' && f.budgetAmount !== null,
          validate: (f) => {
            const n = Number(f.budgetAmount);
            if (!Number.isFinite(n) || n < 1000 || n > 1000000) {
              return 'Monthly budget must be between KES 1,000 and 1,000,000.';
            }
            return '';
          },
          payload: (f) => ({ budgetAmount: f.budgetAmount }),
        },
      ];

export default function CompletenessWizard({ visible, role, token, onSaved, onClose }) {
  const isMaid = role === 'househelp';

  const steps = useMemo(() => buildSteps(isMaid), [isMaid]);

  // ── Local form state (hydrated from server truth when the modal opens) ───
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => emptyForm(isMaid));
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(null); // completeness after last save

  const [langOtherOpen, setLangOtherOpen] = useState(false);
  const [langOtherText, setLangOtherText] = useState('');
  const [dobPickerOpen, setDobPickerOpen] = useState(false);

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

  // Every open: fetch the server profile, hydrate the form, land on the
  // first incomplete step (step 1 when everything is already complete —
  // that is the natural place to start editing).
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    setFinished(null);
    setLangOtherOpen(false);
    setLangOtherText('');
    setDobPickerOpen(false);
    (async () => {
      let nextForm = emptyForm(isMaid);
      try {
        const res = await api.getProfile(token);
        nextForm = hydrate(isMaid, res.profile || null);
      } catch {
        // Non-blocking: the wizard still opens with an empty form.
      }
      if (!alive) return;
      setForm(nextForm);
      const first = steps.findIndex((s) => !s.done(nextForm));
      const entry = first === -1 ? 0 : first;
      setIndex(entry);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isMaid, token]);

  const doneMap = useMemo(() => {
    const map = {};
    steps.forEach((s, i) => {
      map[i] = s.done(form);
    });
    return map;
  }, [steps, form]);

  const completedCount = Object.values(doneMap).filter(Boolean).length;

  // ── Save the current step (partial PUT), then advance ────────────────────
  const saveStep = async () => {
    if (saving || loading) return;
    const step = steps[index];
    const problem = step.validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.saveProfile(step.payload(form), token);
      if (onSaved && res.completeness) onSaved(res.completeness);
      if (index === steps.length - 1) {
        setFinished(res.completeness);
      } else {
        setIndex((i) => Math.min(i + 1, steps.length - 1));
      }
    } catch (e) {
      setError(e.message || 'Could not save this step. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Language helpers ──────────────────────────────────────────────────────
  const toggleLanguage = (lang) =>
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(lang)
        ? f.languages.filter((l) => l !== lang)
        : f.languages.length >= 8
          ? f.languages
          : [...f.languages, lang],
    }));

  const addOtherLanguage = () => {
    const value = langOtherText.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!value) return;
    if (!form.languages.includes(value) && form.languages.length < 8) {
      setForm((f) => ({ ...f, languages: [...f.languages, value] }));
    }
    setLangOtherText('');
    setLangOtherOpen(false);
  };

  // Guarded: the wizard renders (invisible Modal) as soon as the Profile
  // screen mounts — for employers form.languages used to be undefined here,
  // throwing "Cannot read property 'filter' of undefined" on every Profile
  // open. Array.isArray keeps the render path safe for any future shape.
  const customLangs = (Array.isArray(form.languages) ? form.languages : []).filter(
    (l) => !KENYAN_LANGUAGES.includes(l)
  );

  // ── Step bodies ───────────────────────────────────────────────────────────
  const step = steps[index];

  let body = null;
  if (isMaid && step.key === 'dob') {
    body = (
      <>
        <Text style={styles.labelAboveField}>Date of birth</Text>
        <Pressable style={styles.pickerField} onPress={() => setDobPickerOpen(true)}>
          <Text
            style={[styles.pickerFieldText, !form.dateOfBirth && styles.pickerFieldPlaceholder]}
          >
            {form.dateOfBirth || 'Pick your date of birth'}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={colors.brand} />
        </Pressable>
        <Text style={styles.labelAboveField}>Gender (optional)</Text>
        <View style={styles.chipRow}>
          {['female', 'male', 'other'].map((g) => (
            <Chip key={g} label={g} active={form.gender === g} onPress={() => set('gender')(g)} />
          ))}
        </View>
      </>
    );
  } else if (isMaid && step.key === 'languages') {
    body = (
      <>
        <View style={styles.chipRow}>
          {KENYAN_LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={l}
              active={form.languages.includes(l)}
              onPress={() => toggleLanguage(l)}
            />
          ))}
          {customLangs.map((l) => (
            <Chip key={l} label={l} active onPress={() => toggleLanguage(l)} />
          ))}
          <Chip
            label="Other"
            active={langOtherOpen}
            onPress={() => setLangOtherOpen((v) => !v)}
          />
        </View>
        {langOtherOpen ? (
          <View style={styles.otherRow}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Specify the language"
                value={langOtherText}
                onChangeText={setLangOtherText}
                placeholder="e.g. Sigaw"
                maxLength={24}
              />
            </View>
            <Pressable style={styles.otherAddBtn} onPress={addOtherLanguage}>
              <Text style={styles.otherAddText}>Add</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.hintBelow}>Selected: {form.languages.length}/8</Text>
      </>
    );
  } else if (isMaid && step.key === 'jobType') {
    body = (
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
    );
  } else if (isMaid && step.key === 'experience') {
    body = (
      <>
        <TextField
          label="Years of experience"
          value={form.yearsExperience}
          onChangeText={(v) => set('yearsExperience')(v.replace(/\D/g, '').slice(0, 2))}
          placeholder="e.g. 4"
          keyboardType="number-pad"
        />
        <TextField
          label="Expected salary (KES per month, optional)"
          value={form.expectedSalary}
          onChangeText={(v) => set('expectedSalary')(v.replace(/\D/g, '').slice(0, 7))}
          placeholder="e.g. 15000"
          keyboardType="number-pad"
          hint="What you would like to earn. Households may offer more."
        />
      </>
    );
  } else if (isMaid && step.key === 'bio') {
    body = (
      <>
        <View style={styles.bioWrap}>
          <TextInput
            value={form.bio}
            onChangeText={(v) => set('bio')(v.slice(0, 500))}
            placeholder="e.g. I have 5 years' experience caring for toddlers, I cook a variety of meals and I am comfortable with pets."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            maxLength={500}
            style={styles.bioInput}
          />
        </View>
        <Text style={styles.hintBelow}>
          {form.bio.trim().length}/500 — at least 10 characters.
        </Text>
      </>
    );
  } else if (isMaid && step.key === 'nextOfKin') {
    body = (
      <>
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
      </>
    );
  } else if (!isMaid && step.key === 'householdSize') {
    body = (
      <TextField
        label="How many people live in your home?"
        value={form.householdSize}
        onChangeText={(v) => set('householdSize')(v.replace(/\D/g, '').slice(0, 2))}
        placeholder="e.g. 4"
        keyboardType="number-pad"
        hint="Including you. This helps maids prepare."
      />
    );
  } else if (!isMaid && step.key === 'numChildren') {
    body = (
      <TextField
        label="How many children are at home?"
        value={form.numChildren}
        onChangeText={(v) => set('numChildren')(v.replace(/\D/g, '').slice(0, 2))}
        placeholder="e.g. 2 (enter 0 if none)"
        keyboardType="number-pad"
      />
    );
  } else if (!isMaid && step.key === 'budgetAmount') {
    body = (
      <TextField
        label="Monthly budget (KES)"
        value={form.budgetAmount}
        onChangeText={(v) => set('budgetAmount')(v.replace(/\D/g, '').slice(0, 7))}
        placeholder="e.g. 12000"
        keyboardType="number-pad"
        hint="What you plan to pay per month. You can change this any time."
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* ── Progress header ──────────────────────────────────────────── */}
          <View style={styles.head}>
            <View style={styles.headRow}>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.closeBtn}
                accessibilityLabel={index === 0 ? 'Close' : 'Save for later and close'}
              >
                <Ionicons name={index === 0 ? 'close' : 'arrow-back'} size={20} color={colors.brand} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.headTitle}>
                  {isMaid ? 'Complete your profile' : 'Tell us about your home'}
                </Text>
                <Text style={styles.headSubtitle}>
                  {loading
                    ? 'Loading your details…'
                    : `Step ${index + 1} of ${steps.length} · ${completedCount} of ${steps.length} done`}
                </Text>
              </View>
            </View>
            <ProgressBar ratio={steps.length ? completedCount / steps.length : 0} showLabel />
            {/* Tappable step chips — jump to any step, ✅ on completed ones */}
            {!loading ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {steps.map((s, i) => (
                  <Pressable
                    key={s.key}
                    onPress={() => setIndex(i)}
                    style={[
                      styles.stepChip,
                      i === index && styles.stepChipCurrent,
                      doneMap[i] && i !== index && styles.stepChipDone,
                    ]}
                  >
                    {doneMap[i] ? (
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color={i === index ? colors.cream : colors.forest}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.stepChipText,
                          i === index && styles.stepChipTextCurrent,
                        ]}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          {/* ── Step body ────────────────────────────────────────────────── */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <Ionicons name="sparkles-outline" size={30} color={colors.gold} />
              <Text style={styles.loadingText}>Loading your details…</Text>
            </View>
          ) : finished ? (
            <View style={styles.doneWrap}>
              <Ionicons
                name={finished.complete ? 'checkmark-circle' : 'sparkles-outline'}
                size={48}
                color={finished.complete ? colors.forest : colors.gold}
              />
              <Text style={styles.doneTitle}>
                {finished.complete
                  ? 'All done — your profile is complete!'
                  : `${finished.done} of ${finished.total} done`}
              </Text>
              <Text style={styles.doneBody}>
                {finished.complete
                  ? isMaid
                    ? 'Households see everything they need to trust and hire you.'
                    : 'Maids can see the household context they need before applying.'
                  : `Still open: ${(finished.missing || []).join(', ')}. You can finish any time — it never blocks you.`}
              </Text>
              <PrimaryButton title="Back to my profile" onPress={onClose} />
            </View>
          ) : (
            <>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepHint}>{step.hint}</Text>
                <Banner message={error} />
                {body}
              </ScrollView>

              {/* ── Sticky footer ──────────────────────────────────────────── */}
              <View style={styles.footer}>
                {index > 0 ? (
                  <Pressable
                    onPress={() => setIndex((i) => i - 1)}
                    style={styles.backStepBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-back" size={16} color={colors.muted} />
                    <Text style={styles.backStepText}>Back</Text>
                  </Pressable>
                ) : null}
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={index === steps.length - 1 ? 'Save & finish' : 'Save & continue'}
                    onPress={saveStep}
                    loading={saving}
                  />
                </View>
              </View>
            </>
          )}
        </KeyboardAvoidingView>

        <DatePickerModal
          visible={dobPickerOpen}
          initialDate={form.dateOfBirth}
          title="Your date of birth"
          minAge={16}
          maxAge={80}
          onClose={() => setDobPickerOpen(false)}
          onConfirm={(iso) => set('dateOfBirth')(iso)}
        />
      </SafeAreaView>
    </Modal>
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
  screen: { flex: 1, backgroundColor: colors.cream },
  // Header
  head: {
    backgroundColor: colors.card,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  headSubtitle: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: colors.muted },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 12, paddingVertical: 2 },
  stepChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepChipDone: { backgroundColor: colors.greenSoft, borderColor: colors.forest },
  stepChipCurrent: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepChipText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  stepChipTextCurrent: { color: colors.cream },
  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 14.5, fontWeight: '600', color: colors.muted },
  // Body
  bodyContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 },
  stepTitle: { fontSize: 21, fontWeight: '800', color: colors.ink },
  stepHint: { marginTop: 8, marginBottom: 18, fontSize: 14.5, lineHeight: 21, color: colors.muted },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  backStepBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 10 },
  backStepText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  // Done
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneTitle: {
    marginTop: 16,
    fontSize: 21,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  doneBody: {
    marginTop: 10,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  // Fields
  labelAboveField: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 7,
    marginTop: 4,
  },
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
    marginBottom: 16,
  },
  pickerFieldText: { flex: 1, fontSize: 16, color: colors.ink },
  pickerFieldPlaceholder: { color: colors.muted },
  hintBelow: { color: colors.muted, fontSize: 13, marginTop: 10, marginBottom: 4 },
  bioWrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bioInput: { minHeight: 120, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
  otherRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 12 },
  otherAddBtn: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  otherAddText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.forest, backgroundColor: colors.greenSoft },
  chipText: { fontSize: 13.5, color: colors.muted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: colors.forest, fontWeight: '800' },
});
