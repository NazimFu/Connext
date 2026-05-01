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

// Request window: 1 week before to 30 days before meeting
const REQUEST_WINDOW_MIN_WEEKS = 1;
const REQUEST_WINDOW_MAX_DAYS = 30;

// Feedback form: visible 2 hours after meeting time
const FEEDBACK_UNLOCK_HOURS = 2;

// Token replenishment: 30-day cooldown after token usage
const REPLENISHMENT_COOLDOWN_DAYS = 30;

// Token cycle evaluation uses the same 1-month cooldown rule as replenishment.

/**
 * Converts a stored meeting date/time (assumed to be in a reference timezone) 
 * to display format in the user's timezone.
 * 
 * @param dateStr - Stored date in YYYY-MM-DD format
 * @param timeStr - Stored time in HH:MM or HH:MM AM/PM format
 * @param referenceTimezone - Timezone the meeting date/time was recorded in (e.g., mentee's timezone)
 * @param displayTimezone - User's timezone to display the time in
 * @returns { displayDate, displayTime } in the user's timezone, or null if parsing fails
 */
export const getDisplayMeetingDateTime = (
  dateStr: string,
  timeStr: string,
  referenceTimezone: string,
  displayTimezone: string
): { displayDate: string; displayTime: string } | null => {
  try {
    // First convert to UTC using reference timezone
    const utcDateTime = getMeetingDateTime(dateStr, timeStr, referenceTimezone);
    if (!utcDateTime) {
      return null;
    }

    // Then convert to display timezone
    const displayDateTime = toZonedTime(utcDateTime, displayTimezone);

    // Format back to YYYY-MM-DD and HH:MM
    const displayDate = formatTz(displayDateTime, 'yyyy-MM-dd', { timeZone: displayTimezone });
    
    // Check if input was in 12-hour format
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
 * Parses a date string (YYYY-MM-DD format) and time string into a Date object in the user's timezone.
 * Supports both 12-hour (HH:MM AM/PM) and 24-hour (HH:MM) formats.
 * @param dateStr - Date in YYYY-MM-DD format
 * @param timeStr - Time in HH:MM or HH:MM AM/PM format
 * @param timezone - IANA timezone (e.g., "Asia/Kuala_Lumpur", "America/New_York")
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

    // Parse time format (supports both 12-hour and 24-hour)
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

    // Create local time in user's timezone
    const zonedDate = toZonedTime(meetingDate, timezone);
    zonedDate.setHours(hours, minutes, 0, 0);

    // Convert back to UTC
    const utcDate = fromZonedTime(zonedDate, timezone);
    return utcDate;
  } catch (error) {
    console.error('Failed to parse meeting datetime:', { dateStr, timeStr, timezone, error });
    return null;
  }
};

/**
 * Checks if a request is within the valid request window.
 * Valid window: 1 week before to 30 days before meeting
 * @returns { allowed: boolean; reason: string } or { allowed: boolean; reason?: string } if allowed
 */
