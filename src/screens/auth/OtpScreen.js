// OTP verification — 6-digit SMS code. UI rebuilt (owner request 2026-11-01):
//   • COMPACT LAYOUT — the resend counter and "Wrong number? Start over" sit
//     right under the input (they used to pin to the screen bottom and hide
//     behind the open keyboard). Screen's built-in KeyboardAvoidingView
//     (iOS padding / Android height) lifts the whole block with the keyboard.
//   • Paste code button REMOVED (owner) — the OS SMS autofill still works:
//     iOS textContentType="oneTimeCode", Android autoComplete="sms-otp"
//     (Gboard surfaces the code on Android 10+). Full SMS Retriever
//     (expo-otp-autofill) stays deferred to a production build — native
//     module, crashes Expo Go (see git history).
//   • KEYBOARD RELIABLY RE-OPENS — tapping the boxes re-focuses the hidden
//     input through a blur → next-frame focus cycle: a plain focus() is a
//     no-op when Android already considers the field focused after a
//     keyboard dismiss (owner: "when i dismiss the keyboard i cant launch
//     it again").
//   • ANIMATIONS (Reanimated): each box pops as its digit lands and the
//     active box lifts; a wrong code shakes the row and flashes the boxes
//     red; a correct code sends a green wave across the boxes before the
//     handoff (the beat is deliberate — the root reset follows right after).
// Logic unchanged: pendingReg from context (survives restart), finishingRef
// handoff, NO manual navigation — the root stack's reset effect (App.js)
// lands RoleSelect or the role tabs.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen } from '../../ui';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

