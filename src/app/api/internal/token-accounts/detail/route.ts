import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { getTokenReplenishState, getCooldownProgressPercent, hasMeetingOccurred, type TokenCycle } from '@/lib/token-cycle';

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_API_SECRET}`;
}

type MeetingDetail = {
  meetingId: string;
  role: 'mentor' | 'mentee';
  counterpartName: string;
  date: string;
  time: string;
  message: string;
  feedbackSubmitted: boolean;
  status: 'upcoming' | 'completed' | 'cancelled' | 'rejected';
};

export async function GET(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const role = req.nextUrl.searchParams.get('role');
    const id = req.nextUrl.searchParams.get('id');
    if (role !== 'mentor' && role !== 'mentee') {
      return NextResponse.json({ message: "role must be 'mentor' or 'mentee'" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ message: 'id is required' }, { status: 400 });
    }

    const container = database.container(role);
    let doc: any;
    try {
      const { resource } = await container.item(id, id).read();
      doc = resource;
    } catch {
      doc = null;
    }

    if (!doc) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    const now = new Date();
    const ownId = doc.id;
    const ownMentorUID = doc.mentorUID;
    const schedule: any[] = Array.isArray(doc.scheduling) ? doc.scheduling : [];

    const meetings: MeetingDetail[] = schedule
      // Only entries that were actually decided on — pending requests aren't "meetings" yet.
      .filter((s: any) => s.decision === 'accepted' || s.decision === 'rejected')
      .map((s: any) => {
        const isMentorHere = s.mentorUID === ownId || (!!ownMentorUID && s.mentorUID === ownMentorUID);

        let status: MeetingDetail['status'];
        if (s.scheduled_status === 'cancelled') status = 'cancelled';
        else if (s.decision === 'rejected') status = 'rejected';
        else if (hasMeetingOccurred(s.date, s.time, now)) status = 'completed';
        else status = 'upcoming';

        return {
          meetingId: s.meetingId,
          role: isMentorHere ? 'mentor' : 'mentee',
          counterpartName: isMentorHere ? (s.mentee_name || 'Unknown mentee') : (s.mentor_name || 'Unknown mentor'),
          date: s.date,
          time: s.time,
          message: s.message || '',
          feedbackSubmitted: !!s.feedbackFormVerified,
          status,
        } as MeetingDetail;
      })
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    const tokenCycle: TokenCycle | null = doc.token_cycle || null;

    return NextResponse.json({
      account: {
        id: doc.id,
        name: role === 'mentor' ? doc.mentor_name : doc.mentee_name,
        email: role === 'mentor' ? doc.mentor_email : doc.mentee_email,
        createdAt: doc.createdAt ?? null,
        tokens: doc.tokens ?? 0,
        tokenCycle: tokenCycle
          ? {
              status: tokenCycle.status,
              replenishState: getTokenReplenishState(tokenCycle, 'Asia/Kuala_Lumpur', now),
              progressPercent: getCooldownProgressPercent(tokenCycle, now),
            }
          : null,
      },
      meetings,
    });
  } catch (error) {
    console.error('Failed to fetch token account detail:', error);
    return NextResponse.json(
      { message: 'Failed to fetch token account detail', error: (error as Error).message },
      { status: 500 }
    );
  }
}
