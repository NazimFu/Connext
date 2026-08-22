import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay, subDays, subWeeks } from 'date-fns';
import { toZonedTime, fromZonedTime, format as formatTz } from 'date-fns-tz';

export type TokenCycle = {
  status: 'pending' | 'replenished' | 'forfeited';
  meetingId: string;
  meetingDate: string;
  meetingTime: string;
  tokenUsedAt: string;
  feedbackSubmittedAt: string | null;
  feedbackValid: boolean;
  mentorReported: boolean;
  reportRecordedAt: string | null;
  evaluatedAt: string | null;
};

// The timezone all meeting dates/times are stored in
const MEETING_STORAGE_TZ = 'Asia/Kuala_Lumpur';

// Request window: meeting date must be at least 7 days away and at most 30 days away
// Both bounds are compared as calendar dates in Malaysia time.
const REQUEST_WINDOW_MIN_DAYS = 7;
const REQUEST_WINDOW_MAX_DAYS = 30;

// Feedback form: visible 2 hours after meeting time
const FEEDBACK_UNLOCK_HOURS = 2;

// Token replenishment: 30-day cooldown after token usage
//TOKEN TEST 20 DAYS -> 30 to 20
// const REPLENISHMENT_COOLDOWN_DAYS = 30;
const REPLENISHMENT_COOLDOWN_DAYS = 20;

/**
 * Converts a stored meeting date/time (assumed to be in a reference timezone)
 * to display format in the user's timezone.
 */
export const getDisplayMeetingDateTime = (
  dateStr: string,
  timeStr: string,
  referenceTimezone: string,
  displayTimezone: string
): { displayDate: string; displayTime: string } | null => {
  try {
    const utcDateTime = getMeetingDateTime(dateStr, timeStr, referenceTimezone);
    if (!utcDateTime) {
      return null;
    }

    const displayDateTime = toZonedTime(utcDateTime, displayTimezone);
    const displayDate = formatTz(displayDateTime, 'yyyy-MM-dd', { timeZone: displayTimezone });

    const is12Hour = timeStr.includes('AM') || timeStr.includes('PM');
    const displayTime = is12Hour
      ? formatTz(displayDateTime, 'hh:mm a', { timeZone: displayTimezone })
      : formatTz(displayDateTime, 'HH:mm', { timeZone: displayTimezone });

    console.log(
      `[Display DateTime] Original: ${dateStr} ${timeStr} (${referenceTimezone}) → Display: ${displayDate} ${displayTime} (${displayTimezone})`
    );

    return { displayDate, displayTime };
  } catch (error) {
    console.error('Failed to convert display datetime:', { dateStr, timeStr, referenceTimezone, displayTimezone, error });
    return null;
  }
};

/**
 * Parses a date string (YYYY-MM-DD format) and time string into a Date object in the given timezone.
 * Supports both 12-hour (HH:MM AM/PM) and 24-hour (HH:MM) formats.
 * @returns Date object in UTC, or null if parsing fails
 */
export const getMeetingDateTime = (
  dateStr: string,
  timeStr: string,
  timezone: string
): Date | null => {
  try {
    const meetingDate = parseISO(dateStr);
    if (Number.isNaN(meetingDate.getTime())) {
      return null;
    }

    let hours = 0;
    let minutes = 0;

    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      const [rawTime, period] = timeStr.split(' ');
      const [hoursRaw, minutesRaw] = rawTime.split(':').map(Number);
      hours =
        period === 'PM' && hoursRaw !== 12
          ? hoursRaw + 12
          : period === 'AM' && hoursRaw === 12
            ? 0
            : hoursRaw;
      minutes = minutesRaw || 0;
    } else {
      const [hoursRaw, minutesRaw] = timeStr.split(':').map(Number);
      hours = hoursRaw || 0;
      minutes = minutesRaw || 0;
    }

    const zonedDate = toZonedTime(meetingDate, timezone);
    zonedDate.setHours(hours, minutes, 0, 0);

    const utcDate = fromZonedTime(zonedDate, timezone);
    return utcDate;
  } catch (error) {
    console.error('Failed to parse meeting datetime:', { dateStr, timeStr, timezone, error });
    return null;
  }
};

