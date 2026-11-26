"use client";

import { useState, useEffect, useCallback } from "react";

let memoryCache = null;
const listeners = new Set();
let inFlightCount = 0;
const refreshListeners = new Set();

function notifyRefreshListeners() {
  const busy = inFlightCount > 0;
  refreshListeners.forEach((fn) => fn(busy));
}

export function getCachedDiabloData() {
  if (memoryCache) return memoryCache;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("diablo_cache_v1");
      if (stored) {
        memoryCache = JSON.parse(stored);
        return memoryCache;
      }
    } catch {}
  }
  return null;
}

export function setCachedDiabloData(nextData) {
  memoryCache = nextData;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("diablo_cache_v1", JSON.stringify(nextData));
    } catch {}
  }
  listeners.forEach((fn) => {
    try {
      fn(nextData);
    } catch {}
  });
}

export function clearCachedDiabloData() {
  memoryCache = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("diablo_cache_v1");
    } catch {}
  }
}

export async function logoutSession() {
  clearCachedDiabloData();
  try {
    await fetch("/auth/logout", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  } catch {}
  if (typeof window !== "undefined") {
    window.location.href = "/login?logged_out=1";
  }
}

export async function fetchDiabloData() {
  inFlightCount += 1;
  notifyRefreshListeners();
  try {
    const res = await fetch("/api/diablo", { cache: "no-store" });
    if (res.status === 401) {
      clearCachedDiabloData();
      if (typeof window !== "undefined") window.location.href = "/login";
      return null;
    }
    const json = await res.json();
    if (res.ok) {
      setCachedDiabloData(json);
      return json;
    }
  } catch (err) {
    console.error("[Diablo Client] Fetch error:", err);
  } finally {
    inFlightCount = Math.max(0, inFlightCount - 1);
    notifyRefreshListeners();
  }
  return null;
}

export function useDiabloRefreshing() {
  const [refreshing, setRefreshing] = useState(inFlightCount > 0);

  useEffect(() => {
    const listener = (busy) => setRefreshing(busy);
    refreshListeners.add(listener);
    setRefreshing(inFlightCount > 0);
    return () => {
      refreshListeners.delete(listener);
    };
  }, []);

  return refreshing;
}

export function useDiabloData() {
  const cached = getCachedDiabloData();
  const [data, setData] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const refreshing = useDiabloRefreshing();

  useEffect(() => {
    // Listen to cache updates from any tab or component
    const listener = (fresh) => {
      setData(fresh);
      setLoading(false);
    };
    listeners.add(listener);

    // Revalidate in background
    let mounted = true;
    fetchDiabloData().then((fresh) => {
      if (mounted) {
        if (fresh) {
          setData(fresh);
        }
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const reload = useCallback(async () => {
    return await fetchDiabloData();
  }, []);

  return { data, loading: loading && !data, refreshing, error, reload, setData: setCachedDiabloData };
}
