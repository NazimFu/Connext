import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/cosmos";
import { getTokenCycleEvaluateAtIso, parseMeetingDateTime } from '@/lib/token-cycle';

export async function POST(req: NextRequest) {
  try {
    const { meetingId, menteeId } = await req.json();

    if (!meetingId || !menteeId) {
      return NextResponse.json(
        { message: "meetingId and menteeId are required" },
        { status: 400 }
      );
    }

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

    const meetingDateTime = parseMeetingDateTime(meeting.date, meeting.time);
    if (!meetingDateTime) {
      return NextResponse.json(
        { message: 'Invalid meeting date/time format.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const earliestFeedbackAt = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
    const latestValidFeedbackAt = new Date(meetingDateTime.getTime() + 14 * 24 * 60 * 60 * 1000);

    if (now < earliestFeedbackAt) {
      return NextResponse.json(
        {
          message: 'Feedback can only be submitted at least 2 hours after the meeting.',
          validFrom: earliestFeedbackAt.toISOString(),
        },
        { status: 400 }
      );
    }

    if (now > latestValidFeedbackAt) {
      return NextResponse.json(
        {
          message: 'Feedback window expired. Feedback must be submitted within 14 days after the meeting.',
          validUntil: latestValidFeedbackAt.toISOString(),
        },
        { status: 400 }
      );
    }

    // Mark feedback as sent
    user.scheduling[scheduleIndex].feedbackFormSent = true;
    user.scheduling[scheduleIndex].feedbackFormSentAt = new Date().toISOString();

    // Record feedback for cycle evaluation (token is decided at +30 days, not now).
    if (user.token_cycle && user.token_cycle.status === 'pending') {
      if (!user.token_cycle.meetingId || user.token_cycle.meetingId === meetingId) {
        user.token_cycle.meetingId = meetingId;
        user.token_cycle.meetingDate = meeting.date;
        user.token_cycle.meetingTime = meeting.time;
        user.token_cycle.feedbackSubmittedAt = now.toISOString();
        user.token_cycle.feedbackValid = true;
      }
    }

    // Update the document
    await containerToUpdate.item(userId, userId).replace(user);

    console.log(`📝 Feedback submitted for meeting ${meetingId} - marked valid for cycle evaluation`);

    return NextResponse.json({
      message: "Feedback submitted successfully",
      success: true,
      newTokenBalance: user.tokens || 0,
      tokenReplenished: false,
      tokenReplenishAt: getTokenCycleEvaluateAtIso(user.token_cycle?.tokenUsedAt),
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
