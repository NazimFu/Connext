// src/app/api/reports/route.ts
// CHANGED: When a mentor_report is resolved (approved), set accountFrozen=true on the mentee.
//          When a mentor_report is rejected OR reopened (status→pending), clear accountFrozen.

import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';
import type { Mentor, Mentee, Scheduling } from '@/lib/types';
import { locateMeeting, findScheduleIndex } from '@/lib/server/meeting-utils';
import { sendEmail } from '@/lib/email';
import { clampToken, getMeetingDateTime } from '@/lib/token-cycle';

const MY_TIMEZONE = 'Asia/Kuala_Lumpur';

type ReportStatus = 'pending' | 'resolved' | 'rejected';

type ReportSummary = {
  meetingId: string;
  reportType: 'mentor_report' | 'mentee_report';
  reportStatus: ReportStatus;
  reportReason: string | null;
  reportFiledByRole: 'mentor' | 'mentee';
  reportFiledByUid: string | null;
  reportFiledAt: string | null;
  reportTargetRole: 'mentor' | 'mentee';
  reportTargetUid: string | null;
  mentorUID: string | null;
  mentorName: string | null;
  mentorEmail: string | null;
  menteeUID: string | null;
  menteeName: string | null;
  menteeEmail: string | null;
  decision: Scheduling['decision'];
  scheduledStatus: Scheduling['scheduled_status'];
  reportReviewNotes: string | null;
  reportReviewedAt: string | null;
  reportReviewedBy: string | null;
  banLiftedAt: string | null;
  banLiftedBy: string | null;
};

const mentorContainer = database.container('mentor');
const menteeContainer = database.container('mentee');

const MENTOR_REPORT_QUERY =
  'SELECT DISTINCT VALUE s.meetingId FROM c JOIN s IN c.scheduling WHERE IS_DEFINED(s.mentor_report)';

const MENTEE_REPORT_QUERY =
  'SELECT DISTINCT VALUE s.meetingId FROM c JOIN s IN c.scheduling WHERE IS_DEFINED(s.mentee_report)';

const gatherReportedMeetingIds = async (): Promise<string[]> => {
  const ids = new Set<string>();

  try {
    const { resources: mentorReportIds } = await mentorContainer.items
      .query<string>({ query: MENTOR_REPORT_QUERY })
      .fetchAll();
    mentorReportIds.forEach((id) => { if (id) ids.add(id); });
  } catch (error) {
    console.error('Failed fetching mentor reports', error);
  }

  try {
    const { resources: menteeReportIds } = await menteeContainer.items
      .query<string>({ query: MENTEE_REPORT_QUERY })
      .fetchAll();
    menteeReportIds.forEach((id) => { if (id) ids.add(id); });
  } catch (error) {
    console.error('Failed fetching mentee reports', error);
  }

  return Array.from(ids);
};

