import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { evaluateTokenCycleForUser } from '@/lib/token-cycle';
import { sendEmail } from '@/lib/email';

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
        const cycleBefore = user.token_cycle;
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

          // Notify requester when a reported cycle reaches evaluation and is forfeited.
          const wasMentorReported = cycleBefore?.mentorReported === true;
          if (wasMentorReported) {
            const recipientEmail = user.mentee_email || user.mentor_email || user.email;
            const recipientName = user.mentee_name || user.mentor_name || user.name || 'there';

            const meetingId = cycleBefore?.meetingId;
            const meeting = Array.isArray(user.scheduling)
              ? user.scheduling.find((m: any) => m.meetingId === meetingId)
              : null;

            if (recipientEmail) {
              try {
                await sendEmail({
                  to: recipientEmail,
                  subject: 'Meeting report outcome applied',
                  template: 'mentee-reported-cycle-result',
                  data: {
                    menteeName: recipientName,
                    date: cycleBefore?.meetingDate || meeting?.date || null,
                    time: cycleBefore?.meetingTime || meeting?.time || null,
                    mentorName: meeting?.mentor_name || 'Your mentor',
                  },
                });
              } catch (emailError) {
                console.error('Failed to send reported-cycle email:', emailError);
              }
            }
          }
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
