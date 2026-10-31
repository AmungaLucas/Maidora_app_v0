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
        console.log(`[AUTH] signIn: storing session for ${newUser?.phone || newUser?.id || '?'}`);
        await storage.saveSession(newToken, newUser);
        await storage.clearPendingReg();
        setToken(newToken);
        setUser(newUser);
        setPendingRegState(null);
      },
      // EVENT TRACE (owner request 2026-10-31 — "we can also log the events"):
      // every logout now prints a [AUTH] trail to the Metro console.
      //
      // STATE FIRST (owner report 2026-10-31 — "clicked logout but it didn't
      // navigate to login; it did reset the data until I reload/restart"):
      // the old order awaited storage.clearSession() BEFORE the setters, so
      // any AsyncStorage hiccup cleared the disk session (restart → Login)
      // while the running UI never heard about it (stayed on the tabs). Now
      // token/user flip synchronously — the root stack's auth-key remount
      // fires unconditionally — and storage is cleared after, best-effort.
      signOut: async () => {
        console.log(`[AUTH] signOut: start (had token=${!!token} user=${!!user})`);
        setToken(null);
        setUser(null);
        setProfileCompleteness(null);
        try {
          await storage.clearSession();
          console.log('[AUTH] signOut: session cleared from storage — root remounts on Login');
        } catch (e) {
          // UI has already flipped; a storage failure here only means stale
          // disk keys, which the next signIn overwrites.
          console.log('[AUTH] signOut: storage clear FAILED —', e?.message || e);
        }
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
