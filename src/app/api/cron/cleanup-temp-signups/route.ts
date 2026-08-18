import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { getPartitionKeyField } from '@/lib/server/cosmos-partition-key';

/**
 * Deletes expired temp_signup documents (abandoned signups that never
 * completed email verification) from both the mentor and mentee containers.
 */
async function cleanupExpiredTempSignups(containerName: string) {
  const container = database.container(containerName);
  const partitionKeyField = await getPartitionKeyField(container);

  const { resources: expired } = await container.items
    .query({
      query: `SELECT * FROM c WHERE c.type = 'temp_signup' AND c.expiresAt < @now`,
      parameters: [{ name: '@now', value: Date.now() }],
    })
    .fetchAll();

  let deletedCount = 0;
  const errors: Array<{ id: string; email?: string; error: string }> = [];

  for (const doc of expired) {
    try {
      await container.item(doc.id, doc[partitionKeyField]).delete();
      deletedCount++;
    } catch (err: any) {
      console.error(`[CLEANUP-TEMP-SIGNUPS] Failed to delete ${doc.id} in ${containerName}:`, err.message);
      errors.push({ id: doc.id, email: doc.email, error: err.message?.split('\n')[0] || 'unknown error' });
    }
  }

  return { found: expired.length, deletedCount, errors };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [menteeResult, mentorResult] = await Promise.all([
      cleanupExpiredTempSignups('mentee'),
      cleanupExpiredTempSignups('mentor'),
    ]);

    return NextResponse.json({
      success: true,
      mentee: menteeResult,
      mentor: mentorResult,
      deletedCount: menteeResult.deletedCount + mentorResult.deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error cleaning up expired temp signups:', error);
    return NextResponse.json(
      {
        error: 'Failed to cleanup expired temp signups',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
