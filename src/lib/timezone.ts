// src/lib/timezone.ts
// Shared timezone utility for displaying meeting times in the user's chosen timezone.
// Default is GMT+8 (Asia/Kuala_Lumpur, Malaysia Standard Time).

export const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur';

export interface TimezoneOption {
  value: string;     // IANA timezone identifier
  label: string;     // Display label shown in dropdown
  offset: string;    // e.g. "UTC+8:00"
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Kuala_Lumpur',    label: 'Malaysia (KL, Sabah, Sarawak)',  offset: 'UTC+8:00' },
  { value: 'Asia/Singapore',       label: 'Singapore',                       offset: 'UTC+8:00' },
  { value: 'Asia/Jakarta',         label: 'Indonesia (WIB – West)',          offset: 'UTC+7:00' },
  { value: 'Asia/Makassar',        label: 'Indonesia (WITA – Central)',      offset: 'UTC+8:00' },
  { value: 'Asia/Jayapura',        label: 'Indonesia (WIT – East)',          offset: 'UTC+9:00' },
  { value: 'Asia/Bangkok',         label: 'Thailand / Vietnam / Laos',       offset: 'UTC+7:00' },
  { value: 'Asia/Ho_Chi_Minh',     label: 'Vietnam (Ho Chi Minh)',           offset: 'UTC+7:00' },
  { value: 'Asia/Manila',          label: 'Philippines',                     offset: 'UTC+8:00' },
  { value: 'Asia/Taipei',          label: 'Taiwan',                          offset: 'UTC+8:00' },
  { value: 'Asia/Shanghai',        label: 'China (CST)',                     offset: 'UTC+8:00' },
  { value: 'Asia/Hong_Kong',       label: 'Hong Kong',                       offset: 'UTC+8:00' },
  { value: 'Asia/Seoul',           label: 'South Korea',                     offset: 'UTC+9:00' },
  { value: 'Asia/Tokyo',           label: 'Japan',                           offset: 'UTC+9:00' },
  { value: 'Asia/Kolkata',         label: 'India (IST)',                     offset: 'UTC+5:30' },
  { value: 'Asia/Karachi',         label: 'Pakistan (PKT)',                  offset: 'UTC+5:00' },
  { value: 'Asia/Dhaka',           label: 'Bangladesh',                      offset: 'UTC+6:00' },
  { value: 'Asia/Colombo',         label: 'Sri Lanka',                       offset: 'UTC+5:30' },
  { value: 'Asia/Kathmandu',       label: 'Nepal',                           offset: 'UTC+5:45' },
  { value: 'Asia/Dubai',           label: 'UAE / Gulf (GST)',                offset: 'UTC+4:00' },
  { value: 'Asia/Riyadh',          label: 'Saudi Arabia (AST)',              offset: 'UTC+3:00' },
  { value: 'Asia/Tehran',          label: 'Iran',                            offset: 'UTC+3:30' },
  { value: 'Asia/Jerusalem',       label: 'Israel',                          offset: 'UTC+2:00' },
  { value: 'Africa/Nairobi',       label: 'Kenya / East Africa (EAT)',       offset: 'UTC+3:00' },
  { value: 'Africa/Lagos',         label: 'Nigeria / West Africa (WAT)',     offset: 'UTC+1:00' },
  { value: 'Africa/Cairo',         label: 'Egypt (EET)',                     offset: 'UTC+2:00' },
  { value: 'Africa/Johannesburg',  label: 'South Africa (SAST)',             offset: 'UTC+2:00' },
  { value: 'Europe/London',        label: 'United Kingdom (GMT/BST)',        offset: 'UTC+0:00' },
  { value: 'Europe/Paris',         label: 'France / Germany / CET',         offset: 'UTC+1:00' },
  { value: 'Europe/Amsterdam',     label: 'Netherlands',                     offset: 'UTC+1:00' },
  { value: 'Europe/Stockholm',     label: 'Sweden / Scandinavia',            offset: 'UTC+1:00' },
  { value: 'Europe/Moscow',        label: 'Russia (Moscow)',                 offset: 'UTC+3:00' },
  { value: 'Australia/Sydney',     label: 'Australia (AEDT – Sydney)',       offset: 'UTC+10:00' },
  { value: 'Australia/Melbourne',  label: 'Australia (AEDT – Melbourne)',    offset: 'UTC+10:00' },
  { value: 'Australia/Perth',      label: 'Australia (AWST – Perth)',        offset: 'UTC+8:00' },
  { value: 'Pacific/Auckland',     label: 'New Zealand (NZST)',              offset: 'UTC+12:00' },
  { value: 'Pacific/Honolulu',     label: 'Hawaii (HST)',                    offset: 'UTC-10:00' },
  { value: 'America/Anchorage',    label: 'Alaska (AKST)',                   offset: 'UTC-9:00' },
  { value: 'America/Los_Angeles',  label: 'US Pacific (PST/PDT)',            offset: 'UTC-8:00' },
  { value: 'America/Denver',       label: 'US Mountain (MST/MDT)',           offset: 'UTC-7:00' },
  { value: 'America/Chicago',      label: 'US Central (CST/CDT)',            offset: 'UTC-6:00' },
  { value: 'America/New_York',     label: 'US Eastern (EST/EDT)',            offset: 'UTC-5:00' },
  { value: 'America/Sao_Paulo',    label: 'Brazil (BRT)',                    offset: 'UTC-3:00' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (ART)',       offset: 'UTC-3:00' },
  { value: 'America/Toronto',      label: 'Canada (Eastern)',                offset: 'UTC-5:00' },
  { value: 'America/Vancouver',    label: 'Canada (Pacific)',                offset: 'UTC-8:00' },
  { value: 'UTC',                  label: 'UTC (Coordinated Universal Time)', offset: 'UTC+0:00' },
];

/**
 * The source of truth for all stored meeting times.
 * Meetings are always stored in Malaysia time (Asia/Kuala_Lumpur / MY_TZ).
 */
export const MY_TZ = 'Asia/Kuala_Lumpur';

/**
 * Convert a meeting date+time (stored in Malaysia TZ) to the user's display timezone.
 * Returns the converted Date object in local (JS) time, adjusted so when you
 * format it with toLocaleTimeString using the target TZ you get the right value.
 *
 * @param dateStr  "YYYY-MM-DD" (Malaysia date)
 * @param timeStr  "HH:mm" or "HH:mm AM/PM" (Malaysia time)
 * @param userTz   IANA timezone of the viewing user (e.g. "America/New_York")
 * @returns        { date: Date, displayTime: string, displayDate: string, tzLabel: string }
 */
export function convertMeetingTime(
  dateStr: string,
  timeStr: string,
  userTz: string = DEFAULT_TIMEZONE
) {
  const targetTz = userTz || DEFAULT_TIMEZONE;

  // Parse time into 24h hours + minutes (stored as Malaysia time)
  let hours = 0;
  let minutes = 0;

  if (timeStr.includes('AM') || timeStr.includes('PM')) {
    const [t, period] = timeStr.trim().split(' ');
    const [h, m] = t.split(':').map(Number);
    hours = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
    minutes = m;
  } else {
    const [h, m] = timeStr.split(':').map(Number);
    hours = h;
    minutes = m;
  }

  // Build an ISO string representing Malaysia local time
  const myLocalIso = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

  // Compute the UTC instant from Malaysia time
  // We use Intl.DateTimeFormat to find the UTC offset for MY_TZ at this moment
  const myDate = new Date(myLocalIso);

  // Compute Malaysia offset in minutes
  const myOffsetMin = getUtcOffsetMinutes(myDate, MY_TZ);
  // Create a Date representing the true UTC instant
  const utcMs = myDate.getTime() - myOffsetMin * 60000;
  const utcDate = new Date(utcMs);

  // Now format in the user's timezone
  const displayTime = utcDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: targetTz,
  });

  const displayDate = utcDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: targetTz,
  });

  const displayDateFull = utcDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: targetTz,
  });

  const tzOpt = TIMEZONE_OPTIONS.find(t => t.value === targetTz);
  const tzLabel = tzOpt ? `${tzOpt.offset}` : targetTz;

  return { utcDate, displayTime, displayDate, displayDateFull, tzLabel };
}

