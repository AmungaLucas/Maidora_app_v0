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
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
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

function RootNavigator() {
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

  if (booting) return <SplashScreen />;

  let initialRoute = 'Welcome';
  if (pendingReg) initialRoute = 'Otp';
  else if (token && user) initialRoute = user.role ? tabsRouteFor(user) : 'RoleSelect';
  else if (onboardingComplete) initialRoute = 'Login';

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
  // KEY-REMOUNT ON AUTH FLIPS (logout fix, owner report 2026-10-31):
  // React Navigation ignores initialRouteName changes on an already-mounted
  // navigator, so signing out used to strand the UI on the tabs with no
  // session. Keying the navigator on the signed-in STATE makes the whole
  // stack rebuild from the recomputed initial route (Login / RoleSelect /
  // tabs) the moment token+user flip — the same reason logOut in the drawer
  // and Settings now calls signOut() with no navigation calls. Keying on the
  // STATE (not the raw token) keeps token REFRESHES (/me) remount-free.
  const authKey = token && user ? 'in' : 'out';
  return (
    <Stack.Navigator
      key={authKey}
      initialRouteName={initialRoute}
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
