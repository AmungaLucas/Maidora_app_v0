// §7 profile completeness — MULTISTEP wizard (owner direction).
// One step per completeness check so progress feels immediate:
//   househelp → 6 steps: DOB · Languages · Job type · Experience & salary ·
//               About yourself · Next of kin
//   employer  → 3 steps: Household size · Children · Monthly budget
// Each step PARTIALLY saves to PUT /profile (server validation is partial for
// both roles) and pushes the fresh `completeness` up through onSaved — the
// AppContext updates so the Home banner reacts instantly. The wizard opens at
// the first incomplete step and every saved step stays saved (non-blocking:
// closing mid-way keeps whatever was already stored).
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, TextField } from '../../ui';
import { KENYAN_LANGUAGES } from '../../data/kenya';
import DatePickerModal from '../../components/common/DatePickerModal';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

// ─── Shared wizard chrome ────────────────────────────────────────────────────

function ProgressDots({ total, index, done }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            (done[i] || i < index) && styles.dotDone,
            i === index && styles.dotCurrent,
          ]}
        >
          {done[i] || i < index ? (
            <Ionicons name="checkmark" size={11} color={colors.cream} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function WizardShell({ steps, index, doneMap, onBack, onCancel, children }) {
  const step = steps[index];
  const isLast = index === steps.length - 1;
  return (
    <View style={styles.wizard}>
      <View style={styles.wizardHead}>
        <Pressable onPress={index === 0 ? onCancel : onBack} hitSlop={8} style={styles.stepNav}>
          <Ionicons
            name={index === 0 ? 'close' : 'arrow-back'}
            size={20}
            color={colors.brand}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepCount}>
            Step {index + 1} of {steps.length}
          </Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
        </View>
      </View>
      <ProgressDots total={steps.length} index={index} done={doneMap} />
      <Text style={styles.stepHint}>{step.hint}</Text>
      {children}
    </View>
  );
}

// ─── The wizard ──────────────────────────────────────────────────────────────

export default function CompletenessWizard({ role, profile, token, onSaved, onClose }) {
  const isMaid = role === 'househelp';

  // ── Local form state (hydrated from server truth once) ───────────────────
  const [form, setForm] = useState(() =>
    isMaid
      ? {
          dateOfBirth: profile?.dateOfBirth || '',
          gender: profile?.gender || '',
          languages: profile?.languages || [],
          jobType: profile?.jobType || null,
          yearsExperience:
            profile?.yearsExperience === null || profile?.yearsExperience === undefined
              ? ''
              : String(profile.yearsExperience),
          expectedSalary:
            profile?.expectedSalary === null || profile?.expectedSalary === undefined
              ? ''
              : String(profile.expectedSalary),
          bio: profile?.bio || '',
          nokName: profile?.nextOfKin?.name || '',
          nokPhone: profile?.nextOfKin?.phone || '',
          nokRelationship: profile?.nextOfKin?.relationship || '',
        }
      : {
          householdSize:
            profile?.householdSize === null || profile?.householdSize === undefined
              ? ''
              : String(profile.householdSize),
          numChildren:
            profile?.numChildren === null || profile?.numChildren === undefined
              ? ''
              : String(profile.numChildren),
          budgetAmount:
            profile?.budgetAmount === null || profile?.budgetAmount === undefined
              ? ''
              : String(profile.budgetAmount),
        }
  );
  const [langOtherOpen, setLangOtherOpen] = useState(false);
  const [langOtherText, setLangOtherText] = useState('');
  const [dobPickerOpen, setDobPickerOpen] = useState(false);

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

  // Step definitions per role. `done(form)` decides the ✅ dots and the
  // entry step; `payload(form)` is the PARTIAL body sent for that step;
  // `validate(form)` returns an error message or ''.
  const steps = useMemo(
    () =>
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
                f.bio.trim().length >= 10
                  ? ''
                  : 'Write at least 10 characters about yourself.',
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
          ],
    [isMaid]
  );

  // Entry step (first incomplete) + current step index — `steps` is already
  // defined above, so this initializer is safe.
  const [index, setIndex] = useState(() => {
    const first = steps.findIndex((s) => !s.done(form));
    return first === -1 ? steps.length - 1 : first;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(null); // completeness after last save

  // Open at the first incomplete step (captured once on mount).
  const entryIndex = useMemo(() => {
    const first = steps.findIndex((s) => !s.done(form));
    return first === -1 ? steps.length - 1 : first;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (saving) return;
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

  const customLangs = form.languages.filter((l) => !KENYAN_LANGUAGES.includes(l));

  // ── Done screen (after the last step saves) ───────────────────────────────
  if (finished) {
    return (
      <View style={styles.wizard}>
        <View style={styles.doneWrap}>
          <Ionicons
            name={finished.complete ? 'checkmark-circle' : 'sparkles-outline'}
            size={44}
            color={finished.complete ? colors.forest : colors.gold}
          />
          <Text style={styles.doneTitle}>
            {finished.complete
              ? 'Your profile is complete!'
              : `${finished.done} of ${finished.total} done`}
          </Text>
          <Text style={styles.doneBody}>
            {finished.complete
              ? isMaid
                ? 'Households see everything they need to trust and hire you.'
                : 'Maids can see the household context they need before applying.'
              : `Still open: ${finished.missing.join(', ')}. You can finish any time — it never blocks you.`}
          </Text>
          <PrimaryButton title="Back to my profile" onPress={onClose} />
        </View>
      </View>
    );
  }

  const step = steps[index];

  // ── Step bodies ───────────────────────────────────────────────────────────
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
    <WizardShell
      steps={steps}
      index={index}
      doneMap={doneMap}
      onBack={() => setIndex((i) => Math.max(0, i - 1))}
      onCancel={onClose}
    >
      <Banner message={error} />
      {completedCount > 0 && index === entryIndex ? (
        <Banner
          kind="info"
          message={`You have already completed ${completedCount} of ${steps.length} steps — continue where you left off.`}
        />
      ) : null}
      {body}
      <View style={styles.stepButtons}>
        {index > 0 ? (
          <Pressable onPress={() => setIndex((i) => i - 1)} style={styles.backStepBtn} hitSlop={8}>
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

      <DatePickerModal
        visible={dobPickerOpen}
        initialDate={form.dateOfBirth}
        title="Your date of birth"
        minAge={16}
        maxAge={80}
        onClose={() => setDobPickerOpen(false)}
        onConfirm={(iso) => set('dateOfBirth')(iso)}
      />
    </WizardShell>
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
  wizard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginBottom: 16,
  },
  wizardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNav: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: { fontSize: 12, fontWeight: '800', color: colors.goldDark, letterSpacing: 0.6 },
  stepTitle: { fontSize: 16.5, fontWeight: '800', color: colors.ink, marginTop: 1 },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.forest, borderColor: colors.forest },
  dotCurrent: { borderColor: colors.gold, borderWidth: 2 },
  stepHint: { marginTop: 10, fontSize: 13.5, lineHeight: 20, color: colors.muted },
  stepButtons: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  backStepBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  backStepText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  doneWrap: { alignItems: 'center', paddingVertical: 18 },
  doneTitle: { marginTop: 12, fontSize: 19, fontWeight: '800', color: colors.ink },
  doneBody: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
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
    marginBottom: 8,
  },
  pickerFieldText: { flex: 1, fontSize: 16, color: colors.ink },
  pickerFieldPlaceholder: { color: colors.muted },
  hintBelow: { color: colors.muted, fontSize: 13, marginTop: 6, marginBottom: 8 },
  bioWrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bioInput: { minHeight: 100, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
  otherRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 },
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
    backgroundColor: colors.cream,
  },
  chipActive: { borderColor: colors.forest, backgroundColor: colors.greenSoft },
  chipText: { fontSize: 13.5, color: colors.muted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: colors.forest, fontWeight: '800' },
});
