import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { verifyFeedbackTrackingTokenSignature } from '@/lib/googleForm';

type VerifyFeedbackBody = {
  trackingToken?: string;
  signature?: string;
  submittedAt?: string;
  responseId?: string;
  menteeName?: string;
  mentorName?: string;
  sessionDate?: string;
  sessionTime?: string;
};

type SessionMatchInput = {
  menteeName: string;
  mentorName: string;
  sessionDate: string;
  sessionTime: string;
};

const getWebhookSecretFromRequest = (request: NextRequest): string | null => {
  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice('Bearer '.length).trim();
  }

  const direct = request.headers.get('x-feedback-webhook-secret');
  return direct?.trim() || null;
};

const normalizeSubmittedAt = (value?: string): string => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const normalizeText = (value?: string): string => (value || '').trim().toLowerCase();
const normalizeDateText = (value?: string): string => (value || '').trim();
const normalizeTimeText = (value?: string): string => (value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const applySubmissionToMeeting = (
  meeting: any,
  submittedAt: string,
  responseId: string | null
) => {
  meeting.feedbackFormSent = true;
  meeting.feedbackFormSentAt = submittedAt;
  meeting.feedbackFormVerified = true;
  meeting.feedbackFormVerifiedAt = submittedAt;
  if (responseId) {
    meeting.feedbackFormResponseId = responseId;
  }
};

const applyTokenCycleIfMatched = (user: any, touchedMeetingIds: Set<string>, submittedAt: string) => {
  if (!user?.token_cycle || user.token_cycle.status !== 'pending') return;

  const targetMeetingId = user.token_cycle.meetingId;
  if (targetMeetingId && touchedMeetingIds.has(targetMeetingId)) {
    user.token_cycle.feedbackSubmittedAt = submittedAt;
    user.token_cycle.feedbackValid = true;
    user.token_cycle.feedbackVerificationSource = 'google-form-webhook';
  }
};

const applySubmissionToUserByTrackingToken = (
  user: any,
  trackingToken: string,
  submittedAt: string,
  responseId: string | null
): { changed: boolean; meetingIds: string[] } => {
  if (!Array.isArray(user?.scheduling)) return { changed: false, meetingIds: [] };

  let changed = false;
  const touchedMeetingIds = new Set<string>();

  for (const meeting of user.scheduling) {
    if (meeting?.feedbackTrackingToken !== trackingToken) continue;
    applySubmissionToMeeting(meeting, submittedAt, responseId);
    if (meeting?.meetingId) {
      touchedMeetingIds.add(meeting.meetingId);
    }
    changed = true;
  }

  if (changed) {
    applyTokenCycleIfMatched(user, touchedMeetingIds, submittedAt);
  }

  return { changed, meetingIds: Array.from(touchedMeetingIds) };
};

const applySubmissionToUserBySessionDetails = (
  user: any,
  details: SessionMatchInput,
  submittedAt: string,
  responseId: string | null
): { changed: boolean; meetingIds: string[] } => {
  if (!Array.isArray(user?.scheduling)) return { changed: false, meetingIds: [] };

  const targetMentee = normalizeText(details.menteeName);
  const targetMentor = normalizeText(details.mentorName);
  const targetDate = normalizeDateText(details.sessionDate);
  const targetTime = normalizeTimeText(details.sessionTime);

  let changed = false;
  const touchedMeetingIds = new Set<string>();

  for (const meeting of user.scheduling) {
    if (normalizeText(meeting?.mentee_name) !== targetMentee) continue;
    if (normalizeText(meeting?.mentor_name) !== targetMentor) continue;
    if (normalizeDateText(meeting?.date) !== targetDate) continue;
    if (normalizeTimeText(meeting?.time) !== targetTime) continue;

    applySubmissionToMeeting(meeting, submittedAt, responseId);
    if (meeting?.meetingId) {
      touchedMeetingIds.add(meeting.meetingId);
    }
    changed = true;
  }

  if (changed) {
    applyTokenCycleIfMatched(user, touchedMeetingIds, submittedAt);
  }

  return { changed, meetingIds: Array.from(touchedMeetingIds) };
};

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { message: 'GOOGLE_FORM_WEBHOOK_SECRET is not configured.' },
        { status: 500 }
      );
    }

    const providedSecret = getWebhookSecretFromRequest(request);
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as VerifyFeedbackBody;
    const trackingToken = body.trackingToken?.trim();
    const signature = body.signature?.trim();
    const responseId = body.responseId?.trim() || null;

    const hasSignedTrackingPayload = Boolean(trackingToken && signature);
    const hasSessionDetailsPayload = Boolean(
      body.menteeName?.trim() &&
      body.mentorName?.trim() &&
      body.sessionDate?.trim() &&
      body.sessionTime?.trim()
    );

    if (!hasSignedTrackingPayload && !hasSessionDetailsPayload) {
      return NextResponse.json(
        {
          message:
            'Provide either trackingToken+signature or menteeName+mentorName+sessionDate+sessionTime.',
        },
        { status: 400 }
      );
    }

    if (hasSignedTrackingPayload) {
      const signatureValid = verifyFeedbackTrackingTokenSignature(trackingToken as string, signature as string);
      if (!signatureValid) {
        return NextResponse.json({ message: 'Invalid signature.' }, { status: 403 });
      }
    }

    const submittedAt = normalizeSubmittedAt(body.submittedAt);
    const containers = [database.container('mentee'), database.container('mentor')];

    let updatedUsers = 0;
    let updatedMeetings = 0;

    for (const container of containers) {
      const { resources: users } = await container.items.readAll().fetchAll();

      for (const user of users) {
        let result = { changed: false, meetingIds: [] as string[] };

        if (hasSignedTrackingPayload) {
          result = applySubmissionToUserByTrackingToken(
            user,
            trackingToken as string,
            submittedAt,
            responseId
          );
        }

        if (!result.changed && hasSessionDetailsPayload) {
          result = applySubmissionToUserBySessionDetails(
            user,
            {
              menteeName: body.menteeName as string,
              mentorName: body.mentorName as string,
              sessionDate: body.sessionDate as string,
              sessionTime: body.sessionTime as string,
            },
            submittedAt,
            responseId
          );
        }

        if (!result.changed) continue;
        if (!user?.id) continue;

        updatedUsers += 1;
        updatedMeetings += result.meetingIds.length;
        await container.item(user.id, user.id).replace(user);
      }
    }

    if (updatedMeetings === 0) {
      return NextResponse.json(
        { message: 'No matching meeting found for this feedback payload.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      trackingToken: trackingToken || null,
      submittedAt,
      updatedUsers,
      updatedMeetings,
      matchedBy: hasSignedTrackingPayload ? 'tracking-token' : 'session-details',
    });
  } catch (error) {
    console.error('Error verifying Google Form feedback:', error);
    return NextResponse.json(
      {
        message: 'Failed to verify Google Form feedback.',
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
