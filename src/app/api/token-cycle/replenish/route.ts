import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { replenishTokenIfEligible } from '@/lib/token-cycle';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // First check mentee container
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
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    if (!user?.token_cycle || user.token_cycle.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'No pending token cycle',
          currentStatus: user?.token_cycle?.status || 'none',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const result = replenishTokenIfEligible(user, now);

    if (result.replenished) {
      // Update in database
      const container = database.container(containerName);
      await container.item(user.id, user.id).replace(user);

      // Send notification email (optional)
      try {
        const { sendEmail } = await import('@/lib/email');
        const recipientEmail = user.mentee_email || user.mentor_email || user.email;
        const recipientName = user.mentee_name || user.mentor_name || user.name || 'there';

        if (recipientEmail) {
          await sendEmail({
            to: recipientEmail,
            subject: 'Your token has been replenished!',
            template: 'token-replenished',
            data: {
              userName: recipientName,
              date: user.token_cycle?.meetingDate,
              time: user.token_cycle?.meetingTime,
            },
          });
        }
      } catch (emailError) {
        console.error('Failed to send token-replenished email:', emailError);
        // Don't fail the request if email fails
      }

      return NextResponse.json({
        success: true,
        message: 'Token replenished',
        tokensAfter: result.tokensAfter,
        tokensCycle: user.token_cycle,
      });
    } else {
      // Return detailed reason why replenishment failed
      return NextResponse.json(
        {
          success: false,
          error: result.reason || 'Unable to replenish token',
          currentCycle: user.token_cycle,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error replenishing token:', error);
    return NextResponse.json(
      {
        error: 'Failed to replenish token',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
