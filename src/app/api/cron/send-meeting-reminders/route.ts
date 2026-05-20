import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { clampToken } from '@/lib/token-cycle';
import { MY_TZ } from '@/lib/timezone';
import { getMalaysiaTodayKey, getReminderTargetDateKey } from '@/lib/cron-meeting-dates';

// Deadlines (in days before meeting)
const ACCEPTANCE_DEADLINE_DAYS = 3;
const ACCEPTANCE_REMINDER_DAYS = 5;
const MEETING_REMINDER_DAYS = 1;
const MY_TIMEZONE = MY_TZ;

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

async function resolveUserTimezone(
  userId: string | undefined,
  menteeContainer: any,
  mentorContainer: any
): Promise<string> {
  if (!userId) {
    return MY_TIMEZONE;
  }

  try {
    const { resource: mentee } = await menteeContainer.item(userId, userId).read();
    if (mentee?.timezone) {
      return mentee.timezone;
    }
  } catch {
    // fall through to mentor lookup
  }

  try {
    const { resource: mentor } = await mentorContainer.item(userId, userId).read();
    if (mentor?.timezone) {
      return mentor.timezone;
    }
  } catch {
    // fall through to query-based lookup
  }

  try {
    const { resources: mentors } = await mentorContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id OR c.mentee_id = @id',
        parameters: [{ name: '@id', value: userId }],
      })
      .fetchAll();
    const matchMentor = mentors.find((mentor: any) => mentor?.timezone);
    if (matchMentor?.timezone) {
      return matchMentor.timezone;
    }
  } catch {
    // ignore and fall back
  }

  return MY_TIMEZONE;
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
  const todayKey = getMalaysiaTodayKey(now);
  const mentorContainer = database.container('mentor');
  const menteeContainer = database.container('mentee');
  const timezoneCache = new Map<string, string>();

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
      const mentorDocUid = (mentor as any).mentorUID || mentor.id;

      if (targetMeetingId && meeting.meetingId !== targetMeetingId) {
        continue;
      }

      if (targetMeetingId) {
        foundTargetMeeting = true;
      }

      // Skip already resolved meetings
      const status = String(meeting.scheduled_status || '').toLowerCase();
      if (status === 'cancelled' || status === 'canceled' || status === 'past') {
        console.log(`⏭️ Skipping meeting ${meeting.meetingId} - status: ${status}`);
        continue;
      }
      
      console.log(`📋 Processing meeting ${meeting.meetingId} - status: ${status}, decision: ${meeting.decision}`);

      // Only process the owning mentor document to avoid duplicate sends when a mentor
      // books another mentor and the same meeting exists in both mentor documents.
      if (meeting.mentorUID && mentorDocUid !== meeting.mentorUID) {
        console.log(`⏭️ Skipping non-owner doc ${mentorDocUid} for meeting ${meeting.meetingId} (owner: ${meeting.mentorUID})`);
        continue;
      }

      const acceptanceReminderTargetKey = getReminderTargetDateKey(meeting.date, ACCEPTANCE_REMINDER_DAYS);
      const meetingReminderTargetKey = getReminderTargetDateKey(meeting.date, MEETING_REMINDER_DAYS);
      const acceptanceDeadlineKey = getReminderTargetDateKey(meeting.date, ACCEPTANCE_DEADLINE_DAYS);

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
        todayKey,
        acceptanceDeadlineKey,
        acceptanceReminderTargetKey,
        meetingReminderTargetKey,
      });

      // ─── Feature 4: Auto-cancel pending meetings past the 3-day deadline ───
      // Skip if already cancelled (cleanup may have already processed it)
      if (meeting.scheduled_status === 'cancelled') {
        console.log(`⏭️ Skipping meeting ${meeting.meetingId} — already cancelled`);
        continue;
      }
      
      if (meeting.decision === 'pending' && acceptanceDeadlineKey && todayKey >= acceptanceDeadlineKey) {
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
        console.log(`🚫 Auto-cancelled meeting ${meeting.meetingId} — deadline date ${acceptanceDeadlineKey}`);
        continue;
      }

      // ─── Feature 3: Acceptance reminder to mentor ~5 days before ───
      const shouldSendAcceptanceReminder =
        meeting.decision === 'pending' &&
        acceptanceReminderTargetKey === todayKey &&
        (forceReminder || !meeting.acceptanceReminderSentAt);

      console.log(`🔍 Checking acceptance reminder for ${meeting.meetingId}:`, {
        decision: meeting.decision,
        todayKey,
        acceptanceReminderTargetKey,
        acceptanceReminderSentAt: meeting.acceptanceReminderSentAt,
        shouldSendAcceptanceReminder,
      });

      if (shouldSendAcceptanceReminder) {
        try {
          const mentorTimezone = mentor.timezone || meeting.mentor_timezone || MY_TZ;
          console.log(`✉️ Sending acceptance reminder to ${meeting.mentor_email}...`);
          await sendEmail({
            to: meeting.mentor_email,
            subject: 'Action Required: Please Accept or Decline a Meeting Request – CONNEXT',
            template: 'mentor-acceptance-reminder',
            data: {
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
              timezone: mentorTimezone,
              message: meeting.message || '',
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
      const shouldSendMeetingReminder =
        meeting.decision === 'accepted' &&
        meetingReminderTargetKey === todayKey &&
        !meeting.reminderSentAt &&
        !processedMeetingReminderIds.has(meeting.meetingId);

      if (shouldSendMeetingReminder) {
        let reminderOk = false;
        try {
          const menteeTimezone = meeting.mentee_timezone || timezoneCache.get(meeting.menteeUID) || await resolveUserTimezone(meeting.menteeUID, menteeContainer, mentorContainer);
          timezoneCache.set(meeting.menteeUID, menteeTimezone);
          const mentorTimezone = mentor.timezone || meeting.mentor_timezone || MY_TZ;
          await sendEmail({
            to: meeting.mentee_email,
            subject: 'Reminder: Your Mentorship Session is Tomorrow – CONNEXT',
            template: 'meeting-reminder-mentee',
            data: {
              menteeName: meeting.mentee_name,
              mentorName: meeting.mentor_name,
              date: meeting.date,
              time: meeting.time,
              timezone: menteeTimezone,
              message: meeting.message || '',
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
              timezone: mentorTimezone,
              message: meeting.message || '',
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
        const menteeTimezone = cancelled.mentee_timezone || timezoneCache.get(cancelled.menteeUID) || await resolveUserTimezone(cancelled.menteeUID, menteeContainer, mentorContainer);
        timezoneCache.set(cancelled.menteeUID, menteeTimezone);
        await sendEmail({
          to: cancelled.mentee_email,
          subject: 'Meeting Request Automatically Cancelled – CONNEXT',
          template: 'meeting-cancelled-no-acceptance',
          data: {
            menteeName: cancelled.mentee_name,
            mentorName: cancelled.mentor_name,
            date: cancelled.date,
            time: cancelled.time,
            timezone: menteeTimezone,
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
