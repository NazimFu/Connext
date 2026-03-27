import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { evaluateTokenCycleForUser } from '@/lib/token-cycle';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    let evaluatedCount = 0;
    let replenishedCount = 0;
    let forfeitedCount = 0;

    const processContainer = async (container: any) => {
      const { resources: users } = await container.items
        .query({
          query:
            "SELECT * FROM c WHERE IS_DEFINED(c.token_cycle) AND c.token_cycle.status = 'pending'",
        })
        .fetchAll();

      for (const user of users) {
        const result = evaluateTokenCycleForUser(user);
        if (!result.changed) {
          continue;
        }

        await container.item(user.id, user.id).replace(user);
        evaluatedCount += 1;

        if (result.replenished) {
          replenishedCount += 1;
        } else {
          forfeitedCount += 1;
        }
      }
    };

    await processContainer(menteeContainer);
    await processContainer(mentorContainer);

    return NextResponse.json({
      success: true,
      evaluatedCount,
      replenishedCount,
      forfeitedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error evaluating token cycles:', error);
    return NextResponse.json(
      {
        error: 'Failed to evaluate token cycles',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
