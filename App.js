// Maidora Kenya — root navigation.
//
// Flow (per spec):
//   First install : Splash -> Welcome -> RoleSelect -> Signup -> OTP -> Home
//   Later launch  : Splash -> (auth + onboarding check)
//                     signed in            -> Home
//                     not signed in        -> Login
//                     onboarding pending   -> Welcome
//                   pending OTP registration -> OTP (survives restart)
//
// Navigation: React Navigation (native-stack). NOT expo-router.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from './src/context/AppContext';
import { api } from './src/api';

import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import SignupScreen from './src/screens/SignupScreen';
import OtpScreen from './src/screens/OtpScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { booting, token, user, onboardingComplete, pendingReg, signOut } = useApp();

  // Validate a cached session against the server on cold start.
  // Network failures keep the cached session (offline tolerance).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api.me(token);
      } catch (e) {
        if (!cancelled && e && (e.status === 401 || e.status === 403)) {
          signOut();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signOut]);

  if (booting) return <SplashScreen />;

  let initialRoute = 'Welcome';
  if (pendingReg) initialRoute = 'Otp';
  else if (token && user) initialRoute = 'Home';
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
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
