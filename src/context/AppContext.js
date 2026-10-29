// Global app state: session, onboarding flag, pending registration (OTP
// handoff), and the shared §7 profile-completeness snapshot.
//
// Completeness lives HERE (not in the screens) so the Home banner updates
// the instant a step is saved in the Profile wizard — no app restart, no
// stale banner after navigating back. Screens may call refreshCompleteness()
// (e.g. on focus) to re-sync with the server, and setProfileCompleteness()
// directly with the server's response after each save.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../storage';
import { api } from '../api';

const AppContext = createContext(null);

// Minimum time the animated splash stays up (ms) so the "Ping Letters"
// timeline always completes before the first real screen appears.
const SPLASH_MIN_MS = 2600;

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [pendingReg, setPendingRegState] = useState(null);
  const [profileCompleteness, setProfileCompleteness] = useState(null);

  useEffect(() => {
    (async () => {
      const startedAt = Date.now();
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
        // Hold the splash until its intro animation has finished playing.
        const remaining = SPLASH_MIN_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        setBooting(false);
      }
    })();
  }, []);

  // Re-sync §7 completeness from the gateway (role-aware GET /profile).
  // Silent on failure — the banner keeps whatever it last knew.
  const refreshCompleteness = useCallback(async () => {
    if (!token || !user?.role) {
      setProfileCompleteness(null);
      return;
    }
    try {
      const res = await api.getProfile(token);
      setProfileCompleteness(res.completeness || null);
    } catch {
      // Non-blocking: offline / transient errors keep the last snapshot.
    }
  }, [token, user?.role]);

  // Fetch once per session/user change; screens re-call it on focus.
  useEffect(() => {
    refreshCompleteness();
  }, [refreshCompleteness]);

  const value = useMemo(
    () => ({
      booting,
      token,
      user,
      onboardingComplete,
      pendingReg,
      profileCompleteness,
      setProfileCompleteness,
      refreshCompleteness,
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
        setProfileCompleteness(null);
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
      updateUser: async (patch, newToken) => {
        // `patch` may be a partial update OR a full user object (from /auth/me).
        const next = { ...user, ...patch };
        await storage.saveSession(newToken || token, next);
        if (newToken) setToken(newToken);
        setUser(next);
      },
    }),
    [booting, token, user, onboardingComplete, pendingReg, profileCompleteness, refreshCompleteness]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
