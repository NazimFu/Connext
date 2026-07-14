import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { deleteFirebaseAuthUser } from '@/lib/server/firebase-admin';
import { locateMeeting } from '@/lib/server/meeting-utils';
import { sendEmail } from '@/lib/email';
import { getMeetingDateTime } from '@/lib/token-cycle';
import type { Scheduling } from '@/lib/types';

const MY_TIMEZONE = 'Asia/Kuala_Lumpur';
const MEETING_PAST_WINDOW_HOURS = 2;

// `scheduled_status` never actually flips to 'past' in storage — the app computes
// "past" on the client by comparing date/time against now (see useMeetingTime).
// Replicate that here so an old accepted meeting isn't mistaken for "still upcoming".
function hasMeetingOccurred(s: Scheduling): boolean {
  const meetingDateTime = getMeetingDateTime(s.date, s.time, MY_TIMEZONE);
  if (!meetingDateTime) return false;
  return Date.now() >= meetingDateTime.getTime() + MEETING_PAST_WINDOW_HOURS * 60 * 60 * 1000;
}

function isUpcomingMeeting(s: Scheduling): boolean {
  return s.decision === 'accepted' && s.scheduled_status === 'upcoming' && !hasMeetingOccurred(s);
}

function isPendingRequest(s: Scheduling): boolean {
  return s.decision === 'pending';
}

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ message: 'Mentee ID is required' }, { status: 400 });
    }

    const menteeContainer = database.container('mentee');
    const mentorContainer = database.container('mentor');

    let mentee: any;
    try {
      const { resource } = await menteeContainer.item(id, id).read();
      mentee = resource;
    } catch (readError) {
      console.error('Error reading mentee for deletion:', readError);
      return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });
    }

    if (!mentee) {
      return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });
    }

    // Block deletion only if a PAST meeting is still awaiting feedback.
    // An unresolved cycle tied to an upcoming/pending meeting doesn't block —
    // that meeting gets cancelled/withdrawn below and the cycle goes with the account.
    const tokenCycle = mentee.token_cycle;
    if (tokenCycle?.status === 'pending') {
      const cycleMeeting: Scheduling | undefined = (mentee.scheduling || []).find(
        (s: Scheduling) => s.meetingId === tokenCycle.meetingId
      );
      const cycleMeetingIsActive = cycleMeeting ? (isUpcomingMeeting(cycleMeeting) || isPendingRequest(cycleMeeting)) : false;
      if (!cycleMeetingIsActive && !tokenCycle.feedbackValid) {
        return NextResponse.json(
          {
            message:
              'You have an unfilled feedback form for a past meeting. Please submit it before deleting your account.',
          },
          { status: 409 }
        );
      }
    }

    const scheduling: Scheduling[] = mentee.scheduling || [];

    // Upcoming (accepted) meetings: cancel and notify the mentor by email.
    for (const meetingEntry of scheduling.filter(isUpcomingMeeting)) {
      try {
        const lookup = await locateMeeting(meetingEntry.meetingId);
        if (!lookup || !lookup.mentor || lookup.mentorScheduleIndex < 0) continue;

        const mentorDoc: any = lookup.mentor;
        mentorDoc.scheduling[lookup.mentorScheduleIndex].scheduled_status = 'cancelled';
        mentorDoc.scheduling[lookup.mentorScheduleIndex].cancel_info = {
          cancelledBy: id,
          role: 'mentee',
          reason: 'The mentee has deleted their account.',
          cancelledAt: new Date().toISOString(),
          tokenStatus: 'not-applicable',
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
        };

        await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);

        if (mentorDoc.mentor_email) {
          await sendEmail({
            to: mentorDoc.mentor_email,
            subject: `Meeting Cancelled - ${meetingEntry.date} at ${meetingEntry.time}`,
            template: 'meeting-cancelled-by-mentee',
            data: {
              recipientName: mentorDoc.mentor_name,
              mentorName: meetingEntry.mentor_name || mentorDoc.mentor_name,
              menteeName: meetingEntry.mentee_name || mentee.mentee_name,
              date: meetingEntry.date,
              time: meetingEntry.time,
              timezone: mentorDoc.timezone || meetingEntry.mentor_timezone || MY_TIMEZONE,
              reason: 'The mentee has deleted their account.',
              isForMentor: true,
            },
          });
        }
      } catch (cancelError) {
        console.error(
          `Failed to cancel meeting ${meetingEntry.meetingId} during mentee account deletion:`,
          cancelError
        );
        // Best-effort — don't let one failed cancellation/email block account deletion.
      }
    }

    // Pending requests the mentee sent: withdraw them silently, no email.
    for (const meetingEntry of scheduling.filter(isPendingRequest)) {
      try {
        const lookup = await locateMeeting(meetingEntry.meetingId);
        if (!lookup || !lookup.mentor || lookup.mentorScheduleIndex < 0) continue;

        const mentorDoc: any = lookup.mentor;
        mentorDoc.scheduling[lookup.mentorScheduleIndex].decision = 'declined';
        mentorDoc.scheduling[lookup.mentorScheduleIndex].scheduled_status = 'rejected';
        mentorDoc.scheduling[lookup.mentorScheduleIndex].updated_at = new Date().toISOString();

        await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
      } catch (withdrawError) {
        console.error(
          `Failed to withdraw pending request ${meetingEntry.meetingId} during mentee account deletion:`,
          withdrawError
        );
      }
    }

    try {
      await deleteFirebaseAuthUser(id);
    } catch (firebaseError: any) {
      console.error('Failed to delete Firebase Auth user for mentee:', firebaseError);
      return NextResponse.json(
        {
          message: firebaseError?.message || 'Failed to delete Firebase account',
          error: process.env.NODE_ENV === 'development' ? String(firebaseError) : undefined,
        },
        { status: 400 }
      );
    }

    await menteeContainer.item(id, id).delete();

    console.log('Mentee account deleted:', id);

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Failed to delete mentee account:', error);
    return NextResponse.json(
      { message: 'Failed to delete account', error: (error as Error).message },
      { status: 500 }
    );
  }
}
