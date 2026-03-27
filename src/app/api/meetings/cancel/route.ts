import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { clampToken } from '@/lib/token-cycle';

export const dynamic = 'force-dynamic';


// ============================================================================
// GET – Fetch all cancellations (pending, approved, rejected, and auto-replenished)
// ============================================================================
export async function GET() {
  try {
    const mentorContainer = database.container('mentor');

    const allCancellations: any[] = [];

    const { resources: mentors } = await mentorContainer.items.query(`SELECT * FROM c`).fetchAll();

    console.log(`🔍 Scanning ${mentors.length} mentors for all cancellations...`);

    // Extract all cancelled meetings
    for (const mentor of mentors) {
      if (!Array.isArray(mentor.scheduling)) continue;

      for (const meeting of mentor.scheduling) {
        // Include all cancelled meetings with cancel_info
        if (meeting.scheduled_status === 'cancelled' && meeting.cancel_info) {
          
          const duplicate = allCancellations.some(m => m.meetingId === meeting.meetingId);
          if (!duplicate) {
            const status = meeting.cancel_info.tokenStatus;
            console.log(`✅ Found cancellation: ${meeting.meetingId} - status: ${status}`);
            allCancellations.push({
              meetingId: meeting.meetingId,
              menteeUID: meeting.menteeUID,
              mentorUID: meeting.mentorUID,
              menteeName: meeting.mentee_name,
              mentorName: meeting.mentor_name,
              menteeEmail: meeting.mentee_email,
              mentorEmail: meeting.mentor_email,
              date: meeting.date,
              time: meeting.time,
              cancelInfo: meeting.cancel_info,
              cancelledBy: meeting.cancel_info?.cancelledBy,
              cancelReason: meeting.cancel_info?.reason,
              cancelledAt: meeting.cancel_info?.cancelledAt,
              tokenStatus: meeting.cancel_info?.tokenStatus,
              reviewedBy: meeting.cancel_info?.reviewedBy,
              reviewedAt: meeting.cancel_info?.reviewedAt,
              reviewNotes: meeting.cancel_info?.reviewNotes,
            });
          }
        }
      }
    }

    console.log(`📊 Found ${allCancellations.length} total cancellations`);

    // Sort by cancelled date (most recent first)
    allCancellations.sort((a, b) =>
      new Date(b.cancelledAt || 0).getTime() - new Date(a.cancelledAt || 0).getTime()
    );

    return NextResponse.json(allCancellations);

  } catch (error) {
    console.error("GET cancellations error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}



// ============================================================================
// POST – Approve or Reject Cancellation
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { meetingId, action, reviewerName, reviewNotes } = await req.json();

    if (!meetingId || !action || !reviewerName)
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });

    if (!["approve", "reject"].includes(action))
      return NextResponse.json({ message: "Invalid action" }, { status: 400 });

    const mentorContainer = database.container('mentor');
    const menteeContainer = database.container('mentee');

    console.log(`🔍 Processing cancellation ${action} for meeting ${meetingId}`);

    // ---------------- Find meeting inside mentor container ----------------
    const { resources: mentors } = await mentorContainer.items.query(`SELECT * FROM c`).fetchAll();

    let mentorDoc: any = null, meeting: any = null, mentorIndex = -1;

    for (const m of mentors) {
      const idx = m.scheduling?.findIndex((s: any) => s.meetingId === meetingId);
      if (idx >= 0) {
        mentorDoc = m;
        mentorIndex = idx;
        meeting = m.scheduling[idx];
        break;
      }
    }

    if (!meeting) return NextResponse.json({ message: "Meeting not found" }, { status: 404 });

    // Check if cancellation is pending approval
    if (!meeting.cancel_info || meeting.cancel_info.tokenStatus !== 'pending-approval') {
      return NextResponse.json({ 
        message: "This cancellation doesn't require approval or has already been processed" 
      }, { status: 400 });
    }

    // Only mentee cancellations require approval
    if (meeting.cancel_info.role !== 'mentee') {
      return NextResponse.json({ 
        message: "Only mentee cancellations require approval" 
      }, { status: 400 });
    }

    // ---------------- Determine if requester is mentee or mentor-as-mentee ----------------
    const rawMenteeId = meeting.menteeUID;
    let requesterDoc: any = null, requesterIndex = -1, requesterContainer: any = null, isMentorRequester = false;

    console.log(`🔍 Looking for requester with menteeUID: ${rawMenteeId}`);

    // Try both with and without "mentee_" prefix
    let searchIds = [rawMenteeId];
    if (rawMenteeId.startsWith('mentee_')) {
      searchIds.push(rawMenteeId.substring(7)); // Remove "mentee_" prefix
    } else {
      searchIds.push(`mentee_${rawMenteeId}`); // Add "mentee_" prefix
    }

    // Search in mentee container first
    for (const searchId of searchIds) {
      try {
        console.log(`  Trying mentee container with ID: ${searchId}`);
        const { resource } = await menteeContainer.item(searchId, searchId).read();
        if (resource) {
          requesterDoc = resource;
          requesterContainer = menteeContainer;
          requesterIndex = resource.scheduling?.findIndex((s: any) => s.meetingId === meetingId);
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
            requesterIndex = requesterDoc.scheduling?.findIndex((s: any) => s.meetingId === meetingId);
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
      return NextResponse.json({ message: "Requester not found" }, { status: 404 });
    }

    console.log(`👤 Requester found: ${isMentorRequester ? 'mentor-as-mentee' : 'mentee'} ${requesterDoc.id}`);

    // ---------------- Update cancel info ----------------
    const updatedInfo = {
      ...meeting.cancel_info,
      tokenStatus: action === "approve" ? "approved-replenished" : "rejected",
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
      reviewNotes: reviewNotes ?? ""
    };

    // Update mentor side
    mentorDoc.scheduling[mentorIndex].cancel_info = updatedInfo;
    await mentorContainer.item(mentorDoc.id, mentorDoc.id).replace(mentorDoc);
    console.log(`✅ Updated mentor document`);

    // Update requester side AND token in single operation
    if (requesterIndex >= 0) {
      requesterDoc.scheduling[requesterIndex].cancel_info = updatedInfo;
    }

    // ---------------- Token handling ----------------
    if (action === "approve") {
      const currentTokens = clampToken(requesterDoc.tokens);
      requesterDoc.tokens = 1;
      if (requesterDoc.token_cycle?.meetingId === meetingId && requesterDoc.token_cycle.status === 'pending') {
        requesterDoc.token_cycle = undefined;
      }
      console.log(`💰 Replenished token: ${currentTokens} → ${requesterDoc.tokens} for ${isMentorRequester ? 'mentor' : 'mentee'} ${requesterDoc.id}`);
    } else {
      console.log(`❌ Token NOT replenished (cancellation rejected)`);
    }

    // Save requester document once with both cancel_info and token updates
    await requesterContainer.item(requesterDoc.id, requesterDoc.id).replace(requesterDoc);
    console.log(`✅ Updated requester document`);

    return NextResponse.json({
      success: true,
      message: `Cancellation ${action}d successfully`,
      newBalance: requesterDoc.tokens ?? 0
    });

  } catch (error: any) {
    console.error("POST cancellation approval error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
