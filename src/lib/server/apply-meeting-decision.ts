import 'server-only';

import { fromZonedTime } from 'date-fns-tz';
import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { clampToken } from '@/lib/token-cycle';

const MY_TIMEZONE = 'Asia/Kuala_Lumpur';

const parseMeetingDateTimeInMalaysia = (date: string, time: string): Date | null => {
  try {
    const baseDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;

    let hours = 0;
    let minutes = 0;

    if (time.includes('AM') || time.includes('PM')) {
      const [rawTime, period] = time.split(' ');
      const [hoursRaw, minutesRaw] = rawTime.split(':').map(Number);
      if (Number.isNaN(hoursRaw) || Number.isNaN(minutesRaw)) return null;
      hours =
        period === 'PM' && hoursRaw !== 12
          ? hoursRaw + 12
          : period === 'AM' && hoursRaw === 12
            ? 0
            : hoursRaw;
      minutes = minutesRaw;
    } else {
      const [h, m] = time.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      hours = h;
      minutes = m;
    }

    const malaysiaLocalDateTime = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const utcDate = fromZonedTime(malaysiaLocalDateTime, MY_TIMEZONE);
    return Number.isNaN(utcDate.getTime()) ? null : utcDate;
  } catch {
    return null;
  }
};

export type ApplyMeetingDecisionInput = {
  mentorId: string;
  meetingId: string;
  decision: 'accepted' | 'declined' | 'rejected';
  googleMeetUrl?: string;
  meetingLink?: string;
};

export type ApplyMeetingDecisionResult =
  | { ok: true; meeting: any; updatedRequester: boolean }
  | { ok: false; status: number; message: string; error?: string };

