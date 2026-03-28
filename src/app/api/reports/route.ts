import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';
import type { Mentor, Mentee, Scheduling } from '@/lib/types';
import { locateMeeting, findScheduleIndex } from '@/lib/server/meeting-utils';
import { sendEmail } from '@/lib/email';
import { clampToken } from '@/lib/token-cycle';

type ReportStatus = 'pending' | 'resolved' | 'rejected';

type ReportSummary = {
  meetingId: string;
  reportType: 'mentor_report' | 'mentee_report'; // Which report this is
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
};

const mentorContainer = database.container('mentor');
const menteeContainer = database.container('mentee');

// Query for meetings with mentor reports
const MENTOR_REPORT_QUERY =
  'SELECT DISTINCT VALUE s.meetingId FROM c JOIN s IN c.scheduling WHERE IS_DEFINED(s.mentor_report)';

// Query for meetings with mentee reports
const MENTEE_REPORT_QUERY =
  'SELECT DISTINCT VALUE s.meetingId FROM c JOIN s IN c.scheduling WHERE IS_DEFINED(s.mentee_report)';

const gatherReportedMeetingIds = async (): Promise<string[]> => {
  const ids = new Set<string>();

  try {
    const { resources: mentorReportIds } = await mentorContainer.items
      .query<string>({ query: MENTOR_REPORT_QUERY })
      .fetchAll();

    mentorReportIds.forEach((meetingId) => {
      if (meetingId) ids.add(meetingId);
    });
  } catch (error) {
    console.error('Failed fetching mentor reports', error);
  }

  try {
    const { resources: menteeReportIds } = await menteeContainer.items
      .query<string>({ query: MENTEE_REPORT_QUERY })
      .fetchAll();

    menteeReportIds.forEach((meetingId) => {
      if (meetingId) ids.add(meetingId);
    });
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
      if (!lookup?.meeting) {
        continue;
      }

      const { meeting, mentor, mentee } = lookup;

      // Check for mentor's report (filed by mentor against mentee)
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
        });
      }

      // Check for mentee's report (filed by mentee against mentor)
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

