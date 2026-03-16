import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredMeetings } from '@/lib/cleanup-expired-meetings';

/**
 * Manual cleanup endpoint for testing
 * Can be called without authentication for development purposes
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🧪 Manual cleanup triggered');
    
    const result = await cleanupExpiredMeetings();

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error during manual cleanup:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup expired requests',
        message: (error as Error).message,
        stack: (error as Error).stack
      },
      { status: 500 }
    );
  }
}
