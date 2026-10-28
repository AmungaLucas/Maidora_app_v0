// Global app state: session, onboarding flag, pending registration (OTP handoff).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../storage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [pendingReg, setPendingRegState] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u, onboarding, pending] = await Promise.all([
          storage.getToken(),
          storage.getUser(),
          storage.getOnboarding(),
          storage.getPendingReg(),
        ]);
        setToken(t);
        setUser(u);
        setOnboardingComplete(onboarding);
        setPendingRegState(pending);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      booting,
      token,
      user,
      onboardingComplete,
      pendingReg,
      signIn: async (newToken, newUser) => {
        await storage.saveSession(newToken, newUser);
        await storage.clearPendingReg();
        setToken(newToken);
        setUser(newUser);
        setPendingRegState(null);
      },
      signOut: async () => {
        await storage.clearSession();
        setToken(null);
        setUser(null);
      },
      completeOnboarding: async () => {
        await storage.setOnboarding(true);
        setOnboardingComplete(true);
      },
      setPendingReg: async (pending) => {
        if (pending) {
          await storage.setPendingReg(pending);
        } else {
          await storage.clearPendingReg();
        }
        setPendingRegState(pending);
      },
      updateUser: async (patch) => {
        const next = { ...user, ...patch };
        await storage.saveSession(token, next);
        setUser(next);
      },
    }),
    [booting, token, user, onboardingComplete, pendingReg]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
