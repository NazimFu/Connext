import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/cosmos";
import { canAcceptFeedbackSubmission, getMeetingDateTime, type TokenCycle } from '@/lib/token-cycle';

export async function POST(req: NextRequest) {
  try {
    const { meetingId, menteeId, timezone } = await req.json();

    if (!meetingId || !menteeId) {
      return NextResponse.json(
        { message: "meetingId and menteeId are required" },
        { status: 400 }
      );
    }

    const userTimezone = timezone || 'UTC';
    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    // Check if menteeId is actually a mentor's mentorUID (mentor acting as mentee)
    const mentorQuerySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @menteeId",
      parameters: [{ name: "@menteeId", value: menteeId }]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(mentorQuerySpec)
      .fetchAll();

    let containerToUpdate;
    let userId;

    if (mentors.length > 0) {
      // This is a mentor acting as mentee
      containerToUpdate = mentorContainer;
      userId = menteeId;
    } else {
      // This is a regular mentee
      containerToUpdate = menteeContainer;
      userId = menteeId;
    }

    // Get the user document
    const { resource: user } = await containerToUpdate.item(userId, userId).read();

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Find the meeting in scheduling array
    const scheduleIndex = user.scheduling?.findIndex(
      (meeting: any) => meeting.meetingId === meetingId
    );

    if (scheduleIndex === -1 || scheduleIndex === undefined) {
      return NextResponse.json(
        { message: "Meeting not found in user's schedule" },
        { status: 404 }
      );
    }

    // Check if feedback was already submitted to prevent duplicates.
    if (user.scheduling[scheduleIndex].feedbackFormSent === true) {
      return NextResponse.json(
        { 
          message: "Feedback already submitted for this meeting",
          success: false,
          alreadySubmitted: true,
          currentTokenBalance: user.tokens || 0
        },
        { status: 200 }
      );
    }

    const meeting = user.scheduling[scheduleIndex];
    if (meeting.decision !== 'accepted') {
      return NextResponse.json(
        { message: 'Feedback can only be submitted for accepted meetings.' },
        { status: 400 }
      );
    }

    const meetingDateTime = getMeetingDateTime(meeting.date, meeting.time, userTimezone);
    if (!meetingDateTime) {
      return NextResponse.json(
        { message: 'Invalid meeting date/time format.' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Use the new comprehensive timing validation
    // First check if token cycle exists and validate timing
    if (user.token_cycle && user.token_cycle.status === 'pending') {
      const feedbackCheck = canAcceptFeedbackSubmission(user.token_cycle, userTimezone, now);
      if (!feedbackCheck.accepted) {
        return NextResponse.json(
          {
            message: feedbackCheck.reason || 'Feedback submission is not allowed at this time.',
          },
          { status: 400 }
        );
      }
    } else {
      // Fallback to basic timing check if no token cycle
      const earliestFeedbackAt = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
      if (now < earliestFeedbackAt) {
        const minutesRemaining = Math.ceil((earliestFeedbackAt.getTime() - now.getTime()) / (60 * 1000));
        return NextResponse.json(
          {
            message: `Feedback can only be submitted at least 2 hours after the meeting. Try again in ${minutesRemaining} minutes.`,
            validFrom: earliestFeedbackAt.toISOString(),
          },
          { status: 400 }
        );
      }
    }

    // Mark feedback as sent
    user.scheduling[scheduleIndex].feedbackFormSent = true;
    user.scheduling[scheduleIndex].feedbackFormSentAt = now.toISOString();

    // Record feedback for cycle evaluation
    if (user.token_cycle && user.token_cycle.status === 'pending') {
      if (!user.token_cycle.meetingId || user.token_cycle.meetingId === meetingId) {
        user.token_cycle.meetingId = meetingId;
        user.token_cycle.meetingDate = meeting.date;
        user.token_cycle.meetingTime = meeting.time;
        user.token_cycle.feedbackSubmittedAt = now.toISOString();
        user.token_cycle.feedbackValid = true;
        user.token_cycle.feedbackVerificationSource = 'direct-submission';
        
        console.log(`[Feedback Submission] Feedback submitted for meeting ${meetingId}. Marked valid for cycle evaluation at ${now.toISOString()}`);
      }
    }

    // Update the document
    await containerToUpdate.item(userId, userId).replace(user);

    return NextResponse.json({
      //TOKEN TEST 20 DAYS
      // message: "Feedback submitted successfully. Your token will be replenished after the 30-day cooldown once feedback is valid.",
      message: "Feedback submitted successfully. Your token will be replenished after the 20-day cooldown once feedback is valid.",
      success: true,
      newTokenBalance: user.tokens || 0,
      tokenReplenished: false,
      feedbackSubmittedAt: now.toISOString(),
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json(
      { 
        message: "Failed to submit feedback",
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}
