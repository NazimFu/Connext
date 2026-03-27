import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';
import { v4 as uuidv4 } from 'uuid';
import type { Scheduling, Mentee, Mentor } from '@/lib/types';
import { sendEmail } from '@/lib/email';
import { clampToken } from '@/lib/token-cycle';

// -----------------------------
// Helper: Check if slot is available
// -----------------------------
const isSlotAvailable = async (mentorId: string, date: string, time: string): Promise<boolean> => {
  try {
    const mentorContainer = database.container('mentor');
    const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read<Mentor>();

    if (!mentor || !mentor.scheduling) return true;

    const now = new Date();

    const conflict = mentor.scheduling.find(m => {
      if (m.date === date && m.time === time) {
        if (m.decision === 'pending' || m.decision === 'accepted') {
          const scheduledDateTime = new Date(`${m.date}T${m.time}:00`);
          const expiresAt = new Date(scheduledDateTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours
          return now < expiresAt;
        }
      }
      return false;
    });

    return !conflict;
  } catch (err) {
    console.error('Slot check error:', err);
    return false; // safest
  }
};

// -----------------------------
// GET: Fetch user schedule
// -----------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const role = searchParams.get('role');

  if (!userId || !role) {
    return NextResponse.json({ message: 'userId and role required' }, { status: 400 });
  }

  try {
    const container = database.container(role);

    const sanitizeScheduleForRole = (
      entries: Scheduling[],
      viewerRole: 'mentee' | 'mentor'
    ): Scheduling[] => {
      return entries.map(entry => {
        if (!entry.report_status || entry.report_status === 'none') return entry;

        const filedByRole = entry.report_filed_by_role ?? null;
        const viewerIsReporter = filedByRole === viewerRole;

        if (viewerIsReporter) return entry;

        // Hide report details from opposite party for all statuses.
        return {
          ...entry,
          report_status: 'none',
          report_reason: null,
          report_filed_by_role: null,
          report_filed_by_uid: null,
          report_filed_at: null,
          report_target_role: null,
          report_target_uid: null,
          report_review_notes: null,
          report_reviewed_at: null,
          report_reviewed_by: null,
        };
      });
    };

    if (role === 'mentee') {
      const { resource: mentee } = await container.item(userId, userId).read<Mentee>();
      if (!mentee) return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });
      return NextResponse.json(sanitizeScheduleForRole(mentee.scheduling || [], 'mentee'));
    }

    if (role === 'mentor') {
      const { resource: mentor } = await container.item(userId, userId).read<Mentor>();
      if (!mentor) return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
      return NextResponse.json(sanitizeScheduleForRole(mentor.scheduling || [], 'mentor'));
    }

    return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
  } catch (err: any) {
    console.error('Schedule GET error:', err);
    return NextResponse.json({ message: 'Failed', error: err.message }, { status: 500 });
  }
}

