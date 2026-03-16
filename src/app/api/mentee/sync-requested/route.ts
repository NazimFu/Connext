import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

// Helper function to find user in mentee or mentor container
async function findUser(userId: string) {
  // Try mentee container first
  const menteeContainer = database.container('mentee');
  const menteeQuerySpec = {
    query: "SELECT * FROM c WHERE c.id = @userId OR c.mentee_uid = @userId",
    parameters: [{ name: "@userId", value: userId }]
  };

  const { resources: mentees } = await menteeContainer.items.query(menteeQuerySpec).fetchAll();
  
  if (mentees.length > 0) {
    return { user: mentees[0], container: menteeContainer, isMentor: false };
  }

  // Try mentor container if user is a mentor acting as mentee
  const mentorContainer = database.container('mentor');
  const mentorQuerySpec = {
    query: "SELECT * FROM c WHERE c.id = @userId OR c.mentorUID = @userId",
    parameters: [{ name: "@userId", value: userId }]
  };

  const { resources: mentors } = await mentorContainer.items.query(mentorQuerySpec).fetchAll();
  
  if (mentors.length > 0) {
    return { user: mentors[0], container: mentorContainer, isMentor: true };
  }

  return null;
}

// Sync requested_mentors from scheduling history
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const result = await findUser(userId);

    if (!result) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { user, container } = result;

    // Extract unique mentor UIDs from scheduling history
    const requestedMentorUIDs = new Set<string>();
    const requestedMentorEmails = new Set<string>();
    
    if (user.scheduling && Array.isArray(user.scheduling)) {
      user.scheduling.forEach((schedule: any) => {
        if (schedule.mentorUID) {
          requestedMentorUIDs.add(schedule.mentorUID);
        }
        if (schedule.mentor_email) {
          requestedMentorEmails.add(schedule.mentor_email);
        }
      });
    }

    // If we have emails but no UIDs, fetch mentors by email to get their UIDs
    if (requestedMentorEmails.size > 0 && requestedMentorUIDs.size === 0) {
      try {
        const mentorContainer = database.container('mentor');
        const emailArray = Array.from(requestedMentorEmails);
        
        for (const email of emailArray) {
          const querySpec = {
            query: "SELECT c.mentorUID FROM c WHERE c.mentor_email = @email",
            parameters: [{ name: "@email", value: email }]
          };
          
          const { resources } = await mentorContainer.items.query(querySpec).fetchAll();
          if (resources.length > 0 && resources[0].mentorUID) {
            requestedMentorUIDs.add(resources[0].mentorUID);
          }
        }
      } catch (error) {
        console.error('Error fetching mentor UIDs:', error);
      }
    }

    const requestedMentorsArray = Array.from(requestedMentorUIDs);

    // Update document with synced data
    const patchOperations = [
      {
        op: (user.requested_mentors && user.requested_mentors.length > 0 ? 'replace' : 'add') as 'replace' | 'add',
        path: '/requested_mentors',
        value: requestedMentorsArray,
      },
    ];

    await container
      .item(user.id, user.id)
      .patch(patchOperations);

    return NextResponse.json({
      success: true,
      requested_mentors: requestedMentorsArray,
      count: requestedMentorsArray.length,
    });
  } catch (error) {
    console.error('Error syncing requested mentors:', error);
    return NextResponse.json({ error: 'Failed to sync requested mentors' }, { status: 500 });
  }
}