export async function applyMeetingDecision({
  mentorId,
  meetingId,
  decision,
  googleMeetUrl,
  meetingLink,
}: ApplyMeetingDecisionInput): Promise<ApplyMeetingDecisionResult> {
  const mentorContainer = database.container('mentor');

  // 1. Update the TARGET MENTOR (the one accepting/rejecting)
  const querySpec = {
    query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
    parameters: [{ name: "@mentorId", value: mentorId }]
  };

  const { resources: mentors } = await mentorContainer.items
    .query(querySpec)
    .fetchAll();

  if (mentors.length === 0) {
    return { ok: false, status: 404, message: "Mentor not found" };
  }

  const mentor = mentors[0];

  if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) {
    return { ok: false, status: 404, message: "No scheduling data found" };
  }

  const meetingIndex = mentor.scheduling.findIndex(
    (meeting: any) => meeting.meetingId === meetingId
  );

  if (meetingIndex === -1) {
    return { ok: false, status: 404, message: "Meeting not found" };
  }

  const meeting = mentor.scheduling[meetingIndex];
  const menteeId = meeting.menteeUID;

  if (meeting.decision !== 'pending') {
    return {
      ok: false,
      status: 409,
      message: 'This request has already been responded to.',
      error: 'ALREADY_RESOLVED',
    };
  }

  // Enforce 3-day acceptance deadline: mentor can only accept up to 3 days before the meeting
  if (decision === 'accepted') {
    const meetingDateTime = parseMeetingDateTimeInMalaysia(meeting.date, meeting.time);
    if (meetingDateTime) {
      const daysUntilMeeting = (meetingDateTime.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000);
      if (daysUntilMeeting < 3) {
        return {
          ok: false,
          status: 400,
          message:
            'The acceptance deadline has passed. Meetings can only be accepted at least 3 days before the scheduled time.',
          error: 'ACCEPTANCE_DEADLINE_PASSED',
        };
      }
    }
  }

  // Update target mentor's meeting
  mentor.scheduling[meetingIndex].decision = decision;
  mentor.scheduling[meetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
  mentor.scheduling[meetingIndex].updated_at = new Date().toISOString();

  // Update Google Meet URL if provided
  if (googleMeetUrl) {
    mentor.scheduling[meetingIndex].googleMeetUrl = googleMeetUrl;
    console.log(`✅ Updated googleMeetUrl in target mentor's record: ${googleMeetUrl}`);
  }
  if (meetingLink) {
    mentor.scheduling[meetingIndex].meetingLink = meetingLink;
    console.log(`✅ Updated meetingLink in target mentor's record: ${meetingLink}`);
  }

  const isRejected = decision === 'declined' || decision === 'rejected';
  console.log(`Decision: ${decision}, isRejected: ${isRejected}`);

  await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
  console.log('✅ Updated meeting in TARGET mentor table:', meetingId);

  // 2. Update the REQUESTER (could be mentee or mentor acting as mentee) in parallel
  const menteeContainer = database.container('mentee');

  // Try both mentee table and mentor table in parallel
  const [menteeResult, requesterMentorResult] = await Promise.allSettled([
    // Try updating mentee
    (async () => {
      const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();

      if (mentee && mentee.scheduling && Array.isArray(mentee.scheduling)) {
        const menteeMeetingIndex = mentee.scheduling.findIndex(
          (m: any) => m.meetingId === meetingId
        );

        if (menteeMeetingIndex !== -1) {
          mentee.scheduling[menteeMeetingIndex].decision = decision;
          mentee.scheduling[menteeMeetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
          mentee.scheduling[menteeMeetingIndex].updated_at = new Date().toISOString();

          if (googleMeetUrl) {
            mentee.scheduling[menteeMeetingIndex].googleMeetUrl = googleMeetUrl;
          }
          if (meetingLink) {
            mentee.scheduling[menteeMeetingIndex].meetingLink = meetingLink;
          }

          // Replenish token if declined or rejected
          if (isRejected) {
            const currentTokens = clampToken(mentee.tokens);
            mentee.tokens = 1;
            if (mentee.token_cycle?.meetingId === meetingId && mentee.token_cycle.status === 'pending') {
              mentee.token_cycle = undefined;
            }
            console.log(`💰 REPLENISHING TOKEN: ${currentTokens} → ${mentee.tokens} for mentee ${menteeId}`);
          }

          await menteeContainer.item(menteeId, menteeId).replace(mentee);
          console.log('✅ Updated meeting in MENTEE table:', meetingId);
          return { success: true, type: 'mentee' };
        }
      }
      return { success: false, type: 'mentee' };
    })(),

    // Try finding mentor with mentee_id
    (async () => {
      const requesterQuerySpec = {
        query: "SELECT * FROM c WHERE c.mentee_id = @menteeId",
        parameters: [{ name: "@menteeId", value: menteeId }]
      };

      const { resources: requesters } = await mentorContainer.items
        .query(requesterQuerySpec)
        .fetchAll();

      if (requesters.length > 0) {
        const requesterMentor = requesters[0];

        if (requesterMentor.scheduling && Array.isArray(requesterMentor.scheduling)) {
          const requesterMeetingIndex = requesterMentor.scheduling.findIndex(
            (m: any) => m.meetingId === meetingId
          );

          if (requesterMeetingIndex !== -1) {
            requesterMentor.scheduling[requesterMeetingIndex].decision = decision;
            requesterMentor.scheduling[requesterMeetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
            requesterMentor.scheduling[requesterMeetingIndex].updated_at = new Date().toISOString();

            if (googleMeetUrl) {
              requesterMentor.scheduling[requesterMeetingIndex].googleMeetUrl = googleMeetUrl;
            }
            if (meetingLink) {
              requesterMentor.scheduling[requesterMeetingIndex].meetingLink = meetingLink;
            }

            // Replenish token if declined or rejected
            if (isRejected) {
              const currentTokens = clampToken(requesterMentor.tokens);
              requesterMentor.tokens = 1;
              if (requesterMentor.token_cycle?.meetingId === meetingId && requesterMentor.token_cycle.status === 'pending') {
                requesterMentor.token_cycle = undefined;
              }
              console.log(`💰 REPLENISHING TOKEN for mentor: ${currentTokens} → ${requesterMentor.tokens}`);
            }

            await mentorContainer.item(requesterMentor.id, requesterMentor.id).replace(requesterMentor);
            console.log('✅ Updated meeting in REQUESTER MENTOR table:', meetingId);
            return { success: true, type: 'mentor' };
          }
        }
      }
      return { success: false, type: 'mentor' };
    })()
  ]);

  // Check results
  let updatedRequester = false;
  if (menteeResult.status === 'fulfilled' && menteeResult.value.success) {
    updatedRequester = true;
  } else if (requesterMentorResult.status === 'fulfilled' && requesterMentorResult.value.success) {
    updatedRequester = true;
  }

  if (!updatedRequester) {
    console.warn(`⚠️ Could not update requester for meeting ${meetingId}`);
  }

  // Send email notifications
  try {
    console.log(`📧 Preparing to send ${decision} email to: ${meeting.mentee_email}`);
    console.log('Email data:', {
      to: meeting.mentee_email,
      menteeName: meeting.mentee_name,
      mentorName: meeting.mentor_name,
      date: meeting.date,
      time: meeting.time
    });

    if (decision === 'accepted') {
      // Email to mentee: meeting accepted
      await sendEmail({
        to: meeting.mentee_email,
        subject: 'Your Mentorship Meeting is Confirmed - CONNEXT',
        template: 'mentee-meeting-accepted',
        data: {
          menteeName: meeting.mentee_name,
          mentorName: meeting.mentor_name,
          date: meeting.date,
          time: meeting.time,
          timezone: meeting.mentee_timezone || MY_TIMEZONE,
          googleMeetUrl: meeting.googleMeetUrl || ''
        }
      });
      console.log('✅ Acceptance email sent successfully to:', meeting.mentee_email);
    } else if (decision === 'declined' || decision === 'rejected') {
      // Email to mentee: meeting declined/rejected
      console.log('🔴 Sending decline/reject email...');
      await sendEmail({
        to: meeting.mentee_email,
        subject: 'Meeting Request Update - CONNEXT',
        template: 'mentee-meeting-declined',
        data: {
          menteeName: meeting.mentee_name,
          mentorName: meeting.mentor_name,
          date: meeting.date,
          time: meeting.time,
          timezone: meeting.mentee_timezone || MY_TIMEZONE
        }
      });
      console.log('✅ Decline email sent successfully to:', meeting.mentee_email);
    }
  } catch (emailError) {
    console.error('❌ Failed to send decision email:', emailError);
    console.error('Email error details:', {
      message: (emailError as Error).message,
      stack: (emailError as Error).stack
    });
    // Don't fail the request if email fails
  }

  return {
    ok: true,
    meeting: mentor.scheduling[meetingIndex],
    updatedRequester,
  };
}