export const isWithinRequestWindow = (
  meetingDate: string,
  meetingTime: string,
  timezone: string,
  nowUtc: Date = new Date()
): { allowed: boolean; reason?: string } => {
  try {
    const meetingDateTime = getMeetingDateTime(meetingDate, meetingTime, timezone);
    if (!meetingDateTime) {
      return { allowed: false, reason: 'Invalid meeting date/time' };
    }

    const earliestAllowedRequestAt = subDays(meetingDateTime, REQUEST_WINDOW_MAX_DAYS);
    const latestAllowedRequestAt = subWeeks(meetingDateTime, REQUEST_WINDOW_MIN_WEEKS);

    console.log(
      `[Request Window] Now: ${nowUtc.toISOString()}, Meeting: ${meetingDateTime.toISOString()}, EarliestAllowed: ${earliestAllowedRequestAt.toISOString()}, LatestAllowed: ${latestAllowedRequestAt.toISOString()}`
    );

    if (isBefore(nowUtc, earliestAllowedRequestAt)) {
      return { allowed: false, reason: 'Meeting is more than 30 days away' };
    }

    if (isAfter(nowUtc, latestAllowedRequestAt)) {
      return { allowed: false, reason: 'Meeting is less than 1 week away' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking request window:', error);
    return { allowed: false, reason: 'Failed to validate request window' };
  }
};

export const getRequestWindowBounds = (nowUtc: Date = new Date()) => {
  const earliestMeetingDate = startOfDay(addDays(nowUtc, 7));
  const latestMeetingDate = endOfDay(addDays(nowUtc, REQUEST_WINDOW_MAX_DAYS));
  return {
    earliestMeetingDate,
    latestMeetingDate,
  };
};

export const isDateWithinRequestWindow = (meetingDate: Date, nowUtc: Date = new Date()): boolean => {
  const { earliestMeetingDate, latestMeetingDate } = getRequestWindowBounds(nowUtc);
  return meetingDate >= earliestMeetingDate && meetingDate <= latestMeetingDate;
};

/**
 * Checks if the feedback form should be visible to the user.
 * Form is visible 2 hours after meeting time.
 * @param tokenCycle - The token cycle record
 * @param timezone - User's timezone
 * @param nowUtc - Current time in UTC
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
    return false; // Already submitted valid feedback
  }

  const meetingDateTime = getMeetingDateTime(tokenCycle.meetingDate, tokenCycle.meetingTime, timezone);
  if (!meetingDateTime) {
    return false;
  }

  const feedbackUnlockTime = new Date(meetingDateTime.getTime() + FEEDBACK_UNLOCK_HOURS * 60 * 60 * 1000);
  const canShow = isAfter(nowUtc, feedbackUnlockTime);

  console.log(`[Feedback Form Visibility] Meeting: ${meetingDateTime.toISOString()}, Unlock: ${feedbackUnlockTime.toISOString()}, Now: ${nowUtc.toISOString()}, Can show: ${canShow}`);

  return canShow;
};

/**
 * Checks if feedback submission should be accepted based on timing.
 * Feedback is only valid if submitted at least 2 hours after meeting time.
 * @param tokenCycle - The token cycle record
 * @param timezone - User's timezone
 * @param nowUtc - Current time in UTC (submission time)
 */
export const canAcceptFeedbackSubmission = (
  tokenCycle: TokenCycle | null | undefined,
  timezone: string,
  nowUtc: Date = new Date()
): { accepted: boolean; reason?: string } => {
  if (!tokenCycle || tokenCycle.status !== 'pending') {
    return { accepted: false, reason: 'Invalid token cycle status' };
  }

  const meetingDateTime = getMeetingDateTime(tokenCycle.meetingDate, tokenCycle.meetingTime, timezone);
  if (!meetingDateTime) {
    return { accepted: false, reason: 'Invalid meeting date/time' };
  }

  const feedbackUnlockTime = new Date(meetingDateTime.getTime() + FEEDBACK_UNLOCK_HOURS * 60 * 60 * 1000);

  console.log(`[Feedback Acceptance Check] Meeting: ${meetingDateTime.toISOString()}, Unlock: ${feedbackUnlockTime.toISOString()}, Submission: ${nowUtc.toISOString()}`);

  if (isBefore(nowUtc, feedbackUnlockTime)) {
    const minutesEarly = Math.ceil((feedbackUnlockTime.getTime() - nowUtc.getTime()) / (60 * 1000));
    return { accepted: false, reason: `Feedback is not yet available. Try again in ${minutesEarly} minutes.` };
  }

  return { accepted: true };
};

/**
 * Checks if a token can be replenished for a user.
 * Token can be replenished when BOTH conditions are true:
 * 1. 30 days have passed from tokenUsedAt
 * 2. feedbackSubmittedAt exists and feedbackValid is true
 * @param tokenCycle - The token cycle record
 * @param nowUtc - Current time in UTC
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

  // Check if 30 days have passed since token usage
  const tokenUsedAt = parseISO(tokenCycle.tokenUsedAt);
  if (Number.isNaN(tokenUsedAt.getTime())) {
    return { canReplenish: false, reason: 'Invalid tokenUsedAt timestamp' };
  }

  const cooldownEnd = addDays(tokenUsedAt, REPLENISHMENT_COOLDOWN_DAYS);
  const cooldownPassed = isAfter(nowUtc, cooldownEnd) || nowUtc.getTime() === cooldownEnd.getTime();

  console.log(`[Token Replenishment Check] TokenUsedAt: ${tokenUsedAt.toISOString()}, Cooldown ends: ${cooldownEnd.toISOString()}, Now: ${nowUtc.toISOString()}, Cooldown passed: ${cooldownPassed}`);

  // Check if feedback has been submitted and is valid
  const feedbackSubmitted = !!tokenCycle.feedbackSubmittedAt;
  const feedbackValid = tokenCycle.feedbackValid === true;

  console.log(`[Token Replenishment Check] Feedback submitted: ${feedbackSubmitted}, Feedback valid: ${feedbackValid}`);

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
 * Returns what the user should see while waiting for token replenishment.
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
    // Check if feedback form is even available
    const meetingDateTime = getMeetingDateTime(tokenCycle.meetingDate, tokenCycle.meetingTime, timezone);
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
    return { status: 'waiting_for_feedback', message: 'Please submit the feedback form to replenish your token' };
  }

  // Feedback is submitted, check cooldown
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

/**
 * Replenishes a token if all conditions are met.
 * This should be called by cron jobs or on-demand replenishment endpoints.
 * @param menteeDoc - The mentee document from Cosmos DB
 * @param nowUtc - Current time in UTC
 * @returns { replenished: boolean; reason?: string; tokensAfter?: number }
 */
export const replenishTokenIfEligible = (
  menteeDoc: any,
  nowUtc: Date = new Date()
): { replenished: boolean; reason?: string; tokensAfter?: number } => {
  if (!menteeDoc?.token_cycle) {
    return { replenished: false, reason: 'No token cycle found' };
  }

  const checkResult = canReplenishToken(menteeDoc.token_cycle, nowUtc);
  if (!checkResult.canReplenish) {
    console.log(`[Token Replenishment] Cannot replenish: ${checkResult.reason}`);
    return { replenished: false, reason: checkResult.reason };
  }

  // Perform replenishment
  const tokensBefore = clampToken(menteeDoc.tokens);
  menteeDoc.tokens = Math.min(tokensBefore + 1, 1); // Max 1 token
  menteeDoc.token_cycle.status = 'replenished';
  menteeDoc.token_cycle.evaluatedAt = nowUtc.toISOString();

  // Only mark as replenished if tokens actually changed
  if (menteeDoc.tokens === tokensBefore) {
    console.log(`[Token Replenishment] Token count did not change (safety check): ${tokensBefore}`);
    return { replenished: false, reason: 'Tokens did not increment (safety check)', tokensAfter: menteeDoc.tokens };
  }

  console.log(`[Token Replenishment] Token replenished. Before: ${tokensBefore}, After: ${menteeDoc.tokens}, EvaluatedAt: ${nowUtc.toISOString()}`);
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

  // Legacy safety: older records could store future meeting time as tokenUsedAt.
  // Normalize to current time so requesters are not blocked indefinitely.
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
