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

// ---------------------------------------------------------------------------
// CORE FIX: localDateTimeToUtcMs
// ---------------------------------------------------------------------------
// The original bug: `new Date("2025-06-03T08:00:00")` is parsed as the
// **browser's local time**, not as Malaysia time. So `getUtcOffsetMinutes`
// was computing the offset against the wrong UTC instant, producing a wildly
// wrong UTC millisecond value — hence Korean mentees seeing 1:00 AM instead
// of 10:00 AM.
//
// The correct approach: interpret the date+time string as UTC first (append
// "Z"), then figure out how far Malaysia is offset from UTC at that moment,
// and subtract to get the true UTC instant. One Newton-step is enough to
// correct for DST edge cases.
// ---------------------------------------------------------------------------

/**
 * Given a local wall-clock date+time string ("YYYY-MM-DDTHH:mm:ss") and an
 * IANA timezone, return the corresponding UTC timestamp in milliseconds.
 *
 * Strategy
 * --------
 * 1. Treat the string naively as UTC (append "Z") → a first-guess Date.
 * 2. Ask Intl what wall-clock time that UTC instant looks like in `tz`.
 * 3. The difference between that wall-clock time and our target is the
 *    residual error. Subtract it to get the true UTC instant.
 *
 * This is robust against DST transitions and does not rely on the browser's
 * own timezone setting at all.
 */
function localDateTimeToUtcMs(localIso: string, tz: string): number {
  // Step 1 – naive parse as UTC
  const naiveUtcMs = new Date(localIso + 'Z').getTime();

  // Step 2 – what does that UTC instant look like in the target timezone?
  const naiveDate = new Date(naiveUtcMs);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(naiveDate);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  // en-CA gives YYYY-MM-DD dates, hour12:false gives 0-23 hours
  let h = get('hour');
  if (h === 24) h = 0; // midnight edge case in some engines
  const tzWallMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));

  // Step 3 – compute the offset error and correct
  const offsetMs = naiveUtcMs - tzWallMs; // tz is ahead → offsetMs is positive
  return naiveUtcMs + offsetMs;            // true UTC instant
}

/**
 * Convert a meeting date+time (stored in Malaysia TZ) to the user's display timezone.
 *
 * @param dateStr  "YYYY-MM-DD" (Malaysia date)
 * @param timeStr  "HH:mm" or "HH:mm AM/PM" (Malaysia time)
 * @param userTz   IANA timezone of the viewing user (e.g. "America/New_York")
 * @returns        { utcDate, displayTime, displayDate, displayDateFull, tzLabel }
 */
export function convertMeetingTime(
  dateStr: string,
  timeStr: string,
  userTz: string = DEFAULT_TIMEZONE
) {
  const targetTz = userTz || DEFAULT_TIMEZONE;

  // --- Parse timeStr into 24-h hours + minutes ---
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

  // Build a wall-clock ISO string representing Malaysia local time (no suffix!)
  const myLocalIso =
    `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

  // ✅ THE FIX: interpret that wall-clock string as Malaysia time → true UTC ms
  const utcMs = localDateTimeToUtcMs(myLocalIso, MY_TZ);
  const utcDate = new Date(utcMs);

  // Format in the user's target timezone
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
  const tzLabel = tzOpt ? tzOpt.offset : targetTz;

  return { utcDate, displayTime, displayDate, displayDateFull, tzLabel };
}

/**
 * Convert a "HH:mm" time string from a user's local timezone into Malaysia time (MY_TZ).
 * Used before storing availability slots in the database.
 *
 * @param timeStr  "HH:mm" in the user's timezone (e.g. "08:00")
 * @param userTz   IANA timezone of the user (e.g. "America/New_York")
 * @returns        "HH:mm" in Malaysia time (e.g. "21:00"), or null if invalid
 */
export function localTimeToMY(timeStr: string, userTz: string): string | null {
  if (!timeStr || !userTz) return null;
  try {
    // Use a fixed reference date (Monday) to avoid DST edge cases
    const referenceDate = '2000-01-03';
    const localIso = `${referenceDate}T${timeStr}:00`;

    // ✅ FIX: treat timeStr as a wall-clock time in userTz → get true UTC ms
    const utcMs = localDateTimeToUtcMs(localIso, userTz);

    // Now read that UTC instant as Malaysia wall-clock time
    const utcDate = new Date(utcMs);
    const myParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: MY_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(utcDate);

    const getP = (type: string) => myParts.find(p => p.type === type)?.value ?? '00';
    let h = parseInt(getP('hour'), 10);
    if (h === 24) h = 0;
    const m = getP('minute');

    return `${String(h).padStart(2, '0')}:${m}`;
  } catch {
    return null;
  }
}

/**
 * Convert a "HH:mm" time string stored in Malaysia time (MY_TZ) into a user's local timezone.
 * Used when loading availability slots from the database for display.
 *
 * @param timeStr  "HH:mm" in Malaysia time (e.g. "21:00")
 * @param userTz   IANA timezone of the user (e.g. "America/New_York")
 * @returns        "HH:mm" in the user's local time (e.g. "08:00"), or null if invalid
 */
export function myTimeToLocal(timeStr: string, userTz: string): string | null {
  if (!timeStr || !userTz) return null;
  try {
    const referenceDate = '2000-01-03';
    const myIso = `${referenceDate}T${timeStr}:00`;

    // ✅ FIX: treat timeStr as Malaysia wall-clock → true UTC ms
    const utcMs = localDateTimeToUtcMs(myIso, MY_TZ);

    // Read that UTC instant as the user's local wall-clock time
    const utcDate = new Date(utcMs);
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(utcDate);

    const getP = (type: string) => localParts.find(p => p.type === type)?.value ?? '00';
    let h = parseInt(getP('hour'), 10);
    if (h === 24) h = 0;
    const m = getP('minute');

    return `${String(h).padStart(2, '0')}:${m}`;
  } catch {
    return null;
  }
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
 * Parse a stored meeting datetime (Malaysia TZ) into a real UTC Date.
 * Useful for "is this meeting in the past?" checks.
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