// -----------------------------
// POST: Create new meeting request
// -----------------------------
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mentorId, menteeId, date, time, message } = body;

    if (!mentorId || !menteeId || !date || !time || !message) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Check slot availability
    if (!(await isSlotAvailable(mentorId, date, time))) {
      return NextResponse.json({ message: 'Slot unavailable', error: 'SLOT_UNAVAILABLE' }, { status: 409 });
    }

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    // Fetch mentor
    const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read<Mentor>();
    if (!mentor) return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });

    // Fetch mentee
    const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read<Mentee>();
    if (!mentee) return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });

    // Check tokens
    if ((mentee.tokens || 0) < 1) {
      return NextResponse.json({ message: 'Insufficient tokens', error: 'INSUFFICIENT_TOKENS' }, { status: 403 });
    }

    // Deduct token immediately
    mentee.tokens -= 1;

    // Create scheduling entries
    const meetingId = `meet_${uuidv4()}`;

    const newMeetingForMentor: Scheduling = {
      meetingId,
      menteeUID: mentee.menteeUID,
      mentee_name: mentee.mentee_name,
      mentee_email: mentee.mentee_email,
      date,
      time,
      decision: 'pending',
      scheduled_status: 'upcoming',
      message,
      report_status: 'none',
      report_reason: null,
      cancel_info: null,
    };

    const newMeetingForMentee: Scheduling = {
      meetingId,
      mentorUID: mentor.mentorUID,
      mentor_name: mentor.mentor_name,
      mentor_email: mentor.mentor_email,
      date,
      time,
      decision: 'pending',
      scheduled_status: 'upcoming',
      message,
      report_status: 'none',
      report_reason: null,
      cancel_info: null,
    };

    // Prepare patch operations
    const mentorOps: PatchOperation[] = mentor.scheduling?.length
      ? [{ op: 'add', path: '/scheduling/-', value: newMeetingForMentor }]
      : [{ op: 'add', path: '/scheduling', value: [newMeetingForMentor] }];

    const menteeOps: PatchOperation[] = mentee.scheduling?.length
      ? [
          { op: 'add', path: '/scheduling/-', value: newMeetingForMentee },
          { op: 'replace', path: '/tokens', value: mentee.tokens },
        ]
      : [
          { op: 'add', path: '/scheduling', value: [newMeetingForMentee] },
          { op: 'replace', path: '/tokens', value: mentee.tokens },
        ];

    // Apply patches
    await mentorContainer.item(mentorId, mentorId).patch(mentorOps);
    await menteeContainer.item(menteeId, menteeId).patch(menteeOps);

    return NextResponse.json({
      success: true,
      message: 'Meeting requested successfully',
      meetingId,
      newTokenBalance: mentee.tokens,
      meeting: newMeetingForMentee,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Schedule POST error:', err);
    return NextResponse.json({ message: 'Failed', error: err.message }, { status: 500 });
  }
}

