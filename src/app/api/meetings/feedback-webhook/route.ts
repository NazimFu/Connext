import { NextRequest, NextResponse } from 'next/server';

import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import {
  buildMeetingFeedbackRecord,
  isGoogleFormFeedbackRecord,
  sanitizeSubmittedResponses,
} from '@/lib/meeting-feedback';
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

  // Check if feedback submission is within acceptable timing window (2 hours after meeting)
  const timezone = user.timezone || 'UTC';
  const feedbackCheckResult = canAcceptFeedbackSubmission(user.token_cycle, timezone, new Date(submittedAt));
  
  if (!feedbackCheckResult.accepted) {
    console.log(`[Feedback Webhook] Feedback not accepted: ${feedbackCheckResult.reason}`);
    throw new Error(`Feedback submission rejected: ${feedbackCheckResult.reason}`);
  }

  user.token_cycle.meetingId = meetingId;
  user.token_cycle.meetingDate = meeting.date;
  user.token_cycle.meetingTime = meeting.time;
  user.token_cycle.feedbackSubmittedAt = submittedAt;
  user.token_cycle.feedbackValid = true;
  user.token_cycle.feedbackVerificationSource = 'google-form-webhook';
  
  console.log(`[Feedback Webhook] Token cycle updated. Feedback valid, submitted at: ${submittedAt}`);
};

