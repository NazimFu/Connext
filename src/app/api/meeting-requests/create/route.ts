import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { isWithinRequestWindow, buildFreshTokenCycle, clampToken } from '@/lib/token-cycle';

export async function POST(request: Request) {
  try {
    const { mentorId, menteeId, menteeName, menteeEmail, date, time, message, timezone } = await request.json();
    
    if (!mentorId || !menteeId || !menteeName || !date || !time || !message) {
      return NextResponse.json({ message: "All fields are required" }, { status: 400 });
    }

    // Use provided timezone or default to UTC
    const userTimezone = timezone || 'UTC';

    // Check if request is within valid window
    const windowCheck = isWithinRequestWindow(date, time, userTimezone);
    if (!windowCheck.allowed) {
      return NextResponse.json(
        { message: windowCheck.reason || 'Request is outside the valid window' },
        { status: 400 }
      );
    }

    const menteeContainer = database.container('mentee');
    const mentorContainer = database.container('mentor');
    
    // Get mentee document to check tokens
    let menteeDoc;
    try {
      const { resource } = await menteeContainer.item(menteeId, menteeId).read();
      menteeDoc = resource;
    } catch (error: any) {
      if (error?.code !== 404) {
        throw error;
      }
      return NextResponse.json({ message: "Mentee not found" }, { status: 404 });
    }

    if (!menteeDoc) {
      return NextResponse.json({ message: "Mentee not found" }, { status: 404 });
    }

    // Check if mentee has tokens
    const currentTokens = clampToken(menteeDoc.tokens);
    if (currentTokens <= 0) {
      return NextResponse.json(
        { message: "Insufficient tokens. Please wait for token replenishment or submit pending feedback." },
        { status: 402 }
      );
    }

    // Get mentor document
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
      parameters: [
        {
          name: "@mentorId",
          value: mentorId
        }
      ]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentors.length === 0) {
      return NextResponse.json({ message: "Mentor not found" }, { status: 404 });
    }

    const mentor = mentors[0];
    
    // Create a new meeting request
    const meetingId = `meet_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMeeting = {
      meetingId,
      menteeUID: menteeId,
      date,
      time,
      decision: "pending",
      scheduled_status: "pending",
      report_status: "none",
      report_reason: null,
      cancel_info: null,
      mentee_name: menteeName,
      mentee_email: menteeEmail,
      message
    };

    // Deduct token and create token cycle
    const nowIso = new Date().toISOString();
    menteeDoc.tokens = currentTokens - 1;
    menteeDoc.token_cycle = buildFreshTokenCycle(meetingId, date, time, nowIso);

    console.log(`[Meeting Request] Token deducted for mentee ${menteeId}. Before: ${currentTokens}, After: ${menteeDoc.tokens}, TokenUsedAt: ${nowIso}`);

    // Add to mentor's scheduling array
    if (!mentor.scheduling) {
      mentor.scheduling = [];
    }
    mentor.scheduling.push(newMeeting);

    // Update both documents
    await menteeContainer.item(menteeId, menteeId).replace(menteeDoc);
    await mentorContainer.item(mentor.id, mentor.mentorUID).replace(mentor);

    // Add mentor to mentee's requested_mentors array
    try {
      const requestedMentors = menteeDoc.requested_mentors || [];
      if (!requestedMentors.includes(mentorId)) {
        const patchOperations = [
          {
            op: (requestedMentors.length > 0 ? 'set' : 'add') as 'set' | 'add',
            path: '/requested_mentors',
            value: [...requestedMentors, mentorId],
          },
        ];
        await menteeContainer.item(menteeId, menteeId).patch(patchOperations);
      }
    } catch (menteeError) {
      console.error('Failed to update mentee requested mentors:', menteeError);
      // Don't fail the request if this fails
    }

    return NextResponse.json({ 
      message: "Meeting request created successfully",
      meeting: newMeeting,
      tokensRemaining: menteeDoc.tokens
    });
  } catch (error) {
    console.error('Failed to create meeting request', error);
    return NextResponse.json({ message: "Failed to create meeting request", error: (error as Error).message }, { status: 500 });
  }
}