export async function PATCH(request: Request) {
  try {
    const { meetingId, reportType, status, reviewerName, reviewNotes, actionReason } = await request.json();

    if (!meetingId || typeof meetingId !== 'string') {
      return NextResponse.json({ message: 'Meeting ID is required' }, { status: 400 });
    }

    if (!reportType || !['mentor_report', 'mentee_report'].includes(reportType)) {
      return NextResponse.json({ message: 'Valid reportType is required (mentor_report or mentee_report)' }, { status: 400 });
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

    const lookup = await locateMeeting(meetingId);

    if (!lookup?.meeting) {
      return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
    }

    let { mentor, mentorScheduleIndex, mentee, menteeScheduleIndex, meeting, menteeIsInMentorContainer } = lookup;

    const resolvedTimestamp = (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') ? new Date().toISOString() : null;

    const mentorOperations: PatchOperation[] = [];
    if (mentor && mentorScheduleIndex > -1) {
      mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/status`, value: normalizedStatus });
      if (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') {
        mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/review_notes`, value: notes || null });
        mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/reviewed_at`, value: resolvedTimestamp });
        mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/${reportType}/reviewed_by`, value: reviewer });
      }
      // Also update legacy fields for backward compatibility
      mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/report_status`, value: normalizedStatus });
      mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/report_review_notes`, value: (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') ? notes || null : null });
      mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/report_reviewed_at`, value: resolvedTimestamp });
      mentorOperations.push({ op: 'add', path: `/scheduling/${mentorScheduleIndex}/report_reviewed_by`, value: (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') ? reviewer : null });
    }

    const menteeOperations: PatchOperation[] = [];
    if (mentee && menteeScheduleIndex > -1) {
      menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/status`, value: normalizedStatus });
      if (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') {
        menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/review_notes`, value: notes || null });
        menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/reviewed_at`, value: resolvedTimestamp });
        menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/${reportType}/reviewed_by`, value: reviewer });
      }
      // Also update legacy fields for backward compatibility
      menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/report_status`, value: normalizedStatus });
      menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/report_review_notes`, value: (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') ? notes || null : null });
      menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/report_reviewed_at`, value: resolvedTimestamp });
      menteeOperations.push({ op: 'add', path: `/scheduling/${menteeScheduleIndex}/report_reviewed_by`, value: (normalizedStatus === 'resolved' || normalizedStatus === 'rejected') ? reviewer : null });
    }

    if (mentorOperations.length === 0 && menteeOperations.length === 0) {
      return NextResponse.json({ message: 'Meeting not found in schedules' }, { status: 404 });
    }

    if (mentorOperations.length > 0) {
      await mentorContainer.item(mentor!.id, mentor!.id).patch(mentorOperations);
      const { resource: updatedMentor } = await mentorContainer.item(mentor!.id, mentor!.id).read<Mentor>();
      if (updatedMentor) {
        mentor = updatedMentor;
        mentorScheduleIndex = findScheduleIndex(updatedMentor.scheduling, meetingId);
        meeting = updatedMentor.scheduling?.[mentorScheduleIndex] ?? meeting;
      }
    }

    if (menteeOperations.length > 0) {
      if (menteeIsInMentorContainer) {
        await mentorContainer.item((mentee as any).id, (mentee as any).id).patch(menteeOperations);
        const { resource: updatedMenteeAsMentor } = await mentorContainer
          .item((mentee as any).id, (mentee as any).id)
          .read<Mentor>();
        if (updatedMenteeAsMentor) {
          mentee = updatedMenteeAsMentor as any;
          menteeScheduleIndex = findScheduleIndex((updatedMenteeAsMentor as any).scheduling, meetingId);
          meeting = (updatedMenteeAsMentor as any).scheduling?.[menteeScheduleIndex] ?? meeting;
        }
      } else {
        await menteeContainer.item(mentee!.id, mentee!.id).patch(menteeOperations);
        const { resource: updatedMentee } = await menteeContainer.item(mentee!.id, mentee!.id).read<Mentee>();
        if (updatedMentee) {
          mentee = updatedMentee;
          menteeScheduleIndex = findScheduleIndex(updatedMentee.scheduling, meetingId);
          meeting = updatedMentee.scheduling?.[menteeScheduleIndex] ?? meeting;
        }
      }
    }

    // If a mentor-filed report is rejected by admin, do not refund immediately.
    // Clear report penalty and let token return happen at normal cycle evaluation time.
    if (reportType === 'mentor_report' && normalizedStatus === 'rejected' && mentee) {
      const requester: any = mentee as any;

      if (requester.token_cycle?.meetingId === meetingId) {
        requester.token_cycle.mentorReported = false;
        requester.token_cycle.reportRecordedAt = null;
      }

      if (menteeIsInMentorContainer) {
        await mentorContainer.item(requester.id, requester.id).replace(requester);
      } else {
        await menteeContainer.item(requester.id, requester.id).replace(requester);
      }
    }

    // Approving mentor report applies immediate penalty and sends immediate email.
    if (reportType === 'mentor_report' && normalizedStatus === 'resolved' && mentee) {
      const requester: any = mentee as any;

      // Immediate cycle end with forfeiture for this meeting.
      requester.tokens = 0;
      if (requester.token_cycle?.meetingId === meetingId) {
        requester.token_cycle.mentorReported = true;
        requester.token_cycle.reportRecordedAt = resolvedTimestamp;
        requester.token_cycle.status = 'forfeited';
        requester.token_cycle.evaluatedAt = resolvedTimestamp;
      }
      requester.tokens = clampToken(requester.tokens);

      if (menteeIsInMentorContainer) {
        await mentorContainer.item(requester.id, requester.id).replace(requester);
      } else {
        await menteeContainer.item(requester.id, requester.id).replace(requester);
      }

      const recipientEmail = requester.mentee_email || requester.mentor_email || requester.email;
      const recipientName = requester.mentee_name || requester.mentor_name || requester.name || 'there';

      if (recipientEmail) {
        try {
          await sendEmail({
            to: recipientEmail,
            subject: 'Report approved - penalty applied',
            template: 'mentee-report-approved-penalty',
            data: {
              menteeName: recipientName,
              reason: selectedReason,
              adminNotes: notes || null,
              date: meeting?.date || null,
              time: meeting?.time || null,
              mentorName: meeting?.mentor_name || mentor?.mentor_name || 'Your mentor',
            },
          });
        } catch (emailError) {
          console.error('Failed to send report approved email:', emailError);
        }
      }
    }

    // Rejected mentor reports are deferred to cycle evaluation; approved mentor reports apply immediate forfeiture.

    return NextResponse.json({
      success: true,
      meeting,
      status: normalizedStatus,
      message: normalizedStatus === 'resolved' 
        ? 'Report accepted' 
        : normalizedStatus === 'rejected' 
        ? 'Report rejected' 
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
