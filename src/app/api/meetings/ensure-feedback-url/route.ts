// src/app/api/meetings/ensure-feedback-url/route.ts
//
// Called when a user clicks "Fill Feedback Form" and feedbackFormUrl is absent.
// Generates a signed URL (same logic as send-feedback cron), persists it to
// the requester's own document (source of truth), then best-effort mirrors it
// to the mentor's document if that mentor account still exists. Looking the
// meeting up via the REQUESTER's own scheduling array — rather than scanning
// every mentor's document — means this keeps working even after the mentor
// has deleted their account.

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

    // ── 1. Find the meeting on the REQUESTER's own document ─────────────────
    // This always exists regardless of whether the mentor's account still does.
    let requesterDoc: any = null;
    let requesterContainer: any = null;
    let requesterScheduleIdx = -1;

    try {
      const { resource: menteeDoc } = await menteeContainer.item(userId, userId).read();
      if (menteeDoc && Array.isArray(menteeDoc.scheduling)) {
        const idx = menteeDoc.scheduling.findIndex((s: any) => s.meetingId === meetingId);
        if (idx !== -1) {
          requesterDoc = menteeDoc;
          requesterContainer = menteeContainer;
          requesterScheduleIdx = idx;
        }
      }
    } catch (err: any) {
      if (err.code !== 404) throw err;
    }

    if (!requesterDoc) {
      // Fall back: mentor acting as mentee.
      try {
        const { resource: mentorAsRequester } = await mentorContainer.item(userId, userId).read();
        if (mentorAsRequester && Array.isArray(mentorAsRequester.scheduling)) {
          const idx = mentorAsRequester.scheduling.findIndex((s: any) => s.meetingId === meetingId);
          if (idx !== -1) {
            requesterDoc = mentorAsRequester;
            requesterContainer = mentorContainer;
            requesterScheduleIdx = idx;
          }
        }
      } catch (err: any) {
        if (err.code !== 404) throw err;
      }
    }

    if (!requesterDoc || requesterScheduleIdx === -1) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const requesterMeeting = requesterDoc.scheduling[requesterScheduleIdx];

    // Guard: meeting must be accepted and not cancelled
    if (requesterMeeting.decision !== 'accepted') {
      return NextResponse.json(
        { error: 'Meeting is not accepted' },
        { status: 409 }
      );
    }
    const ns = String(requesterMeeting.scheduled_status || '').toLowerCase();
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
      requesterMeeting.date,
      requesterMeeting.time,
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
    if (requesterMeeting.feedbackFormUrl && requesterMeeting.feedbackToken) {
      return NextResponse.json({
        success: true,
        feedbackFormUrl: requesterMeeting.feedbackFormUrl,
        cached: true,
      });
    }

    // ── 3. Generate a new signed link ────────────────────────────────────────
    const mentorUid = requesterMeeting.mentorUID;
    if (!mentorUid) {
      return NextResponse.json(
        { error: 'This meeting is missing its mentor reference and cannot generate a feedback link.' },
        { status: 500 }
      );
    }

    let signedLink: { feedbackToken: string; formUrl: string };
    try {
      signedLink = await buildSignedLink({
        meetingId,
        mentorUid,
        menteeName: requesterMeeting.mentee_name || requesterDoc.mentee_name || requesterDoc.name || requesterDoc.mentor_name || 'Mentee',
        mentorName: requesterMeeting.mentor_name || 'Mentor',
        sessionDate: requesterMeeting.date,
        sessionTime: requesterMeeting.time,
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

    // ── 4. Persist to the requester's own document (source of truth) ────────
    requesterDoc.scheduling[requesterScheduleIdx].feedbackToken = feedbackToken;
    requesterDoc.scheduling[requesterScheduleIdx].feedbackFormUrl = formUrl;
    requesterDoc.scheduling[requesterScheduleIdx].feedbackFormDelivered = true;
    requesterDoc.scheduling[requesterScheduleIdx].feedbackFormDeliveredAt = deliveredAt;

    await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);
    console.log(`[ensure-feedback-url] Saved feedbackFormUrl to requester doc for meeting ${meetingId}`);

    // ── 5. Best-effort mirror to the mentor's document, if it still exists ──
    (async () => {
      try {
        const { resources: mentorMatches } = await mentorContainer.items
          .query({
            query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
            parameters: [{ name: '@id', value: mentorUid }],
          })
          .fetchAll();

        const mentorDoc = mentorMatches[0];
        if (!mentorDoc || !Array.isArray(mentorDoc.scheduling)) {
          console.log(`[ensure-feedback-url] Mentor ${mentorUid} no longer exists — skipping mentor-side persist.`);
          return;
        }

        const idx = mentorDoc.scheduling.findIndex((s: any) => s.meetingId === meetingId);
        if (idx === -1) return;

        mentorDoc.scheduling[idx].feedbackToken = feedbackToken;
        mentorDoc.scheduling[idx].feedbackFormUrl = formUrl;
        mentorDoc.scheduling[idx].feedbackFormDelivered = true;
        mentorDoc.scheduling[idx].feedbackFormDeliveredAt = deliveredAt;
        await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
        console.log(`[ensure-feedback-url] Saved feedbackFormUrl to mentor doc for meeting ${meetingId}`);
      } catch (err) {
        console.error('[ensure-feedback-url] Failed to persist to mentor doc (non-fatal):', err);
      }
    })().catch(() => {});

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