// -----------------------------
// DELETE: Cancel meeting
// -----------------------------
export async function DELETE(request: Request, { params }: { params: Promise<{ meetingID: string }> }) {
  try {
    const { meetingID } = await params;
    const body = await request.json();
    const { cancelledBy, reason } = body;

    if (!meetingID || !cancelledBy || !reason) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    console.log(`🔍 Cancelling meeting ${meetingID} by ${cancelledBy}`);

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    // Find the meeting in mentor container
    const { resources: mentors } = await mentorContainer.items.query(`SELECT * FROM c`).fetchAll();
    
    let mentorDoc: any = null;
    let meeting: any = null;
    let mentorIndex = -1;

    for (const m of mentors) {
      const idx = m.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
      if (idx >= 0) {
        mentorDoc = m;
        mentorIndex = idx;
        meeting = m.scheduling[idx];
        break;
      }
    }

    if (!meeting) {
      return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
    }

    console.log(`✅ Found meeting. menteeUID: ${meeting.menteeUID}, mentorUID: ${meeting.mentorUID}`);

    // Determine who is cancelling: mentor or mentee
    // Handle mentee_ prefix for mentor-as-mentee scenarios
    const rawMenteeUID = meeting.menteeUID;
    const menteeUIDVariants = [
      rawMenteeUID,
      rawMenteeUID.startsWith('mentee_') ? rawMenteeUID.substring(7) : `mentee_${rawMenteeUID}`
    ];

    const isMentorCancelling = cancelledBy === meeting.mentorUID;
    const isMenteeCancelling = menteeUIDVariants.includes(cancelledBy);

    console.log(`🔐 Authorization check - cancelledBy: ${cancelledBy}`);
    console.log(`   mentorUID: ${meeting.mentorUID}, isMentorCancelling: ${isMentorCancelling}`);
    console.log(`   menteeUID variants: ${menteeUIDVariants.join(', ')}, isMenteeCancelling: ${isMenteeCancelling}`);

    if (!isMentorCancelling && !isMenteeCancelling) {
      return NextResponse.json({ message: 'Unauthorized cancellation' }, { status: 403 });
    }

    console.log(`👤 Cancelling role: ${isMentorCancelling ? 'mentor' : 'mentee'}`);

    // Find and update mentee/requester FIRST to determine if they are mentor-as-mentee
    const rawMenteeId = meeting.menteeUID;
    let requesterDoc: any = null;
    let requesterIndex = -1;
    let requesterContainer: any = null;
    let isMentorRequester = false;

    console.log(`🔍 Looking for requester with menteeUID: ${rawMenteeId}`);

    // Try mentee container first - try with and without "mentee_" prefix
    let searchIds = [rawMenteeId];
    if (rawMenteeId.startsWith('mentee_')) {
      searchIds.push(rawMenteeId.substring(7)); // Remove "mentee_" prefix
    } else {
      searchIds.push(`mentee_${rawMenteeId}`); // Add "mentee_" prefix
    }

    for (const searchId of searchIds) {
      try {
        console.log(`  Trying mentee container with ID: ${searchId}`);
        const { resource } = await menteeContainer.item(searchId, searchId).read();
        if (resource) {
          requesterDoc = resource;
          requesterContainer = menteeContainer;
          requesterIndex = resource.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
          console.log(`✅ Found in mentee container with ID: ${searchId}`);
          break;
        }
      } catch (err: any) {
        if (err.code !== 404) {
          console.error(`Error checking mentee ${searchId}:`, err);
        }
      }
    }

    // If not found in mentee container, try mentor container (mentor as mentee)
    if (!requesterDoc) {
      console.log(`  Not found in mentee container, checking mentor container...`);
      
      for (const searchId of searchIds) {
        try {
          console.log(`  Trying mentor container with ID: ${searchId}`);
          const { resources: matchMentors } = await mentorContainer.items.query({
            query: `SELECT * FROM c WHERE c.id = @id`,
            parameters: [{ name: '@id', value: searchId }]
          }).fetchAll();

          if (matchMentors.length > 0) {
            requesterDoc = matchMentors[0];
            requesterContainer = mentorContainer;
            isMentorRequester = true;
            requesterIndex = requesterDoc.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
            console.log(`✅ Found in mentor container with ID: ${searchId}`);
            break;
          }
        } catch (err) {
          console.error(`Error checking mentor ${searchId}:`, err);
        }
      }
    }

    if (!requesterDoc) {
      console.error(`❌ Requester not found for menteeUID: ${rawMenteeId}`);
      return NextResponse.json({ message: 'Requester not found' }, { status: 404 });
    }

    console.log(`✅ Found requester: ${isMentorRequester ? 'mentor-as-mentee' : 'mentee'} ${requesterDoc.id}`);

    // Create cancel_info
    // Auto-replenish ONLY if the TARGET MENTOR cancels
    // If REQUESTER cancels (whether mentee or mentor-as-mentee), requires admin approval
    const cancel_info = {
      cancelledBy: cancelledBy,
      role: isMentorCancelling ? 'mentor' : 'mentee',
      reason: reason,
      cancelledAt: new Date().toISOString(),
      tokenStatus: isMentorCancelling ? 'auto-replenished' : 'pending-approval',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null
    };

    console.log(`💡 Token decision - isMentorCancelling: ${isMentorCancelling}, tokenStatus: ${cancel_info.tokenStatus}`);

    // Update mentor's meeting
    mentorDoc.scheduling[mentorIndex].scheduled_status = 'cancelled';
    mentorDoc.scheduling[mentorIndex].cancel_info = cancel_info;
    await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
    console.log(`✅ Updated target mentor document`);

    // Update requester's meeting
    if (requesterIndex >= 0) {
      requesterDoc.scheduling[requesterIndex].scheduled_status = 'cancelled';
      requesterDoc.scheduling[requesterIndex].cancel_info = cancel_info;
      console.log(`✅ Updated requester's meeting at index ${requesterIndex}`);
    }

    // If MENTOR (target) cancels → automatically refund token to requester
    if (isMentorCancelling) {
      const currentTokens = clampToken(requesterDoc.tokens);
      requesterDoc.tokens = 1;
      if (requesterDoc.token_cycle?.meetingId === meetingID && requesterDoc.token_cycle.status === 'pending') {
        requesterDoc.token_cycle = undefined;
      }
      console.log(`💰 Auto-refund: ${currentTokens} → ${requesterDoc.tokens} for ${isMentorRequester ? 'mentor-as-mentee' : 'mentee'} ${requesterDoc.id}`);
    }

    // Save requester document
    await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);
    console.log(`✅ Saved requester document`);

    // Send cancellation emails
    try {
      if (isMentorCancelling) {
        // Mentor cancelled - send email to mentee/requester
        const requesterEmail = isMentorRequester ? requesterDoc.mentor_email : requesterDoc.mentee_email;
        const requesterName = isMentorRequester ? requesterDoc.mentor_name : requesterDoc.mentee_name;
        
        if (requesterEmail) {
          await sendEmail({
            to: requesterEmail,
            subject: `Meeting Cancelled - ${meeting.date} at ${meeting.time}`,
            template: 'meeting-cancelled-by-mentor',
            data: {
              recipientName: requesterName,
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
              reason: reason,
              isForMentee: true,
              tokenAutoRefunded: true
            }
          });
          console.log(`📧 Sent cancellation email to requester: ${requesterEmail}`);
        }
      } else {
        // Mentee/requester cancelled - send email to mentor
        if (mentorDoc.mentor_email) {
          await sendEmail({
            to: mentorDoc.mentor_email,
            subject: `Meeting Cancellation Request - ${meeting.date} at ${meeting.time}`,
            template: 'meeting-cancelled-by-mentee',
            data: {
              recipientName: mentorDoc.mentor_name,
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
              reason: reason,
              isForMentor: true
            }
          });
          console.log(`📧 Sent cancellation email to mentor: ${mentorDoc.mentor_email}`);
        }
        
        // Also send email to the requester (mentee or mentor-as-mentee)
        const requesterEmail = isMentorRequester ? requesterDoc.mentor_email : requesterDoc.mentee_email;
        const requesterName = isMentorRequester ? requesterDoc.mentor_name : requesterDoc.mentee_name;
        
        if (requesterEmail) {
          await sendEmail({
            to: requesterEmail,
            subject: `Meeting Cancellation Submitted - ${meeting.date} at ${meeting.time}`,
            template: 'meeting-cancelled-by-mentee',
            data: {
              recipientName: requesterName,
              mentorName: meeting.mentor_name,
              menteeName: meeting.mentee_name,
              date: meeting.date,
              time: meeting.time,
              reason: reason,
              isForMentor: false,
              tokenPendingApproval: true
            }
          });
          console.log(`📧 Sent cancellation confirmation to requester: ${requesterEmail}`);
        }
      }
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
      // Don't fail the cancellation if email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Meeting cancelled successfully',
      requiresApproval: isMenteeCancelling,
      tokenStatus: cancel_info.tokenStatus,
      newBalance: requesterDoc.tokens
    });

  } catch (err: any) {
    console.error('Schedule DELETE error:', err);
    return NextResponse.json({ message: 'Failed to cancel meeting', error: err.message }, { status: 500 });
  }
}

