import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { clampToken } from '@/lib/token-cycle';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const MY_TIMEZONE = 'Asia/Kuala_Lumpur';

// Deadlines (in days before meeting)
const ACCEPTANCE_DEADLINE_DAYS = 3;
const ACCEPTANCE_REMINDER_DAYS = 5;
const MEETING_REMINDER_DAYS = 1;

// Allow a small catch-up window so the cron can hit the reminder minute
const ACCEPTANCE_REMINDER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MEETING_REMINDER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function parseMeetingDateTimeMY(date: string, time: string): Date | null {
  try {
    let hours = 0;
    let minutes = 0;

    if (time.includes('AM') || time.includes('PM')) {
      const [rawTime, period] = time.split(' ');
      const [h, m] = rawTime.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      hours = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
      minutes = m;
    } else {
      const [h, m] = time.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      hours = h;
      minutes = m;
    }

    const localStr = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const utc = fromZonedTime(localStr, MY_TIMEZONE);
    return Number.isNaN(utc.getTime()) ? null : utc;
  } catch {
    return null;
  }
}

async function refundTokenToRequester(
  requesterIdentifier: string,
  meetingId: string,
  mentorContainer: any,
  menteeContainer: any
): Promise<void> {
  let requester: any = null;
  let isRequesterMentor = false;

  // 1) Try direct mentee document id lookup first
  try {
    const { resource } = await menteeContainer.item(requesterIdentifier, requesterIdentifier).read();
    if (resource) {
      requester = resource;
    }
  } catch (err: any) {
    // Continue to fallback queries below.
  }

  // 2) Fallback: mentee by id / menteeUID / mentee_uid
  if (!requester) {
    const { resources: menteeMatches } = await menteeContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id OR c.mentee_uid = @id',
        parameters: [{ name: '@id', value: requesterIdentifier }],
      })
      .fetchAll();

    if (menteeMatches.length > 0) {
      requester = menteeMatches[0];
    }
  }

  // 3) Fallback: mentor acting as mentee by id / mentorUID / mentee_id
  if (!requester) {
    const { resources: mentorMatches } = await mentorContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id OR c.mentee_id = @id',
        parameters: [{ name: '@id', value: requesterIdentifier }],
      })
      .fetchAll();

    if (mentorMatches.length > 0) {
      requester = mentorMatches[0];
      isRequesterMentor = true;
    }
  }

  if (!requester) {
    console.warn(`⚠️ Could not resolve requester for token refund. identifier=${requesterIdentifier}, meetingId=${meetingId}`);
    return;
  }

  // Update meeting status on requester side
  if (requester.scheduling && Array.isArray(requester.scheduling)) {
    const idx = requester.scheduling.findIndex((m: any) => m.meetingId === meetingId);
    if (idx !== -1) {
      requester.scheduling[idx].decision = 'declined';
      requester.scheduling[idx].scheduled_status = 'cancelled';
      requester.scheduling[idx].updated_at = new Date().toISOString();
    }
  }

  // Refund token
  const before = clampToken(requester.tokens);
  requester.tokens = 1;
  if (requester.token_cycle?.meetingId === meetingId && requester.token_cycle.status === 'pending') {
    requester.token_cycle = undefined;
  }

  if (isRequesterMentor) {
    await mentorContainer.item(requester.id, requester.id).replace(requester);
  } else {
    await menteeContainer.item(requester.id, requester.id).replace(requester);
  }

  console.log(
    `💰 Token refund applied to ${isRequesterMentor ? 'mentor' : 'mentee'} ${requester.id} (identifier=${requesterIdentifier}) ${before} -> ${requester.tokens}`
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const targetMeetingId = searchParams.get('meetingId');
  const forceReminder = searchParams.get('forceReminder') === 'true';

  console.log('===== CRON TEST =====');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('API_URL:', process.env.API_URL);
  console.log('targetMeetingId:', targetMeetingId);
  console.log('forceReminder:', forceReminder);
  console.log('COSMOS endpoint exists:', !!process.env.COSMOS_DB_ENDPOINT);
  console.log('COSMOS key exists:', !!process.env.COSMOS_DB_KEY);
  console.log('Database:', process.env.COSMOS_DB_DATABASE_ID);
  console.log('Container:', process.env.COSMOS_DB_CONTAINER_ID);

  const now = new Date();
  const mentorContainer = database.container('mentor');
  const menteeContainer = database.container('mentee');

  let meetingRemindersSent = 0;
  let acceptanceRemindersSent = 0;
  let autoCancelledCount = 0;
  const errors: string[] = [];
  const processedMeetingReminderIds = new Set<string>();

  const { resources: allMentors } = await mentorContainer.items
    .query({ query: 'SELECT * FROM c WHERE c.scheduling != null' })
    .fetchAll();

  const meetings = allMentors.flatMap((mentor) =>
    Array.isArray(mentor.scheduling) ? mentor.scheduling : []
  );
  console.log('Total meetings found from DB:', meetings.length);

  for (const mentor of allMentors) {
    if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) continue;

    let hasChanges = false;
    const autoCancelledMeetings: any[] = [];
    let foundTargetMeeting = false;

    for (let i = 0; i < mentor.scheduling.length; i++) {
      const meeting = mentor.scheduling[i];

      if (targetMeetingId && meeting.meetingId !== targetMeetingId) {
        continue;
      }

      if (targetMeetingId) {
        foundTargetMeeting = true;
      }

      // Skip already resolved meetings
      const status = String(meeting.scheduled_status || '').toLowerCase();
      if (status === 'cancelled' || status === 'canceled' || status === 'past') continue;

      const meetingDateTime = parseMeetingDateTimeMY(meeting.date, meeting.time);
      if (!meetingDateTime) continue;

      const msUntilMeeting = meetingDateTime.getTime() - now.getTime();
      const daysUntilMeeting = msUntilMeeting / (24 * 60 * 60 * 1000);

      console.log('Checking meeting:', {
        meetingId: meeting.meetingId,
        menteeUID: meeting.menteeUID,
        mentorUID: meeting.mentorUID,
        date: meeting.date,
        time: meeting.time,
        decision: meeting.decision,
        scheduled_status: meeting.scheduled_status,
        report_status: meeting.report_status,
        acceptanceReminderSentAt: meeting.acceptanceReminderSentAt,
        reminderSentAt: meeting.reminderSentAt,
        feedbackSentAt: meeting.feedbackSentAt,
        daysUntilMeeting,
      });

      // Meeting is already past — skip (cleanup-expired-meetings handles these)
      if (daysUntilMeeting <= 0) continue;

      // ─── Feature 4: Auto-cancel pending meetings past the 3-day deadline ───
      if (meeting.decision === 'pending' && daysUntilMeeting <= ACCEPTANCE_DEADLINE_DAYS) {
        mentor.scheduling[i].decision = 'declined';
        mentor.scheduling[i].scheduled_status = 'cancelled';
        mentor.scheduling[i].updated_at = now.toISOString();
        mentor.scheduling[i].cancel_info = {
          cancelledBy: 'system',
          role: 'system',
          reason: 'Mentor did not accept the request within the 3-day acceptance deadline.',
          cancelledAt: now.toISOString(),
          tokenStatus: 'auto-replenished',
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
        };
        hasChanges = true;
        autoCancelledMeetings.push(meeting);
        autoCancelledCount++;
        console.log(`🚫 Auto-cancelled meeting ${meeting.meetingId} — ${daysUntilMeeting.toFixed(1)}d until meeting`);
        continue;
      }

      // ─── Feature 3: Acceptance reminder to mentor ~5 days before ───
      const acceptanceReminderTargetMs = meetingDateTime.getTime() - ACCEPTANCE_REMINDER_DAYS * 24 * 60 * 60 * 1000;
      if (
        meeting.decision === 'pending' &&
        daysUntilMeeting > ACCEPTANCE_DEADLINE_DAYS &&
        now.getTime() >= acceptanceReminderTargetMs &&
        now.getTime() < acceptanceReminderTargetMs + ACCEPTANCE_REMINDER_WINDOW_MS &&
        (forceReminder || !meeting.acceptanceReminderSentAt)
      ) {
        try {
          await sendEmail({
            to: meeting.mentor_email,
            subject: 'Action Required: Please Accept or Decline a Meeting Request – CONNEXT',
            template: 'mentor-acceptance-reminder',
            data: {
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
            },
          });
          mentor.scheduling[i].acceptanceReminderSentAt = now.toISOString();
          hasChanges = true;
          acceptanceRemindersSent++;
          console.log(`📧 Acceptance reminder sent to ${meeting.mentor_email} for meeting ${meeting.meetingId}`);
        } catch (err) {
          const msg = `Acceptance reminder failed for ${meeting.meetingId}: ${(err as Error).message}`;
          errors.push(msg);
          console.error(msg);
        }
        if (foundTargetMeeting) {
          break;
        }
        continue;
      }

      // ─── Feature 2: 1-day reminder (accepted meetings) ───
      const meetingReminderTargetMs = meetingDateTime.getTime() - MEETING_REMINDER_DAYS * 24 * 60 * 60 * 1000;
      if (
        meeting.decision === 'accepted' &&
        meeting.scheduled_status === 'upcoming' &&
        daysUntilMeeting > 0 &&
        now.getTime() >= meetingReminderTargetMs &&
        now.getTime() < meetingReminderTargetMs + MEETING_REMINDER_WINDOW_MS &&
        !meeting.reminderSentAt &&
        !processedMeetingReminderIds.has(meeting.meetingId)
      ) {
        let reminderOk = false;
        try {
          await sendEmail({
            to: meeting.mentee_email,
            subject: 'Reminder: Your Mentorship Session is Tomorrow – CONNEXT',
            template: 'meeting-reminder-mentee',
            data: {
              menteeName: meeting.mentee_name,
              mentorName: meeting.mentor_name,
              date: meeting.date,
              time: meeting.time,
              googleMeetUrl: meeting.googleMeetUrl || meeting.meetingLink || '',
            },
          });

          await sendEmail({
            to: meeting.mentor_email,
            subject: 'Reminder: Mentorship Session Tomorrow – CONNEXT',
            template: 'meeting-reminder-mentor',
            data: {
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
              googleMeetUrl: meeting.googleMeetUrl || meeting.meetingLink || '',
            },
          });

          reminderOk = true;
          processedMeetingReminderIds.add(meeting.meetingId);
          meetingRemindersSent++;
          console.log(`📧 1-day reminders sent for meeting ${meeting.meetingId}`);
        } catch (err) {
          const msg = `1-day reminder failed for ${meeting.meetingId}: ${(err as Error).message}`;
          errors.push(msg);
          console.error(msg);
        }

        if (reminderOk) {
          mentor.scheduling[i].reminderSentAt = now.toISOString();
          hasChanges = true;
        }
      }
    }

    // Persist mentor changes
    if (hasChanges) {
      await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
    }

    if (foundTargetMeeting) {
      break;
    }

    // Handle auto-cancelled meetings: refund tokens + notify mentees
    for (const cancelled of autoCancelledMeetings) {
      try {
        await refundTokenToRequester(cancelled.menteeUID, cancelled.meetingId, mentorContainer, menteeContainer);
        console.log(`💰 Token refunded for cancelled meeting ${cancelled.meetingId}`);
      } catch (err) {
        const msg = `Token refund failed for ${cancelled.meetingId}: ${(err as Error).message}`;
        errors.push(msg);
        console.error(msg);
      }

      try {
        await sendEmail({
          to: cancelled.mentee_email,
          subject: 'Meeting Request Automatically Cancelled – CONNEXT',
          template: 'meeting-cancelled-no-acceptance',
          data: {
            menteeName: cancelled.mentee_name,
            mentorName: cancelled.mentor_name,
            date: cancelled.date,
            time: cancelled.time,
          },
        });
        console.log(`📧 Auto-cancel notification sent to ${cancelled.mentee_email}`);
      } catch (err) {
        const msg = `Auto-cancel email failed for ${cancelled.meetingId}: ${(err as Error).message}`;
        errors.push(msg);
        console.error(msg);
      }
    }
  }

  return NextResponse.json({
    success: true,
    meetingRemindersSent,
    acceptanceRemindersSent,
    autoCancelledCount,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
