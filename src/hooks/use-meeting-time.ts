'use client';

// src/hooks/use-meeting-time.ts
// Hook that reads the user's timezone preference and returns formatter functions.
// Import and call once per page; pass the returned formatters to child components.

import { useMemo } from 'react';
import {
  convertMeetingTime,
  formatMeetingDateTime,
  DEFAULT_TIMEZONE,
  getUserTimezone,
} from '@/lib/timezone';

export function useMeetingTime(user: { timezone?: string } | null | undefined) {
  const tz = getUserTimezone(user);

  const convert = useMemo(
    () =>
      (dateStr: string, timeStr: string) =>
        convertMeetingTime(dateStr, timeStr, tz),
    [tz]
  );

  const format = useMemo(
    () =>
      (dateStr: string, timeStr: string, includeOffset = true) =>
        formatMeetingDateTime(dateStr, timeStr, tz, includeOffset),
    [tz]
  );

  /**
   * Returns true when the current moment is past the meeting end window.
   * Respects the user's timezone for display but uses UTC for the comparison.
   * @param endWindowHours  How many hours after meeting start is "over". Default 2.
   */
  const isPastMeeting = useMemo(
    () =>
      (dateStr: string, timeStr: string, endWindowHours = 2): boolean => {
        const { utcDate } = convertMeetingTime(dateStr, timeStr, DEFAULT_TIMEZONE);
        const endMs = utcDate.getTime() + endWindowHours * 3600000;
        return Date.now() >= endMs;
      },
    []
  );

  const isOngoing = useMemo(
    () =>
      (dateStr: string, timeStr: string, durationHours = 2): boolean => {
        const { utcDate } = convertMeetingTime(dateStr, timeStr, DEFAULT_TIMEZONE);
        const nowMs = Date.now();
        const startMs = utcDate.getTime();
        const endMs = startMs + durationHours * 3600000;
        return nowMs >= startMs && nowMs < endMs;
      },
    []
  );

  const isUpcoming = useMemo(
    () =>
      (dateStr: string, timeStr: string): boolean => {
        const { utcDate } = convertMeetingTime(dateStr, timeStr, DEFAULT_TIMEZONE);
        return Date.now() < utcDate.getTime();
      },
    []
  );

  return { tz, convert, format, isPastMeeting, isOngoing, isUpcoming };
}