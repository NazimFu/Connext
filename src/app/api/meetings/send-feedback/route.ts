import { NextRequest, NextResponse } from 'next/server';

import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { createSignedFeedbackFormLink } from '@/lib/server/feedback-form';
import { parseMeetingDateTime } from '@/lib/token-cycle';

const FEEDBACK_SEND_DELAY_MS = 2 * 60 * 60 * 1000;
const FEEDBACK_VALID_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type UserDoc = {
  id: string;
  mentorUID?: string;
  mentee_id?: string;
  scheduling?: any[];
};

type RequesterRecord = {
  container: any;
  doc: UserDoc;
  scheduleIndex: number;
};

type DeliveryState = {
  deliveredAt: string;
  feedbackToken: string;
  formUrl: string;
};

const isCancelledMeeting = (meeting: any): boolean => {
  const status = String(meeting?.scheduled_status || '').trim().toLowerCase();
  return status === 'cancelled' || status === 'canceled';
};

const shouldSendFeedbackForMeeting = (meeting: any, now: Date): boolean => {
  if (meeting?.decision !== 'accepted' || isCancelledMeeting(meeting)) {
    return false;
  }

  const meetingDateTime = parseMeetingDateTime(meeting.date, meeting.time);
  if (!meetingDateTime) {
    return false;
  }

  const opensAt = meetingDateTime.getTime() + FEEDBACK_SEND_DELAY_MS;
  const closesAt = meetingDateTime.getTime() + FEEDBACK_VALID_WINDOW_MS;

  return now.getTime() >= opensAt && now.getTime() <= closesAt;
};

const findMeetingIndex = (doc: UserDoc | null | undefined, meetingId: string): number => {
  if (!Array.isArray(doc?.scheduling)) {
    return -1;
  }

  return doc.scheduling.findIndex((meeting: any) => meeting?.meetingId === meetingId);
};

const getMeetingString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const applyDeliveryState = (meeting: any, deliveryState: DeliveryState): boolean => {
  let changed = false;

  if (meeting.feedbackFormDelivered !== true) {
    meeting.feedbackFormDelivered = true;
    changed = true;
  }

  if (meeting.feedbackFormDeliveredAt !== deliveryState.deliveredAt) {
    meeting.feedbackFormDeliveredAt = deliveryState.deliveredAt;
    changed = true;
  }

  if (meeting.feedbackFormUrl !== deliveryState.formUrl) {
    meeting.feedbackFormUrl = deliveryState.formUrl;
    changed = true;
  }

  if (meeting.feedbackToken !== deliveryState.feedbackToken) {
    meeting.feedbackToken = deliveryState.feedbackToken;
    changed = true;
  }

  return changed;
};

