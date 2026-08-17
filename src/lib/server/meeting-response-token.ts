import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

const MEETING_RESPONSE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MEETING_RESPONSE_TOKEN_KIND = 'meeting-response';

export type MeetingResponseTokenPayload = {
  kind: 'meeting-response';
  meetingId: string;
  mentorId: string;
  iat: number;
  exp: number;
};

type VerifyMeetingResponseTokenResult =
  | { ok: true; payload: MeetingResponseTokenPayload }
  | { ok: false; reason: string };

const encodeBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const decodeBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

const getMeetingResponseTokenSecret = (): string => {
  const secret = process.env.FEEDBACK_TOKEN_SECRET || process.env.FEEDBACK_FORM_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      'FEEDBACK_TOKEN_SECRET is not configured. Set FEEDBACK_TOKEN_SECRET or FEEDBACK_FORM_SIGNING_SECRET.'
    );
  }
  return secret;
};

const signEncodedPayload = (encodedPayload: string): string =>
  createHmac('sha256', getMeetingResponseTokenSecret()).update(encodedPayload).digest('base64url');

export const createMeetingResponseToken = (
  { meetingId, mentorId }: { meetingId: string; mentorId: string },
  now: Date = new Date()
): string => {
  if (!meetingId) {
    throw new Error('meetingId is required to sign a meeting response token');
  }
  if (!mentorId) {
    throw new Error('mentorId is required to sign a meeting response token');
  }

  const payload: MeetingResponseTokenPayload = {
    kind: MEETING_RESPONSE_TOKEN_KIND,
    meetingId,
    mentorId,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + MEETING_RESPONSE_TOKEN_TTL_MS) / 1000),
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
};

export const verifyMeetingResponseToken = (
  token: string,
  now: Date = new Date()
): VerifyMeetingResponseTokenResult => {
  if (!token) {
    return { ok: false, reason: 'Missing token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, reason: 'Invalid token format' };
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
      return { ok: false, reason: 'Invalid token signature' };
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<MeetingResponseTokenPayload>;

    if (
      payload.kind !== MEETING_RESPONSE_TOKEN_KIND ||
      typeof payload.meetingId !== 'string' ||
      typeof payload.mentorId !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return { ok: false, reason: 'Invalid token payload' };
    }

    const nowInSeconds = Math.floor(now.getTime() / 1000);
    if (payload.exp < nowInSeconds) {
      return { ok: false, reason: 'Token expired' };
    }

    return {
      ok: true,
      payload: payload as MeetingResponseTokenPayload,
    };
  } catch (error) {
    console.error('Failed to verify meeting response token:', error);
    return { ok: false, reason: 'Failed to parse token' };
  }
};

export const buildMeetingResponseUrl = (
  {
    meetingId,
    mentorId,
    intent,
  }: { meetingId: string; mentorId: string; intent: 'accept' | 'decline' },
  now: Date = new Date()
): string => {
  const token = createMeetingResponseToken({ meetingId, mentorId }, now);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://connext-platform.vercel.app';
  const url = new URL('/mentor/respond', baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('intent', intent);
  return url.toString();
};
