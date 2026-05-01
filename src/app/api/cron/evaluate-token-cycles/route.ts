import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { replenishTokenIfEligible } from '@/lib/token-cycle';
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
    let stillPendingCount = 0;

    const now = new Date();
    console.log(`[Token Cycle Evaluation] Starting evaluation at ${now.toISOString()}`);

    const processContainer = async (container: any, containerName: string) => {
      const { resources: users } = await container.items
        .query({
          query:
            "SELECT * FROM c WHERE IS_DEFINED(c.token_cycle) AND c.token_cycle.status = 'pending'",
        })
        .fetchAll();

      console.log(`[Token Cycle Evaluation] Found ${users.length} users with pending token cycles in ${containerName}`);

      for (const user of users) {
        const cycleBefore = user.token_cycle;
        const result = replenishTokenIfEligible(user, now);

        if (result.replenished) {
          // Token was replenished
          await container.item(user.id, user.id).replace(user);
          evaluatedCount += 1;
          replenishedCount += 1;

          console.log(`[Token Cycle Evaluation] Token replenished for ${user.id} in ${containerName}`);

          // Send notification email
          const recipientEmail = user.mentee_email || user.mentor_email || user.email;
          const recipientName = user.mentee_name || user.mentor_name || user.name || 'there';

          if (recipientEmail) {
            try {
              await sendEmail({
                to: recipientEmail,
                subject: 'Your token has been replenished!',
                template: 'token-replenished',
                data: {
                  userName: recipientName,
                  date: cycleBefore?.meetingDate,
                  time: cycleBefore?.meetingTime,
                },
              });
            } catch (emailError) {
              console.error(
                `[Token Cycle Evaluation] Failed to send token-replenished email to ${recipientEmail}:`,
                emailError
              );
            }
          }
        } else {
          // Keep pending until BOTH are satisfied:
          // 1) 1-month cooldown after tokenUsedAt, and 2) valid feedback is submitted.
          // No automatic forfeiture here.
          stillPendingCount += 1;
          console.log(
            `[Token Cycle Evaluation] Token cycle still pending for ${user.id} in ${containerName}. Reason: ${result.reason}`
          );
        }
      }
    };

    await processContainer(menteeContainer, 'mentee');
    await processContainer(mentorContainer, 'mentor');

    console.log(
      `[Token Cycle Evaluation] Evaluation complete. Evaluated: ${evaluatedCount}, Replenished: ${replenishedCount}, Still Pending: ${stillPendingCount}`
    );

    return NextResponse.json({
      success: true,
      evaluatedCount,
      replenishedCount,
      stillPendingCount,
      timestamp: now.toISOString(),
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
