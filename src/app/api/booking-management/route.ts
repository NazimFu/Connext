import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import type { BookedSlot } from '@/lib/types';

const MY_TIMEZONE = 'Asia/Kuala_Lumpur';

// Get booked slots for a specific mentor and date
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mentorId = searchParams.get('mentorId');
  const date = searchParams.get('date');

  if (!mentorId || !date) {
    return NextResponse.json({ message: 'MentorId and date are required' }, { status: 400 });
  }

  try {
    const container = database.container('mentor');
    
    // Get mentor's current scheduling to find booked slots
    const { resource: mentor } = await container.item(mentorId, mentorId).read();
    if (!mentor) {
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    const currentTime = new Date();
    
    // Get booked slots from mentor's scheduling for the specific date
    const bookedSlots: string[] = [];
    
    if (mentor.scheduling && Array.isArray(mentor.scheduling)) {
      mentor.scheduling.forEach((meeting: any) => {
        if (meeting.date === date && 
            (meeting.decision === 'pending' || meeting.decision === 'accepted')) {
          
          // Check if slot has expired (2 hours after scheduled time in Malaysia timezone)
          const scheduledDateTime = new Date(`${meeting.date}T${meeting.time}:00`);
          const expirationTime = new Date(scheduledDateTime.getTime() + (2 * 60 * 60 * 1000)); // +2 hours
          
          // If not expired, consider it booked
          if (currentTime < expirationTime) {
            bookedSlots.push(meeting.time);
          }
        }
      });
    }

    return NextResponse.json({ bookedSlots });
    
  } catch (error) {
    console.error('Failed to fetch booked slots:', error);
    return NextResponse.json({ 
      message: 'Failed to fetch booked slots', 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

// Cleanup expired slots (called by background process)
export async function DELETE() {
  try {
    const mentorContainer = database.container('mentor');
    const currentTime = new Date();
    
    // Query all mentors
    const { resources: mentors } = await mentorContainer.items.readAll().fetchAll();
    
    let cleanedCount = 0;
    
    for (const mentor of mentors) {
      if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) continue;
      
      let hasExpiredMeetings = false;
      const updatedScheduling = mentor.scheduling.filter((meeting: any) => {
        if (meeting.decision === 'pending') {
          const scheduledDateTime = new Date(`${meeting.date}T${meeting.time}:00`);
          const expirationTime = new Date(scheduledDateTime.getTime() + (2 * 60 * 60 * 1000));
          
          if (currentTime >= expirationTime) {
            hasExpiredMeetings = true;
            cleanedCount++;
            return false; // Remove expired pending meetings
          }
        }
        return true; // Keep all other meetings
      });
      
      // Update mentor if there were expired meetings
      if (hasExpiredMeetings) {
        if (typeof mentor.id === 'string') {
          await mentorContainer.item(mentor.id, mentor.id).replace({
            ...mentor,
            scheduling: updatedScheduling
          });
        } else {
          console.warn('Mentor id is undefined or not a string, skipping update for this mentor:', mentor);
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Cleaned ${cleanedCount} expired slots` 
    });
    
  } catch (error) {
    console.error('Failed to cleanup expired slots:', error);
    return NextResponse.json({ 
      message: 'Failed to cleanup expired slots', 
      error: (error as Error).message 
    }, { status: 500 });
  }
}