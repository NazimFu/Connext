import { NextRequest, NextResponse } from 'next/server';

import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import {
  buildMeetingFeedbackRecord,
  isGoogleFormFeedbackRecord,
  sanitizeSubmittedResponses,
} from '@/lib/meeting-feedback';
import { locateMeeting } from '@/lib/server/meeting-utils';
import { verifyFeedbackToken } from '@/lib/server/feedback-form';
import { canAcceptFeedbackSubmission } from '@/lib/token-cycle';

export const runtime = 'nodejs';

const getWebhookSecret = (): string => {
  const canonicalSecret = process.env.FEEDBACK_WEBHOOK_SECRET;
  const legacySecret = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
  const secret = canonicalSecret || legacySecret;
  if (!secret) {
    throw new Error('FEEDBACK_WEBHOOK_SECRET is not configured');
  }

  if (!canonicalSecret && legacySecret) {
    console.warn('Using legacy GOOGLE_FORM_WEBHOOK_SECRET fallback. Set FEEDBACK_WEBHOOK_SECRET.');
  }

  return secret;
};

const getProvidedSecret = (request: NextRequest): string | null => {
  const directHeader = request.headers.get('x-feedback-webhook-secret');
  if (directHeader) {
    return directHeader;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return null;
};

const normalizeResponses = (rawResponses: unknown) => {
  if (!Array.isArray(rawResponses)) {
    return [];
  }

  return sanitizeSubmittedResponses(
    rawResponses.map((response) => {
      const item = response as { question?: unknown; answer?: unknown };
      return {
        question: String(item.question ?? '').trim(),
        answer: String(item.answer ?? '').trim(),
      };
    })
  )
    .filter((response) => response.question.length > 0)
    .filter((response) => !/feedback\s*token/i.test(response.question));
};

const normalizeSubmittedAt = (submittedAt: unknown): string => {
  if (typeof submittedAt !== 'string') {
    return new Date().toISOString();
  }

  const parsed = new Date(submittedAt);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const applyFeedbackSubmission = (
  meeting: any,
  feedbackRecord: ReturnType<typeof buildMeetingFeedbackRecord>
) => {
  meeting.feedback_form = feedbackRecord;
  meeting.feedbackFormSent = true;
  meeting.feedbackFormSentAt = meeting.feedbackFormSentAt || feedbackRecord.submittedAt;
  meeting.feedbackFormVerified = true;
  meeting.feedbackFormVerifiedAt = meeting.feedbackFormVerifiedAt || feedbackRecord.submittedAt;
};

const syncPendingTokenCycle = (
  user: any,
  meeting: any,
  meetingId: string,
  submittedAt: string
) => {
  if (user?.token_cycle?.status !== 'pending') {
    console.log('[Feedback Webhook] Token cycle not pending, skipping sync');
    return;
  }

  if (user.token_cycle.meetingId && user.token_cycle.meetingId !== meetingId) {
    console.log('[Feedback Webhook] Token cycle meeting ID mismatch, skipping sync');
    return;
  }

  user.token_cycle.meetingId = meetingId;
  user.token_cycle.meetingDate = meeting.date;
  user.token_cycle.meetingTime = meeting.time;

  // Check if feedback submission is within acceptable timing window (2 hours after meeting)
  const timezone = user.timezone || 'UTC';
  const feedbackCheckResult = canAcceptFeedbackSubmission(user.token_cycle, timezone, new Date(submittedAt));

  if (!feedbackCheckResult.accepted) {
    console.log(`[Feedback Webhook] Feedback not accepted: ${feedbackCheckResult.reason}`);
    throw new Error(`Feedback submission rejected: ${feedbackCheckResult.reason}`);
  }

  user.token_cycle.feedbackSubmittedAt = submittedAt;
  user.token_cycle.feedbackValid = true;
  user.token_cycle.feedbackVerificationSource = 'google-form-webhook';

  console.log(`[Feedback Webhook] Token cycle updated. Feedback valid, submitted at: ${submittedAt}`);
};

export async function POST(request: NextRequest) {
  try {
    const providedSecret = getProvidedSecret(request);
    if (!providedSecret || providedSecret !== getWebhookSecret()) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const feedbackToken = String(body?.feedbackToken ?? '').trim();
    const submittedAt = normalizeSubmittedAt(body?.submittedAt);
    const responses = normalizeResponses(body?.responses);
    const responseId = String(body?.responseId ?? '').trim();

    const verification = verifyFeedbackToken(feedbackToken);
    if (!verification.ok) {
      return NextResponse.json(
        { message: verification.reason },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    // Locate the meeting by ID alone — this finds the requester's copy even
    // if the mentor's account has since been deleted (locateMeeting searches
    // both containers independently and tolerates either side being missing).
    const lookup = await locateMeeting(verification.payload.meetingId);
    if (!lookup?.meeting) {
      return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
    }

    const { mentor: mentorDoc, mentorScheduleIndex, mentee: requesterDoc, menteeScheduleIndex, menteeIsInMentorContainer } = lookup;

    if (!requesterDoc || !Array.isArray(requesterDoc.scheduling) || menteeScheduleIndex < 0) {
      return NextResponse.json({ message: 'Requester schedule not found' }, { status: 404 });
    }

    const requesterMeeting = requesterDoc.scheduling[menteeScheduleIndex];

    // Defense in depth: the token was signed for a specific mentor — if the
    // requester's own copy disagrees (shouldn't happen), reject it.
    if (requesterMeeting.mentorUID && requesterMeeting.mentorUID !== verification.payload.mentorUid) {
      return NextResponse.json({ message: 'Feedback token does not match this meeting' }, { status: 400 });
    }

    if (requesterMeeting.decision !== 'accepted' || requesterMeeting.scheduled_status === 'cancelled') {
      return NextResponse.json(
        { message: 'Meeting is not eligible for mentor feedback notification' },
        { status: 409 }
      );
    }

    const requesterContainer = menteeIsInMentorContainer ? mentorContainer : menteeContainer;
    const mentorMeeting = mentorDoc && mentorScheduleIndex > -1 ? mentorDoc.scheduling[mentorScheduleIndex] : null;

    const canonicalFeedbackRecord = isGoogleFormFeedbackRecord(mentorMeeting?.feedback_form)
      ? mentorMeeting!.feedback_form
      : isGoogleFormFeedbackRecord(requesterMeeting.feedback_form)
        ? requesterMeeting.feedback_form
        : buildMeetingFeedbackRecord('google_form', responses, submittedAt);

    // ── Sync the requester's own copy — this must succeed regardless of
    // whether the mentor's account still exists, since it's what unblocks
    // the requester's feedback obligation and their own account deletion. ──
    const requesterNeedsSubmissionSync =
      !requesterMeeting.feedback_form || !requesterMeeting.feedbackFormSent || !requesterMeeting.feedbackFormSentAt;

    if (requesterNeedsSubmissionSync) {
      try {
        applyFeedbackSubmission(requesterMeeting, canonicalFeedbackRecord);
        if (!requesterMeeting.feedbackFormResponseId && responseId) {
          requesterMeeting.feedbackFormResponseId = responseId;
        }

        // This will throw if feedback timing is invalid
        syncPendingTokenCycle(requesterDoc, requesterMeeting, verification.payload.meetingId, canonicalFeedbackRecord.submittedAt);

        await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);
      } catch (tokenCycleError: any) {
        console.error('[Feedback Webhook] Token cycle sync error:', tokenCycleError);
        // If the feedback is too early, reject the webhook
        if (tokenCycleError.message?.includes('Feedback submission rejected')) {
          return NextResponse.json(
            { message: 'Feedback is too early. Please submit after the meeting + 2 hours...' },
            { status: 400 }
          );
        }
        throw tokenCycleError;
      }
    }

    // ── Mentor-side sync + notification email — best-effort only. If the
    // mentor's account has been deleted there's no one left to notify, so we
    // skip this without failing the request (the requester side already
    // succeeded, which is what matters). ──
    let mentorNotified = false;
    if (mentorDoc && mentorScheduleIndex > -1 && mentorMeeting) {
      try {
        const mentorNeedsSubmissionSync =
          !mentorMeeting.feedback_form || !mentorMeeting.feedbackFormSent || !mentorMeeting.feedbackFormSentAt;

        if (mentorNeedsSubmissionSync) {
          applyFeedbackSubmission(mentorMeeting, canonicalFeedbackRecord);
          if (!mentorMeeting.feedbackFormResponseId && responseId) {
            mentorMeeting.feedbackFormResponseId = responseId;
          }
          await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
        }

        if (mentorMeeting.mentorFeedbackNotifiedAt) {
          mentorNotified = true;
        } else {
          const mentorEmail = requesterMeeting.mentor_email || mentorDoc.mentor_email;
          if (mentorEmail) {
            await sendEmail({
              to: mentorEmail,
              subject: `New feedback submitted for your session with ${requesterMeeting.mentee_name || 'your mentee'}`,
              template: 'mentor-feedback-submitted',
              data: {
                mentorName: requesterMeeting.mentor_name || mentorDoc.mentor_name || 'there',
                menteeName: requesterMeeting.mentee_name || 'A mentee',
                date: requesterMeeting.date,
                time: requesterMeeting.time,
                timezone: mentorDoc.timezone || requesterMeeting.mentor_timezone || 'Asia/Kuala_Lumpur',
                submittedAt: canonicalFeedbackRecord.submittedAt,
                responses: canonicalFeedbackRecord.responses,
              },
            });

            mentorMeeting.mentorFeedbackNotifiedAt = new Date().toISOString();
            await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
            mentorNotified = true;
          }
        }
      } catch (mentorSyncError) {
        console.error('[Feedback Webhook] Failed to sync/notify mentor (non-fatal — requester side already saved):', mentorSyncError);
      }
    } else {
      console.log(`[Feedback Webhook] Mentor for meeting ${verification.payload.meetingId} no longer exists — skipping mentor sync/notification.`);
    }

    return NextResponse.json({
      success: true,
      feedbackSubmittedAt: requesterMeeting.feedbackFormSentAt,
      mentorNotified,
    });
  } catch (error) {
    console.error('Failed to process feedback webhook:', error);
    return NextResponse.json(
      { message: 'Failed to process feedback webhook', error: (error as Error).message },
      { status: 500 }
    );
  }
}
