"use client";

import { useState, useEffect, useCallback } from "react";

let memoryCache = null;
const listeners = new Set();

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

export async function fetchDiabloData() {
  try {
    const res = await fetch("/api/diablo");
    if (res.status === 401) {
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
  }
  return null;
}

export function useDiabloData() {
  const cached = getCachedDiabloData();
  const [data, setData] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

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

  return { data, loading: loading && !data, error, reload, setData: setCachedDiabloData };
}
