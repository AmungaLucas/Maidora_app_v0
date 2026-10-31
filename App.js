// Maidora Kenya — root navigation.
//
// Flow (per unified spec §3.2 — role is chosen at ONBOARDING, not signup):
//   First install : Splash -> Welcome -> Signup -> OTP -> RoleSelect (onboarding) -> Home
//   Later launch  : Splash -> (auth + onboarding check)
//                     signed in + role set  -> Home (role tabs)
//                     signed in, role unset -> RoleSelect (onboarding)
//                     not signed in         -> Login
//                     onboarding seen       -> Welcome (first-run only)
//                     pending OTP registration -> OTP (survives restart)
//
// Navigation: React Navigation (native-stack + bottom-tabs + drawer).
// NOT expo-router. The drawer lives inside the Profile tab (ProfileDrawer).
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from './src/context/AppContext';
import { colors } from './src/theme';
import { api } from './src/api';

import SplashScreen from './src/screens/auth/SplashScreen';
import WelcomeScreen from './src/screens/auth/WelcomeScreen';
import RoleSelectScreen from './src/screens/auth/RoleSelectScreen';
import SignupScreen from './src/screens/auth/SignupScreen';
import OtpScreen from './src/screens/auth/OtpScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import PaymentScreen from './src/screens/payments/PaymentScreen';
import MaidProfileScreen from './src/screens/employer/MaidProfileScreen';
import PostJobScreen from './src/screens/employer/PostJobScreen';
import JobDetailScreen from './src/screens/maid/JobDetailScreen';
import ChatThreadScreen from './src/screens/chat/ChatThreadScreen';
import KycIntroScreen from './src/screens/verification/KycIntroScreen';
import KycPersonalScreen from './src/screens/verification/KycPersonalScreen';
import KycDocTypeScreen from './src/screens/verification/KycDocTypeScreen';
import KycCaptureScreen from './src/screens/verification/KycCaptureScreen';
import KycReviewScreen from './src/screens/verification/KycReviewScreen';
import KycDoneScreen from './src/screens/verification/KycDoneScreen';
import { EmployerTabs, HousehelpTabs, tabsRouteFor } from './src/navigation/Tabs';

const Stack = createNativeStackNavigator();

// Navigator theme aligned with the Maidora palette — keeps screen-transition
// flashes and the area behind the rounded tab bar corners cream, not white.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand,
    background: colors.cream,
    card: colors.card,
    text: colors.ink,
    border: colors.line,
    notification: colors.gold,
  },
};

