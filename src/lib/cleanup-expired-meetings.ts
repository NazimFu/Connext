import { database } from './cosmos';
import { clampToken } from './token-cycle';
import { sendEmail } from './email';
import { getMalaysiaTodayKey, getReminderTargetDateKey } from './cron-meeting-dates';

const PENDING_REQUEST_DEADLINE_DAYS = 3;

/**
 * Cleanup expired pending meeting requests
 * Removes pending requests once the 3-day acceptance deadline has passed and refunds tokens
 */
export async function cleanupExpiredMeetings(): Promise<{
  expiredCount: number;
  tokensRefunded: number;
}> {
  console.log('🕒 Starting cleanup of expired pending meeting requests...');

  const mentorContainer = database.container('mentor');
  const menteeContainer = database.container('mentee');

  let expiredCount = 0;
  let tokensRefunded = 0;

  const now = new Date();
  const todayKey = getMalaysiaTodayKey(now);
  console.log(`Current time: ${now.toISOString()}`);

  const { resources: allMentors } = await mentorContainer.items
    .query({ query: "SELECT * FROM c WHERE c.scheduling != null" })
    .fetchAll();

  for (const mentor of allMentors) {
    if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) {
      continue;
    }

    let hasChanges = false;

    for (let i = 0; i < mentor.scheduling.length; i++) {
      const meeting = mentor.scheduling[i];

      if (meeting.decision !== 'pending' || meeting.scheduled_status !== 'pending') {
        continue;
      }

      let deadlineKey: string | null = null;
      try {
        deadlineKey = getReminderTargetDateKey(meeting.date, PENDING_REQUEST_DEADLINE_DAYS);
      } catch (parseError) {
        console.error(`Error parsing date for meeting ${meeting.meetingId}:`, parseError);
        continue;
      }

      if (!deadlineKey || todayKey < deadlineKey) {
        continue;
      }

      console.log(`⏰ Expired: ${meeting.meetingId} - ${meeting.date} ${meeting.time} (deadline: ${deadlineKey}, today: ${todayKey})`);

      // --- Step 1: find and update the requester (mentee) document first ---
      const menteeId = meeting.menteeUID;
      let requester: any = null;
      let isRequesterMentor = false;

      if (menteeId) {
        // Direct id lookup
        try {
          const { resource: menteeResource } = await menteeContainer.item(menteeId, menteeId).read();
          if (menteeResource) {
            requester = menteeResource;
          }
        } catch (err: any) {
          if (err.code !== 404) {
            console.error(`Unexpected error reading mentee ${menteeId} for meeting ${meeting.meetingId}:`, err);
          }
        }

        // Fallback: query mentee container
        if (!requester) {
          try {
            const { resources: menteeMatches } = await menteeContainer.items
              .query({
                query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id OR c.mentee_uid = @id',
                parameters: [{ name: '@id', value: menteeId }],
              })
              .fetchAll();
            if (menteeMatches.length > 0) {
              requester = menteeMatches[0];
            }
          } catch (qErr) {
            console.error(`Mentee query failed for ${menteeId}:`, qErr);
          }
        }

        // Fallback: mentor acting as mentee
        if (!requester) {
          try {
            const { resources: mentorMatches } = await mentorContainer.items
              .query({
                query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id OR c.mentee_id = @id',
                parameters: [{ name: '@id', value: menteeId }],
              })
              .fetchAll();
            if (mentorMatches.length > 0) {
              requester = mentorMatches[0];
              isRequesterMentor = true;
            }
          } catch (qErr) {
            console.error(`Mentor-as-mentee query failed for ${menteeId}:`, qErr);
          }
        }
      }

      // Last-resort: find whoever has this meetingId in their scheduling
      if (!requester) {
        try {
          const { resources: menteeMatches } = await menteeContainer.items
            .query({
              query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.scheduling, {"meetingId": @meetingId}, true)',
              parameters: [{ name: '@meetingId', value: meeting.meetingId }],
            })
            .fetchAll();
          if (menteeMatches.length > 0) {
            requester = menteeMatches[0];
          }
        } catch (qErr) {
          console.error(`MeetingId fallback query failed for ${meeting.meetingId}:`, qErr);
        }
      }

      const cancelInfo = {
        cancelledBy: 'system',
        role: 'system',
        reason: 'Mentor did not accept the request within the 3-day acceptance deadline.',
        cancelledAt: now.toISOString(),
        tokenStatus: 'auto-replenished',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
      };

      if (requester) {
        // Update requester's scheduling entry
        if (requester.scheduling && Array.isArray(requester.scheduling)) {
          const idx = requester.scheduling.findIndex((m: any) => m.meetingId === meeting.meetingId);
          if (idx !== -1) {
            requester.scheduling[idx].scheduled_status = 'cancelled';
            requester.scheduling[idx].cancel_info = cancelInfo;
          }
        }

        // Refund token
        const before = clampToken(requester.tokens);
        requester.tokens = 1;
        if (
          requester.token_cycle?.meetingId === meeting.meetingId &&
          requester.token_cycle.status === 'pending'
        ) {
          requester.token_cycle = undefined;
        }

        try {
          if (isRequesterMentor) {
            await mentorContainer.item(requester.id, requester.id).replace(requester);
          } else {
            await menteeContainer.item(requester.id, requester.id).replace(requester);
          }
          tokensRefunded++;
          console.log(`💰 Refunded 1 token to ${isRequesterMentor ? 'mentor' : 'mentee'} ${requester.id}. ${before} → ${requester.tokens}`);
        } catch (saveErr) {
          console.error(`Failed to save requester after token refund for meeting ${meeting.meetingId}:`, saveErr);
        }

        // Send email using requester document fields, fall back to meeting fields
        const recipientEmail =
          requester.mentee_email || requester.email || requester.mentor_email || meeting.mentee_email;
        const recipientName =
          requester.mentee_name || requester.name || requester.mentor_name || meeting.mentee_name || 'there';

        if (recipientEmail) {
          try {
            await sendEmail({
              to: recipientEmail,
              subject: 'Meeting Request Automatically Cancelled – CONNEXT',
              template: 'meeting-cancelled-no-acceptance',
              data: {
                menteeName: recipientName,
                mentorName: meeting.mentor_name || 'the mentor',
                date: meeting.date,
                time: meeting.time,
                timezone: requester.mentee_timezone || requester.timezone || meeting.mentee_timezone || 'Asia/Kuala_Lumpur',
              },
            });
            console.log(`📧 Auto-cancel notification sent to ${recipientEmail}`);
          } catch (emailError) {
            console.error(`Failed to send cancellation email for meeting ${meeting.meetingId}:`, emailError);
          }
        } else {
          console.warn(`No recipient email found for meeting ${meeting.meetingId}`);
        }
      } else {
        // No requester document found — still send email if mentee_email is on the meeting
        console.warn(`Could not find requester document for meeting ${meeting.meetingId} (menteeUID: ${menteeId})`);
        if (meeting.mentee_email) {
          try {
            await sendEmail({
              to: meeting.mentee_email,
              subject: 'Meeting Request Automatically Cancelled – CONNEXT',
              template: 'meeting-cancelled-no-acceptance',
              data: {
                menteeName: meeting.mentee_name || 'there',
                mentorName: meeting.mentor_name || 'the mentor',
                date: meeting.date,
                time: meeting.time,
                timezone: meeting.mentee_timezone || 'Asia/Kuala_Lumpur',
              },
            });
            console.log(`📧 Fallback auto-cancel email sent to ${meeting.mentee_email}`);
          } catch (emailError) {
            console.error(`Failed to send fallback email for meeting ${meeting.meetingId}:`, emailError);
          }
        }
      }

      // --- Step 1b: notify the mentor that the request they didn't act on was auto-cancelled ---
      const mentorEmail = mentor.mentor_email || meeting.mentor_email;
      if (mentorEmail) {
        try {
          await sendEmail({
            to: mentorEmail,
            subject: 'Meeting Request Automatically Cancelled – CONNEXT',
            template: 'meeting-cancelled-no-acceptance-mentor',
            data: {
              mentorName: mentor.mentor_name || meeting.mentor_name || 'there',
              menteeName: (requester && (requester.mentee_name || requester.name)) || meeting.mentee_name || 'the mentee',
              date: meeting.date,
              time: meeting.time,
              timezone: mentor.mentor_timezone || mentor.timezone || meeting.mentor_timezone || 'Asia/Kuala_Lumpur',
            },
          });
          console.log(`📧 Auto-cancel notification sent to mentor ${mentorEmail}`);
        } catch (emailError) {
          console.error(`Failed to send mentor cancellation email for meeting ${meeting.meetingId}:`, emailError);
        }
      } else {
        console.warn(`No mentor email found for meeting ${meeting.meetingId}`);
      }

      // --- Step 2: mark the meeting as cancelled on the mentor side (in memory) ---
      mentor.scheduling[i].scheduled_status = 'cancelled';
      mentor.scheduling[i].cancel_info = cancelInfo;
      hasChanges = true;
      expiredCount++;
    }

    // --- Step 3: persist mentor changes only after all processing is done ---
    if (hasChanges) {
      try {
        await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
        console.log(`✅ Marked expired meetings as cancelled for mentor ${mentor.mentor_name || mentor.mentorUID}`);
      } catch (saveErr) {
        console.error(`Failed to save mentor ${mentor.id} after cleanup:`, saveErr);
      }
    }
  }

  console.log(`✅ Cleanup complete. Marked ${expiredCount} expired requests as cancelled, refunded ${tokensRefunded} tokens.`);

  return {
    expiredCount,
    tokensRefunded
  };
}
