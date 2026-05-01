import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check mentee container first
    const menteeContainer = database.container('mentee');
    let user;
    let containerName = 'mentee';

    try {
      const response = await menteeContainer.item(userId, userId).read();
      user = response.resource;
    } catch {
      // Not in mentee, try mentor
      const mentorContainer = database.container('mentor');
      try {
        const response = await mentorContainer.item(userId, userId).read();
        user = response.resource;
        containerName = 'mentor';
      } catch {
        return NextResponse.json(
          {
            error: 'User not found',
            tokenCycle: null,
          },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      {
        tokenCycle: user?.token_cycle || null,
        tokens: user?.tokens || 0,
        timezone: user?.timezone || 'UTC',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching token cycle:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch token cycle',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
