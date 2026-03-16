import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/cosmos";

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

    // Check if feedback was already submitted to prevent duplicate replenishments
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

    // Mark feedback as sent
    user.scheduling[scheduleIndex].feedbackFormSent = true;
    user.scheduling[scheduleIndex].feedbackFormSentAt = new Date().toISOString();

    // Replenish token for mentee (add 1 token back) - only happens once
    const currentTokens = user.tokens || 0;
    user.tokens = currentTokens + 1;

    // Update the document
    await containerToUpdate.item(userId, userId).replace(user);

    console.log(`📝 Feedback submitted for meeting ${meetingId} - token replenished: ${currentTokens} → ${user.tokens}`);

    return NextResponse.json({
      message: "Feedback submitted successfully and token replenished",
      success: true,
      newTokenBalance: user.tokens
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
