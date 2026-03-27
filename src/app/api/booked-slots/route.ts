import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const mentorId = searchParams.get('mentorId');
    const date = searchParams.get('date');

    if (!mentorId || !date) {
      return NextResponse.json(
        { message: "mentorId and date are required" },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');
    
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
      return NextResponse.json({ bookedSlots: [] });
    }

    const mentor = mentors[0];
    const bookedSlots: string[] = [];

    // Check scheduling array for active bookings on the specified date
    if (mentor.scheduling && Array.isArray(mentor.scheduling)) {
      mentor.scheduling.forEach((meeting: any) => {
        // Only consider slots booked if:
        // 1. Date matches
        // 2. Meeting is pending, OR accepted+upcoming
        // Rejected/declined/cancelled/past should be reusable
        if (meeting.date === date && 
            (meeting.decision === 'pending' ||
             (meeting.decision === 'accepted' && meeting.scheduled_status === 'upcoming'))) {
          bookedSlots.push(meeting.time);
        }
      });
    }

    return NextResponse.json({ bookedSlots });
  } catch (error) {
    console.error('Failed to fetch booked slots:', error);
    return NextResponse.json(
      { 
        message: "Failed to fetch booked slots", 
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}