/**
 * Checks if a meeting date is within the valid request window.
 *
 * The window is evaluated purely on CALENDAR DATES in Malaysia time:
 *   - Meeting date must be >= today (MY) + 7 days
 *   - Meeting date must be <= today (MY) + 30 days
 *
 * The meeting time is deliberately ignored — users pick a date on a calendar,
 * and dates on that calendar always refer to Malaysia dates (the storage TZ).
 * The caller's timezone parameter is accepted for API compatibility but is not
 * used in the window calculation so that users in different timezones get the
 * same allowed date range.
 *
 * @param meetingDate  "YYYY-MM-DD" — the Malaysia calendar date the user picked
 * @param meetingTime  ignored for the window check
 * @param _timezone    kept for API compatibility, not used here
 * @param nowUtc       current UTC time (defaults to new Date())
 */
export const isWithinRequestWindow = (
  meetingDate: string,
  meetingTime: string,
  _timezone: string,
  nowUtc: Date = new Date()
): { allowed: boolean; reason?: string } => {
  try {
    // Derive today's calendar date in Malaysia time
    const nowInMY = toZonedTime(nowUtc, MEETING_STORAGE_TZ);
    const todayMY = new Date(
      nowInMY.getFullYear(),
      nowInMY.getMonth(),
      nowInMY.getDate()
    );

    // Parse the meeting date — treat it as a plain calendar date (no TZ shift)
    const parsed = parseISO(meetingDate);
    if (Number.isNaN(parsed.getTime())) {
      return { allowed: false, reason: 'Invalid meeting date' };
    }
    const meetingDayMY = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );

    // Earliest allowed: today (MY) + 7 calendar days
    const earliestAllowed = new Date(todayMY);
    earliestAllowed.setDate(todayMY.getDate() + REQUEST_WINDOW_MIN_DAYS);

    // Latest allowed: today (MY) + 30 calendar days
    const latestAllowed = new Date(todayMY);
    latestAllowed.setDate(todayMY.getDate() + REQUEST_WINDOW_MAX_DAYS);

    console.log(
      `[Request Window] TodayMY: ${todayMY.toDateString()}, MeetingMY: ${meetingDayMY.toDateString()}, Earliest: ${earliestAllowed.toDateString()}, Latest: ${latestAllowed.toDateString()}`
    );

    if (meetingDayMY < earliestAllowed) {
      return {
        allowed: false,
        reason: `Meeting date must be at least ${REQUEST_WINDOW_MIN_DAYS} days from today (Malaysia time)`,
      };
    }

    if (meetingDayMY > latestAllowed) {
      return {
        allowed: false,
        reason: `Meeting date must be within ${REQUEST_WINDOW_MAX_DAYS} days from today (Malaysia time)`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking request window:', error);
    return { allowed: false, reason: 'Failed to validate request window' };
  }
};

/**
 * Returns the earliest and latest selectable dates for the calendar UI.
 * Both bounds are derived from today's date in Malaysia time so the calendar
 * always shows the same allowed range regardless of the user's local timezone.
 */
export const getRequestWindowBounds = (nowUtc: Date = new Date()) => {
  const nowInMY = toZonedTime(nowUtc, MEETING_STORAGE_TZ);
  const todayMY = new Date(
    nowInMY.getFullYear(),
    nowInMY.getMonth(),
    nowInMY.getDate()
  );

  const earliestMeetingDate = new Date(todayMY);
  earliestMeetingDate.setDate(todayMY.getDate() + REQUEST_WINDOW_MIN_DAYS);

  const latestMeetingDate = new Date(todayMY);
  latestMeetingDate.setDate(todayMY.getDate() + REQUEST_WINDOW_MAX_DAYS);
  // Allow selection through the end of the last allowed day
  latestMeetingDate.setHours(23, 59, 59, 999);

  return { earliestMeetingDate, latestMeetingDate };
};

export const isDateWithinRequestWindow = (meetingDate: Date, nowUtc: Date = new Date()): boolean => {
  const { earliestMeetingDate, latestMeetingDate } = getRequestWindowBounds(nowUtc);
  return meetingDate >= earliestMeetingDate && meetingDate <= latestMeetingDate;
};

/**
 * Checks if the feedback form should be visible to the user.
 * Form is visible 2 hours after meeting time (meeting stored in Malaysia TZ).
 */
export const canShowFeedbackForm = (
  tokenCycle: TokenCycle | null | undefined,
  timezone: string,
  nowUtc: Date = new Date()
): boolean => {
  if (!tokenCycle || tokenCycle.status !== 'pending') {
    return false;
  }

  if (tokenCycle.feedbackSubmittedAt && tokenCycle.feedbackValid) {
    return false;
  }

  const meetingDateTime = getMeetingDateTime(
    tokenCycle.meetingDate,
    tokenCycle.meetingTime,
    MEETING_STORAGE_TZ
  );
  if (!meetingDateTime) {
    return false;
  }

  const feedbackUnlockTime = new Date(meetingDateTime.getTime() + FEEDBACK_UNLOCK_HOURS * 60 * 60 * 1000);
  const canShow = isAfter(nowUtc, feedbackUnlockTime);

  console.log(
    `[Feedback Form Visibility] Meeting: ${meetingDateTime.toISOString()}, Unlock: ${feedbackUnlockTime.toISOString()}, Now: ${nowUtc.toISOString()}, Can show: ${canShow}`
  );

  return canShow;
};

/**
 * Checks if feedback submission should be accepted based on timing.
 * Feedback is only valid if submitted at least 2 hours after meeting time (Malaysia TZ).
 */
export const canAcceptFeedbackSubmission = (
  tokenCycle: TokenCycle | null | undefined,
  timezone: string,
  nowUtc: Date = new Date()
): { accepted: boolean; reason?: string } => {
  if (!tokenCycle || tokenCycle.status !== 'pending') {
    return { accepted: false, reason: 'Invalid token cycle status' };
  }

  const meetingDateTime = getMeetingDateTime(
    tokenCycle.meetingDate,
    tokenCycle.meetingTime,
    MEETING_STORAGE_TZ
  );
  if (!meetingDateTime) {
    return { accepted: false, reason: 'Invalid meeting date/time' };
  }

  const feedbackUnlockTime = new Date(meetingDateTime.getTime() + FEEDBACK_UNLOCK_HOURS * 60 * 60 * 1000);

  console.log(
    `[Feedback Acceptance Check] Meeting: ${meetingDateTime.toISOString()}, Unlock: ${feedbackUnlockTime.toISOString()}, Submission: ${nowUtc.toISOString()}`
  );

  if (isBefore(nowUtc, feedbackUnlockTime)) {
    const minutesEarly = Math.ceil((feedbackUnlockTime.getTime() - nowUtc.getTime()) / (60 * 1000));
    return {
      accepted: false,
      reason: `Feedback is not yet available. Try again in ${minutesEarly} minutes.`,
    };
  }

  return { accepted: true };
};

/**
 * Checks if a token can be replenished.
 * Both conditions must be true:
 * 1. 30 days have passed since tokenUsedAt
 * 2. feedbackSubmittedAt exists and feedbackValid is true
 */
export const canReplenishToken = (
  tokenCycle: TokenCycle | null | undefined,
  nowUtc: Date = new Date()
): { canReplenish: boolean; reason?: string } => {
  if (!tokenCycle) {
    return { canReplenish: false, reason: 'No token cycle found' };
  }

  if (tokenCycle.status === 'replenished') {
    return { canReplenish: false, reason: 'Token already replenished' };
  }

  if (tokenCycle.status === 'forfeited') {
    return { canReplenish: false, reason: 'Token cycle forfeited' };
  }

  const tokenUsedAt = parseISO(tokenCycle.tokenUsedAt);
  if (Number.isNaN(tokenUsedAt.getTime())) {
    return { canReplenish: false, reason: 'Invalid tokenUsedAt timestamp' };
  }

  const cooldownEnd = addDays(tokenUsedAt, REPLENISHMENT_COOLDOWN_DAYS);
  const cooldownPassed = isAfter(nowUtc, cooldownEnd) || nowUtc.getTime() === cooldownEnd.getTime();

  console.log(
    `[Token Replenishment Check] TokenUsedAt: ${tokenUsedAt.toISOString()}, Cooldown ends: ${cooldownEnd.toISOString()}, Now: ${nowUtc.toISOString()}, Cooldown passed: ${cooldownPassed}`
  );

  const feedbackSubmitted = !!tokenCycle.feedbackSubmittedAt;
  const feedbackValid = tokenCycle.feedbackValid === true;

  console.log(
    `[Token Replenishment Check] Feedback submitted: ${feedbackSubmitted}, Feedback valid: ${feedbackValid}`
  );

  if (!feedbackSubmitted) {
    return { canReplenish: false, reason: 'Waiting for feedback submission' };
  }

  if (!feedbackValid) {
    return { canReplenish: false, reason: 'Feedback is invalid' };
  }

  if (!cooldownPassed) {
    const msRemaining = cooldownEnd.getTime() - nowUtc.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    return { canReplenish: false, reason: `Cooldown ends in ${daysRemaining} days` };
  }

  return { canReplenish: true };
};

/**
 * Gets the current replenishment state for UI display.
 */
export const getTokenReplenishState = (
  tokenCycle: TokenCycle | null | undefined,
  timezone: string,
  nowUtc: Date = new Date()
): {
  status: 'not_pending' | 'waiting_for_feedback' | 'waiting_for_cooldown' | 'ready_to_replenish';
  message: string;
  daysRemaining?: number;
  minutesRemaining?: number;
} => {
  if (!tokenCycle || tokenCycle.status !== 'pending') {
    return { status: 'not_pending', message: 'No pending token cycle' };
  }

  const feedbackSubmitted = !!tokenCycle.feedbackSubmittedAt;
  const feedbackValid = tokenCycle.feedbackValid === true;

  if (!feedbackSubmitted || !feedbackValid) {
    const meetingDateTime = getMeetingDateTime(
      tokenCycle.meetingDate,
      tokenCycle.meetingTime,
      MEETING_STORAGE_TZ
    );
    if (meetingDateTime) {
      const feedbackUnlockTime = new Date(meetingDateTime.getTime() + FEEDBACK_UNLOCK_HOURS * 60 * 60 * 1000);
      if (isBefore(nowUtc, feedbackUnlockTime)) {
        const minutesRemaining = Math.ceil((feedbackUnlockTime.getTime() - nowUtc.getTime()) / (60 * 1000));
        return {
          status: 'waiting_for_feedback',
          message: `Feedback form available in ${minutesRemaining} minutes`,
          minutesRemaining,
        };
      }
    }
    return {
      status: 'waiting_for_feedback',
      message: 'Please submit the feedback form to replenish your token',
    };
  }

  const tokenUsedAt = parseISO(tokenCycle.tokenUsedAt);
  if (Number.isNaN(tokenUsedAt.getTime())) {
    return { status: 'waiting_for_cooldown', message: 'Processing token replenishment' };
  }

  const cooldownEnd = addDays(tokenUsedAt, REPLENISHMENT_COOLDOWN_DAYS);
  const cooldownPassed = isAfter(nowUtc, cooldownEnd) || nowUtc.getTime() === cooldownEnd.getTime();

  if (!cooldownPassed) {
    const msRemaining = cooldownEnd.getTime() - nowUtc.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    return {
      status: 'waiting_for_cooldown',
      message: `Token will replenish in ${daysRemaining} days`,
      daysRemaining,
    };
  }

  return { status: 'ready_to_replenish', message: 'Token ready to replenish' };
};

// Buffer after a meeting's scheduled end before it's treated as "occurred" (matches
// the mentor/mentee delete-account routes' own copy of this window).
const MEETING_PAST_WINDOW_HOURS = 2;

/**
 * Whether a meeting's date/time (plus a small buffer) has already passed.
 * `scheduled_status` never flips to 'past' in storage — it's computed on read —
 * so callers that need "still upcoming" vs. "already happened" must check this.
 */
export const hasMeetingOccurred = (
  dateStr: string,
  timeStr: string,
  nowUtc: Date = new Date()
): boolean => {
  const meetingDateTime = getMeetingDateTime(dateStr, timeStr, MEETING_STORAGE_TZ);
  if (!meetingDateTime) return false;
  return nowUtc.getTime() >= meetingDateTime.getTime() + MEETING_PAST_WINDOW_HOURS * 60 * 60 * 1000;
};

/**
 * Returns 0-100: how far the current cooldown is toward its end date.
 * 100 whenever there's no active pending cycle (nothing left to wait on).
 */
export const getCooldownProgressPercent = (
  tokenCycle: TokenCycle | null | undefined,
  nowUtc: Date = new Date()
): number => {
  if (!tokenCycle || tokenCycle.status !== 'pending') {
    return 100;
  }

  const tokenUsedAt = parseISO(tokenCycle.tokenUsedAt);
  if (Number.isNaN(tokenUsedAt.getTime())) {
    return 0;
  }

  const cooldownEnd = addDays(tokenUsedAt, REPLENISHMENT_COOLDOWN_DAYS);
  const totalMs = cooldownEnd.getTime() - tokenUsedAt.getTime();
  if (totalMs <= 0) {
    return 100;
  }

  const elapsedMs = nowUtc.getTime() - tokenUsedAt.getTime();
  const percent = (elapsedMs / totalMs) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
};

/**
 * Replenishes a token if all conditions are met (or unconditionally when
 * `options.force` is set — used by the admin override, bypasses the
 * feedback/cooldown eligibility check entirely).
 */
export const replenishTokenIfEligible = (
  menteeDoc: any,
  nowUtc: Date = new Date(),
  options: { force?: boolean } = {}
): { replenished: boolean; reason?: string; tokensAfter?: number } => {
  if (!menteeDoc?.token_cycle) {
    return { replenished: false, reason: 'No token cycle found' };
  }

  if (!options.force) {
    const checkResult = canReplenishToken(menteeDoc.token_cycle, nowUtc);
    if (!checkResult.canReplenish) {
      console.log(`[Token Replenishment] Cannot replenish: ${checkResult.reason}`);
      return { replenished: false, reason: checkResult.reason };
    }
  }

  const tokensBefore = clampToken(menteeDoc.tokens);
  menteeDoc.tokens = Math.min(tokensBefore + 1, 1);
  menteeDoc.token_cycle.status = 'replenished';
  menteeDoc.token_cycle.evaluatedAt = nowUtc.toISOString();

  if (menteeDoc.tokens === tokensBefore) {
    console.log(`[Token Replenishment] Token count did not change (safety check): ${tokensBefore}`);
    return { replenished: false, reason: 'Tokens did not increment (safety check)', tokensAfter: menteeDoc.tokens };
  }

  console.log(
    `[Token Replenishment] Token replenished. Before: ${tokensBefore}, After: ${menteeDoc.tokens}, EvaluatedAt: ${nowUtc.toISOString()}`
  );
  return { replenished: true, tokensAfter: menteeDoc.tokens };
};

export const clampToken = (tokens: unknown): number => {
  const numeric = typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : 0;
  if (numeric <= 0) return 0;
  return 1;
};

export const parseMeetingDateTime = (date: string, time: string): Date | null => {
  try {
    const meetingDate = new Date(date);
    if (Number.isNaN(meetingDate.getTime())) {
      return null;
    }

    if (time.includes('AM') || time.includes('PM')) {
      const [rawTime, period] = time.split(' ');
      const [hoursRaw, minutesRaw] = rawTime.split(':').map(Number);
      const hours =
        period === 'PM' && hoursRaw !== 12
          ? hoursRaw + 12
          : period === 'AM' && hoursRaw === 12
            ? 0
            : hoursRaw;
      meetingDate.setHours(hours, minutesRaw, 0, 0);
      return meetingDate;
    }

    const [hours, minutes] = time.split(':').map(Number);
    meetingDate.setHours(hours, minutes, 0, 0);
    return meetingDate;
  } catch {
    return null;
  }
};

export const buildFreshTokenCycle = (
  meetingId: string,
  meetingDate: string,
  meetingTime: string,
  nowIso: string
): TokenCycle => ({
  status: 'pending',
  meetingId,
  meetingDate,
  meetingTime,
  tokenUsedAt: nowIso,
  feedbackSubmittedAt: null,
  feedbackValid: false,
  mentorReported: false,
  reportRecordedAt: null,
  evaluatedAt: null,
});

export const getTokenCycleEvaluateAtIso = (tokenUsedAtIso: string | null | undefined): string | null => {
  if (!tokenUsedAtIso) return null;
  const tokenUsedAt = new Date(tokenUsedAtIso);
  if (Number.isNaN(tokenUsedAt.getTime())) return null;
  return addDays(tokenUsedAt, REPLENISHMENT_COOLDOWN_DAYS).toISOString();
};

export const evaluateTokenCycleForUser = (user: any, now: Date = new Date()) => {
  if (!user?.token_cycle || user.token_cycle.status !== 'pending') {
    return { changed: false, evaluated: false, replenished: false };
  }

  const tokenUsedAt = new Date(user.token_cycle.tokenUsedAt);
  if (Number.isNaN(tokenUsedAt.getTime())) {
    return { changed: false, evaluated: false, replenished: false };
  }

  // Legacy safety: older records could store a future time as tokenUsedAt
  if (tokenUsedAt > now) {
    user.token_cycle.tokenUsedAt = now.toISOString();
    user.tokens = clampToken(user.tokens);
    return { changed: true, evaluated: false, replenished: false };
  }

  const replenishResult = replenishTokenIfEligible(user, now);
  if (!replenishResult.replenished) {
    user.tokens = clampToken(user.tokens);
    return { changed: false, evaluated: false, replenished: false };
  }

  return { changed: true, evaluated: true, replenished: true };
};