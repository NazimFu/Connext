import { database } from './cosmos';
import { clampToken } from './token-cycle';
import { sendEmail } from './email';
import { getMalaysiaTodayKey, getReminderTargetDateKey } from './cron-meeting-dates';
import { toZonedTime } from 'date-fns-tz';

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

  // Get current time
  const now = new Date();
  const todayKey = getMalaysiaTodayKey(now);
  console.log(`Current time: ${now.toISOString()}`);

  // Process all mentors
  const { resources: allMentors } = await mentorContainer.items
    .query({ query: "SELECT * FROM c WHERE c.scheduling != null" })
    .fetchAll();

  for (const mentor of allMentors) {
    if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) {
      continue;
    }

    let hasChanges = false;
    const expiredMeetings: any[] = [];

    // Find expired pending meetings
    for (let i = 0; i < mentor.scheduling.length; i++) {
      const meeting = mentor.scheduling[i];
      
      // Only process pending meetings
      if (meeting.decision === 'pending' && meeting.scheduled_status === 'pending') {
        try {
          const deadlineKey = getReminderTargetDateKey(meeting.date, PENDING_REQUEST_DEADLINE_DAYS);
          if (deadlineKey && todayKey >= deadlineKey) {
            console.log(`⏰ Expired: ${meeting.meetingId} - ${meeting.date} ${meeting.time} (deadline: ${deadlineKey}, today: ${todayKey})`);
            expiredMeetings.push(meeting);
            
            // Mark as cancelled instead of deleting
            mentor.scheduling[i].scheduled_status = 'cancelled';
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
            expiredCount++;
          }
        } catch (parseError) {
          console.error(`Error parsing date for meeting ${meeting.meetingId}:`, parseError);
        }
      }
    }

    // Save changes if any
    if (hasChanges) {
      await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
      console.log(`✅ Marked ${expiredMeetings.length} expired meetings as cancelled in mentor ${mentor.mentor_name || mentor.mentorUID}`);

      // Refund tokens to requesters
      for (const expiredMeeting of expiredMeetings) {
        try {
          const menteeId = expiredMeeting.menteeUID;
          
          if (!menteeId) {
            console.warn(`No menteeUID found for meeting ${expiredMeeting.meetingId}`);
            continue;
          }
          
          // Try to find requester (could be mentee or mentor)
          let requester: any = null;
          let isRequesterMentor = false;
          
          try {
            const { resource: menteeResource } = await menteeContainer.item(menteeId, menteeId).read();
            if (menteeResource) {
              requester = menteeResource;
              
              // Also mark as cancelled on mentee's scheduling
              if (requester.scheduling && Array.isArray(requester.scheduling)) {
                const menteeSchedulingIndex = requester.scheduling.findIndex(
                  (m: any) => m.meetingId === expiredMeeting.meetingId
                );
                if (menteeSchedulingIndex !== -1) {
                  requester.scheduling[menteeSchedulingIndex].scheduled_status = 'cancelled';
                  requester.scheduling[menteeSchedulingIndex].cancel_info = {
                    cancelledBy: 'system',
                    role: 'system',
                    reason: 'Mentor did not accept the request within the 3-day acceptance deadline.',
                    cancelledAt: now.toISOString(),
                    tokenStatus: 'auto-replenished',
                    reviewedBy: null,
                    reviewedAt: null,
                    reviewNotes: null,
                  };
                  console.log(`✅ Marked expired meeting as cancelled on mentee ${menteeId}`);
                }
              }
            }
          } catch (err: any) {
            if (err.code === 404) {
              // Check if it's a mentor acting as mentee
              const requesterQuerySpec = {
                query: "SELECT * FROM c WHERE c.mentee_id = @menteeId",
                parameters: [{ name: "@menteeId", value: menteeId }]
              };
              const { resources: mentorRequesters } = await mentorContainer.items
                .query(requesterQuerySpec)
                .fetchAll();
              
              if (mentorRequesters.length > 0) {
                requester = mentorRequesters[0];
                isRequesterMentor = true;
                
                // Also mark as cancelled on mentor-as-mentee's scheduling
                if (requester.scheduling && Array.isArray(requester.scheduling)) {
                  const mentorSchedulingIndex = requester.scheduling.findIndex(
                    (m: any) => m.meetingId === expiredMeeting.meetingId
                  );
                  if (mentorSchedulingIndex !== -1) {
                    requester.scheduling[mentorSchedulingIndex].scheduled_status = 'cancelled';
                    requester.scheduling[mentorSchedulingIndex].cancel_info = {
                      cancelledBy: 'system',
                      role: 'system',
                      reason: 'Mentor did not accept the request within the 3-day acceptance deadline.',
                      cancelledAt: now.toISOString(),
                      tokenStatus: 'auto-replenished',
                      reviewedBy: null,
                      reviewedAt: null,
                      reviewNotes: null,
                    };
                    console.log(`✅ Marked expired meeting as cancelled on mentor-as-mentee ${requester.mentorUID}`);
                  }
                }
              }
            }
          }
          
          if (requester) {
            const currentTokens = clampToken(requester.tokens);
            requester.tokens = 1;
            if (requester.token_cycle?.meetingId === expiredMeeting.meetingId && requester.token_cycle.status === 'pending') {
              requester.token_cycle = undefined;
            }
            
            if (isRequesterMentor) {
              await mentorContainer.item(requester.id, requester.id).replace(requester);
            } else {
              await menteeContainer.item(requester.id, requester.id).replace(requester);
            }
            
            tokensRefunded++;
            console.log(`💰 Refunded 1 token to ${isRequesterMentor ? 'mentor' : 'mentee'} ${requester.id}. New balance: ${requester.tokens}`);

            const recipientName = requester.mentee_name || requester.name || requester.mentor_name || 'there';
            const recipientEmail = requester.mentee_email || requester.email || requester.mentor_email;

            if (recipientEmail) {
              try {
                await sendEmail({
                  to: recipientEmail,
                  subject: 'Meeting Request Automatically Cancelled – CONNEXT',
                  template: 'meeting-cancelled-no-acceptance',
                  data: {
                    menteeName: recipientName,
                    mentorName: expiredMeeting.mentor_name || 'the mentor',
                    date: expiredMeeting.date,
                    time: expiredMeeting.time,
                    timezone: requester.mentee_timezone || requester.timezone || 'Asia/Kuala_Lumpur',
                  },
                });
                console.log(`📧 Auto-cancel notification sent to ${recipientEmail}`);
              } catch (emailError) {
                console.error(`Failed to send cancellation email for meeting ${expiredMeeting.meetingId}:`, emailError);
              }
            }
          } else {
            console.warn(`Could not find requester for expired meeting ${expiredMeeting.meetingId} with menteeUID ${menteeId}`);
          }
        } catch (refundError) {
          console.error(`Error refunding token for meeting ${expiredMeeting.meetingId}:`, refundError);
        }
      }
    }
  }

  console.log(`✅ Cleanup complete. Marked ${expiredCount} expired requests as cancelled, refunded ${tokensRefunded} tokens.`);

  return {
    expiredCount,
    tokensRefunded
  };
}
