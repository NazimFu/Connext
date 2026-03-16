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

// GET - Get favorite mentors for a mentee
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const result = await findUser(userId);

    if (!result) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { user } = result;

    return NextResponse.json({
      favorite_mentors: user.favorite_mentors || [],
      requested_mentors: user.requested_mentors || []
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

// POST - Toggle favorite mentor
export async function POST(request: NextRequest) {
  try {
    const { userId, mentorUID } = await request.json();

    if (!userId || !mentorUID) {
      return NextResponse.json(
        { error: 'User ID and Mentor UID are required' },
        { status: 400 }
      );
    }

    const result = await findUser(userId);

    if (!result) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { user, container } = result;
    const currentFavorites = user.favorite_mentors || [];
    const isFavorited = currentFavorites.includes(mentorUID);

    // Toggle favorite
    const updatedFavorites = isFavorited
      ? currentFavorites.filter((uid: string) => uid !== mentorUID)
      : [...currentFavorites, mentorUID];

    // Update document with proper partition key
    const patchOperations = [
      {
        op: (currentFavorites.length > 0 ? 'replace' : 'add') as 'replace' | 'add',
        path: '/favorite_mentors',
        value: updatedFavorites,
      },
    ];

    await container
      .item(user.id, user.id)
      .patch(patchOperations);

    return NextResponse.json({
      success: true,
      isFavorited: !isFavorited,
      favorite_mentors: updatedFavorites,
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return NextResponse.json({ error: 'Failed to toggle favorite' }, { status: 500 });
  }
}