export async function GET() {
  try {
    const meetingIds = await gatherReportedMeetingIds();
    const reports: ReportSummary[] = [];

    for (const meetingId of meetingIds) {
      const lookup = await locateMeeting(meetingId);
      if (!lookup?.meeting) continue;

      const { meeting, mentor, mentee } = lookup;

      if (meeting.mentor_report) {
        reports.push({
          meetingId,
          reportType: 'mentor_report',
          reportStatus: meeting.mentor_report.status as ReportStatus,
          reportReason: meeting.mentor_report.reason ?? null,
          reportFiledByRole: 'mentor',
          reportFiledByUid: meeting.mentor_report.filed_by_uid ?? null,
          reportFiledAt: meeting.mentor_report.filed_at ?? null,
          reportTargetRole: 'mentee',
          reportTargetUid: meeting.menteeUID ?? mentee?.menteeUID ?? null,
          mentorUID: meeting.mentorUID ?? mentor?.mentorUID ?? null,
          mentorName: meeting.mentor_name ?? mentor?.mentor_name ?? null,
          mentorEmail: meeting.mentor_email ?? mentor?.mentor_email ?? null,
          menteeUID: mentee?.menteeUID ?? meeting.menteeUID ?? null,
          menteeName: mentee?.mentee_name ?? meeting.mentee_name ?? null,
          menteeEmail: mentee?.mentee_email ?? meeting.mentee_email ?? null,
          decision: meeting.decision,
          scheduledStatus: meeting.scheduled_status,
          reportReviewNotes: meeting.mentor_report.review_notes ?? null,
          reportReviewedAt: meeting.mentor_report.reviewed_at ?? null,
          reportReviewedBy: meeting.mentor_report.reviewed_by ?? null,
          banLiftedAt: (meeting.mentor_report as any).ban_lifted_at ?? null,
          banLiftedBy: (meeting.mentor_report as any).ban_lifted_by ?? null,
        });
      }

      if (meeting.mentee_report) {
        reports.push({
          meetingId,
          reportType: 'mentee_report',
          reportStatus: meeting.mentee_report.status as ReportStatus,
          reportReason: meeting.mentee_report.reason ?? null,
          reportFiledByRole: 'mentee',
          reportFiledByUid: meeting.mentee_report.filed_by_uid ?? null,
          reportFiledAt: meeting.mentee_report.filed_at ?? null,
          reportTargetRole: 'mentor',
          reportTargetUid: meeting.mentorUID ?? mentor?.mentorUID ?? null,
          mentorUID: meeting.mentorUID ?? mentor?.mentorUID ?? null,
          mentorName: meeting.mentor_name ?? mentor?.mentor_name ?? null,
          mentorEmail: meeting.mentor_email ?? mentor?.mentor_email ?? null,
          menteeUID: mentee?.menteeUID ?? meeting.menteeUID ?? null,
          menteeName: mentee?.mentee_name ?? meeting.mentee_name ?? null,
          menteeEmail: mentee?.mentee_email ?? meeting.mentee_email ?? null,
          decision: meeting.decision,
          scheduledStatus: meeting.scheduled_status,
          reportReviewNotes: meeting.mentee_report.review_notes ?? null,
          reportReviewedAt: meeting.mentee_report.reviewed_at ?? null,
          reportReviewedBy: meeting.mentee_report.reviewed_by ?? null,
          banLiftedAt: null,
          banLiftedBy: null,
        });
      }
    }

    reports.sort((a, b) => {
      const aDate = a.reportFiledAt ? new Date(a.reportFiledAt).getTime() : 0;
      const bDate = b.reportFiledAt ? new Date(b.reportFiledAt).getTime() : 0;
      return bDate - aDate;
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Failed to fetch reports', error);
    return NextResponse.json(
      { message: 'Failed to fetch reports', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Helper: set accountFrozen flag on a user document ───────────────────────
async function setAccountFrozen(
  requester: any,
  menteeIsInMentorContainer: boolean,
  frozen: boolean
): Promise<void> {
  try {
    requester.accountFrozen = frozen;
    if (menteeIsInMentorContainer) {
      await mentorContainer.item(requester.id, requester.id).replace(requester);
    } else {
      await menteeContainer.item(requester.id, requester.id).replace(requester);
    }
    console.log(
      `[Reports] accountFrozen=${frozen} set on ${menteeIsInMentorContainer ? 'mentor' : 'mentee'} ${requester.id}`
    );
  } catch (err) {
    console.error('[Reports] Failed to update accountFrozen flag:', err);
  }
}

// ─── Helper: has this meeting's start time already passed? ──────────────────
function meetingHasStarted(meeting: any): boolean {
  const meetingDateTime = getMeetingDateTime(meeting.date, meeting.time, MY_TIMEZONE);
  if (!meetingDateTime) return true; // unknown timing — safest is to leave it alone
  return Date.now() >= meetingDateTime.getTime();
}

// ─── Helper: cancel the reported user's OTHER active meeting/request ────────
// If the CURRENT token cycle belongs to a DIFFERENT, unrelated meeting (the
// reported meeting's own cycle already ran its course before this report was
// reviewed), that separate commitment is cancelled/withdrawn IMMEDIATELY —
// same moment the ban is imposed, not deferred to when the ban is lifted —
// with an immediate token refund and a privacy-safe email to the other
// mentor (never mentions the report). If that other meeting is already
// ongoing/past, it's left alone to resolve naturally. Mutates `requester` in
// place (tokens/token_cycle/scheduling); the caller persists the write.
async function cancelRequestersOtherActiveMeeting(
  requester: any,
  requesterIsInMentorContainer: boolean,
  cancelledAt: string
): Promise<void> {
  const otherMeetingId = requester.token_cycle?.meetingId;
  if (!otherMeetingId) {
    requester.tokens = clampToken(requester.tokens);
    return;
  }

  const otherLookup = await locateMeeting(otherMeetingId);
  const otherMeeting = otherLookup?.meeting;

  if (
    !otherLookup?.mentor ||
    otherLookup.mentorScheduleIndex < 0 ||
    otherLookup.menteeScheduleIndex < 0 ||
    !otherMeeting ||
    meetingHasStarted(otherMeeting)
  ) {
    // Unknown/missing meeting, or already ongoing/past — leave it untouched;
    // it resolves naturally through the normal feedback flow.
    requester.tokens = clampToken(requester.tokens);
    return;
  }

  const targetMentorDoc: any = otherLookup.mentor;
  const requesterOwnScheduleIndex = otherLookup.menteeScheduleIndex;
  // Deliberately generic — the requester's report/suspension is confidential
  // and must not be disclosed to an unrelated third-party mentor.
  const neutralReason = 'This meeting could not proceed and was cancelled automatically. We apologize for any inconvenience.';

  const notifyOtherMentor = async () => {
    if (!targetMentorDoc.mentor_email) return;
    try {
      await sendEmail({
        to: targetMentorDoc.mentor_email,
        subject: `Meeting Cancelled - ${otherMeeting.date} at ${otherMeeting.time}`,
        template: 'meeting-cancelled-by-mentee',
        data: {
          recipientName: targetMentorDoc.mentor_name,
          mentorName: otherMeeting.mentor_name || targetMentorDoc.mentor_name,
          menteeName: otherMeeting.mentee_name || requester.mentee_name || requester.mentor_name,
          date: otherMeeting.date,
          time: otherMeeting.time,
          timezone: targetMentorDoc.timezone || otherMeeting.mentor_timezone || MY_TIMEZONE,
          reason: neutralReason,
          isForMentor: true,
        },
      });
    } catch (emailError) {
      console.error('[Reports] Failed to notify mentor of report-driven cancellation:', emailError);
    }
  };

  if (otherMeeting.decision === 'pending') {
    // A still-pending (not yet accepted) request being withdrawn is a
    // low-stakes action — no meeting was ever confirmed, so no email is sent.
    targetMentorDoc.scheduling[otherLookup.mentorScheduleIndex].decision = 'declined';
    targetMentorDoc.scheduling[otherLookup.mentorScheduleIndex].scheduled_status = 'rejected';
    targetMentorDoc.scheduling[otherLookup.mentorScheduleIndex].updated_at = cancelledAt;
    await mentorContainer.item(targetMentorDoc.id, targetMentorDoc.id).replace(targetMentorDoc);

    requester.scheduling[requesterOwnScheduleIndex].decision = 'declined';
    requester.scheduling[requesterOwnScheduleIndex].scheduled_status = 'rejected';
    requester.scheduling[requesterOwnScheduleIndex].updated_at = cancelledAt;
    requester.tokens = 1;
    requester.token_cycle = undefined;
  } else if (otherMeeting.decision === 'accepted' && otherMeeting.scheduled_status === 'upcoming') {
    const cancelInfo = {
      cancelledBy: requester.id,
      role: requesterIsInMentorContainer ? 'mentor' : 'mentee',
      reason: neutralReason,
      cancelledAt,
      tokenStatus: 'auto-replenished',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    };

    targetMentorDoc.scheduling[otherLookup.mentorScheduleIndex].scheduled_status = 'cancelled';
    targetMentorDoc.scheduling[otherLookup.mentorScheduleIndex].cancel_info = cancelInfo;
    await mentorContainer.item(targetMentorDoc.id, targetMentorDoc.id).replace(targetMentorDoc);
    await notifyOtherMentor();

    requester.scheduling[requesterOwnScheduleIndex].scheduled_status = 'cancelled';
    requester.scheduling[requesterOwnScheduleIndex].cancel_info = cancelInfo;
    requester.tokens = 1;
    requester.token_cycle = undefined;
  } else {
    requester.tokens = clampToken(requester.tokens);
  }
}

// ─── Helper: cancel a frozen mentor's own hosted upcoming meetings ──────────
// Runs when a mentor account is frozen (they were reported while acting as a
// requester elsewhere). Protects the mentees who booked THEM by cancelling
// any accepted/upcoming session, refunding the mentee's token, and notifying
// them. Pending requests TO this mentor are deliberately left untouched — they
// resolve later via a manual decline once the mentor is unbanned, or the
// existing 3-day auto-cancel cleanup cron.
async function cancelMentorsHostedUpcomingMeetings(mentorDoc: any, cancelledAt: string): Promise<void> {
  const ownMentorIds = new Set([mentorDoc.id, mentorDoc.mentorUID].filter(Boolean));
  const scheduling: Scheduling[] = mentorDoc.scheduling || [];
  const neutralReason = 'This meeting could not proceed and was cancelled automatically. We apologize for any inconvenience.';

  const hostedUpcoming = scheduling.filter((s: any) => {
    const isRequesterEntry = !!s.mentorUID && !ownMentorIds.has(s.mentorUID);
    if (isRequesterEntry) return false; // this is the mentor's OWN booking elsewhere, not hosted by them
    return s.decision === 'accepted' && s.scheduled_status === 'upcoming';
  });

  // The mentor's own document was already saved (accountFrozen + token
  // mutations) before this function runs, so further mutations here need a
  // separate write — collected as PatchOperations and applied in ONE call at
  // the end, rather than each meeting doing its own full-document .replace()
  // (which would risk the same stale-etag double-write bug fixed earlier).
  const mentorOwnPatchOps: PatchOperation[] = [];

  for (const meetingEntry of hostedUpcoming) {
    try {
      const lookup = await locateMeeting(meetingEntry.meetingId);
      if (!lookup || !lookup.mentee || lookup.menteeScheduleIndex < 0) continue;

      const requesterDoc: any = lookup.mentee;
      const requesterContainer = lookup.menteeIsInMentorContainer ? mentorContainer : menteeContainer;

      const cancelInfo = {
        cancelledBy: mentorDoc.id,
        role: 'mentor',
        reason: neutralReason,
        cancelledAt,
        tokenStatus: 'auto-replenished',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
      };

      requesterDoc.scheduling[lookup.menteeScheduleIndex].scheduled_status = 'cancelled';
      requesterDoc.scheduling[lookup.menteeScheduleIndex].cancel_info = cancelInfo;

      if (requesterDoc.token_cycle?.meetingId === meetingEntry.meetingId && requesterDoc.token_cycle.status === 'pending') {
        requesterDoc.tokens = 1;
        requesterDoc.token_cycle = undefined;
      } else {
        requesterDoc.tokens = clampToken(requesterDoc.tokens);
      }

      await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);

      // Mirror the cancellation onto the mentor's OWN copy of this meeting —
      // otherwise the mentee's side shows it cancelled but the mentor's own
      // record (visible again once the ban is lifted) still shows "upcoming".
      const ownIndex = scheduling.findIndex((s: any) => s.meetingId === meetingEntry.meetingId);
      if (ownIndex > -1) {
        mentorOwnPatchOps.push(
          { op: 'add', path: `/scheduling/${ownIndex}/scheduled_status`, value: 'cancelled' },
          { op: 'add', path: `/scheduling/${ownIndex}/cancel_info`, value: cancelInfo }
        );
      }

      const requesterEmail = lookup.menteeIsInMentorContainer ? requesterDoc.mentor_email : requesterDoc.mentee_email;
      const requesterName = lookup.menteeIsInMentorContainer ? requesterDoc.mentor_name : requesterDoc.mentee_name;

      if (requesterEmail) {
        await sendEmail({
          to: requesterEmail,
          subject: `Meeting Cancelled - ${meetingEntry.date} at ${meetingEntry.time}`,
          template: 'meeting-cancelled-by-mentor',
          data: {
            recipientName: requesterName,
            mentorName: meetingEntry.mentor_name || mentorDoc.mentor_name,
            menteeName: meetingEntry.mentee_name || requesterName,
            date: meetingEntry.date,
            time: meetingEntry.time,
            timezone: meetingEntry.mentee_timezone || requesterDoc.timezone || MY_TIMEZONE,
            reason: neutralReason,
            isForMentee: true,
            tokenAutoRefunded: true,
          },
        });
      }
    } catch (err) {
      console.error(`[Reports] Failed to cancel hosted meeting ${meetingEntry.meetingId} during freeze:`, err);
    }
  }

  if (mentorOwnPatchOps.length > 0) {
    try {
      await mentorContainer.item(mentorDoc.id, mentorDoc.id).patch(mentorOwnPatchOps);
      console.log(`[Reports] Marked ${mentorOwnPatchOps.length / 2} hosted meeting(s) cancelled on ${mentorDoc.id}'s own record`);
    } catch (err) {
      console.error(`[Reports] Failed to update mentor's own scheduling copy after freeze:`, err);
    }
  }
}

export async function PATCH(request: Request) {
  try {
    const { meetingId, reportType, status, reviewerName, reviewNotes, actionReason, liftBan } =
      await request.json();

    if (!meetingId || typeof meetingId !== 'string') {
      return NextResponse.json({ message: 'Meeting ID is required' }, { status: 400 });
    }

    if (!reportType || !['mentor_report', 'mentee_report'].includes(reportType)) {
      return NextResponse.json(
        { message: 'Valid reportType is required (mentor_report or mentee_report)' },
        { status: 400 }
      );
    }

    const lookup = await locateMeeting(meetingId);

    if (!lookup?.meeting) {
      return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
    }

    // ─── LIFT BAN ────────────────────────────────────────────────────────────
    // Unfreezes the reported mentee's account WITHOUT touching the report's
    // status — the report stays "resolved" (accepted) instead of reverting to
    // "pending", which used to make the filer's report look unreviewed again.
    if (liftBan === true) {
      if (reportType !== 'mentor_report') {
        return NextResponse.json(
          { message: 'Only mentor reports can freeze or unban an account' },
          { status: 400 }
        );
      }

      const reviewer = typeof reviewerName === 'string' ? reviewerName.trim() : '';
      if (!reviewer) {
        return NextResponse.json(
          { message: 'Reviewer name is required to lift a ban' },
          { status: 400 }
        );
      }

      const { mentee: bannedUser, menteeScheduleIndex: bannedScheduleIndex, mentor: reportingMentor, mentorScheduleIndex: mentorScheduleIdx, menteeIsInMentorContainer: bannedIsInMentorContainer } = lookup;

      if (!bannedUser) {
        return NextResponse.json({ message: 'Reported user not found' }, { status: 404 });
      }

      const requester: any = bannedUser;
      await setAccountFrozen(requester, !!bannedIsInMentorContainer, false);

      const liftedAt = new Date().toISOString();
      const banLiftOperations: PatchOperation[] = [];
      const extraNotes: string[] = [];

      if (bannedScheduleIndex > -1) {
        banLiftOperations.push(
          { op: 'add', path: `/scheduling/${bannedScheduleIndex}/mentor_report/ban_lifted_at`, value: liftedAt },
          { op: 'add', path: `/scheduling/${bannedScheduleIndex}/mentor_report/ban_lifted_by`, value: reviewer }
        );
      }

      // Undo the token forfeiture caused by THIS report, if it's still in that
      // state (skip if it already moved on, e.g. already replenished). The
      // cooldown timer resumes from wherever it was — tokenUsedAt,
      // feedbackSubmittedAt and feedbackValid are left untouched — so the
      // mentee still has to submit feedback and wait out the cooldown.
      const tokenCycle = requester.token_cycle;
      const tokenCycleRestored =
        tokenCycle?.meetingId === meetingId &&
        tokenCycle?.status === 'forfeited' &&
        tokenCycle?.mentorReported === true;

      if (tokenCycleRestored) {
        banLiftOperations.push(
          { op: 'add', path: '/token_cycle/status', value: 'pending' },
          { op: 'add', path: '/token_cycle/mentorReported', value: false },
          { op: 'add', path: '/token_cycle/reportRecordedAt', value: null },
          { op: 'add', path: '/token_cycle/evaluatedAt', value: null }
        );
        extraNotes.push('Token cycle resumed; the mentee still needs to submit feedback and wait out the cooldown.');
      }

      // If nothing was in flight at ban time, an idle already-earned token was
      // confiscated as a penalty for being banned — hand it back now. (Any
      // OTHER active meeting/request the account had is not something to
      // restore here — it was already cancelled and refunded immediately when
      // the report was accepted; see cancelRequestersOtherActiveMeeting.)
      const pendingRestore = requester.ban_pending_restore as { hadIdleToken: boolean } | undefined;

      if (pendingRestore?.hadIdleToken) {
        banLiftOperations.push({ op: 'add', path: '/tokens', value: 1 });
        extraNotes.push('An idle token confiscated at ban time has been returned.');
      }

      if (pendingRestore) {
        banLiftOperations.push({ op: 'add', path: '/ban_pending_restore', value: null });
      }

      if (banLiftOperations.length > 0) {
        if (bannedIsInMentorContainer) {
          await mentorContainer.item(requester.id, requester.id).patch(banLiftOperations);
        } else {
          await menteeContainer.item(requester.id, requester.id).patch(banLiftOperations);
        }
      }

      if (reportingMentor && mentorScheduleIdx > -1) {
        const mirrorOperations: PatchOperation[] = [
          { op: 'add', path: `/scheduling/${mentorScheduleIdx}/mentor_report/ban_lifted_at`, value: liftedAt },
          { op: 'add', path: `/scheduling/${mentorScheduleIdx}/mentor_report/ban_lifted_by`, value: reviewer },
        ];
        await mentorContainer.item(reportingMentor.id, reportingMentor.id).patch(mirrorOperations);
      }

      // Notify the mentee their account has been unfrozen
      const liftRecipientEmail = requester.mentee_email || requester.mentor_email || requester.email;
      const liftRecipientName = requester.mentee_name || requester.mentor_name || requester.name || 'there';

      if (liftRecipientEmail) {
        try {
          await sendEmail({
            to: liftRecipientEmail,
            subject: 'Your Connext Account Has Been Unfrozen',
            template: 'mentee-ban-lifted',
            data: {
              menteeName: liftRecipientName,
              notes: extraNotes.length ? extraNotes.join(' ') : null,
            },
          });
        } catch (emailError) {
          console.error('Failed to send ban-lifted email:', emailError);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Ban lifted — report remains accepted.${extraNotes.length ? ' ' + extraNotes.join(' ') : ''}`,
      });
    }

    if (!status || !['pending', 'resolved', 'rejected'].includes(status)) {
      return NextResponse.json({ message: 'Invalid status supplied' }, { status: 400 });
    }

    const normalizedStatus = status as ReportStatus;
    const reviewer = typeof reviewerName === 'string' ? reviewerName.trim() : '';
    const notes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
    const selectedReason = typeof actionReason === 'string' ? actionReason.trim() : '';

    if ((normalizedStatus === 'resolved' || normalizedStatus === 'rejected') && !reviewer) {
      return NextResponse.json(
        { message: 'Reviewer name is required to resolve or reject a report' },
        { status: 400 }
      );
    }

    if (reportType === 'mentor_report' && normalizedStatus === 'resolved' && !selectedReason) {
      return NextResponse.json(
        { message: 'Action reason is required when approving a mentor report' },
        { status: 400 }
      );
    }

    let { mentor, mentorScheduleIndex, mentee, menteeScheduleIndex, meeting, menteeIsInMentorContainer } =
      lookup;

    const resolvedTimestamp =
      normalizedStatus === 'resolved' || normalizedStatus === 'rejected'
        ? new Date().toISOString()
        : null;

    const mentorOperations: PatchOperation[] = [];
    if (mentor && mentorScheduleIndex > -1) {
      mentorOperations.push({
        op: 'add',
        path: `/scheduling/${mentorScheduleIndex}/${reportType}/status`,
        value: normalizedStatus,
      });
      // A fresh status transition supersedes any earlier "Lift Ban" record —
      // clear it so a re-accepted report doesn't look like its ban is still
      // lifted (which would hide the "Lift Ban" button behind a stale "Reopen").
      mentorOperations.push(
        { op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/ban_lifted_at`, value: null },
        { op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/ban_lifted_by`, value: null }
      );
      if (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') {
        mentorOperations.push({
          op: 'add',
          path: `/scheduling/${mentorScheduleIndex}/${reportType}/review_notes`,
          value: notes || null,
        });
        mentorOperations.push({
          op: 'add',
          path: `/scheduling/${mentorScheduleIndex}/${reportType}/reviewed_at`,
          value: resolvedTimestamp,
        });
        mentorOperations.push({
          op: 'add',
          path: `/scheduling/${mentorScheduleIndex}/${reportType}/reviewed_by`,
          value: reviewer,
        });
      }
      // Legacy fields
      mentorOperations.push({
        op: 'add',
        path: `/scheduling/${mentorScheduleIndex}/report_status`,
        value: normalizedStatus,
      });
      mentorOperations.push({
        op: 'add',
        path: `/scheduling/${mentorScheduleIndex}/report_review_notes`,
        value: normalizedStatus === 'resolved' || normalizedStatus === 'rejected' ? notes || null : null,
      });
      mentorOperations.push({
        op: 'add',
        path: `/scheduling/${mentorScheduleIndex}/report_reviewed_at`,
        value: resolvedTimestamp,
      });
      mentorOperations.push({
        op: 'add',
        path: `/scheduling/${mentorScheduleIndex}/report_reviewed_by`,
        value: normalizedStatus === 'resolved' || normalizedStatus === 'rejected' ? reviewer : null,
      });
    }

    const menteeOperations: PatchOperation[] = [];
    if (mentee && menteeScheduleIndex > -1) {
      menteeOperations.push({
        op: 'add',
        path: `/scheduling/${menteeScheduleIndex}/${reportType}/status`,
        value: normalizedStatus,
      });
      // See matching comment on mentorOperations above.
      menteeOperations.push(
        { op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/ban_lifted_at`, value: null },
        { op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/ban_lifted_by`, value: null }
      );
      if (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') {
        menteeOperations.push({
          op: 'add',
          path: `/scheduling/${menteeScheduleIndex}/${reportType}/review_notes`,
          value: notes || null,
        });
        menteeOperations.push({
          op: 'add',
          path: `/scheduling/${menteeScheduleIndex}/${reportType}/reviewed_at`,
          value: resolvedTimestamp,
        });
        menteeOperations.push({
          op: 'add',
          path: `/scheduling/${menteeScheduleIndex}/${reportType}/reviewed_by`,
          value: reviewer,
        });
      }
      // Legacy fields
      menteeOperations.push({
        op: 'add',
        path: `/scheduling/${menteeScheduleIndex}/report_status`,
        value: normalizedStatus,
      });
      menteeOperations.push({
        op: 'add',
        path: `/scheduling/${menteeScheduleIndex}/report_review_notes`,
        value: normalizedStatus === 'resolved' || normalizedStatus === 'rejected' ? notes || null : null,
      });
      menteeOperations.push({
        op: 'add',
        path: `/scheduling/${menteeScheduleIndex}/report_reviewed_at`,
        value: resolvedTimestamp,
      });
      menteeOperations.push({
        op: 'add',
        path: `/scheduling/${menteeScheduleIndex}/report_reviewed_by`,
        value: normalizedStatus === 'resolved' || normalizedStatus === 'rejected' ? reviewer : null,
      });
    }

    if (mentorOperations.length === 0 && menteeOperations.length === 0) {
      return NextResponse.json({ message: 'Meeting not found in schedules' }, { status: 404 });
    }

    if (mentorOperations.length > 0) {
      await mentorContainer.item(mentor!.id, mentor!.id).patch(mentorOperations);
      const { resource: updatedMentor } = await mentorContainer
        .item(mentor!.id, mentor!.id)
        .read<Mentor>();
      if (updatedMentor) {
        mentor = updatedMentor;
        mentorScheduleIndex = findScheduleIndex(updatedMentor.scheduling, meetingId);
        meeting = updatedMentor.scheduling?.[mentorScheduleIndex] ?? meeting;
      }
    }

    if (menteeOperations.length > 0) {
      if (menteeIsInMentorContainer) {
        await mentorContainer
          .item((mentee as any).id, (mentee as any).id)
          .patch(menteeOperations);
        const { resource: updatedMenteeAsMentor } = await mentorContainer
          .item((mentee as any).id, (mentee as any).id)
          .read<Mentor>();
        if (updatedMenteeAsMentor) {
          mentee = updatedMenteeAsMentor as any;
          menteeScheduleIndex = findScheduleIndex(
            (updatedMenteeAsMentor as any).scheduling,
            meetingId
          );
          meeting = (updatedMenteeAsMentor as any).scheduling?.[menteeScheduleIndex] ?? meeting;
        }
      } else {
        await menteeContainer.item(mentee!.id, mentee!.id).patch(menteeOperations);
        const { resource: updatedMentee } = await menteeContainer
          .item(mentee!.id, mentee!.id)
          .read<Mentee>();
        if (updatedMentee) {
          mentee = updatedMentee;
          menteeScheduleIndex = findScheduleIndex(updatedMentee.scheduling, meetingId);
          meeting = updatedMentee.scheduling?.[menteeScheduleIndex] ?? meeting;
        }
      }
    }

    // ─── ACCOUNT FREEZE LOGIC ────────────────────────────────────────────────
    // Only mentor_report affects the reported mentee's account freeze status.
    if (reportType === 'mentor_report' && mentee) {
      const requester: any = mentee;

      if (normalizedStatus === 'resolved') {
        // Admin approved the report → FREEZE the reported user's account.
        // Set the flag in memory and persist it together with the token
        // mutations below in ONE write — an earlier version wrote the freeze
        // via setAccountFrozen() and then wrote AGAIN with more mutations,
        // using a now-stale local copy of the document for the second write,
        // which could silently lose the freeze on a later report.
        requester.accountFrozen = true;

        const reportedCycleIsActive =
          requester.token_cycle?.meetingId === meetingId &&
          requester.token_cycle.status === 'pending';

        if (reportedCycleIsActive) {
          // Apply token penalty (immediate cycle forfeiture) for the reported meeting's own cycle.
          requester.token_cycle.mentorReported = true;
          requester.token_cycle.reportRecordedAt = resolvedTimestamp;
          requester.token_cycle.status = 'forfeited';
          requester.token_cycle.evaluatedAt = resolvedTimestamp;
          requester.tokens = clampToken(requester.tokens);
        } else if (requester.token_cycle?.status === 'pending' && requester.token_cycle.meetingId) {
          // The CURRENT token cycle belongs to a DIFFERENT, unrelated meeting —
          // cancel/withdraw it right now and refund immediately (see helper).
          await cancelRequestersOtherActiveMeeting(requester, !!menteeIsInMentorContainer, resolvedTimestamp!);
        } else if (clampToken(requester.tokens) > 0) {
          // Nothing active — an idle, already-earned token would otherwise sit
          // there unaffected by the ban. Confiscate it as a penalty and
          // remember to hand it back once "Lift Ban" runs.
          requester.ban_pending_restore = { hadIdleToken: true };
          requester.tokens = 0;
        } else {
          requester.tokens = clampToken(requester.tokens);
        }

        if (menteeIsInMentorContainer) {
          await mentorContainer.item(requester.id, requester.id).replace(requester);
        } else {
          await menteeContainer.item(requester.id, requester.id).replace(requester);
        }
        console.log(`[Reports] accountFrozen=true set on ${menteeIsInMentorContainer ? 'mentor' : 'mentee'} ${requester.id}`);

        // If the frozen account is itself a mentor (reported while acting as a
        // requester on someone else's session), also cancel every meeting
        // where THEY are the host — protecting those mentees from a mentor
        // under active suspension. Pending requests TO them are left alone.
        if (menteeIsInMentorContainer) {
          await cancelMentorsHostedUpcomingMeetings(requester, resolvedTimestamp!);
        }

        // Send penalty + freeze email
        const recipientEmail =
          requester.mentee_email || requester.mentor_email || requester.email;
        const recipientName =
          requester.mentee_name || requester.mentor_name || requester.name || 'there';

        if (recipientEmail) {
          try {
            await sendEmail({
              to: recipientEmail,
              subject: 'Account Frozen – Report Approved',
              template: 'mentee-report-approved-penalty',
              data: {
                menteeName: recipientName,
                reason: selectedReason,
                adminNotes: notes || null,
              },
            });
          } catch (emailError) {
            console.error('Failed to send report approved email:', emailError);
          }
        }

        // Confirm to the filing mentor that their report was accepted
        if (mentor?.mentor_email) {
          try {
            await sendEmail({
              to: mentor.mentor_email,
              subject: 'Your Report Has Been Approved',
              template: 'mentor-report-accepted',
              data: {
                mentorName: mentor.mentor_name,
                menteeName: meeting?.mentee_name || recipientName,
                date: meeting?.date || null,
                time: meeting?.time || null,
                reportReason: (meeting as any)?.mentor_report?.reason || null,
                reviewNotes: notes || null,
              },
            });
          } catch (emailError) {
            console.error('Failed to send mentor report-accepted email:', emailError);
          }
        }
      } else if (normalizedStatus === 'rejected' || normalizedStatus === 'pending') {
        // Admin rejected the report OR reopened it → UNFREEZE the account.
        // For 'pending' (reopen), we also unfreeze so the user is not stuck.
        // Single write (see comment on the 'resolved' branch above for why).
        requester.accountFrozen = false;

        if (normalizedStatus === 'rejected') {
          // Clear mentor-reported flag so token cycle can be evaluated normally
          if (requester.token_cycle?.meetingId === meetingId) {
            requester.token_cycle.mentorReported = false;
            requester.token_cycle.reportRecordedAt = null;
          }
        }

        if (menteeIsInMentorContainer) {
          await mentorContainer.item(requester.id, requester.id).replace(requester);
        } else {
          await menteeContainer.item(requester.id, requester.id).replace(requester);
        }
        console.log(`[Reports] accountFrozen=false set on ${menteeIsInMentorContainer ? 'mentor' : 'mentee'} ${requester.id}`);

        // Only the filing mentor is told a report was rejected — the mentee
        // was never notified anything happened, so they stay uninformed here too.
        if (normalizedStatus === 'rejected' && mentor?.mentor_email) {
          try {
            await sendEmail({
              to: mentor.mentor_email,
              subject: 'Your Report Has Been Reviewed',
              template: 'mentor-report-rejected',
              data: {
                mentorName: mentor.mentor_name,
                menteeName: meeting?.mentee_name || requester.mentee_name || requester.mentor_name,
                date: meeting?.date || null,
                time: meeting?.time || null,
                reportReason: (meeting as any)?.mentor_report?.reason || null,
                reviewNotes: notes || null,
              },
            });
          } catch (emailError) {
            console.error('Failed to send mentor report-rejected email:', emailError);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      meeting,
      status: normalizedStatus,
      message:
        normalizedStatus === 'resolved'
          ? 'Report accepted — account frozen'
          : normalizedStatus === 'rejected'
          ? 'Report rejected — account unfrozen'
          : 'Report status updated',
    });
  } catch (error) {
    console.error('Failed to update report', error);
    return NextResponse.json(
      { message: 'Failed to update report', error: (error as Error).message },
      { status: 500 }
    );
  }
}
