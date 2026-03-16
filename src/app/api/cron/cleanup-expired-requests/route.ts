import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredMeetings } from '@/lib/cleanup-expired-meetings';

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await cleanupExpiredMeetings();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error cleaning up expired requests:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup expired requests',
        message: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

