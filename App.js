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
// Navigation: React Navigation (native-stack). NOT expo-router.
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from './src/context/AppContext';
import { colors } from './src/theme';
import { api } from './src/api';

import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import SignupScreen from './src/screens/SignupScreen';
import OtpScreen from './src/screens/OtpScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PaymentScreen from './src/screens/PaymentScreen';
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

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="EmployerTabs" component={EmployerTabs} />
      <Stack.Screen name="HousehelpTabs" component={HousehelpTabs} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
