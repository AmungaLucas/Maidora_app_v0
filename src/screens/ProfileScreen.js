// Profile — shared by both roles, with drawer navigation separating the
// account destinations (verification, payments, settings) from this screen.
// "Change my role" stays ONLY inside Settings.
//   Househelp → §7 profile-strength card (6 checks: DOB, languages, job type,
//   experience, bio, next of kin). DOB uses the 3-step picker popup; expected
//   salary (v4 rename of wage expectation) and "about yourself" are editable.
//   Employer → household card (3 checks: household size, children, budget).
// Both roles: tapping "Email unverified" opens a sheet with a prefilled,
// editable email → code → verified (SMTP path §5). Filled fields autofill
// into KYC later (spec §7 → §8 order).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { ROLES, colors, radius } from '../theme';
import { Banner, BottomSheetModal, PrimaryButton, Screen, ScreenHeader, TextField } from '../ui';
import { KENYAN_LANGUAGES } from '../data/kenya';
import DatePickerModal from '../components/common/DatePickerModal';
import AppDrawer from '../components/common/AppDrawer';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ProfileScreen({ navigation }) {
  const { user, token, signOut, updateUser } = useApp();
  const isHousehelp = user?.role === 'househelp';
  const isEmployer = user?.role === 'employer';

  // Drawer + email verification sheet (both roles).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);

  // ── Househelp state ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [langOtherOpen, setLangOtherOpen] = useState(false);
  const [langOtherText, setLangOtherText] = useState('');
  const [form, setForm] = useState({
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
  });

  // ── Employer state ───────────────────────────────────────────────────────
  const [empProfile, setEmpProfile] = useState(null);
  const [empCompleteness, setEmpCompleteness] = useState(null);
  const [empEditing, setEmpEditing] = useState(false);
  const [empSaving, setEmpSaving] = useState(false);
  const [empError, setEmpError] = useState('');
  const [empNote, setEmpNote] = useState('');
  const [empForm, setEmpForm] = useState({
    householdSize: '',
    numChildren: '',
    budgetAmount: '',
  });

  useEffect(() => {
    if (!token || !(isHousehelp || isEmployer)) return;
    (async () => {
      try {
        const res = await api.getProfile(token);
        if (isHousehelp) {
          setProfile(res.profile);
          setCompleteness(res.completeness);
          hydrateMaid(res.profile);
        } else {
          setEmpProfile(res.profile);
          setEmpCompleteness(res.completeness);
          hydrateEmployer(res.profile);
        }
      } catch {
        // Non-blocking: the profile card simply shows the default state.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isHousehelp, isEmployer]);

  const hydrateMaid = (p) => {
    if (!p) return;
    setForm({
      dateOfBirth: p.dateOfBirth || '',
      gender: p.gender || '',
      languages: p.languages || [],
      jobType: p.jobType || null,
      yearsExperience: p.yearsExperience === null || p.yearsExperience === undefined ? '' : String(p.yearsExperience),
      expectedSalary: p.expectedSalary === null || p.expectedSalary === undefined ? '' : String(p.expectedSalary),
      bio: p.bio || '',
      nokName: p.nextOfKin?.name || '',
      nokPhone: p.nextOfKin?.phone || '',
      nokRelationship: p.nextOfKin?.relationship || '',
    });
    setLangOtherOpen(false);
    setLangOtherText('');
  };

  const hydrateEmployer = (p) => {
    setEmpForm({
      householdSize: p?.householdSize === null || p?.householdSize === undefined ? '' : String(p.householdSize),
      numChildren: p?.numChildren === null || p?.numChildren === undefined ? '' : String(p.numChildren),
      budgetAmount: p?.budgetAmount === null || p?.budgetAmount === undefined ? '' : String(p.budgetAmount),
    });
  };

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const setEmp = (key) => (v) => setEmpForm((f) => ({ ...f, [key]: v }));

  // Languages: pick from the Kenyan list (max 8). "Other" opens a specify
  // input — the typed value is stored as its own entry, never the literal
  // string "Other".
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

  // Values the user saved that are not in the standard list (e.g. a previous
  // "Other: Xuguri" entry) still render as removable chips.
  const customLangs = form.languages.filter((l) => !KENYAN_LANGUAGES.includes(l));

  const saveMaid = async () => {
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
          expectedSalary: form.expectedSalary.trim() || undefined,
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
      hydrateMaid(res.profile);
      setEditing(false);
      setSavedNote(
        res.completeness.complete
          ? 'Your profile is complete. Households can see everything they need.'
          : `Saved. ${res.completeness.done} of ${res.completeness.total} done.`
      );
    } catch (e) {
      setErrorMessage(e.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveEmployer = async () => {
    if (empSaving) return;
    setEmpSaving(true);
    setEmpError('');
    setEmpNote('');
    try {
      const res = await api.saveProfile(
        {
          householdSize: empForm.householdSize.trim(),
          numChildren: empForm.numChildren.trim(),
          budgetAmount: empForm.budgetAmount.trim(),
        },
        token
      );
      setEmpProfile(res.profile);
      setEmpCompleteness(res.completeness);
      hydrateEmployer(res.profile);
      setEmpEditing(false);
      setEmpNote(
        res.completeness.complete
          ? 'Household profile complete — better matches ahead.'
          : `Saved. ${res.completeness.done} of ${res.completeness.total} done.`
      );
    } catch (e) {
      setEmpError(e.message || 'Could not save. Please try again.');
    } finally {
      setEmpSaving(false);
    }
  };

  const initials = String(user?.fullName || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const drawerItems = [
    {
      icon: 'person-circle-outline',
      label: 'Personal details',
      onPress: () => {},
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification (Trust Badge)',
      onPress: () => navigation.navigate('KycIntro'),
    },
    {
      icon: 'cash-outline',
      label: 'Payments & receipts',
      onPress: () => navigation.navigate('Payment'),
    },
    {
      icon: 'settings-outline',
      label: 'Account settings',
      onPress: () => navigation.navigate('Settings'),
    },
    {
      icon: 'log-out-outline',
      label: 'Log out',
      danger: true,
      onPress: () => {
        signOut();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      },
    },
  ];

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Account"
        title="Profile"
        right={
          <Pressable
            onPress={() => setDrawerOpen(true)}
            hitSlop={10}
            style={styles.menuBtn}
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={24} color={colors.brand} />
          </Pressable>
        }
      />

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
          {/* Tap when unverified → prefilled, editable email + code sheet (§5) */}
          <Pressable
            disabled={user?.emailVerified}
            onPress={() => setEmailSheetOpen(true)}
            style={[styles.vChip, user?.emailVerified && styles.vChipOk]}
          >
            <Ionicons
              name={user?.emailVerified ? 'checkmark-circle' : 'alert-circle'}
              size={13}
              color={user?.emailVerified ? colors.forest : colors.goldDark}
            />
            <Text style={[styles.vChipText, user?.emailVerified && styles.vChipTextOk]}>
              {user?.emailVerified ? 'Email verified' : 'Email unverified · tap to verify'}
            </Text>
          </Pressable>
        </View>
      </View>

      {isHousehelp ? (
        <View style={styles.completenessCard}>
          <View style={styles.completenessHead}>
            <Ionicons name="ribbon-outline" size={20} color={colors.brand} />
            <Text style={styles.completenessTitle}>Profile strength</Text>
            <Text style={styles.completenessCount}>
              {completeness ? `${completeness.done}/${completeness.total}` : '–/6'}
            </Text>
          </View>
          <Text style={styles.completenessBody}>
            {completeness && completeness.complete
              ? 'Complete. Households see everything they need to trust and hire you.'
              : 'Add a few details so households can find and trust you. This never blocks you from applying.'}
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
                hydrateMaid(profile);
                setEditing(true);
              }}
            />
          ) : (
            <View style={styles.editor}>
              <Banner message={errorMessage} />
              {/* DOB — 3-step picker popup (year → month → day) */}
              <Text style={styles.labelAboveField}>Date of birth</Text>
              <Pressable style={styles.pickerField} onPress={() => setDobPickerOpen(true)}>
                <Text style={[styles.pickerFieldText, !form.dateOfBirth && styles.pickerFieldPlaceholder]}>
                  {form.dateOfBirth || 'Pick your date of birth'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={colors.brand} />
              </Pressable>
              <Text style={styles.hintBelow}>Used for age filtering. Tap to choose year, then month, then day.</Text>

              <Text style={styles.groupLabel}>Gender (optional)</Text>
              <View style={styles.chipRow}>
                {['female', 'male', 'other'].map((g) => (
                  <Chip key={g} label={g} active={form.gender === g} onPress={() => set('gender')(g)} />
                ))}
              </View>

              <Text style={styles.groupLabel}>Languages spoken (up to 8)</Text>
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
                  <Chip
                    key={l}
                    label={l}
                    active
                    onPress={() => toggleLanguage(l)}
                  />
                ))}
                <Chip label="Other" active={langOtherOpen} onPress={() => setLangOtherOpen((v) => !v)} />
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
                label="Expected salary (KES per month, optional)"
                value={form.expectedSalary}
                onChangeText={(v) => set('expectedSalary')(v.replace(/\D/g, '').slice(0, 7))}
                placeholder="e.g. 15000"
                keyboardType="number-pad"
                hint="What you would like to earn. Households may offer more."
              />

              <Text style={styles.labelAboveField}>Tell us a little more about yourself</Text>
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
              <Text style={styles.hintBelow}>{form.bio.trim().length}/500 — at least 10 characters.</Text>

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
                  <PrimaryButton title="Save profile" onPress={saveMaid} loading={saving} />
                </View>
              </View>
            </View>
          )}
        </View>
      ) : null}

      {isEmployer ? (
        <View style={styles.completenessCard}>
          <View style={styles.completenessHead}>
            <Ionicons name="home-outline" size={20} color={colors.brand} />
            <Text style={styles.completenessTitle}>Household profile</Text>
            <Text style={styles.completenessCount}>
              {empCompleteness ? `${empCompleteness.done}/${empCompleteness.total}` : '–/3'}
            </Text>
          </View>
          <Text style={styles.completenessBody}>
            {empCompleteness && empCompleteness.complete
              ? 'Complete. Maids can see the household context they need before applying.'
              : 'Tell us about your home so we can match the right help for you. Only shared with matches.'}
          </Text>
          {empCompleteness && !empCompleteness.complete ? (
            <View style={styles.missingWrap}>
              {empCompleteness.missing.map((m) => (
                <View key={m} style={styles.missingChip}>
                  <Text style={styles.missingChipText}>{m}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {empNote ? <Banner kind="info" message={empNote} /> : null}

          {!empEditing ? (
            <PrimaryButton
              title={empCompleteness && empCompleteness.complete ? 'Edit household details' : 'Tell us about your home'}
              onPress={() => {
                hydrateEmployer(empProfile);
                setEmpEditing(true);
              }}
            />
          ) : (
            <View style={styles.editor}>
              <Banner message={empError} />
              <TextField
                label="How many people live in your home?"
                value={empForm.householdSize}
                onChangeText={(v) => setEmp('householdSize')(v.replace(/\D/g, '').slice(0, 2))}
                placeholder="e.g. 4"
                keyboardType="number-pad"
                hint="Including you. This helps maids prepare."
              />
              <TextField
                label="How many children are at home?"
                value={empForm.numChildren}
                onChangeText={(v) => setEmp('numChildren')(v.replace(/\D/g, '').slice(0, 2))}
                placeholder="e.g. 2 (enter 0 if none)"
                keyboardType="number-pad"
              />
              <TextField
                label="Monthly budget (KES)"
                value={empForm.budgetAmount}
                onChangeText={(v) => setEmp('budgetAmount')(v.replace(/\D/g, '').slice(0, 7))}
                placeholder="e.g. 12000"
                keyboardType="number-pad"
                hint="What you plan to pay per month. You can change this any time."
              />
              <View style={styles.editorButtons}>
                <Pressable onPress={() => setEmpEditing(false)} style={styles.cancelBtn} hitSlop={8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Save household" onPress={saveEmployer} loading={empSaving} />
                </View>
              </View>
            </View>
          )}
        </View>
      ) : null}

      <Text style={styles.footerNote}>
        <Text style={{ color: colors.gold }}>♥ </Text>
        Maidora Kenya — Trusted help for your household.
      </Text>

      {/* Drawer — separates verification / payments / settings from profile */}
      <AppDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userName={user?.fullName}
        roleLabel={ROLES[user?.role] || 'Member'}
        items={drawerItems}
      />

      {/* Email verification sheet — prefilled, editable email + 6-digit code */}
      <EmailVerifySheet
        visible={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
        user={user}
        token={token}
        onUser={updateUser}
      />

      <DatePickerModal
        visible={dobPickerOpen}
        initialDate={form.dateOfBirth}
        title="Your date of birth"
        minAge={16}
        maxAge={80}
        onClose={() => setDobPickerOpen(false)}
        onConfirm={(iso) => set('dateOfBirth')(iso)}
      />
    </Screen>
  );
}

// ── Email verification sheet (§5 SMTP path) ──────────────────────────────────
// Stage compose: prefilled editable email → Send code (updates the account
// email first when edited, then requests the SMTP OTP).
// Stage code: 6-digit entry → verify → session user refreshed by the caller.
function EmailVerifySheet({ visible, onClose, user, token, onUser }) {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('compose'); // compose | code | done
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setEmail(user?.email || '');
    setStage(user?.emailVerified ? 'done' : 'compose');
    setCode('');
    setBusy(false);
    setError('');
    setNote('');
    setResendIn(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const target = email.trim().toLowerCase();
      if (!EMAIL_RE.test(target)) {
        throw new Error('Enter a valid email address.');
      }
      if (target !== String(user?.email || '').toLowerCase()) {
        const upd = await api.updateEmail(target, token);
        if (upd.user) onUser(upd.user);
      }
      const res = await api.requestEmailVerification(token);
      setStage('code');
      setResendIn(res.resendAfterSeconds || 60);
      setNote(res.message || 'Check your inbox for the 6-digit code.');
    } catch (e) {
      setError(e.message || 'Could not send the email right now. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.verifyEmail(code.replace(/\D/g, ''), token);
      if (res.user) onUser(res.user);
      setStage('done');
      setNote(res.message || 'Email verified.');
      setTimeout(onClose, 900);
    } catch (e) {
      setError(e.message || 'That code did not work. Check and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.sheetHead}>
        <Ionicons
          name={stage === 'done' ? 'checkmark-circle' : 'mail-outline'}
          size={22}
          color={stage === 'done' ? colors.forest : colors.brand}
        />
        <Text style={styles.sheetTitle}>
          {stage === 'compose' ? 'Verify your email' : stage === 'code' ? 'Enter the code' : 'Verified'}
        </Text>
      </View>

      {stage === 'compose' ? (
        <>
          <Banner message={error} />
          <Banner kind="info" message={note} />
          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Prefilled from your account — you can change it here."
          />
          <PrimaryButton title="Send verification code" onPress={sendCode} loading={busy} />
        </>
      ) : null}

      {stage === 'code' ? (
        <>
          <Banner message={error} />
          <Banner kind="info" message={note} />
          <TextField
            label="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="e.g. 482913"
            keyboardType="number-pad"
            maxLength={6}
          />
          <PrimaryButton
            title="Verify email"
            onPress={confirmCode}
            loading={busy}
            disabled={code.replace(/\D/g, '').length !== 6}
          />
          <Pressable
            disabled={resendIn > 0 || busy}
            onPress={sendCode}
            style={styles.resendBtn}
            hitSlop={8}
          >
            <Text style={[styles.resendText, resendIn > 0 && { color: colors.muted }]}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {stage === 'done' ? (
        <>
          <Banner kind="info" message={note || 'Your email is verified.'} />
          <PrimaryButton title="Done" onPress={onClose} />
        </>
      ) : null}
    </BottomSheetModal>
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
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  verificationRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
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
  labelAboveField: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 7,
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
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  resendBtn: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: colors.forest, fontWeight: '700', fontSize: 14.5 },
  footerNote: { textAlign: 'center', fontSize: 12.5, color: colors.muted, paddingVertical: 14 },
});
