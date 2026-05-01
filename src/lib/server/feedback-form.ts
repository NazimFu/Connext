import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { GOOGLE_FORM_CONFIG, generateFeedbackFormUrl } from '@/lib/googleForm';
import { parseMeetingDateTime } from '@/lib/token-cycle';

const FEEDBACK_FORM_OPEN_DELAY_MS = 2 * 60 * 60 * 1000;
const FEEDBACK_TOKEN_TTL_MS = 3650 * 24 * 60 * 60 * 1000;
const FEEDBACK_TOKEN_KIND = 'feedback-submit';

export type FeedbackTokenPayload = {
  kind: 'feedback-submit';
  meetingId: string;
  mentorUid: string;
  iat: number;
  exp: number;
};

type SignedFeedbackFormInput = {
  meetingId: string;
  mentorUid: string;
  menteeName: string;
  mentorName: string;
  sessionDate: string;
  sessionTime: string;
};

type VerifyFeedbackTokenResult =
  | { ok: true; payload: FeedbackTokenPayload }
  | { ok: false; reason: string };

export type SignedFeedbackFormLink = {
  feedbackToken: string;
  formUrl: string;
};

const encodeBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const decodeBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

const getFeedbackTokenSecretOrNull = (): string | null =>
  process.env.FEEDBACK_TOKEN_SECRET || process.env.FEEDBACK_FORM_SIGNING_SECRET || null;

const getFeedbackTokenSecret = (): string => {
  const canonicalSecret = process.env.FEEDBACK_TOKEN_SECRET;
  const legacySecret = process.env.FEEDBACK_FORM_SIGNING_SECRET;
  const secret = canonicalSecret || legacySecret || null;
  if (!secret) {
    throw new Error(
      'FEEDBACK_TOKEN_SECRET is not configured. Set FEEDBACK_TOKEN_SECRET or FEEDBACK_FORM_SIGNING_SECRET.'
    );
  }

  if (!canonicalSecret && legacySecret) {
    console.warn('Using legacy FEEDBACK_FORM_SIGNING_SECRET fallback. Set FEEDBACK_TOKEN_SECRET.');
  }

  return secret;
};

const assertFeedbackTokenFieldConfigured = (): void => {
  if (!GOOGLE_FORM_CONFIG.entryIds.feedbackToken) {
    throw new Error('NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID is not configured');
  }
};

const signEncodedPayload = (encodedPayload: string): string =>
  createHmac('sha256', getFeedbackTokenSecret()).update(encodedPayload).digest('base64url');

export const getFeedbackWindow = (sessionDate: string, sessionTime: string) => {
  const meetingDateTime = parseMeetingDateTime(sessionDate, sessionTime);
  if (!meetingDateTime) {
    throw new Error(`Invalid meeting date/time: ${sessionDate} ${sessionTime}`);
  }

  return {
    meetingDateTime,
    opensAt: new Date(meetingDateTime.getTime() + FEEDBACK_FORM_OPEN_DELAY_MS),
  };
};

export const isWithinFeedbackWindow = (
  sessionDate: string,
  sessionTime: string,
  now: Date = new Date()
): boolean => {
  try {
    const { opensAt } = getFeedbackWindow(sessionDate, sessionTime);
    return now >= opensAt;
  } catch {
    return false;
  }
};

export const createFeedbackToken = (
  {
    meetingId,
    mentorUid,
    sessionDate,
    sessionTime,
  }: Pick<SignedFeedbackFormInput, 'meetingId' | 'mentorUid' | 'sessionDate' | 'sessionTime'>,
  now: Date = new Date()
): string => {
  if (!meetingId) {
    throw new Error('meetingId is required to sign a feedback token');
  }
  if (!mentorUid) {
    throw new Error('mentorUid is required to sign a feedback token');
  }

  const payload: FeedbackTokenPayload = {
    kind: FEEDBACK_TOKEN_KIND,
    meetingId,
    mentorUid,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + FEEDBACK_TOKEN_TTL_MS) / 1000),
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
};

export const createSignedFeedbackFormUrl = (
  input: SignedFeedbackFormInput,
  now: Date = new Date()
): string => {
  return createSignedFeedbackFormLink(input, now).formUrl;
};

export const createSignedFeedbackFormLink = (
  input: SignedFeedbackFormInput,
  now: Date = new Date()
): SignedFeedbackFormLink => {
  assertFeedbackTokenFieldConfigured();

  const feedbackToken = createFeedbackToken(
    {
      meetingId: input.meetingId,
      mentorUid: input.mentorUid,
      sessionDate: input.sessionDate,
      sessionTime: input.sessionTime,
    },
    now
  );

  return {
    feedbackToken,
    formUrl: generateFeedbackFormUrl({
      menteeName: input.menteeName,
      mentorName: input.mentorName,
      sessionDate: input.sessionDate,
      sessionTime: input.sessionTime,
      feedbackToken,
    }),
  };
};

export const maybeCreateSignedFeedbackFormUrl = (
  input: SignedFeedbackFormInput,
  now: Date = new Date()
): string | null => {
  if (!getFeedbackTokenSecretOrNull() || !GOOGLE_FORM_CONFIG.entryIds.feedbackToken) {
    return null;
  }

  if (!isWithinFeedbackWindow(input.sessionDate, input.sessionTime, now)) {
    return null;
  }

  return createSignedFeedbackFormUrl(input, now);
};

export const verifyFeedbackToken = (
  feedbackToken: string,
  now: Date = new Date()
): VerifyFeedbackTokenResult => {
  if (!feedbackToken) {
    return { ok: false, reason: 'Missing feedback token' };
  }

  const parts = feedbackToken.split('.');
  if (parts.length !== 2) {
    return { ok: false, reason: 'Invalid feedback token format' };
  }

  const [encodedPayload, signature] = parts;

  try {
    const expectedSignature = signEncodedPayload(encodedPayload);
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { ok: false, reason: 'Invalid feedback token signature' };
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<FeedbackTokenPayload>;

    if (
      payload.kind !== FEEDBACK_TOKEN_KIND ||
      typeof payload.meetingId !== 'string' ||
      typeof payload.mentorUid !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return { ok: false, reason: 'Invalid feedback token payload' };
    }

    const nowInSeconds = Math.floor(now.getTime() / 1000);
    if (payload.exp < nowInSeconds) {
      return { ok: false, reason: 'Feedback token expired' };
    }

    return {
      ok: true,
      payload: payload as FeedbackTokenPayload,
    };
  } catch (error) {
    console.error('Failed to verify feedback token:', error);
    return { ok: false, reason: 'Failed to parse feedback token' };
  }
};
