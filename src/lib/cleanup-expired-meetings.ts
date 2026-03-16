import { database } from './cosmos';

/**
 * Cleanup expired pending meeting requests
 * Removes meetings that have passed their scheduled time and refunds tokens
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
    for (let i = mentor.scheduling.length - 1; i >= 0; i--) {
      const meeting = mentor.scheduling[i];
      
      // Only process pending meetings
      if (meeting.decision === 'pending' && meeting.scheduled_status === 'pending') {
        try {
          // Parse meeting date and time - handle both formats
          let meetingDateTime: Date;
          
          if (meeting.date.includes('/')) {
            // DD/MM/YYYY format
            const [day, month, year] = meeting.date.split('/').map(Number);
            const [hours, minutes] = meeting.time.split(':').map(Number);
            meetingDateTime = new Date(year, month - 1, day, hours, minutes);
          } else {
            // YYYY-MM-DD format
            const [year, month, day] = meeting.date.split('-').map(Number);
            const [hours, minutes] = meeting.time.split(':').map(Number);
            meetingDateTime = new Date(year, month - 1, day, hours, minutes);
          }
          
          // Check if meeting time has passed
          if (meetingDateTime < now) {
            console.log(`⏰ Expired: ${meeting.meetingId} - ${meeting.date} ${meeting.time} (scheduled: ${meetingDateTime.toISOString()})`);
            expiredMeetings.push(meeting);
            mentor.scheduling.splice(i, 1);
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
      console.log(`✅ Removed ${expiredMeetings.length} expired meetings from mentor ${mentor.mentor_name || mentor.mentorUID}`);

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
              
              // Also remove the expired meeting from mentee's scheduling
              if (requester.scheduling && Array.isArray(requester.scheduling)) {
                const menteeSchedulingIndex = requester.scheduling.findIndex(
                  (m: any) => m.meetingId === expiredMeeting.meetingId
                );
                if (menteeSchedulingIndex !== -1) {
                  requester.scheduling.splice(menteeSchedulingIndex, 1);
                  console.log(`🗑️ Removed expired meeting from mentee ${menteeId}`);
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
                
                // Also remove the expired meeting from mentor's scheduling
                if (requester.scheduling && Array.isArray(requester.scheduling)) {
                  const mentorSchedulingIndex = requester.scheduling.findIndex(
                    (m: any) => m.meetingId === expiredMeeting.meetingId
                  );
                  if (mentorSchedulingIndex !== -1) {
                    requester.scheduling.splice(mentorSchedulingIndex, 1);
                    console.log(`🗑️ Removed expired meeting from mentor-as-mentee ${requester.mentorUID}`);
                  }
                }
              }
            }
          }
          
          if (requester) {
            const currentTokens = requester.tokens || 0;
            requester.tokens = currentTokens + 1;
            
            if (isRequesterMentor) {
              await mentorContainer.item(requester.id, requester.id).replace(requester);
            } else {
              await menteeContainer.item(requester.id, requester.id).replace(requester);
            }
            
            tokensRefunded++;
            console.log(`💰 Refunded 1 token to ${isRequesterMentor ? 'mentor' : 'mentee'} ${requester.id}. New balance: ${requester.tokens}`);
          } else {
            console.warn(`Could not find requester for expired meeting ${expiredMeeting.meetingId} with menteeUID ${menteeId}`);
          }
        } catch (refundError) {
          console.error(`Error refunding token for meeting ${expiredMeeting.meetingId}:`, refundError);
        }
      }
    }
  }

  console.log(`✅ Cleanup complete. Removed ${expiredCount} expired requests, refunded ${tokensRefunded} tokens.`);

  return {
    expiredCount,
    tokensRefunded
  };
}
