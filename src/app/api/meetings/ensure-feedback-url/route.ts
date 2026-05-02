// src/app/api/meetings/ensure-feedback-url/route.ts
//
// Called when a user clicks "Fill Feedback Form" and feedbackFormUrl is absent.
// Generates a signed URL (same logic as send-feedback cron), persists it to
// both mentor and mentee/requester documents, then returns it to the client.

import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { convertMeetingTime } from '@/lib/timezone';

// Inline the signed-link builder so this route has no import dependency on the
// server-only feedback-form module (which may require env vars only available
// server-side and is already imported below via dynamic require if needed).
async function buildSignedLink(params: {
  meetingId: string;
  mentorUid: string;
  menteeName: string;
  mentorName: string;
  sessionDate: string;
  sessionTime: string;
  now: Date;
}): Promise<{ feedbackToken: string; formUrl: string }> {
  const { createSignedFeedbackFormLink } = await import('@/lib/server/feedback-form');
  return createSignedFeedbackFormLink(params, params.now);
}

export async function POST(request: NextRequest) {
  try {
    const { meetingId, userId } = await request.json();

    if (!meetingId || !userId) {
      return NextResponse.json(
        { error: 'meetingId and userId are required' },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    // ── 1. Find the meeting in the mentor container ──────────────────────────
    const { resources: allMentors } = await mentorContainer.items
      .query({ query: 'SELECT * FROM c' })
      .fetchAll();

    let mentorDoc: any = null;
    let mentorMeetingIdx = -1;

    for (const m of allMentors) {
      if (!Array.isArray(m.scheduling)) continue;
      const idx = m.scheduling.findIndex((s: any) => s.meetingId === meetingId);
      if (idx !== -1) {
        mentorDoc = m;
        mentorMeetingIdx = idx;
        break;
      }
    }

    if (!mentorDoc || mentorMeetingIdx === -1) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const mentorMeeting = mentorDoc.scheduling[mentorMeetingIdx];

    // Guard: meeting must be accepted and not cancelled
    if (mentorMeeting.decision !== 'accepted') {
      return NextResponse.json(
        { error: 'Meeting is not accepted' },
        { status: 409 }
      );
    }
    const ns = String(mentorMeeting.scheduled_status || '').toLowerCase();
    if (ns === 'cancelled' || ns === 'canceled') {
      return NextResponse.json(
        { error: 'Meeting is cancelled' },
        { status: 409 }
      );
    }

    // Guard: must be at least 2 hours after meeting start.
    // IMPORTANT: Meeting times are stored in Malaysia time (Asia/Kuala_Lumpur).
    // Use convertMeetingTime to correctly interpret them as Malaysia wall-clock
    // time rather than browser/server local time.
    const { utcDate: meetingUtcDate } = convertMeetingTime(
      mentorMeeting.date,
      mentorMeeting.time,
      'Asia/Kuala_Lumpur'
    );

    const now = new Date();
    const earliestAt = new Date(meetingUtcDate.getTime() + 2 * 60 * 60 * 1000);

    if (now < earliestAt) {
      const minutesLeft = Math.ceil((earliestAt.getTime() - now.getTime()) / 60000);
      return NextResponse.json(
        {
          error: `Feedback form available in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
          availableAt: earliestAt.toISOString(),
        },
        { status: 400 }
      );
    }

    // ── 2. Reuse existing URL if already generated ───────────────────────────
    if (mentorMeeting.feedbackFormUrl && mentorMeeting.feedbackToken) {
      return NextResponse.json({
        success: true,
        feedbackFormUrl: mentorMeeting.feedbackFormUrl,
        cached: true,
      });
    }

    // ── 3. Generate a new signed link ────────────────────────────────────────
    let signedLink: { feedbackToken: string; formUrl: string };
    try {
      signedLink = await buildSignedLink({
        meetingId,
        mentorUid: mentorMeeting.mentorUID,
        menteeName: mentorMeeting.mentee_name || 'Mentee',
        mentorName: mentorMeeting.mentor_name || 'Mentor',
        sessionDate: mentorMeeting.date,
        sessionTime: mentorMeeting.time,
        now,
      });
    } catch (err: any) {
      console.error('[ensure-feedback-url] Failed to generate signed link:', err.message);
      return NextResponse.json(
        { error: 'Failed to generate feedback link. Check server configuration.' },
        { status: 500 }
      );
    }

    const { feedbackToken, formUrl } = signedLink;
    const deliveredAt = now.toISOString();

    // ── 4. Persist to mentor document ────────────────────────────────────────
    mentorDoc.scheduling[mentorMeetingIdx].feedbackToken = feedbackToken;
    mentorDoc.scheduling[mentorMeetingIdx].feedbackFormUrl = formUrl;
    mentorDoc.scheduling[mentorMeetingIdx].feedbackFormDelivered = true;
    mentorDoc.scheduling[mentorMeetingIdx].feedbackFormDeliveredAt = deliveredAt;

    await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
    console.log(`[ensure-feedback-url] Saved feedbackFormUrl to mentor doc for meeting ${meetingId}`);

    // ── 5. Find requester (mentee or mentor-as-mentee) and persist ───────────
    const menteeUid = mentorMeeting.menteeUID;

    const findAndPersistRequester = async () => {
      // Try mentee container first
      try {
        const { resource: menteeDoc } = await menteeContainer
          .item(menteeUid, menteeUid)
          .read();

        if (menteeDoc && Array.isArray(menteeDoc.scheduling)) {
          const idx = menteeDoc.scheduling.findIndex(
            (s: any) => s.meetingId === meetingId
          );
          if (idx !== -1) {
            menteeDoc.scheduling[idx].feedbackToken = feedbackToken;
            menteeDoc.scheduling[idx].feedbackFormUrl = formUrl;
            menteeDoc.scheduling[idx].feedbackFormDelivered = true;
            menteeDoc.scheduling[idx].feedbackFormDeliveredAt = deliveredAt;
            await menteeContainer.item(menteeDoc.id, menteeDoc.id).replace(menteeDoc);
            console.log(`[ensure-feedback-url] Saved feedbackFormUrl to mentee doc for meeting ${meetingId}`);
            return;
          }
        }
      } catch (err: any) {
        if (err.code !== 404) throw err;
      }

      // Fall back: mentor acting as mentee
      for (const m of allMentors) {
        if (m.id === mentorDoc.id || !Array.isArray(m.scheduling)) continue;
        const idx = m.scheduling.findIndex((s: any) => s.meetingId === meetingId);
        if (idx !== -1) {
          m.scheduling[idx].feedbackToken = feedbackToken;
          m.scheduling[idx].feedbackFormUrl = formUrl;
          m.scheduling[idx].feedbackFormDelivered = true;
          m.scheduling[idx].feedbackFormDeliveredAt = deliveredAt;
          await mentorContainer.item(m.id, m.id).replace(m);
          console.log(`[ensure-feedback-url] Saved feedbackFormUrl to mentor-as-mentee doc for meeting ${meetingId}`);
          return;
        }
      }

      console.warn(`[ensure-feedback-url] Could not find requester doc for meeting ${meetingId}`);
    };

    // Persist to requester in background (don't block the response)
    findAndPersistRequester().catch((err) =>
      console.error('[ensure-feedback-url] Failed to persist to requester:', err)
    );

    return NextResponse.json({
      success: true,
      feedbackFormUrl: formUrl,
      cached: false,
    });
  } catch (error: any) {
    console.error('[ensure-feedback-url] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}