// One OTP box — owns its own micro-animations so the parent only flips
// simple props (digit / active / phase).
function OtpBox({ digit, active, phase, index }) {
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const flash = useSharedValue(0); // 0 = resting colors, 1 = error/success color

  // Digit lands → pop.
  useEffect(() => {
    if (digit) {
      scale.value = withSequence(
        withTiming(1.14, { duration: 90 }),
        withSpring(1, { damping: 13, stiffness: 220 })
      );
    }
  }, [digit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active box lifts a touch so the entry point reads at a glance.
  useEffect(() => {
    lift.value = withTiming(active ? -3 : 0, { duration: 140 });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrong code → every box flashes red (row shake handled by the parent).
  useEffect(() => {
    if (phase === 'error') {
      flash.value = withSequence(
        withTiming(1, { duration: 110 }),
        withTiming(0, { duration: 430 })
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Correct code → green wave sweeps left-to-right, box bounces in turn.
  useEffect(() => {
    if (phase === 'success') {
      flash.value = withDelay(index * 60, withTiming(1, { duration: 120 }));
      scale.value = withDelay(
        index * 60,
        withSequence(withTiming(1.12, { duration: 100 }), withSpring(1, { damping: 13 }))
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
    borderColor: interpolateColor(
      flash.value,
      [0, 1],
      [active ? colors.forest : colors.line, phase === 'error' ? colors.danger : colors.brandSoft]
    ),
    backgroundColor: interpolateColor(
      flash.value,
      [0, 1],
      [colors.card, phase === 'error' ? colors.dangerSoft : colors.greenSoft]
    ),
  }));

  return (
    <Animated.View style={[styles.box, active && styles.boxActive, boxStyle]}>
      <Text style={styles.boxDigit}>{digit || ''}</Text>
    </Animated.View>
  );
}

export default function OtpScreen({ navigation }) {
  const { pendingReg, setPendingReg, signIn } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  // 'idle' | 'error' | 'success' — drives the box animations.
  const [phase, setPhase] = useState('idle');
  const inputRef = useRef(null);
  const submittedRef = useRef('');
  const clearTimerRef = useRef(null);
  // True while a successful verify is handing off to the session — suppresses
  // the !pendingReg reset below and keeps THIS screen's content up (no blank
  // frame) until the root stack's reset (App.js) swaps it out.
  const finishingRef = useRef(false);
  // Last known phone label — pendingReg is already null during the handoff
  // window, but the screen must keep its content until the reset lands.
  const phoneLabelRef = useRef(null);
  if (pendingReg) phoneLabelRef.current = pendingReg.maskedPhone || pendingReg.phone || null;

  // Row shake on a wrong code.
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  useEffect(() => {
    if (!pendingReg && !finishingRef.current) {
      // Direct nav with nothing pending — send the user back to the start.
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    }
  }, [pendingReg, navigation]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  useEffect(() => () => clearTimeout(clearTimerRef.current), []);

  // Android quirk (owner report 2026-11-01 — "when i dismiss the keyboard i
  // cant launch it again"): after a keyboard dismiss the field is still the
  // FOCUSED input, so a plain focus() is a no-op. Blur first, then focus on
  // the next frame — the keyboard reliably comes back.
  const refocus = () => {
    const input = inputRef.current;
    if (!input) return;
    input.blur();
    requestAnimationFrame(() => input.focus());
  };

  const flashError = (erroredValue) => {
    setPhase('error');
    shake.value = withSequence(
      withTiming(-9, { duration: 60 }),
      withTiming(9, { duration: 70 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 50 })
    );
    // Hold the digits through the shake + red flash, THEN clear — but never
    // wipe digits the user already started retyping. submittedRef clears
    // immediately so the SAME code can be re-entered and re-verified.
    submittedRef.current = '';
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      setCode((c) => (c === erroredValue ? '' : c));
      setPhase('idle');
    }, 560);
  };

  const verify = async (value) => {
    if (!pendingReg || verifying || value.length !== CODE_LENGTH) return;
    setVerifying(true);
    setError('');
    finishingRef.current = true;
    try {
      const res = await api.verifyOtp({ userId: pendingReg.userId, code: value });
      // Success beat: the green wave plays BEFORE the handoff — the root
      // reset lands the moment signIn commits, so this is the one visible
      // "verified" moment. ~0.6s, deliberate.
      setPhase('success');
      await new Promise((r) => setTimeout(r, 640));
      // NO setPendingReg(null) here (owner report 2026-10-31 — "blank screen
      // with back arrow"): the old explicit await flipped pendingReg BEFORE
      // signIn committed, which (a) hit the empty guard below and rendered
      // this screen EMPTY under the stack header, and (b) put the root in a
      // transient key=out → Login state ahead of the real landing. signIn
      // clears pendingReg itself, batched with token+user in ONE render.
      await signIn(res.token, res.user);
      // NO manual navigation here (same principle as the 2026-10-31 logout
      // fix): signIn flips the session and the root stack's reset effect
      // (App.js — navigationRef.resetRoot) lands RoleSelect while no role
      // is set, the role tabs after onboarding. A manual reset here races
      // that root reset and could land the user on the wrong screen.
    } catch (e) {
      finishingRef.current = false;
      setError(e.message || 'Verification failed. Please try again.');
      flashError(value);
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (text) => {
    const clean = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(clean);
    setError('');
    if (phase === 'error') setPhase('idle'); // typing after a shake → back to normal
    if (clean.length === CODE_LENGTH && submittedRef.current !== clean) {
      submittedRef.current = clean;
      verify(clean);
    }
  };

  const resend = async () => {
    if (!pendingReg || resending || seconds > 0) return;
    setResending(true);
    setError('');
    try {
      const res = await api.resendOtp({ userId: pendingReg.userId });
      setSeconds(RESEND_SECONDS);
      if (res.otpSent === false) {
        setInfo(res.note || 'We could not send the SMS right now. Please try again shortly.');
      } else {
        setInfo('A new code is on its way.');
      }
    } catch (e) {
      setError(e.message || 'Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // Direct nav with nothing pending AND no handoff in flight → empty screen
  // (the reset effect above sends the user back to the start). Mid-handoff
  // (finishingRef) KEEP the real UI up: pendingReg is already null but the
  // root reset to RoleSelect lands in this same commit — rendering the empty
  // guard here is exactly the blank screen the owner kept seeing
  // (owner report 2026-10-31: "still i land on a blank screen after the otp").
  if (!pendingReg && !finishingRef.current) return <Screen scroll={false} />;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {/* Back button comes from the native-stack header (App.js); the title
          stays in the content. */}
      <Text style={styles.title}>Verify your phone</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to{' '}
        <Text style={styles.phone}>{phoneLabelRef.current || 'your phone'}</Text>
      </Text>

      <Pressable style={styles.boxesPressable} onPress={refocus}>
        <Animated.View style={[styles.boxes, shakeStyle]}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <OtpBox
              key={i}
              index={i}
              digit={code[i]}
              active={code.length === i}
              phase={phase}
            />
          ))}
        </Animated.View>
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        style={styles.hiddenInput}
      />
      <Text style={styles.hint}>Enter the code. It expires in 10 minutes.</Text>

      <View style={styles.bannerWrap}>
        <Banner kind="info" message={info} />
        <Banner message={error} />
      </View>

      <PrimaryButton
        title="Verify & Continue"
        onPress={() => verify(code)}
        disabled={code.length !== CODE_LENGTH}
        loading={verifying}
        style={styles.cta}
      />

      {/* Sits right after the input — always visible above the keyboard. */}
      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text style={styles.resendWait}>Resend code in {seconds}s</Text>
        ) : (
          <Pressable onPress={resend} hitSlop={8}>
            <Text style={styles.resendLink}>{resending ? 'Sending…' : 'Resend code'}</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.changeNumberRow}
        hitSlop={8}
        onPress={async () => {
          await setPendingReg(null);
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        }}
      >
        <Text style={styles.changeNumberText}>Wrong number? Start over</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 10 },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.muted },
  phone: { color: colors.forest, fontWeight: '700' },
  boxesPressable: { marginTop: 24 },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  box: {
    width: 48,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderWidth: 2 },
  boxDigit: { fontSize: 24, fontWeight: '800', color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  hint: { marginTop: 12, fontSize: 13, color: colors.muted, textAlign: 'center' },
  bannerWrap: { marginTop: 10 },
  cta: { marginTop: 12 },
  resendRow: { alignItems: 'center', marginTop: 16 },
  resendWait: { color: colors.muted, fontSize: 14 },
  resendLink: { color: colors.forest, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
  changeNumberRow: { alignItems: 'center', marginTop: 12 },
  changeNumberText: { color: colors.muted, fontSize: 13.5 },
});