/**
 * Format a meeting date + time for display in a user's timezone.
 * Returns a friendly string like "Mon, Jun 3, 2025 at 9:00 AM (UTC+8:00)"
 */
export function formatMeetingDateTime(
  dateStr: string,
  timeStr: string,
  userTz: string = DEFAULT_TIMEZONE,
  includeOffset = true
): string {
  const { displayDate, displayTime, tzLabel } = convertMeetingTime(dateStr, timeStr, userTz);
  if (includeOffset && userTz !== DEFAULT_TIMEZONE) {
    return `${displayDate} at ${displayTime} (${tzLabel})`;
  }
  return `${displayDate} at ${displayTime}`;
}

/**
 * Get the UTC offset in minutes for an IANA timezone at a given Date.
 * Positive = east of UTC (e.g. Malaysia = +480).
 */
function getUtcOffsetMinutes(date: Date, tz: string): number {
  // Format as UTC and in target TZ, then diff
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr  = date.toLocaleString('en-US', { timeZone: tz });
  const utcMs  = new Date(utcStr).getTime();
  const tzMs   = new Date(tzStr).getTime();
  return (tzMs - utcMs) / 60000;
}

/**
 * Parse a stored meeting datetime (Malaysia TZ) into a real UTC Date.
 * Useful for "is this meeting in the past?" checks accounting for the user's TZ.
 */
export function parseMeetingUtcDate(dateStr: string, timeStr: string): Date {
  const { utcDate } = convertMeetingTime(dateStr, timeStr, MY_TZ);
  return utcDate;
}

/**
 * Get the user's preferred timezone from their profile, with fallback.
 */
export function getUserTimezone(user: { timezone?: string } | null | undefined): string {
  return user?.timezone || DEFAULT_TIMEZONE;
}