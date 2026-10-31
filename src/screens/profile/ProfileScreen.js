// Profile — the drawer's "Personal details" screen (REAL React Navigation
// drawer, ProfileDrawer). Shared by both roles. Layout (owner redesign
// 2026-10-30 — the old build crammed everything into stacked cards with the
// wizard inline, which felt broken):
//   1. Header — hamburger LEFT (the drawer opens from the left), "Profile".
//   2. Identity card — avatar, name, role, phone, location.
//   3. Profile strength card — REAL progress bar + %, missing chips, CTA.
//      Tapping opens the multistep wizard FULL-SCREEN (CompletenessWizard
//      modal). When complete, the card becomes a Trust Badge upsell (§8).
//   4. Account status — tappable Phone / Email rows; unverified email opens
//      a sheet with a prefilled, editable email → code → verified (§5).
// Completeness lives in AppContext, so every wizard save updates the Home
// banner instantly. Verification / Payments / Settings live in the drawer.
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { ROLES, colors, radius } from '../../theme';
import {
  Banner,
  BottomSheetModal,
  PrimaryButton,
  ProgressBar,
  Screen,
  TextField,
} from '../../ui';
import DrawerMenuButton from '../../components/common/DrawerMenuButton';
import ActionSheet from '../../components/common/ActionSheet';
import GuidedCapture from '../verification/GuidedCapture';
import CompletenessWizard from './CompletenessWizard';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ProfileScreen({ navigation }) {
  const { user, token, profileCompleteness, setProfileCompleteness, updateUser } = useApp();
  const isHousehelp = user?.role === 'househelp';
  const isEmployer = user?.role === 'employer';

  const [wizardOpen, setWizardOpen] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  // Avatar capture — brand ActionSheet chooser (take photo / gallery) plus
  // the shared guided camera modal (circle frame, exact crop, WebP). No OS
  // popups, no foreign camera activity (the old launchImageLibrary path).
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarCam, setAvatarCam] = useState(null); // { startWithGallery } | null

  const completeness = profileCompleteness;
  const hasProfileSection = isHousehelp || isEmployer;
  const complete = Boolean(completeness && completeness.complete);

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

  // §8/§13 media pipeline — profile photo: guided capture (camera or
  // gallery) → circle crop → WebP ≤600 px → POST /media/avatar → public
  // media.maidora.co.ke URL on users.avatar_url.
  const pickAvatar = () => {
    if (avatarBusy) return;
    setAvatarError('');
    setAvatarSheetOpen(true);
  };

  const onAvatarShot = async (shot) => {
    if (!shot || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      const res = await api.uploadAvatar(shot.base64, shot.mime, token);
      await updateUser({ avatarUrl: res.url });
    } catch (e) {
      setAvatarError(e.message || 'Could not upload the photo. Check your connection and try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      {/* Header — hamburger LEFT (drawer opens from the left) */}
      <View style={styles.header}>
        <DrawerMenuButton navigation={navigation} />
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* 1 — Identity (tap the avatar to add/change the profile photo) */}
      <View style={styles.identityCard}>
        <Pressable onPress={pickAvatar} disabled={avatarBusy} style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]} hitSlop={6}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.avatarEdit}>
            <Ionicons name="camera" size={12} color={colors.cream} />
          </View>
        </Pressable>
        {avatarBusy ? <Text style={styles.avatarBusyText}>Uploading photo…</Text> : null}
        <Banner kind="error" message={avatarError} />
        <Text style={styles.name}>{user?.fullName}</Text>
        <View style={styles.roleBadge}>
          <Ionicons
            name={user?.role === 'househelp' ? 'sparkles' : 'home'}
            size={12}
            color={colors.goldDark}
          />
          <Text style={styles.roleBadgeText}>{ROLES[user?.role] || 'Member'}</Text>
        </View>
        <View style={styles.contactRow}>
          <Ionicons name="call-outline" size={15} color={colors.muted} />
          <Text style={styles.contactText}>{user?.phone}</Text>
        </View>
        {user?.locationName ? (
          <View style={styles.contactRow}>
            <Ionicons name="location-outline" size={15} color={colors.muted} />
            <Text style={styles.contactText}>{user.locationName}</Text>
          </View>
        ) : null}
      </View>

      {/* 2 — §7 Profile strength → multistep wizard (full-screen modal) */}
      {hasProfileSection ? (
        <View style={styles.card}>
          {completeness ? (
            <>
              <View style={styles.strengthHead}>
                <View style={styles.strengthIcon}>
                  <Ionicons
                    name={isHousehelp ? 'ribbon-outline' : 'home-outline'}
                    size={17}
                    color={colors.brand}
                  />
                </View>
                <Text style={styles.strengthTitle}>
                  {isHousehelp ? 'Profile strength' : 'Household profile'}
                </Text>
                <Text style={styles.strengthCount}>
                  {completeness.done}/{completeness.total}
                </Text>
              </View>
              <ProgressBar
                ratio={completeness.total ? completeness.done / completeness.total : 0}
                showLabel
              />
              <Text style={styles.strengthBody}>
                {complete
                  ? isHousehelp
                    ? 'Complete. Households see everything they need to trust and hire you.'
                    : 'Complete. Maids can see the household context they need before applying.'
                  : 'Fill this in a few quick steps. It never blocks you from applying or hiring.'}
              </Text>
              {!complete && completeness.missing?.length ? (
                <View style={styles.missingWrap}>
                  {completeness.missing.map((m) => (
                    <View key={m} style={styles.missingChip}>
                      <Text style={styles.missingChipText}>{m}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {savedNote ? <Banner kind="info" message={savedNote} /> : null}
            </>
          ) : (
            <Text style={[styles.strengthBody, { marginBottom: 12 }]}>
              {isHousehelp
                ? 'Add your details so households can find and trust you.'
                : 'Tell maids about your home so they can apply with confidence.'}
            </Text>
          )}

          <PrimaryButton
            title={
              complete
                ? isHousehelp
                  ? 'Edit my details'
                  : 'Edit household details'
                : isHousehelp
                  ? 'Complete my profile'
                  : 'Tell us about your home'
            }
            onPress={() => setWizardOpen(true)}
          />

          {/* Complete → level up to the Trust Badge (§8), inside the drawer */}
          {complete && user?.kycStatus !== 'approved' ? (
            <Pressable style={styles.badgeRow} onPress={() => navigation.navigate('Verification')}>
              <View style={[styles.badgeIcon, { backgroundColor: colors.goldSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.goldDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeTitle}>Next: get your Trust Badge</Text>
                <Text style={styles.badgeBody}>
                  Verified ID builds trust — free, reviewed within 72 hours.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* 3 — Account status: tappable verification rows */}
      <View style={styles.card}>
        <Text style={styles.statusLabel}>Account status</Text>
        <View style={[styles.statusRow, styles.statusRowBorder]}>
          <Ionicons
            name={user?.phoneVerified ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={user?.phoneVerified ? colors.forest : colors.goldDark}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Phone</Text>
            <Text style={styles.statusBody}>{user?.phone}</Text>
          </View>
          <Text
            style={[
              styles.statusChip,
              user?.phoneVerified ? styles.statusChipOk : styles.statusChipPending,
            ]}
          >
            {user?.phoneVerified ? 'Verified' : 'Unverified'}
          </Text>
        </View>
        {/* Tap when unverified → prefilled, editable email + code sheet (§5) */}
        <Pressable
          disabled={user?.emailVerified}
          onPress={() => setEmailSheetOpen(true)}
          style={styles.statusRow}
        >
          <Ionicons
            name={user?.emailVerified ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={user?.emailVerified ? colors.forest : colors.goldDark}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Email</Text>
            <Text style={styles.statusBody}>{user?.email || 'Add your email'}</Text>
          </View>
          {user?.emailVerified ? (
            <Text style={[styles.statusChip, styles.statusChipOk]}>Verified</Text>
          ) : (
            <View style={styles.statusAction}>
              <Text style={styles.statusActionText}>Verify</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.forest} />
            </View>
          )}
        </Pressable>
      </View>

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

      {/* Full-screen multistep wizard — fetches the server profile itself,
          opens at the first incomplete step, saves each step partially. */}
      <CompletenessWizard
        visible={wizardOpen}
        role={isHousehelp ? 'househelp' : 'employer'}
        token={token}
        onSaved={onWizardSaved}
        onClose={() => setWizardOpen(false)}
      />

      {/* Avatar capture — brand chooser + guided circle camera (no OS popups) */}
      <ActionSheet
        visible={avatarSheetOpen}
        title="Profile photo"
        subtitle="How would you like to add it?"
        onClose={() => setAvatarSheetOpen(false)}
        options={[
          {
            key: 'camera',
            icon: 'camera-outline',
            label: 'Take photo',
            sub: 'Center yourself in the circle guide',
            onPress: () => setAvatarCam({ startWithGallery: false }),
          },
          {
            key: 'gallery',
            icon: 'images-outline',
            label: 'Choose from gallery',
            sub: 'Cropped to the circle automatically',
            onPress: () => setAvatarCam({ startWithGallery: true }),
          },
        ]}
      />
      <GuidedCapture
        visible={!!avatarCam}
        mode="avatar"
        startWithGallery={!!avatarCam?.startWithGallery}
        onClose={() => setAvatarCam(null)}
        onResult={onAvatarShot}
      />

      {/* Verification / Payments / Settings live in the DRAWER — hamburger
          top-LEFT (ProfileDrawer). Log out is in the drawer footer. */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, flex: 1 },
  // Identity card
  identityCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    marginBottom: 14,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brandSoftBg,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { alignSelf: 'center' },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  avatarBusyText: { marginTop: 8, fontSize: 12, color: colors.muted },
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
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  contactText: { fontSize: 14, color: colors.muted },
  // Shared card
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginBottom: 14,
  },
  // Profile strength
  strengthHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  strengthIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthTitle: { flex: 1, fontSize: 16.5, fontWeight: '800', color: colors.ink },
  strengthCount: { fontSize: 16, fontWeight: '800', color: colors.goldDark },
  strengthBody: { marginTop: 12, fontSize: 14, lineHeight: 21, color: colors.muted },
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 4 },
  missingChip: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  missingChipText: { color: colors.goldDark, fontSize: 12, fontWeight: '700' },
  // Trust badge row
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  badgeBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  // Account status
  statusLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  statusRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  statusTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  statusBody: { marginTop: 1, fontSize: 13, color: colors.muted },
  statusChip: {
    fontSize: 12,
    fontWeight: '800',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  statusChipOk: { color: colors.forest, backgroundColor: colors.greenSoft },
  statusChipPending: { color: colors.goldDark, backgroundColor: colors.goldSoft },
  statusAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusActionText: { color: colors.forest, fontWeight: '800', fontSize: 13.5 },
  footerNote: { textAlign: 'center', fontSize: 12.5, color: colors.muted, paddingVertical: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  resendBtn: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: colors.forest, fontWeight: '700', fontSize: 14.5 },
});