const findRequesterRecord = (
  menteeDocsById: Map<string, UserDoc>,
  requesterMentorsByMenteeId: Map<string, UserDoc[]>,
  menteeUid: string,
  meetingId: string
): RequesterRecord | null => {
  const menteeDoc = menteeDocsById.get(menteeUid);
  const menteeScheduleIndex = findMeetingIndex(menteeDoc, meetingId);
  if (menteeDoc && menteeScheduleIndex !== -1) {
    return {
      container: database.container('mentee'),
      doc: menteeDoc,
      scheduleIndex: menteeScheduleIndex,
    };
  }

  const requesterMentors = requesterMentorsByMenteeId.get(menteeUid) || [];
  for (const requesterMentor of requesterMentors) {
    const scheduleIndex = findMeetingIndex(requesterMentor, meetingId);
    if (scheduleIndex !== -1) {
      return {
        container: database.container('mentor'),
        doc: requesterMentor,
        scheduleIndex,
      };
    }
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    console.log('Checking for sessions that started around:', now.toISOString());

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');
    const [{ resources: mentors }, { resources: mentees }] = await Promise.all([
      mentorContainer.items.readAll().fetchAll(),
      menteeContainer.items.readAll().fetchAll(),
    ]);

    const mentorDocsById = new Map<string, UserDoc>();
    const mentorDocsByUid = new Map<string, UserDoc>();
    const requesterMentorsByMenteeId = new Map<string, UserDoc[]>();
    const menteeDocsById = new Map<string, UserDoc>();

    for (const mentor of mentors as UserDoc[]) {
      mentorDocsById.set(mentor.id, mentor);
      if (mentor.mentorUID) {
        mentorDocsByUid.set(mentor.mentorUID, mentor);
      }

      if (mentor.mentee_id) {
        const current = requesterMentorsByMenteeId.get(mentor.mentee_id) || [];
        current.push(mentor);
        requesterMentorsByMenteeId.set(mentor.mentee_id, current);
      }
    }

    for (const mentee of mentees as UserDoc[]) {
      menteeDocsById.set(mentee.id, mentee);
    }

    const sentForms: string[] = [];
    const errors: Array<{ meetingId: string; error: string }> = [];
    const processedMeetingIds = new Set<string>();

    for (const candidateDoc of mentors as UserDoc[]) {
      if (!Array.isArray(candidateDoc.scheduling)) {
        continue;
      }

      for (const candidateMeeting of candidateDoc.scheduling) {
        const meetingId = getMeetingString(candidateMeeting?.meetingId);
        if (!meetingId || processedMeetingIds.has(meetingId)) {
          continue;
        }
        processedMeetingIds.add(meetingId);

        try {
          const targetMentorDoc =
            mentorDocsByUid.get(candidateMeeting?.mentorUID) ||
            mentorDocsById.get(candidateMeeting?.mentorUID) ||
            (candidateDoc.mentorUID === candidateMeeting?.mentorUID || candidateDoc.id === candidateMeeting?.mentorUID
              ? candidateDoc
              : null);

          if (!targetMentorDoc) {
            throw new Error('Target mentor record not found');
          }

          const targetMeetingIndex = findMeetingIndex(targetMentorDoc, meetingId);
          if (targetMeetingIndex === -1) {
            throw new Error('Target mentor meeting not found');
          }

          const mentorMeeting = targetMentorDoc.scheduling?.[targetMeetingIndex];
          if (!shouldSendFeedbackForMeeting(mentorMeeting, now)) {
            continue;
          }

          if (!getMeetingString(mentorMeeting?.menteeUID)) {
            throw new Error('Meeting requester is missing for this session');
          }

          const requesterRecord = findRequesterRecord(
            menteeDocsById,
            requesterMentorsByMenteeId,
            mentorMeeting.menteeUID,
            meetingId
          );

          if (!requesterRecord) {
            throw new Error('Requester meeting record not found');
          }

          const requesterMeeting = requesterRecord.doc.scheduling?.[requesterRecord.scheduleIndex];
          if (!requesterMeeting) {
            throw new Error('Requester meeting details missing');
          }

          if (mentorMeeting.feedbackFormSent === true || requesterMeeting.feedbackFormSent === true) {
            continue;
          }

          const alreadyDelivered =
            mentorMeeting.feedbackFormDelivered === true || requesterMeeting.feedbackFormDelivered === true;
          const deliveredAt =
            getMeetingString(mentorMeeting.feedbackFormDeliveredAt) ||
            getMeetingString(requesterMeeting.feedbackFormDeliveredAt) ||
            now.toISOString();

          let feedbackToken =
            getMeetingString(mentorMeeting.feedbackToken) || getMeetingString(requesterMeeting.feedbackToken);
          let formUrl =
            getMeetingString(mentorMeeting.feedbackFormUrl) || getMeetingString(requesterMeeting.feedbackFormUrl);

          if (!alreadyDelivered && (!feedbackToken || !formUrl)) {
            const signedLink = createSignedFeedbackFormLink(
              {
                meetingId,
                mentorUid: mentorMeeting.mentorUID,
                menteeName: mentorMeeting.mentee_name || requesterMeeting.mentee_name || 'Mentee',
                mentorName: mentorMeeting.mentor_name || candidateMeeting?.mentor_name || 'Mentor',
                sessionDate: mentorMeeting.date,
                sessionTime: mentorMeeting.time,
              },
              now
            );

            feedbackToken = signedLink.feedbackToken;
            formUrl = signedLink.formUrl;
          }

          if (alreadyDelivered && (!feedbackToken || !formUrl)) {
            throw new Error(
              'Feedback delivery metadata is incomplete on existing records; refusing to regenerate a new signed link after delivery.'
            );
          }

          const deliveryState: DeliveryState = {
            deliveredAt,
            feedbackToken: feedbackToken as string,
            formUrl: formUrl as string,
          };

          if (!alreadyDelivered) {
            const menteeEmail = mentorMeeting.mentee_email || requesterMeeting.mentee_email;
            if (!getMeetingString(menteeEmail)) {
              throw new Error('Mentee email is missing for this meeting');
            }

            await sendEmail({
              to: menteeEmail,
              subject: 'Your Session Feedback - Connext',
              template: 'mentee-feedback-form',
              data: {
                menteeName: mentorMeeting.mentee_name || requesterMeeting.mentee_name || 'there',
                mentorName: mentorMeeting.mentor_name || 'your mentor',
                date: new Date(mentorMeeting.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
                time: mentorMeeting.time,
                formUrl: deliveryState.formUrl,
              },
            });
          }

          const mentorChanged = applyDeliveryState(mentorMeeting, deliveryState);
          const requesterChanged = applyDeliveryState(requesterMeeting, deliveryState);

          if (mentorChanged) {
            await mentorContainer.item(targetMentorDoc.id, targetMentorDoc.id).replace(targetMentorDoc);
          }

          if (requesterChanged) {
            await requesterRecord.container
              .item(requesterRecord.doc.id, requesterRecord.doc.id)
              .replace(requesterRecord.doc);
          }

          if (!alreadyDelivered) {
            sentForms.push(`${meetingId} (${mentorMeeting.mentee_name || 'unknown mentee'})`);
            console.log(`Feedback form sent for meeting ${meetingId}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown feedback delivery error';
          console.error(`Error processing feedback form for meeting ${meetingId}:`, error);
          errors.push({
            meetingId,
            error: message,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      sentCount: sentForms.length,
      sentForms,
      errors: errors.length > 0 ? errors : undefined,
      checkedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Error in send-feedback endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to send feedback forms', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
