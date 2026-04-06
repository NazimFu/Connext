import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { generateFeedbackFormUrl } from '@/lib/googleForm';

/**
 * API endpoint to send feedback forms to mentees whose sessions ended 2 hours ago
 * This should be called by a cron job every hour
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication to prevent unauthorized calls
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key-here';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    console.log('Checking for sessions that started around:', twoHoursAgo.toISOString());

    // Query both mentor and mentee containers for accepted meetings
    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    const sentForms: string[] = [];
    const errors: any[] = [];

    // Helper function to process meetings
    const processMeetings = async (container: any, role: 'mentor' | 'mentee') => {
      const { resources: users } = await container.items.readAll().fetchAll();

      for (const user of users) {
        if (!user.scheduling || !Array.isArray(user.scheduling)) continue;

        for (const meeting of user.scheduling) {
          // Skip if not accepted or already cancelled
          if (meeting.decision !== 'accepted' || meeting.scheduled_status === 'cancelled') {
            continue;
          }

          // Skip if feedback form email was already sent
          if (meeting.feedbackFormDelivered === true) {
            continue;
          }

          // Parse meeting date and time
          const meetingDate = new Date(meeting.date);
          const [hours, minutes] = meeting.time.split(':').map(Number);
          meetingDate.setHours(hours, minutes, 0, 0);

          // Check if meeting started approximately 2 hours ago (within ±30 minutes window)
          const timeDifference = Math.abs(now.getTime() - meetingDate.getTime() - 2 * 60 * 60 * 1000);
          const thirtyMinutesInMs = 30 * 60 * 1000;

          if (timeDifference <= thirtyMinutesInMs) {
            try {
              const scheduleIndex = user.scheduling.findIndex(
                (m: any) => m.meetingId === meeting.meetingId
              );
              if (scheduleIndex === -1) {
                continue;
              }

              const existingToken = user.scheduling[scheduleIndex].feedbackTrackingToken;
              const trackingToken =
                typeof existingToken === 'string' && existingToken.trim().length > 0
                  ? existingToken
                  : randomUUID();

              // Generate pre-filled form URL
              const formUrl = generateFeedbackFormUrl({
                menteeName: meeting.mentee_name,
                mentorName: meeting.mentor_name,
                sessionDate: meeting.date,
                sessionTime: meeting.time,
                trackingToken,
              });

              // Send email to mentee
              await sendEmail({
                to: meeting.mentee_email,
                subject: '📝 Your Session Feedback - Connext',
                template: 'mentee-feedback-form',
                data: {
                  menteeName: meeting.mentee_name,
                  mentorName: meeting.mentor_name,
                  date: new Date(meeting.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }),
                  time: meeting.time,
                  formUrl: formUrl
                }
              });

              // Mark feedback form email as delivered in the database.
              // Submission is tracked separately through the verification webhook.
              if (scheduleIndex !== -1) {
                user.scheduling[scheduleIndex].feedbackFormDelivered = true;
                user.scheduling[scheduleIndex].feedbackFormDeliveredAt = now.toISOString();
                user.scheduling[scheduleIndex].feedbackFormUrl = formUrl; // Store the form URL
                user.scheduling[scheduleIndex].feedbackTrackingToken = trackingToken;
                
                await container.item(user.id, user.id).replace(user);
              }

              sentForms.push(`${meeting.meetingId} (${meeting.mentee_name})`);
              console.log(`Feedback form sent for meeting ${meeting.meetingId}`);
            } catch (error) {
              console.error(`Error sending feedback form for meeting ${meeting.meetingId}:`, error);
              errors.push({
                meetingId: meeting.meetingId,
                error: (error as Error).message
              });
            }
          }
        }
      }
    };

    // Process both containers
    await processMeetings(mentorContainer, 'mentor');
    await processMeetings(menteeContainer, 'mentee');

    return NextResponse.json({
      success: true,
      sentCount: sentForms.length,
      sentForms,
      errors: errors.length > 0 ? errors : undefined,
      checkedAt: now.toISOString()
    });

  } catch (error) {
    console.error('Error in send-feedback endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to send feedback forms', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to manually trigger feedback form sending (for testing)
 * Remove or secure this in production
 */
export async function GET(request: NextRequest) {
  // For testing purposes - you can call this endpoint manually
  return POST(request);
}
