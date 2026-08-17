import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/cosmos";
import { verifyMeetingResponseToken } from "@/lib/server/meeting-response-token";
import { applyMeetingDecision } from "@/lib/server/apply-meeting-decision";
import { convertMeetingTime, DEFAULT_TIMEZONE } from "@/lib/timezone";

async function loadMentorAndMeeting(mentorId: string, meetingId: string) {
  const mentorContainer = database.container('mentor');
  const querySpec = {
    query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
    parameters: [{ name: "@mentorId", value: mentorId }]
  };
  const { resources: mentors } = await mentorContainer.items.query(querySpec).fetchAll();
  if (mentors.length === 0) return null;

  const mentor = mentors[0];
  if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) return null;

  const meeting = mentor.scheduling.find((m: any) => m.meetingId === meetingId);
  if (!meeting) return null;

  return { mentor, meeting };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const verified = verifyMeetingResponseToken(token);

    if (!verified.ok) {
      return NextResponse.json({ ok: false, reason: verified.reason }, { status: 400 });
    }

    const { meetingId, mentorId } = verified.payload;
    const found = await loadMentorAndMeeting(mentorId, meetingId);

    if (!found) {
      return NextResponse.json({ ok: false, reason: 'Meeting request not found' }, { status: 404 });
    }

    const { mentor, meeting } = found;

    return NextResponse.json({
      ok: true,
      meeting: {
        meetingId: meeting.meetingId,
        date: meeting.date,
        time: meeting.time,
        message: meeting.message || '',
        decision: meeting.decision,
        menteeName: meeting.mentee_name,
        menteeEmail: meeting.mentee_email,
        mentorName: mentor.mentor_name,
        timezone: mentor.timezone || meeting.mentor_timezone || DEFAULT_TIMEZONE,
      },
    });
  } catch (error) {
    console.error('Failed to load meeting response details:', error);
    return NextResponse.json(
      { ok: false, reason: 'Failed to load meeting request details' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, decision } = body;

    if (decision !== 'accepted' && decision !== 'declined') {
      return NextResponse.json(
        { ok: false, reason: 'decision must be "accepted" or "declined"' },
        { status: 400 }
      );
    }

    const verified = verifyMeetingResponseToken(token);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, reason: verified.reason }, { status: 400 });
    }

    const { meetingId, mentorId } = verified.payload;

    const result = await applyMeetingDecision({ mentorId, meetingId, decision });

    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.message, error: result.error }, { status: result.status });
    }

    let meetLinkCreated = false;

    if (decision === 'accepted') {
      try {
        const meeting = result.meeting;
        const { utcDate } = convertMeetingTime(meeting.date, meeting.time, DEFAULT_TIMEZONE);
        const endDateTime = new Date(utcDate.getTime() + 3600000);

        const createMeetRes = await fetch(new URL('/api/create-meet', req.nextUrl.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `Mentorship Session with ${meeting.mentee_name}`,
            description: `Message: ${meeting.message || 'No message'}`,
            startDateTime: utcDate.toISOString(),
            endDateTime: endDateTime.toISOString(),
            attendees: [meeting.mentee_email, meeting.mentor_email].filter(Boolean),
            mentorId,
            meetingId,
            menteeId: meeting.menteeUID,
          }),
        });

        meetLinkCreated = createMeetRes.ok;
        if (!createMeetRes.ok) {
          console.error('create-meet call failed for token-based accept:', await createMeetRes.text());
        }
      } catch (meetError) {
        console.error('Failed to create Google Meet for token-based accept:', meetError);
      }
    }

    return NextResponse.json({ ok: true, decision, meetLinkCreated });
  } catch (error) {
    console.error('Failed to apply meeting response:', error);
    return NextResponse.json(
      { ok: false, reason: 'Failed to apply meeting response' },
      { status: 500 }
    );
  }
}
