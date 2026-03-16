import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function POST(request: Request) {
  try {
    const { mentorId, menteeId, menteeName, menteeEmail, date, time, message } = await request.json();
    
    if (!mentorId || !menteeId || !menteeName || !date || !time || !message) {
      return NextResponse.json({ message: "All fields are required" }, { status: 400 });
    }

    const mentorContainer = database.container('mentor');
    
    // First, get the mentor document
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @mentorId",
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
    const newMeeting = {
      meetingId: `meet_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    // Add to mentor's scheduling array
    if (!mentor.scheduling) {
      mentor.scheduling = [];
    }
    mentor.scheduling.push(newMeeting);

    // Replace the entire document in Cosmos DB
    await mentorContainer.item(mentor.id, mentor.mentorUID).replace(mentor);

    // Add mentor to mentee's requested_mentors array
    try {
      const menteeContainer = database.container('mentee');
      const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();
      
      if (mentee) {
        const requestedMentors = mentee.requested_mentors || [];
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
      }
    } catch (menteeError) {
      console.error('Failed to update mentee requested mentors:', menteeError);
      // Don't fail the request if this fails
    }

    return NextResponse.json({ 
      message: "Meeting request created successfully",
      meeting: newMeeting
    });
  } catch (error) {
    console.error('Failed to create meeting request', error);
    return NextResponse.json({ message: "Failed to create meeting request", error: (error as Error).message }, { status: 500 });
  }
}
