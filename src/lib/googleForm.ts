/**
 * Google Form configuration and utilities for feedback collection
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const GOOGLE_FORM_CONFIG = {
  baseUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdVEs5LL2tLlH5yshUYpPW5XhNlB9_rtV5-PkE6438qpqJg5g/viewform',
  entryIds: {
    menteeName: 'entry.1761271270',
    mentorName: 'entry.768740967',
    sessionDate: 'entry.1198034537',
    sessionTime: 'entry.183080322',
    trackingToken: process.env.GOOGLE_FORM_ENTRY_TRACKING_TOKEN || '',
    trackingMeetingId: process.env.GOOGLE_FORM_ENTRY_MEETING_ID || '',
    trackingMenteeId: process.env.GOOGLE_FORM_ENTRY_MENTEE_ID || '',
    trackingSignature: process.env.GOOGLE_FORM_ENTRY_SIGNATURE || ''
  }
};

interface FeedbackFormParams {
  menteeName: string;
  mentorName: string;
  sessionDate: string; // Format: YYYY-MM-DD
  sessionTime: string; // Format: HH:MM
  trackingToken?: string;
  meetingId?: string;
  menteeId?: string;
}

const buildTrackingPayload = (meetingId: string, menteeId: string): string => `${meetingId}:${menteeId}`;
const buildTokenTrackingPayload = (trackingToken: string): string => `token:${trackingToken}`;

export function createFeedbackTrackingSignature(meetingId: string, menteeId: string): string {
  const signingSecret = process.env.FEEDBACK_FORM_SIGNING_SECRET;
  if (!signingSecret) {
    throw new Error('FEEDBACK_FORM_SIGNING_SECRET is missing.');
  }

  return createHmac('sha256', signingSecret)
    .update(buildTrackingPayload(meetingId, menteeId), 'utf8')
    .digest('hex');
}

export function verifyFeedbackTrackingSignature(
  meetingId: string,
  menteeId: string,
  signature: string
): boolean {
  if (!signature) return false;

  try {
    const expected = createFeedbackTrackingSignature(meetingId, menteeId);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

export function createFeedbackTrackingTokenSignature(trackingToken: string): string {
  const signingSecret = process.env.FEEDBACK_FORM_SIGNING_SECRET;
  if (!signingSecret) {
    throw new Error('FEEDBACK_FORM_SIGNING_SECRET is missing.');
  }

  return createHmac('sha256', signingSecret)
    .update(buildTokenTrackingPayload(trackingToken), 'utf8')
    .digest('hex');
}

export function verifyFeedbackTrackingTokenSignature(
  trackingToken: string,
  signature: string
): boolean {
  if (!trackingToken || !signature) return false;

  try {
    const expected = createFeedbackTrackingTokenSignature(trackingToken);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generate a pre-filled Google Form URL with session details
 */
export function generateFeedbackFormUrl({
  menteeName,
  mentorName,
  sessionDate,
  sessionTime,
  trackingToken,
  meetingId,
  menteeId,
}: FeedbackFormParams): string {
  const params = new URLSearchParams({
    'usp': 'pp_url',
    [GOOGLE_FORM_CONFIG.entryIds.menteeName]: menteeName,
    [GOOGLE_FORM_CONFIG.entryIds.mentorName]: mentorName,
    [GOOGLE_FORM_CONFIG.entryIds.sessionDate]: sessionDate,
    [GOOGLE_FORM_CONFIG.entryIds.sessionTime]: sessionTime
  });

  const hasTokenTracking = Boolean(trackingToken);
  if (hasTokenTracking) {
    const signature = createFeedbackTrackingTokenSignature(trackingToken as string);

    if (GOOGLE_FORM_CONFIG.entryIds.trackingToken) {
      params.set(GOOGLE_FORM_CONFIG.entryIds.trackingToken, trackingToken as string);
    }

    if (GOOGLE_FORM_CONFIG.entryIds.trackingSignature) {
      params.set(GOOGLE_FORM_CONFIG.entryIds.trackingSignature, signature);
    }
  }

  const shouldAttachLegacyTracking = Boolean(meetingId && menteeId);
  if (shouldAttachLegacyTracking) {
    const signature = createFeedbackTrackingSignature(meetingId as string, menteeId as string);

    if (GOOGLE_FORM_CONFIG.entryIds.trackingMeetingId) {
      params.set(GOOGLE_FORM_CONFIG.entryIds.trackingMeetingId, meetingId as string);
    }

    if (GOOGLE_FORM_CONFIG.entryIds.trackingMenteeId) {
      params.set(GOOGLE_FORM_CONFIG.entryIds.trackingMenteeId, menteeId as string);
    }

    if (GOOGLE_FORM_CONFIG.entryIds.trackingSignature) {
      params.set(GOOGLE_FORM_CONFIG.entryIds.trackingSignature, signature);
    }
  }

  return `${GOOGLE_FORM_CONFIG.baseUrl}?${params.toString()}`;
}
