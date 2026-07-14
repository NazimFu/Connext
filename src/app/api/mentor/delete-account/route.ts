import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { deleteFirebaseAuthUser } from '@/lib/server/firebase-admin';
import { locateMeeting } from '@/lib/server/meeting-utils';
import { sendEmail } from '@/lib/email';
import { clampToken, getMeetingDateTime } from '@/lib/token-cycle';
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
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
      parameters: [{ name: '@id', value: id }],
    };
    const { resources } = await mentorContainer.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    const mentor = resources[0];
    const partitionKeyValue = mentor.mentorUID || mentor.id;
    const ownMentorIds = new Set([mentor.id, mentor.mentorUID].filter(Boolean));

    // Block deletion only if a PAST meeting is still awaiting feedback.
    // (Mentors can carry a token_cycle when acting as a requester in another
    // mentor's meeting.) A cycle tied to an upcoming/pending meeting doesn't
    // block — that meeting gets cancelled/withdrawn below and the cycle goes with it.
    const tokenCycle = mentor.token_cycle;
    if (tokenCycle?.status === 'pending') {
      const cycleMeeting: Scheduling | undefined = (mentor.scheduling || []).find(
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

    const scheduling: Scheduling[] = mentor.scheduling || [];
    const interruptions = scheduling.filter((s) => isUpcomingMeeting(s) || isPendingRequest(s));

    for (const meetingEntry of interruptions) {
      try {
        const lookup = await locateMeeting(meetingEntry.meetingId);
        if (!lookup || !lookup.mentor) continue;

        // Is THIS mentor the target (received the request) or the requester
        // (acting as mentee on another mentor's meeting)?
        const isTarget = ownMentorIds.has(lookup.mentor.id) || ownMentorIds.has((lookup.mentor as any).mentorUID);

        if (isTarget) {
          // ── This mentor received the request; the other side is the requester. ──
          if (!lookup.mentee || lookup.menteeScheduleIndex < 0) continue;

          const requesterDoc: any = lookup.mentee;
          const requesterContainer = lookup.menteeIsInMentorContainer ? mentorContainer : menteeContainer;
          const requesterEmail = lookup.menteeIsInMentorContainer ? requesterDoc.mentor_email : requesterDoc.mentee_email;
          const requesterName = lookup.menteeIsInMentorContainer ? requesterDoc.mentor_name : requesterDoc.mentee_name;

          const refundRequesterToken = () => {
            if (requesterDoc.token_cycle?.meetingId === meetingEntry.meetingId && requesterDoc.token_cycle.status === 'pending') {
              requesterDoc.tokens = 1;
              requesterDoc.token_cycle = undefined;
            } else {
              requesterDoc.tokens = clampToken(requesterDoc.tokens);
            }
          };

          if (isPendingRequest(meetingEntry)) {
            // Pending request FROM the requester → reject it + refund + notify.
            requesterDoc.scheduling[lookup.menteeScheduleIndex].decision = 'declined';
            requesterDoc.scheduling[lookup.menteeScheduleIndex].scheduled_status = 'rejected';
            requesterDoc.scheduling[lookup.menteeScheduleIndex].updated_at = new Date().toISOString();
            refundRequesterToken();
            await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);

            if (requesterEmail) {
              await sendEmail({
                to: requesterEmail,
                subject: 'Meeting Request Update - CONNEXT',
                template: 'mentee-meeting-declined',
                data: {
                  menteeName: requesterName,
                  mentorName: meetingEntry.mentor_name || mentor.mentor_name,
                  date: meetingEntry.date,
                  time: meetingEntry.time,
                  timezone: meetingEntry.mentee_timezone || requesterDoc.timezone || MY_TIMEZONE,
                },
              });
            }
          } else {
            // Accepted, upcoming meeting → cancel + refund + notify.
            requesterDoc.scheduling[lookup.menteeScheduleIndex].scheduled_status = 'cancelled';
            requesterDoc.scheduling[lookup.menteeScheduleIndex].cancel_info = {
              cancelledBy: id,
              role: 'mentor',
              reason: 'The mentor has deleted their account.',
              cancelledAt: new Date().toISOString(),
              tokenStatus: 'auto-replenished',
              reviewedBy: null,
              reviewedAt: null,
              reviewNotes: null,
            };
            refundRequesterToken();
            await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);

            if (requesterEmail) {
              await sendEmail({
                to: requesterEmail,
                subject: `Meeting Cancelled - ${meetingEntry.date} at ${meetingEntry.time}`,
                template: 'meeting-cancelled-by-mentor',
                data: {
                  recipientName: requesterName,
                  mentorName: meetingEntry.mentor_name || mentor.mentor_name,
                  menteeName: meetingEntry.mentee_name || requesterName,
                  date: meetingEntry.date,
                  time: meetingEntry.time,
                  timezone: meetingEntry.mentee_timezone || requesterDoc.timezone || MY_TIMEZONE,
                  reason: 'The mentor has deleted their account.',
                  isForMentee: true,
                  tokenAutoRefunded: true,
                },
              });
            }
          }
        } else {
          // ── This mentor is the requester (acting as mentee) on someone else's meeting. ──
          if (lookup.mentorScheduleIndex < 0) continue;

          const targetMentorDoc: any = lookup.mentor;

          if (isPendingRequest(meetingEntry)) {
            // Pending request this mentor sent → withdraw it silently, no email.
            targetMentorDoc.scheduling[lookup.mentorScheduleIndex].decision = 'declined';
            targetMentorDoc.scheduling[lookup.mentorScheduleIndex].scheduled_status = 'rejected';
            targetMentorDoc.scheduling[lookup.mentorScheduleIndex].updated_at = new Date().toISOString();
            await mentorContainer.item(targetMentorDoc.id, targetMentorDoc.id).replace(targetMentorDoc);
          } else {
            // Accepted, upcoming meeting this mentor booked → cancel + notify the target mentor.
            targetMentorDoc.scheduling[lookup.mentorScheduleIndex].scheduled_status = 'cancelled';
            targetMentorDoc.scheduling[lookup.mentorScheduleIndex].cancel_info = {
              cancelledBy: id,
              role: 'mentor',
              reason: 'The requester has deleted their account.',
              cancelledAt: new Date().toISOString(),
              tokenStatus: 'not-applicable',
              reviewedBy: null,
              reviewedAt: null,
              reviewNotes: null,
            };
            await mentorContainer.item(targetMentorDoc.id, targetMentorDoc.id).replace(targetMentorDoc);

            if (targetMentorDoc.mentor_email) {
              await sendEmail({
                to: targetMentorDoc.mentor_email,
                subject: `Meeting Cancelled - ${meetingEntry.date} at ${meetingEntry.time}`,
                template: 'meeting-cancelled-by-mentee',
                data: {
                  recipientName: targetMentorDoc.mentor_name,
                  mentorName: meetingEntry.mentor_name || targetMentorDoc.mentor_name,
                  menteeName: meetingEntry.mentee_name || mentor.mentor_name,
                  date: meetingEntry.date,
                  time: meetingEntry.time,
                  timezone: targetMentorDoc.timezone || meetingEntry.mentor_timezone || MY_TIMEZONE,
                  reason: 'The requester has deleted their account.',
                  isForMentor: true,
                },
              });
            }
          }
        }
      } catch (interruptionError) {
        console.error(
          `Failed to resolve meeting ${meetingEntry.meetingId} during mentor account deletion:`,
          interruptionError
        );
        // Best-effort — don't let one failed cancellation/email block account deletion.
      }
    }

    try {
      await deleteFirebaseAuthUser(partitionKeyValue);
    } catch (firebaseError: any) {
      console.error('Failed to delete Firebase Auth user for mentor:', firebaseError);
      return NextResponse.json(
        {
          message: firebaseError?.message || 'Failed to delete Firebase account',
          error: process.env.NODE_ENV === 'development' ? String(firebaseError) : undefined,
        },
        { status: 400 }
      );
    }

    await mentorContainer.item(mentor.id, partitionKeyValue).delete();

    console.log('Mentor account deleted:', mentor.id);

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Failed to delete mentor account:', error);
    return NextResponse.json(
      { message: 'Failed to delete account', error: (error as Error).message },
      { status: 500 }
    );
  }
}