function RootNavigator({ navigationRef }) {
  const { booting, token, user, onboardingComplete, pendingReg, signOut, updateUser } = useApp();
  const bootValidatedRef = useRef(false);

  // Validate a cached session against the server on cold start (once per
  // session — /me returns a refreshed 30d token + current user shape, and
  // re-arming on every token change would loop). Network failures keep the
  // cached session (offline tolerance).
  useEffect(() => {
    if (!token || bootValidatedRef.current) return;
    bootValidatedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.me(token);
        if (!cancelled && res && res.user) {
          // Store the refreshed token + user (role, verification, status).
          await updateUser(res.user, res.token);
        }
      } catch (e) {
        if (!cancelled && e && (e.status === 401 || e.status === 403)) {
          signOut();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signOut, updateUser]);

  // [AUTH] EVENT TRACE (owner request 2026-10-31 — "we can also log the
  // events"): prints the navigator's auth key and where a remount would
  // land on every auth-state change, so a field report like "logout didn't
  // navigate" comes with a trail instead of a guess. Expected logout trail:
  //   [AUTH] signOut: start → session cleared → root: key=out → Login
  const authKeyDebug = token && user ? 'in' : 'out';
  // The REAL route name the auth state wants the root stack to sit on — used
  // by the trace, the initial route and the reset effect below. (It used to
  // print the pseudo-name 'tabs' for role-set users; the actual tab route is
  // more useful in a trail.)
  const landingRoute =
    pendingReg ? 'Otp'
    : token && user ? (user?.role ? tabsRouteFor(user) : 'RoleSelect')
    : onboardingComplete ? 'Login'
    : 'Welcome';
  useEffect(() => {
    if (booting) return;
    console.log(
      `[AUTH] root: key=${authKeyDebug} → ${landingRoute} ` +
        `(token=${!!token} user=${!!user} pendingReg=${!!pendingReg} onboarding=${!!onboardingComplete})`
    );
  }, [authKeyDebug, landingRoute, booting, token, user, pendingReg, onboardingComplete]);

  // RESET-BASED AUTH ROUTING (owner trails 2026-10-31 — "logout did not push
  // me to login screen", "still i land on a blank screen after the otp"):
  // the previous mechanism keyed this navigator on the auth state and relied
  // on React unmounting/remounting the whole tree. Both trails show the state
  // flip landing perfectly (every [AUTH] line correct) while the MOUNTED tree
  // silently ignored the remount: logout left tabs/drawer/KYC alive and
  // interactive for a full minute (their API calls 401'd), and the OTP
  // handoff re-rendered the OLD Otp screen blank through its !pendingReg
  // guard. Context updates reach the old tree even when the key remount does
  // not happen. So the remount trick is retired — one persistent navigator
  // plus the documented resetRoot
  // (reactnavigation.org/docs/navigating-without-navigation-prop) whenever
  // the landing differs from the stack's top route. That is the SAME action
  // path as the in-app resets that demonstrably work on this device
  // (RoleSelect → tabs, Login → Otp replace).
  useEffect(() => {
    if (booting) return;
    const top = navigationRef.current?.getRootState?.()?.routes?.slice(-1)[0]?.name;
    if (!top || top === landingRoute) return;
    // While signed OUT, never fight the auth flow's own handoffs — Signup's
    // replace('Otp') and Otp's reset(Welcome) navigate themselves. Only
    // rescue screens that belong to a signed-in tree (tabs/drawer/stack)
    // after a logout or a 401 signOut.
    const authFlowRoute = ['Welcome', 'Login', 'Signup', 'Otp', 'ForgotPassword'].includes(top);
    if (authKeyDebug === 'out' && !authFlowRoute) {
      console.log(`[AUTH] root: resetRoot → ${landingRoute} (top was ${top})`);
      navigationRef.current.resetRoot({ index: 0, routes: [{ name: landingRoute }] });
    } else if (authKeyDebug === 'in' && top !== landingRoute) {
      // Signed-in landing (RoleSelect after OTP / tabs after login) — the
      // old screen belongs to the out-tree and the handoff wants a fresh one.
      console.log(`[AUTH] root: resetRoot → ${landingRoute} (top was ${top})`);
      navigationRef.current.resetRoot({ index: 0, routes: [{ name: landingRoute }] });
    }
  }, [booting, landingRoute, authKeyDebug, navigationRef]);

  if (booting) return <SplashScreen />;

  // Headers (reactnavigation.org/docs/headers + /docs/header-buttons):
  // every NON-tab screen shows the navigator's own branded bar — the back
  // button is automatic in a stack navigator (it appears only when there is
  // somewhere to go back to) and screens title themselves via `options`.
  // Tab screens (EmployerTabs/HousehelpTabs) and chrome-less roots (Splash,
  // Welcome, terminal KycDone) opt out with headerShown: false. Auth flow
  // roots (Login post-logout, Otp with a pending registration, RoleSelect
  // as the onboarding entry) keep the bar too — cream-on-cream it reads as
  // quiet top spacing, and the SAME static config works for their pushed
  // states (back chevron appears automatically).
  //
  // RESET ON AUTH FLIPS (see the reset effect above for the full story):
  // initialRouteName only matters for the FIRST mount after boot — React
  // Navigation ignores it on an already-mounted navigator, so every later
  // auth flip is driven by navigationRef.resetRoot (documented
  // "navigating without the navigation prop" pattern). No navigator key —
  // the key-remount approach (logout fix 2026-10-31) turned out to be the
  // one path that never actually rebuilt the tree on device.
  return (
    <Stack.Navigator
      initialRouteName={landingRoute}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.forest,
        headerTitleStyle: { fontWeight: '800', color: colors.ink },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ title: '' }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ title: '' }} />
      <Stack.Screen name="Otp" component={OtpScreen} options={{ title: '' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: '' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: '' }} />
      <Stack.Screen name="EmployerTabs" component={EmployerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="HousehelpTabs" component={HousehelpTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      {/* Marketplace (unified spec §9/§10) — shared by both roles; the root
          stack's automatic back button returns to the originating tab. */}
      <Stack.Screen name="MaidProfile" component={MaidProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job' }} />
      <Stack.Screen name="PostJob" component={PostJobScreen} options={{ title: 'Post a Job' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: 'Chat' }} />
      {/* KYC / trust badge (§8) — root-stack copies also open from the Home
          banner; inside the Profile drawer the same screens render under the
          drawer's own hamburger header (ProfileDrawer). */}
      <Stack.Screen name="KycIntro" component={KycIntroScreen} options={{ title: 'Trust Badge' }} />
      <Stack.Screen name="KycPersonal" component={KycPersonalScreen} options={{ title: 'Personal details' }} />
      <Stack.Screen name="KycDocType" component={KycDocTypeScreen} options={{ title: 'Your document type' }} />
      {/* Photos checklist — front + back + selfie on ONE screen with the
          guided in-app camera (owner request 2026-10-31). */}
      <Stack.Screen name="KycCapture" component={KycCaptureScreen} options={{ title: 'Your photos' }} />
      <Stack.Screen name="KycReview" component={KycReviewScreen} options={{ title: 'Review your submission' }} />
      <Stack.Screen
        name="KycDone"
        component={KycDoneScreen}
        options={{ headerShown: false }} // terminal — no back into a submitted flow
      />
    </Stack.Navigator>
  );
}

export default function App() {
  // Container-level ref — RootNavigator drives auth routing through it
  // (resetRoot) because the flip can originate anywhere (drawer footer,
  // 401 in the boot validator, OTP success) and those screens' own
  // navigation objects cannot reset the ROOT stack reliably.
  const navigationRef = useNavigationContainerRef();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <RootNavigator navigationRef={navigationRef} />
          </NavigationContainer>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
