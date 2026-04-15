'use client';

// src/hooks/use-timezone.ts
// Drop this hook into any component that needs to react to live timezone changes.
//
// Usage:
//   const { timezone } = useTimezone(user);
//
// It reads the initial value from the user's profile (same as before), but also
// listens for 'timezone-changed' events dispatched by the profile edit page,
// so the whole app updates instantly without a page reload.

import { useState, useEffect } from 'react';
import { DEFAULT_TIMEZONE, getUserTimezone } from '@/lib/timezone';

export function useTimezone(user: { timezone?: string } | null | undefined): {
  timezone: string;
} {
  const [timezone, setTimezone] = useState<string>(() => {
    // 1. Try localStorage first (set immediately when the user picks a new TZ)
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('userTimezone');
        if (stored) return stored;
      } catch {}
    }
    // 2. Fall back to the user's profile value
    return getUserTimezone(user);
  });

  // Keep in sync when the user object loads/changes
  useEffect(() => {
    const fromUser = getUserTimezone(user);
    setTimezone(prev => {
      // localStorage wins over the user object if it is newer
      try {
        const stored = localStorage.getItem('userTimezone');
        if (stored) return stored;
      } catch {}
      return fromUser;
    });
  }, [user]);

  // Listen for live timezone-changed events (dispatched by the profile edit page)
  useEffect(() => {
    const handler = (e: Event) => {
      const tz = (e as CustomEvent<{ timezone: string }>).detail?.timezone;
      if (tz) setTimezone(tz);
    };
    window.addEventListener('timezone-changed', handler);
    return () => window.removeEventListener('timezone-changed', handler);
  }, []);

  // Also sync across browser tabs via storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'userTimezone' && e.newValue) {
        setTimezone(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return { timezone };
}