// -----------------------------
// PATCH: Handle meeting updates (report, etc)
// -----------------------------
export async function PATCH(request: Request, { params }: { params: Promise<{ meetingID: string }> }) {
  try {
    const { meetingID } = await params;
    const body = await request.json();
    const { action, reporterRole, reporterId, reason } = body;

    if (!meetingID || !action) {
      return NextResponse.json({ message: 'Missing required fields (meetingID, action)' }, { status: 400 });
    }

    // Handle report action
    if (action === 'report') {
      if (!reporterId || !reason || !reporterRole) {
        return NextResponse.json({ message: 'Missing required fields for report (reporterId, reporterRole, reason)' }, { status: 400 });
      }

      console.log(`📋 Processing report for meeting ${meetingID}`);
      console.log(`   Reporter: ${reporterId} (role: ${reporterRole}), Reason: ${reason}`);

      const mentorContainer = database.container('mentor');
      const menteeContainer = database.container('mentee');

      // Find the meeting in mentor container
      const { resources: mentors } = await mentorContainer.items.query(`SELECT * FROM c`).fetchAll();
      
      let mentorDoc: any = null;
      let meeting: any = null;
      let mentorIndex = -1;

      // A meeting can exist in multiple mentor documents when requester is a mentor-as-mentee.
      // Always select the TARGET mentor document (meeting.mentorUID matches document mentorUID/id).
      const candidates: Array<{ doc: any; idx: number; row: any }> = [];
      for (const m of mentors) {
        const idx = m.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
        if (idx >= 0) {
          candidates.push({ doc: m, idx, row: m.scheduling[idx] });
        }
      }

      const best = candidates.find((c) => c.row?.mentorUID === c.doc?.mentorUID || c.row?.mentorUID === c.doc?.id)
        || candidates[0];

      if (best) {
        mentorDoc = best.doc;
        mentorIndex = best.idx;
        meeting = best.row;
      }

      if (!meeting) {
        return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });
      }

      console.log(`✅ Found meeting. menteeUID: ${meeting.menteeUID}, mentorUID: ${meeting.mentorUID}`);

      // Determine reporter role from the meeting identity, not client-provided role,
      // to avoid attribution bugs for mentors acting as mentees.
      const rawMenteeUID = meeting.menteeUID;
      const menteeUIDVariants = [
        rawMenteeUID,
        rawMenteeUID?.startsWith('mentee_') ? rawMenteeUID.substring(7) : `mentee_${rawMenteeUID}`,
      ].filter(Boolean);

      const isMentorReporter = reporterId === meeting.mentorUID;
      const isMenteeReporter = menteeUIDVariants.includes(reporterId);

      if (!isMentorReporter && !isMenteeReporter) {
        return NextResponse.json({ message: 'Unauthorized reporter for this meeting' }, { status: 403 });
      }

      const effectiveReporterRole: 'mentor' | 'mentee' = isMentorReporter ? 'mentor' : 'mentee';

      // Determine report type based on actual role
      let reportType: 'mentor_report' | 'mentee_report';
      let reportTargetUID: string;
      let reportTargetRole: 'mentor' | 'mentee';

      if (effectiveReporterRole === 'mentor') {
        reportType = 'mentor_report';
        reportTargetUID = meeting.menteeUID;
        reportTargetRole = 'mentee';
      } else {
        reportType = 'mentee_report';
        reportTargetUID = meeting.mentorUID;
        reportTargetRole = 'mentor';
      }

      console.log(`📊 Report details: type=${reportType}, reporter=${reporterId}, target=${reportTargetUID}`);

      // Check if report already exists
      if (meeting[reportType]) {
        return NextResponse.json({ message: 'Report already filed for this meeting' }, { status: 409 });
      }

      // Create report object with all required fields
      const filedAtIso = new Date().toISOString();
      const reportData = {
        status: 'pending',
        reason: reason,
        filed_by_uid: reporterId,
        filed_by_role: effectiveReporterRole,
        filed_at: filedAtIso,
        target_uid: reportTargetUID,
        target_role: reportTargetRole,
        review_notes: null,
        reviewed_at: null,
        reviewed_by: null,
      };

      // Update mentor's copy of meeting
      mentorDoc.scheduling[mentorIndex][reportType] = reportData;
      mentorDoc.scheduling[mentorIndex].report_status = 'pending'; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_reason = reason; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_filed_by_role = effectiveReporterRole; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_filed_by_uid = reporterId; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_filed_at = filedAtIso; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_target_role = reportTargetRole; // For backward compatibility
      mentorDoc.scheduling[mentorIndex].report_target_uid = reportTargetUID; // For backward compatibility

      await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
      console.log(`✅ Updated mentor document`);

      // Find and update mentee/requester document
      const rawMenteeId = meeting.menteeUID;
      let requesterDoc: any = null;
      let requesterIndex = -1;
      let requesterContainer: any = null;
      let isMentorRequester = false;

      // Try mentee container first - try with and without "mentee_" prefix
      let searchIds = [rawMenteeId];
      if (rawMenteeId.startsWith('mentee_')) {
        searchIds.push(rawMenteeId.substring(7)); // Remove "mentee_" prefix
      } else {
        searchIds.push(`mentee_${rawMenteeId}`); // Add "mentee_" prefix
      }

      for (const searchId of searchIds) {
        try {
          const { resource } = await menteeContainer.item(searchId, searchId).read();
          if (resource) {
            requesterDoc = resource;
            requesterContainer = menteeContainer;
            requesterIndex = resource.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
            console.log(`✅ Found mentee document`);
            break;
          }
        } catch (err: any) {
          if (err.code !== 404) {
            console.error(`Error checking mentee ${searchId}:`, err);
          }
        }
      }

      // If not found in mentee container, try mentor container (mentor as mentee)
      if (!requesterDoc) {
        for (const searchId of searchIds) {
          try {
            const { resources: matchMentors } = await mentorContainer.items.query({
              query: `SELECT * FROM c WHERE c.id = @id`,
              parameters: [{ name: '@id', value: searchId }]
            }).fetchAll();

            if (matchMentors.length > 0) {
              requesterDoc = matchMentors[0];
              requesterContainer = mentorContainer;
              isMentorRequester = true;
              requesterIndex = requesterDoc.scheduling?.findIndex((s: any) => s.meetingId === meetingID);
              console.log(`✅ Found mentor-as-mentee document`);
              break;
            }
          } catch (err) {
            console.error(`Error checking mentor ${searchId}:`, err);
          }
        }
      }

      if (!requesterDoc) {
        console.error(`⚠️ Could not find requester document, but report was filed successfully in mentor's record`);
        // Don't fail here - we already updated mentor's record
      } else if (requesterIndex >= 0) {
        // Update requester's copy of meeting
        requesterDoc.scheduling[requesterIndex][reportType] = reportData;
        requesterDoc.scheduling[requesterIndex].report_status = 'pending';
        requesterDoc.scheduling[requesterIndex].report_reason = reason;
        requesterDoc.scheduling[requesterIndex].report_filed_by_role = effectiveReporterRole;
        requesterDoc.scheduling[requesterIndex].report_filed_by_uid = reporterId;
        requesterDoc.scheduling[requesterIndex].report_filed_at = filedAtIso;
        requesterDoc.scheduling[requesterIndex].report_target_role = reportTargetRole;
        requesterDoc.scheduling[requesterIndex].report_target_uid = reportTargetUID;

        // Mentor report marks cycle as penalized, regardless of later feedback submission order.
        if (effectiveReporterRole === 'mentor' && requesterDoc.token_cycle?.status === 'pending') {
          requesterDoc.token_cycle.mentorReported = true;
          requesterDoc.token_cycle.reportRecordedAt = filedAtIso;
          requesterDoc.tokens = clampToken(requesterDoc.tokens);
        }

        await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);
        console.log(`✅ Updated requester document`);
      }

      console.log(`✅ Report submitted successfully`);

      return NextResponse.json({
        success: true,
        message: 'Report submitted successfully',
        meetingId: meetingID,
        reportType: reportType,
      }, { status: 200 });
    }

    return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Schedule PATCH error:', err);
    return NextResponse.json({ message: 'Failed to process request', error: err.message }, { status: 500 });
  }
}