const findRequesterRecord = async (
  mentorContainer: any,
  menteeContainer: any,
  menteeUid: string,
  meetingId: string
) => {
  try {
    const { resource: menteeDoc } = await menteeContainer.item(menteeUid, menteeUid).read();
    if (
      menteeDoc?.scheduling &&
      Array.isArray(menteeDoc.scheduling) &&
      menteeDoc.scheduling.some((meeting: any) => meeting.meetingId === meetingId)
    ) {
      return {
        container: menteeContainer,
        doc: menteeDoc,
      };
    }
  } catch (error: any) {
    if (error?.code !== 404) {
      throw error;
    }
  }

  const requesterQuerySpec = {
    query: 'SELECT * FROM c WHERE c.mentee_id = @menteeUid',
    parameters: [{ name: '@menteeUid', value: menteeUid }],
  };

  const { resources: requesterMentors } = await mentorContainer.items
    .query(requesterQuerySpec)
    .fetchAll();

  const requesterMentor = requesterMentors.find(
    (candidate: any) =>
      candidate?.scheduling &&
      Array.isArray(candidate.scheduling) &&
      candidate.scheduling.some((meeting: any) => meeting.meetingId === meetingId)
  );

  if (!requesterMentor) {
    return null;
  }

  return {
    container: mentorContainer,
    doc: requesterMentor,
  };
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
    const mentorQuerySpec = {
      query: 'SELECT * FROM c WHERE c.mentorUID = @mentorUid OR c.id = @mentorUid',
      parameters: [{ name: '@mentorUid', value: verification.payload.mentorUid }],
    };

    const { resources: mentors } = await mentorContainer.items.query(mentorQuerySpec).fetchAll();
    const mentorDoc =
      mentors.find((mentor: any) => mentor.id === verification.payload.mentorUid) ??
      mentors.find((mentor: any) => mentor.mentorUID === verification.payload.mentorUid) ??
      mentors[0];

    if (!mentorDoc?.scheduling || !Array.isArray(mentorDoc.scheduling)) {
      return NextResponse.json(
        { message: 'Mentor schedule not found' },
        { status: 404 }
      );
    }

    const scheduleIndex = mentorDoc.scheduling.findIndex(
      (meeting: any) => meeting.meetingId === verification.payload.meetingId
    );

    if (scheduleIndex === -1) {
      return NextResponse.json(
        { message: 'Meeting not found' },
        { status: 404 }
      );
    }

    const meeting = mentorDoc.scheduling[scheduleIndex];
    if (meeting.decision !== 'accepted' || meeting.scheduled_status === 'cancelled') {
      return NextResponse.json(
        { message: 'Meeting is not eligible for mentor feedback notification' },
        { status: 409 }
      );
    }

    if (!meeting.menteeUID) {
      return NextResponse.json(
        { message: 'Meeting requester is missing for this session' },
        { status: 400 }
      );
    }

    const requesterRecord = await findRequesterRecord(
      mentorContainer,
      menteeContainer,
      meeting.menteeUID,
      verification.payload.meetingId
    );

    if (!requesterRecord?.doc?.scheduling || !Array.isArray(requesterRecord.doc.scheduling)) {
      return NextResponse.json(
        { message: 'Requester schedule not found' },
        { status: 404 }
      );
    }

    const requesterMeetingIndex = requesterRecord.doc.scheduling.findIndex(
      (scheduledMeeting: any) => scheduledMeeting.meetingId === verification.payload.meetingId
    );

    if (requesterMeetingIndex === -1) {
      return NextResponse.json(
        { message: 'Requester meeting not found' },
        { status: 404 }
      );
    }

    const canonicalFeedbackRecord = isGoogleFormFeedbackRecord(meeting.feedback_form)
      ? meeting.feedback_form
      : isGoogleFormFeedbackRecord(requesterRecord.doc.scheduling[requesterMeetingIndex].feedback_form)
        ? requesterRecord.doc.scheduling[requesterMeetingIndex].feedback_form
        : buildMeetingFeedbackRecord('google_form', responses, submittedAt);

    const mentorNeedsSubmissionSync =
      !meeting.feedback_form || !meeting.feedbackFormSent || !meeting.feedbackFormSentAt;
    const requesterMeeting = requesterRecord.doc.scheduling[requesterMeetingIndex];
    const requesterNeedsSubmissionSync =
      !requesterMeeting.feedback_form ||
      !requesterMeeting.feedbackFormSent ||
      !requesterMeeting.feedbackFormSentAt;

    if (mentorNeedsSubmissionSync || requesterNeedsSubmissionSync) {
      try {
        applyFeedbackSubmission(
          mentorDoc.scheduling[scheduleIndex],
          canonicalFeedbackRecord
        );
        if (!mentorDoc.scheduling[scheduleIndex].feedbackFormResponseId && responseId) {
          mentorDoc.scheduling[scheduleIndex].feedbackFormResponseId = responseId;
        }
        applyFeedbackSubmission(
          requesterRecord.doc.scheduling[requesterMeetingIndex],
          canonicalFeedbackRecord
        );
        if (!requesterRecord.doc.scheduling[requesterMeetingIndex].feedbackFormResponseId && responseId) {
          requesterRecord.doc.scheduling[requesterMeetingIndex].feedbackFormResponseId = responseId;
        }
        
        // This will throw if feedback timing is invalid
        syncPendingTokenCycle(
          requesterRecord.doc,
          requesterRecord.doc.scheduling[requesterMeetingIndex],
          verification.payload.meetingId,
          canonicalFeedbackRecord.submittedAt
        );

        await requesterRecord.container
          .item(requesterRecord.doc.id, requesterRecord.doc.id)
          .replace(requesterRecord.doc);
        await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
      } catch (tokenCycleError: any) {
        console.error('[Feedback Webhook] Token cycle sync error:', tokenCycleError);
        // If the feedback is too early, reject the webhook
        if (tokenCycleError.message?.includes('Feedback submission rejected')) {
          return NextResponse.json(
            { message: 'Feedback is too early. Please submit after the meeting + 2 hours.' },
            { status: 400 }
          );
        }
        throw tokenCycleError;
      }
    }

    if (meeting.mentorFeedbackNotifiedAt) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        feedbackSubmittedAt: mentorDoc.scheduling[scheduleIndex].feedbackFormSentAt,
        mentorFeedbackNotifiedAt: meeting.mentorFeedbackNotifiedAt,
      });
    }

    const mentorEmail = meeting.mentor_email || mentorDoc.mentor_email;
    if (!mentorEmail) {
      return NextResponse.json(
        { message: 'Mentor email is missing for this meeting' },
        { status: 400 }
      );
    }

    await sendEmail({
      to: mentorEmail,
      subject: `New feedback submitted for your session with ${meeting.mentee_name || 'your mentee'}`,
      template: 'mentor-feedback-submitted',
      data: {
        mentorName: meeting.mentor_name || mentorDoc.mentor_name || 'there',
        menteeName: meeting.mentee_name || 'A mentee',
        date: meeting.date,
        time: meeting.time,
        timezone: meeting.mentor_timezone || mentorDoc.timezone || 'Asia/Kuala_Lumpur',
        submittedAt: canonicalFeedbackRecord.submittedAt,
        responses: canonicalFeedbackRecord.responses,
      },
    });

    mentorDoc.scheduling[scheduleIndex].mentorFeedbackNotifiedAt = new Date().toISOString();
    await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);

    return NextResponse.json({
      success: true,
      feedbackSubmittedAt: mentorDoc.scheduling[scheduleIndex].feedbackFormSentAt,
      mentorFeedbackNotifiedAt: mentorDoc.scheduling[scheduleIndex].mentorFeedbackNotifiedAt,
    });
  } catch (error) {
    console.error('Failed to process feedback webhook:', error);
    return NextResponse.json(
      { message: 'Failed to process feedback webhook', error: (error as Error).message },
      { status: 500 }
    );
  }
}
