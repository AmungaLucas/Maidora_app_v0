// Profile — the drawer's "Personal details" screen (REAL React Navigation
// drawer, ProfileDrawer). Shared by both roles:
//   Househelp → §7 profile-strength summary + 6-step completeness wizard
//   Employer  → household summary + 3-step completeness wizard
// Both roles: tapping "Email unverified" opens a sheet with a prefilled,
// editable email → code → verified (SMTP path §5). Completeness lives in
// AppContext, so every wizard save updates the Home banner instantly.
// Verification / Payments / Settings live in the drawer (hamburger top-right).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { ROLES, colors, radius } from '../../theme';
import { Banner, BottomSheetModal, PrimaryButton, Screen, ScreenHeader, TextField } from '../../ui';
import CompletenessWizard from './CompletenessWizard';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ProfileScreen({ navigation }) {
  const { user, token, profileCompleteness, setProfileCompleteness } = useApp();
  const isHousehelp = user?.role === 'househelp';
  const isEmployer = user?.role === 'employer';

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardProfile, setWizardProfile] = useState(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [savedNote, setSavedNote] = useState('');

  const completeness = profileCompleteness;

  const initials = String(user?.fullName || 'M')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const onWizardSaved = (nextCompleteness) => {
    // AppContext update → Home banner reacts the moment a step saves.
    setProfileCompleteness(nextCompleteness);
    setSavedNote(
      nextCompleteness.complete
        ? isHousehelp
          ? 'Your profile is complete. Households can see everything they need.'
          : 'Household profile complete — better matches ahead.'
        : `Saved. ${nextCompleteness.done} of ${nextCompleteness.total} done.`
    );
  };

  // Open the wizard: fetch the server profile first so the form hydrates
  // with existing values and opens at the first incomplete step.
  const openWizard = async () => {
    setWizardOpen(true);
    setWizardLoading(true);
    try {
      const res = await api.getProfile(token);
      setWizardProfile(res.profile || null);
      if (res.completeness) setProfileCompleteness(res.completeness);
    } catch {
      // Non-blocking: the wizard still opens with an empty form.
      setWizardProfile(null);
    } finally {
      setWizardLoading(false);
    }
  };

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Account"
        title="Profile"
        right={
          <Pressable
            onPress={() => navigation.openDrawer()}
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
        {user?.email ? <Text style={styles.contact}>{user.email}</Text> : null}
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

      {/* §7 completeness summary → multistep wizard */}
      {isHousehelp || isEmployer ? (
        <View style={styles.completenessCard}>
          {wizardOpen ? (
            wizardLoading ? (
              <View style={styles.wizardLoading}>
                <Ionicons name="sparkles-outline" size={26} color={colors.gold} />
                <Text style={styles.wizardLoadingText}>Loading your details…</Text>
              </View>
            ) : (
              <CompletenessWizard
                role={isHousehelp ? 'househelp' : 'employer'}
                profile={wizardProfile}
                token={token}
                onSaved={onWizardSaved}
                onClose={() => setWizardOpen(false)}
              />
            )
          ) : (
            <>
              <View style={styles.completenessHead}>
                <Ionicons
                  name={isHousehelp ? 'ribbon-outline' : 'home-outline'}
                  size={20}
                  color={colors.brand}
                />
                <Text style={styles.completenessTitle}>
                  {isHousehelp ? 'Profile strength' : 'Household profile'}
                </Text>
                <Text style={styles.completenessCount}>
                  {completeness ? `${completeness.done}/${completeness.total}` : '—'}
                </Text>
              </View>
              <Text style={styles.completenessBody}>
                {completeness && completeness.complete
                  ? isHousehelp
                    ? 'Complete. Households see everything they need to trust and hire you.'
                    : 'Complete. Maids can see the household context they need before applying.'
                  : 'Fill this in a few quick steps. It never blocks you from applying or hiring.'}
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

              <PrimaryButton
                title={
                  completeness && completeness.complete
                    ? isHousehelp
                      ? 'Edit my details'
                      : 'Edit household details'
                    : isHousehelp
                      ? 'Complete my profile'
                      : 'Tell us about your home'
                }
                onPress={openWizard}
              />
            </>
          )}
        </View>
      ) : null}

      <Text style={styles.footerNote}>
        <Text style={{ color: colors.gold }}>♥ </Text>
        Maidora Kenya — Trusted help for your household.
      </Text>

      {/* Email verification sheet — prefilled, editable email + 6-digit code */}
      <EmailVerifySheet
        visible={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
        user={user}
        token={token}
      />

      {/* Verification / Payments / Settings live in the DRAWER — hamburger
          top-right (ProfileDrawer). Log out is in the drawer footer. */}
    </Screen>
  );
}

// ── Email verification sheet (§5 SMTP path) ──────────────────────────────────
// Stage compose: prefilled editable email → Send code (updates the account
// email first when edited, then requests the SMTP OTP).
// Stage code: 6-digit entry → verify → session user refreshed via context.
function EmailVerifySheet({ visible, onClose, user, token }) {
  const { updateUser } = useApp();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('compose'); // compose | code | done
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resendIn, setResendIn] = useState(0);

  React.useEffect(() => {
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

  React.useEffect(() => {
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
        if (upd.user) updateUser(upd.user);
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
      if (res.user) updateUser(res.user);
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
  wizardLoading: { alignItems: 'center', paddingVertical: 22 },
  wizardLoadingText: { marginTop: 8, fontSize: 14, color: colors.muted, fontWeight: '600' },
  footerNote: { textAlign: 'center', fontSize: 12.5, color: colors.muted, paddingVertical: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  resendBtn: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: colors.forest, fontWeight: '700', fontSize: 14.5 },
});
