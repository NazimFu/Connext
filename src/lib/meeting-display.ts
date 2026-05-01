/**
 * Client-side timezone display utilities
 * Used in React components to show times in the user's timezone
 */

import { getDisplayMeetingDateTime } from '@/lib/token-cycle';

/**
 * Format a meeting for display in the user's timezone
 * @param meeting - Meeting object with date and time
 * @param originatorTimezone - Timezone the meeting was created in (stored in meeting doc or originating user's timezone)
 * @param viewerTimezone - Current user's timezone
 * @returns Formatted display object or null
 */
export const formatMeetingForDisplay = (
  meeting: { date?: string; time?: string; [key: string]: any },
  originatorTimezone: string = 'UTC',
  viewerTimezone: string = 'UTC'
): { displayDate: string; displayTime: string; fullDisplay: string } | null => {
  if (!meeting.date || !meeting.time) {
    return null;
  }

  const converted = getDisplayMeetingDateTime(meeting.date, meeting.time, originatorTimezone, viewerTimezone);
  if (!converted) {
    return null;
  }

  return {
    displayDate: converted.displayDate,
    displayTime: converted.displayTime,
    fullDisplay: `${converted.displayDate} at ${converted.displayTime}`,
  };
};

/**
 * Format multiple meetings with timezone conversion
 */
export const formatMeetingsForDisplay = (
  meetings: Array<{ date?: string; time?: string; [key: string]: any }>,
  originatorTimezone: string = 'UTC',
  viewerTimezone: string = 'UTC'
): Array<{ original: any; display: ReturnType<typeof formatMeetingForDisplay> }> => {
  return meetings.map((meeting) => ({
    original: meeting,
    display: formatMeetingForDisplay(meeting, originatorTimezone, viewerTimezone),
  }));
};
