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

// Test window: finalize cycle 2 hours 30 minutes after token usage.
export const TOKEN_CYCLE_EVALUATION_MS = (2 * 60 + 30) * 60 * 1000;

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
  return new Date(tokenUsedAt.getTime() + TOKEN_CYCLE_EVALUATION_MS).toISOString();
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

  const evaluateAt = new Date(tokenUsedAt.getTime() + TOKEN_CYCLE_EVALUATION_MS);
  if (now < evaluateAt) {
    user.tokens = clampToken(user.tokens);
    return { changed: false, evaluated: false, replenished: false };
  }

  const feedbackValid = user.token_cycle.feedbackValid === true;
  const mentorReported = user.token_cycle.mentorReported === true;
  const replenished = feedbackValid && !mentorReported;

  user.tokens = replenished ? 1 : 0;
  user.token_cycle.status = replenished ? 'replenished' : 'forfeited';
  user.token_cycle.evaluatedAt = now.toISOString();

  return { changed: true, evaluated: true, replenished };
};
