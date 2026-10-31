// useCachedResource — instant paints from AsyncStorage + silent revalidate.
//
// Owner request 2026-11-01: "have cache and skeletal loaders". The hub used
// to blank into an ActivityIndicator on every focus; now the LAST good
// payload renders immediately (stale-while-revalidate) and the network
// refresh lands quietly behind it. Skeletons cover the TRUE first launch,
// when no cache exists yet.
//
//   const { data, loading, refresh } = useCachedResource('home/maid-rails', api.maidsRails, token);
//
//   data     — the freshest payload (cache first, then network)
//   loading  — true only when there is NOTHING to paint yet (no cache, first
//              fetch in flight) — exactly the skeleton window
//   refresh  — manual re-fetch (pull-to-refresh / after a mutation)
//
// Cache shape on disk: { at, data }. A failed network fetch never evicts the
// cached copy — offline users keep their last rails. Cache keys are namespaced
// per user id by the caller (role hubs differ).
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@maidora/cache/';

export function useCachedResource(key, fetcher, token, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled && !!token);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const writeCache = useCallback(
    async (value) => {
      try {
        await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data: value }));
      } catch {
        // storage full / transient — cache is best-effort
      }
    },
    [key]
  );

  const load = useCallback(
    async ({ fromCacheOnly = false } = {}) => {
      if (!token || !enabled) return;
      // 1. Cache first — instant paint.
      let cached = null;
      try {
        const raw = await AsyncStorage.getItem(PREFIX + key);
        if (raw) cached = JSON.parse(raw)?.data ?? null;
      } catch {
        cached = null;
      }
      if (cached !== null && mounted.current) {
        setData(cached);
        setLoading(false);
      }
      if (fromCacheOnly) return;
      // 2. Network revalidate — silently overwrites the cached paint.
      try {
        const fresh = await fetcher(token);
        if (fresh !== undefined && fresh !== null && mounted.current) {
          setData(fresh);
          writeCache(fresh);
        }
      } catch {
        // keep whatever is painted (cache or nothing) — never blank on error
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [token, enabled, fetcher, key, writeCache]
  );

  useEffect(() => {
    load();
    // token/key drive; fetcher identity is stable via useCallback at call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, enabled]);

  return { data, loading, refresh: load };
}
