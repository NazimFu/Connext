import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { replenishTokenIfEligible } from '@/lib/token-cycle';
import { sendEmail } from '@/lib/email';

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_API_SECRET}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { userId, role } = await req.json();

    if (!userId || (role !== 'mentor' && role !== 'mentee')) {
      return NextResponse.json({ message: "userId and role ('mentor' or 'mentee') are required" }, { status: 400 });
    }

    const container = database.container(role);
    let user: any;
    try {
      const { resource } = await container.item(userId, userId).read();
      user = resource;
    } catch {
      user = null;
    }

    if (!user) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    if (!user.token_cycle || user.token_cycle.status !== 'pending') {
      return NextResponse.json(
        { message: 'No pending token cycle to override', currentStatus: user.token_cycle?.status || 'none' },
        { status: 400 }
      );
    }

    const now = new Date();
    const result = replenishTokenIfEligible(user, now, { force: true });

    if (!result.replenished) {
      // Only hits the "tokens already at max" safety-check path, since force
      // skips the eligibility gate — still handled for completeness.
      return NextResponse.json({ message: result.reason || 'Unable to replenish token' }, { status: 400 });
    }

    await container.item(user.id, user.id).replace(user);

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
            date: user.token_cycle?.meetingDate,
            time: user.token_cycle?.meetingTime,
          },
        });
      } catch (emailError) {
        console.error('Failed to send token-replenished email:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Token forcibly replenished',
      tokensAfter: result.tokensAfter,
    });
  } catch (error) {
    console.error('Failed to force-replenish token:', error);
    return NextResponse.json(
      { message: 'Failed to force-replenish token', error: (error as Error).message },
      { status: 500 }
    );
  }
}
