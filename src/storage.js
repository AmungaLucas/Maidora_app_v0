// AsyncStorage persistence for session, onboarding flag and pending registration.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  token: '@maidora/token',
  user: '@maidora/user',
  onboarding: '@maidora/onboardingComplete',
  pending: '@maidora/pendingRegistration',
};

export const storage = {
  getToken: () => AsyncStorage.getItem(KEYS.token),

  getUser: async () => {
    const raw = await AsyncStorage.getItem(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  saveSession: (token, user) =>
    Promise.all([
      AsyncStorage.setItem(KEYS.token, token),
      AsyncStorage.setItem(KEYS.user, JSON.stringify(user)),
    ]),

  clearSession: () =>
    Promise.all([AsyncStorage.removeItem(KEYS.token), AsyncStorage.removeItem(KEYS.user)]),

  getOnboarding: async () => (await AsyncStorage.getItem(KEYS.onboarding)) === 'true',

  setOnboarding: (v) => AsyncStorage.setItem(KEYS.onboarding, v ? 'true' : 'false'),

  // Pending registration: { userId, phone, maskedPhone, role, expiresAt }
  // Lets the OTP screen survive an app restart. Expired entries self-clear.
  getPendingReg: async () => {
    const raw = await AsyncStorage.getItem(KEYS.pending);
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw);
      if (pending && pending.expiresAt && Date.now() > pending.expiresAt) {
        await AsyncStorage.removeItem(KEYS.pending);
        return null;
      }
      return pending;
    } catch {
      return null;
    }
  },

  setPendingReg: (pending) => AsyncStorage.setItem(KEYS.pending, JSON.stringify(pending)),

  clearPendingReg: () => AsyncStorage.removeItem(KEYS.pending),
};
