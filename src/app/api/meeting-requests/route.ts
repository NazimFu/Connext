import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/cosmos";
import { sendEmail } from "@/lib/email";
import { cleanupExpiredMeetings } from "@/lib/cleanup-expired-meetings";
import { fromZonedTime } from 'date-fns-tz';
import { buildFreshTokenCycle, clampToken, evaluateTokenCycleForUser, getTokenCycleEvaluateAtIso } from '@/lib/token-cycle';

// Testing config: require at least 30 minutes lead time before meeting.
// Production target: 3 * 24 * 60 * 60 * 1000 (3 days).
const MIN_REQUEST_LEAD_TIME_MS = 30 * 60 * 1000;
const MY_TIMEZONE = 'Asia/Kuala_Lumpur';

const parseMeetingDateTimeInMalaysia = (date: string, time: string): Date | null => {
  try {
    const baseDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;

    let hours = 0;
    let minutes = 0;

    if (time.includes('AM') || time.includes('PM')) {
      const [rawTime, period] = time.split(' ');
      const [hoursRaw, minutesRaw] = rawTime.split(':').map(Number);
      if (Number.isNaN(hoursRaw) || Number.isNaN(minutesRaw)) return null;
      hours =
        period === 'PM' && hoursRaw !== 12
          ? hoursRaw + 12
          : period === 'AM' && hoursRaw === 12
            ? 0
            : hoursRaw;
      minutes = minutesRaw;
    } else {
      const [h, m] = time.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      hours = h;
      minutes = m;
    }

    const malaysiaLocalDateTime = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const utcDate = fromZonedTime(malaysiaLocalDateTime, MY_TIMEZONE);
    return Number.isNaN(utcDate.getTime()) ? null : utcDate;
  } catch {
    return null;
  }
};

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const mentorId = searchParams.get('mentorId');
    const menteeId = searchParams.get('menteeId');

    console.log('GET /api/meeting-requests - params:', { mentorId, menteeId });

    // Need at least one parameter
    if (!mentorId && !menteeId) {
      return NextResponse.json(
        { message: "Either mentorId or menteeId is required" },
        { status: 400 }
      );
    }

    // Run cleanup of expired meetings before fetching
    try {
      const cleanupResult = await cleanupExpiredMeetings();
      if (cleanupResult.expiredCount > 0) {
        console.log(`🧹 Auto-cleanup: Removed ${cleanupResult.expiredCount} expired meetings, refunded ${cleanupResult.tokensRefunded} tokens`);
      }
    } catch (cleanupError) {
      console.error('Error during auto-cleanup:', cleanupError);
      // Don't fail the request if cleanup fails
    }

    const mentorContainer = database.container('mentor');

    const sanitizeForMenteeView = (meeting: any) => ({
      ...meeting,
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
      mentor_report: undefined,
      mentee_report: undefined,
    });
    const normalizedDecision = (meeting: any) => {
      if (meeting?.decision === 'accepted' || meeting?.decision === 'rejected' || meeting?.decision === 'pending') {
        return meeting.decision;
      }
      if (meeting?.scheduled_status === 'pending') {
        return 'pending';
      }
      return meeting?.decision;
    };
    let allMeetings: any[] = [];

    // Query by mentorId (user is RECEIVING requests as a mentor)
    if (mentorId) {
      const mentorQuerySpec = {
        query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
        parameters: [{ name: "@mentorId", value: mentorId }]
      };

      const { resources: mentors } = await mentorContainer.items
        .query(mentorQuerySpec)
        .fetchAll();

      if (mentors.length > 0) {
        const mentor = mentors.find((m: any) => m.id === mentorId) ?? mentors.find((m: any) => m.mentorUID === mentorId) ?? mentors[0];
        if (mentor.scheduling && Array.isArray(mentor.scheduling)) {
          mentor.scheduling.forEach((meeting: any) => {
            // Inbox view should show all non-cancelled meetings this mentor is receiving.
            // Exclude self-requested meetings by matching mentor's own mentee_id.
            const isSelfRequestedMeeting = Boolean(mentor.mentee_id) && meeting.menteeUID === mentor.mentee_id;
            if (meeting.scheduled_status !== 'cancelled' && !isSelfRequestedMeeting) {
              allMeetings.push({
                ...meeting,
                decision: normalizedDecision(meeting),
                mentor_name: mentor.mentor_name,
                mentor_email: mentor.mentor_email,
              });
            }
          });
        }
      }
      
      console.log(`Found ${allMeetings.length} meetings where user is receiving as mentor`);
    }

    // Query by menteeId (user SENT requests - could be mentor acting as mentee)
    if (menteeId) {
      // First, check if menteeId is actually a mentor's mentorUID
      const requesterQuerySpec = {
        query: "SELECT * FROM c WHERE c.mentorUID = @menteeId OR c.id = @menteeId",
        parameters: [{ name: "@menteeId", value: menteeId }]
      };

      const { resources: requesterMentors } = await mentorContainer.items
        .query(requesterQuerySpec)
        .fetchAll();

      if (requesterMentors.length > 0) {
        // This is a mentor acting as mentee
        const requesterMentor = requesterMentors.find((m: any) => m.id === menteeId) ?? requesterMentors.find((m: any) => m.mentorUID === menteeId) ?? requesterMentors[0];
        const actualMenteeId = requesterMentor.mentee_id;

        const evalResult = evaluateTokenCycleForUser(requesterMentor);
        if (evalResult.changed) {
          await mentorContainer.item(requesterMentor.id, requesterMentor.id).replace(requesterMentor);
        }

        console.log(`menteeId ${menteeId} is a mentor with mentee_id: ${actualMenteeId}`);

        // Get meetings from requester mentor's scheduling where they are the mentee
        if (requesterMentor.scheduling && Array.isArray(requesterMentor.scheduling)) {
          requesterMentor.scheduling.forEach((meeting: any) => {
            // **CRITICAL: Only include meetings where:**
            // 1. This is NOT cancelled
            // 2. The menteeUID matches their mentee_id (they are the requester)
            // 3. The mentorUID is NOT them (they're requesting from someone else)
            if (meeting.scheduled_status !== 'cancelled' && 
                meeting.menteeUID === actualMenteeId &&
                meeting.mentorUID !== menteeId) {
              allMeetings.push({
                ...sanitizeForMenteeView(meeting),
                decision: normalizedDecision(meeting),
              });
            }
          });
        }

        console.log(`Found ${allMeetings.filter(m => m.menteeUID === actualMenteeId).length} meetings where mentor sent requests as mentee`);
      } else {
        // Regular mentee, check mentee container
        const menteeContainer = database.container('mentee');
        
        try {
          const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();

          if (mentee) {
            const evalResult = evaluateTokenCycleForUser(mentee);
            if (evalResult.changed) {
              await menteeContainer.item(mentee.id, mentee.id).replace(mentee);
            }
          }
          
          if (mentee && mentee.scheduling && Array.isArray(mentee.scheduling)) {
            mentee.scheduling.forEach((meeting: any) => {
              if (meeting.scheduled_status !== 'cancelled') {
                allMeetings.push({
                  ...sanitizeForMenteeView(meeting),
                  decision: normalizedDecision(meeting),
                  menteeUID: menteeId,
                });
              }
            });
          }

          console.log(`Found ${mentee?.scheduling?.length || 0} meetings for regular mentee`);
        } catch (menteeError: any) {
          if (menteeError.code !== 404) {
            console.error('Error reading mentee:', menteeError);
          } else {
            console.log(`No mentee found with id: ${menteeId}`);
          }
        }
      }
    }

    console.log(`Returning ${allMeetings.length} total meetings`);

    return NextResponse.json(allMeetings, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error('Failed to fetch meeting requests:', error);
    return NextResponse.json(
      { 
        message: "Failed to fetch meeting requests",
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { message: "Content-Type must be application/json" },
        { status: 400 }
      );
    }

    const text = await req.text();
    
    if (!text || text.trim() === '') {
      return NextResponse.json(
        { message: "Request body is empty" },
        { status: 400 }
      );
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return NextResponse.json(
        { message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    console.log('Received body:', body);

    const { 
      mentorId,  // This is the TARGET mentor (the one receiving the request)
      menteeId,  // This could be the actual menteeId OR the requester's mentorUID
      menteeName, 
      mentee_name,
      menteeEmail, 
      mentee_email,
      date, 
      time, 
      message 
    } = body;

    const finalMenteeName = menteeName || mentee_name;
    const finalMenteeEmail = menteeEmail || mentee_email;
    
    const missingFields = [];
    if (!mentorId) missingFields.push('mentorId');
    if (!menteeId) missingFields.push('menteeId');
    if (!finalMenteeName) missingFields.push('menteeName/mentee_name');
    if (!finalMenteeEmail) missingFields.push('menteeEmail/mentee_email');
    if (!date) missingFields.push('date');
    if (!time) missingFields.push('time');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          message: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields,
          receivedBody: body
        },
        { status: 400 }
      );
    }

    // Get TARGET mentor info
    const mentorContainer = database.container('mentor');
    const mentorQuerySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
      parameters: [{ name: "@mentorId", value: mentorId }]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(mentorQuerySpec)
      .fetchAll();

    if (mentors.length === 0) {
      return NextResponse.json(
        { message: "Mentor not found" },
        { status: 404 }
      );
    }

    const targetMentor = mentors[0];

    // Check if slot is already booked
    if (targetMentor.scheduling && Array.isArray(targetMentor.scheduling)) {
      const isSlotTaken = targetMentor.scheduling.some((meeting: any) => 
        meeting.date === date && 
        meeting.time === time && 
        // Only active pending requests or upcoming accepted meetings block the slot.
        // Rejected/declined/cancelled/past meetings should not block reuse.
        (
          meeting.decision === 'pending' ||
          (meeting.decision === 'accepted' && meeting.scheduled_status === 'upcoming')
        )
      );

      if (isSlotTaken) {
        return NextResponse.json(
          { 
            message: "This time slot is no longer available",
            error: "SLOT_UNAVAILABLE"
          },
          { status: 409 }
        );
      }
    }

    const meetingId = `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    const scheduledMeetingDateTime = parseMeetingDateTimeInMalaysia(date, time);
    if (!scheduledMeetingDateTime) {
      return NextResponse.json(
        {
          message: 'Invalid meeting date/time format.',
          error: 'INVALID_MEETING_DATETIME',
          receivedDate: date,
          receivedTime: time,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const timeUntilMeeting = scheduledMeetingDateTime.getTime() - now.getTime();

    if (timeUntilMeeting <= 0) {
      return NextResponse.json(
        {
          message: 'Meeting time must be in the future.',
          error: 'MEETING_TIME_PASSED',
          receivedDate: date,
          receivedTime: time,
          parsedMeetingIso: scheduledMeetingDateTime.toISOString(),
          serverNowIso: now.toISOString(),
        },
        { status: 400 }
      );
    }

    if (timeUntilMeeting < MIN_REQUEST_LEAD_TIME_MS) {
      return NextResponse.json(
        {
          message: 'This meeting is too soon to request. Please choose a time at least 30 minutes from now (testing window).',
          error: 'REQUEST_TOO_CLOSE',
          minimumLeadTimeMinutes: Math.floor(MIN_REQUEST_LEAD_TIME_MS / 60000),
          receivedDate: date,
          receivedTime: time,
          parsedMeetingIso: scheduledMeetingDateTime.toISOString(),
          serverNowIso: now.toISOString(),
        },
        { status: 400 }
      );
    }

    // Determine if the requester is a mentor or mentee
    let actualMenteeId = menteeId;
    let requesterMentor = null;
    let requester: any = null;
    let isRequesterMentor = false;

    // Check if requester is a mentor (by checking if menteeId is actually a mentorUID)
    try {
      const requesterMentorQuerySpec = {
        query: "SELECT * FROM c WHERE c.mentorUID = @menteeId OR c.id = @menteeId",
        parameters: [{ name: "@menteeId", value: menteeId }]
      };

      const { resources: requesterMentors } = await mentorContainer.items
        .query(requesterMentorQuerySpec)
        .fetchAll();

      if (requesterMentors.length > 0) {
        requesterMentor = requesterMentors[0];
        requester = requesterMentor;
        isRequesterMentor = true;
        actualMenteeId = requesterMentor.mentee_id;
        
        console.log(`✅ Requester is a mentor. Using mentee_id: ${actualMenteeId}`);
      }
    } catch (mentorCheckError) {
      console.log('Requester is not a mentor, treating as regular mentee');
    }

    // If not a mentor, check if it's a mentee
    if (!requester) {
      const menteeContainer = database.container('mentee');
      try {
        const { resource: menteeResource } = await menteeContainer.item(menteeId, menteeId).read();
        if (menteeResource) {
          requester = menteeResource;
          actualMenteeId = menteeId;
        }
      } catch (err) {
        console.log('Requester not found in mentee container');
      }
    }

    // Check if requester has enough tokens (strict 0/1 model)
    if (requester) {
      requester.tokens = clampToken(requester.tokens);

      const evalResult = evaluateTokenCycleForUser(requester);
      if (evalResult.changed) {
        if (isRequesterMentor) {
          await mentorContainer.item(requester.id, requester.id).replace(requester);
        } else {
          const menteeContainer = database.container('mentee');
          await menteeContainer.item(requester.id, requester.id).replace(requester);
        }
      }

      if (requester.token_cycle?.status === 'pending') {
        return NextResponse.json(
          {
            message: 'You already have an active token cycle. Complete it before requesting another meeting.',
            error: 'ACTIVE_TOKEN_CYCLE',
            tokenReplenishAt: getTokenCycleEvaluateAtIso(requester.token_cycle.tokenUsedAt),
          },
          { status: 409 }
        );
      }

      const currentTokens = clampToken(requester.tokens);
      if (currentTokens < 1) {
        return NextResponse.json(
          { 
            message: "Insufficient tokens. You need at least 1 token to request a meeting.",
            error: "INSUFFICIENT_TOKENS",
            currentTokens: 0
          },
          { status: 403 }
        );
      }
      console.log(`✅ Requester has ${currentTokens} tokens available`);
      
      // Consume token for this cycle.
      requester.tokens = 0;
      console.log(`💰 DEDUCTING TOKEN: ${currentTokens} → ${requester.tokens}`);
      
    } else {
      return NextResponse.json(
        { 
          message: "Requester not found. Please ensure your profile is complete.",
          error: "REQUESTER_NOT_FOUND"
        },
        { status: 404 }
      );
    }

    // Start cycle timing from actual token usage (request creation time),
    // not scheduled meeting time.
    const tokenUsageAt = createdAt;
    requester.token_cycle = buildFreshTokenCycle(meetingId, date, time, tokenUsageAt);

    // **IMPORTANT: Structure the meeting object correctly**
    const newMeeting = {
      meetingId,
      menteeUID: actualMenteeId,          // Always use the actual mentee_id
      mentorUID: mentorId,                // Always the TARGET mentor
      date,
      time,
      decision: "pending",
      scheduled_status: "pending",
      report_status: "none",
      report_reason: null,
      cancel_info: null,
      mentee_name: finalMenteeName,       // Name of the requester
      mentee_email: finalMenteeEmail,     // Email of the requester
      mentor_name: targetMentor.mentor_name,     // Name of target mentor
      mentor_email: targetMentor.mentor_email,   // Email of target mentor
      message: message || "",
      created_at: createdAt,
      googleMeetUrl: "",
      updated_at: createdAt
    };

    console.log('📝 Meeting structure:', {
      menteeUID: actualMenteeId,
      mentorUID: mentorId,
      mentee_name: finalMenteeName,
      mentor_name: targetMentor.mentor_name,
      requesterIsMentor: !!requesterMentor
    });

    // If requester is a MENTOR (acting as mentee), store in their scheduling array
    if (requesterMentor) {
      if (!requesterMentor.scheduling) {
        requesterMentor.scheduling = [];
      }

      requesterMentor.scheduling.push(newMeeting);
      requesterMentor.tokens = requester.tokens; // Update token count
      await mentorContainer.item(requesterMentor.id, requesterMentor.id).replace(requesterMentor);
      
      console.log('✅ Meeting stored in REQUESTER mentor table (acting as mentee):', meetingId);
      console.log('✅ Token balance updated:', requesterMentor.tokens);
    } else {
      // Requester is a regular MENTEE, store in mentee table
      const menteeContainer = database.container('mentee');
      
      try {
        const { resource: mentee } = await menteeContainer.item(actualMenteeId, actualMenteeId).read();
        
        if (!mentee) {
          return NextResponse.json(
            { 
              message: "Mentee not found. Please ensure you have completed your profile.",
              menteeId: actualMenteeId 
            },
            { status: 404 }
          );
        }

        if (!mentee.scheduling) {
          mentee.scheduling = [];
        }

        mentee.scheduling.push(newMeeting);
        mentee.tokens = requester.tokens; // Update token count
        mentee.token_cycle = requester.token_cycle;
        await menteeContainer.item(actualMenteeId, actualMenteeId).replace(mentee);
        
        console.log('✅ Meeting stored in MENTEE table:', meetingId);
        console.log('✅ Token balance updated:', mentee.tokens);

        // Update requested_mentors
        try {
          const requestedMentors = mentee.requested_mentors || [];
          if (!requestedMentors.includes(mentorId)) {
            const patchOperations = [
              {
                op: (requestedMentors.length > 0 ? 'set' : 'add') as 'set' | 'add',
                path: '/requested_mentors',
                value: [...requestedMentors, mentorId],
              },
            ];
            await menteeContainer.item(actualMenteeId, actualMenteeId).patch(patchOperations);
          }
        } catch (menteeError) {
          console.error('Failed to update mentee requested mentors:', menteeError);
        }
      } catch (menteeError) {
        console.error('Failed to store in mentee table:', menteeError);
        return NextResponse.json(
          { 
            message: "Failed to create meeting request in mentee table",
            error: (menteeError as Error).message 
          },
          { status: 500 }
        );
      }
    }

    // Store in TARGET mentor's scheduling array
    if (!targetMentor.scheduling) {
      targetMentor.scheduling = [];
    }
    targetMentor.scheduling.push(newMeeting);
    await mentorContainer.item(targetMentor.id, targetMentor.id).replace(targetMentor);

    console.log('✅ Meeting stored in TARGET mentor table:', meetingId);

    // Send email notification to mentor
    try {
      await sendEmail({
        to: targetMentor.mentor_email,
        subject: 'New Meeting Request Received - CONNEXT',
        template: 'mentor-meeting-request',
        data: {
          mentorName: targetMentor.mentor_name,
          menteeName: finalMenteeName,
          menteeEmail: finalMenteeEmail,
          date,
          time,
          message: message || ''
        }
      });
      console.log('✅ Email sent to mentor');
    } catch (emailError) {
      console.error('Failed to send email to mentor:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      message: "Meeting request created successfully",
      meeting: newMeeting,
      requesterIsMentor: !!requesterMentor,
      newTokenBalance: requester.tokens
    });

  } catch (error) {
    console.error('Failed to create meeting request:', error);
    return NextResponse.json(
      { 
        message: "Failed to create meeting request",
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { mentorId, meetingId, decision, googleMeetUrl, meetingLink } = body;

    console.log('PATCH meeting-requests:', { mentorId, meetingId, decision, googleMeetUrl, meetingLink });

    if (!mentorId || !meetingId || !decision) {
      return NextResponse.json(
        { message: "mentorId, meetingId, and decision are required" },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');
    
    // 1. Update the TARGET MENTOR (the one accepting/rejecting)
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @mentorId OR c.id = @mentorId",
      parameters: [{ name: "@mentorId", value: mentorId }]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentors.length === 0) {
      return NextResponse.json(
        { message: "Mentor not found" },
        { status: 404 }
      );
    }

    const mentor = mentors[0];

    if (!mentor.scheduling || !Array.isArray(mentor.scheduling)) {
      return NextResponse.json(
        { message: "No scheduling data found" },
        { status: 404 }
      );
    }

    const meetingIndex = mentor.scheduling.findIndex(
      (meeting: any) => meeting.meetingId === meetingId
    );

    if (meetingIndex === -1) {
      return NextResponse.json(
        { message: "Meeting not found" },
        { status: 404 }
      );
    }

    const meeting = mentor.scheduling[meetingIndex];
    const menteeId = meeting.menteeUID;

    // Update target mentor's meeting
    mentor.scheduling[meetingIndex].decision = decision;
    mentor.scheduling[meetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
    mentor.scheduling[meetingIndex].updated_at = new Date().toISOString();
    
    // Update Google Meet URL if provided
    if (googleMeetUrl) {
      mentor.scheduling[meetingIndex].googleMeetUrl = googleMeetUrl;
      console.log(`✅ Updated googleMeetUrl in target mentor's record: ${googleMeetUrl}`);
    }
    if (meetingLink) {
      mentor.scheduling[meetingIndex].meetingLink = meetingLink;
      console.log(`✅ Updated meetingLink in target mentor's record: ${meetingLink}`);
    }
    
    const isRejected = decision === 'declined' || decision === 'rejected';
    console.log(`Decision: ${decision}, isRejected: ${isRejected}`);

    await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
    console.log('✅ Updated meeting in TARGET mentor table:', meetingId);

    // 2. Update the REQUESTER (could be mentee or mentor acting as mentee) in parallel
    const menteeContainer = database.container('mentee');
    
    // Try both mentee table and mentor table in parallel
    const [menteeResult, requesterMentorResult] = await Promise.allSettled([
      // Try updating mentee
      (async () => {
        const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();
        
        if (mentee && mentee.scheduling && Array.isArray(mentee.scheduling)) {
          const menteeMeetingIndex = mentee.scheduling.findIndex(
            (m: any) => m.meetingId === meetingId
          );

          if (menteeMeetingIndex !== -1) {
            mentee.scheduling[menteeMeetingIndex].decision = decision;
            mentee.scheduling[menteeMeetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
            mentee.scheduling[menteeMeetingIndex].updated_at = new Date().toISOString();

            if (googleMeetUrl) {
              mentee.scheduling[menteeMeetingIndex].googleMeetUrl = googleMeetUrl;
            }
            if (meetingLink) {
              mentee.scheduling[menteeMeetingIndex].meetingLink = meetingLink;
            }

            // Replenish token if declined or rejected
            if (isRejected) {
              const currentTokens = clampToken(mentee.tokens);
              mentee.tokens = 1;
              if (mentee.token_cycle?.meetingId === meetingId && mentee.token_cycle.status === 'pending') {
                mentee.token_cycle = undefined;
              }
              console.log(`💰 REPLENISHING TOKEN: ${currentTokens} → ${mentee.tokens} for mentee ${menteeId}`);
            }

            await menteeContainer.item(menteeId, menteeId).replace(mentee);
            console.log('✅ Updated meeting in MENTEE table:', meetingId);
            return { success: true, type: 'mentee' };
          }
        }
        return { success: false, type: 'mentee' };
      })(),
      
      // Try finding mentor with mentee_id
      (async () => {
        const requesterQuerySpec = {
          query: "SELECT * FROM c WHERE c.mentee_id = @menteeId",
          parameters: [{ name: "@menteeId", value: menteeId }]
        };

        const { resources: requesters } = await mentorContainer.items
          .query(requesterQuerySpec)
          .fetchAll();

        if (requesters.length > 0) {
          const requesterMentor = requesters[0];
          
          if (requesterMentor.scheduling && Array.isArray(requesterMentor.scheduling)) {
            const requesterMeetingIndex = requesterMentor.scheduling.findIndex(
              (m: any) => m.meetingId === meetingId
            );

            if (requesterMeetingIndex !== -1) {
              requesterMentor.scheduling[requesterMeetingIndex].decision = decision;
              requesterMentor.scheduling[requesterMeetingIndex].scheduled_status = decision === 'accepted' ? 'upcoming' : 'rejected';
              requesterMentor.scheduling[requesterMeetingIndex].updated_at = new Date().toISOString();

              if (googleMeetUrl) {
                requesterMentor.scheduling[requesterMeetingIndex].googleMeetUrl = googleMeetUrl;
              }
              if (meetingLink) {
                requesterMentor.scheduling[requesterMeetingIndex].meetingLink = meetingLink;
              }

              // Replenish token if declined or rejected
              if (isRejected) {
                const currentTokens = clampToken(requesterMentor.tokens);
                requesterMentor.tokens = 1;
                if (requesterMentor.token_cycle?.meetingId === meetingId && requesterMentor.token_cycle.status === 'pending') {
                  requesterMentor.token_cycle = undefined;
                }
                console.log(`💰 REPLENISHING TOKEN for mentor: ${currentTokens} → ${requesterMentor.tokens}`);
              }

              await mentorContainer.item(requesterMentor.id, requesterMentor.id).replace(requesterMentor);
              console.log('✅ Updated meeting in REQUESTER MENTOR table:', meetingId);
              return { success: true, type: 'mentor' };
            }
          }
        }
        return { success: false, type: 'mentor' };
      })()
    ]);

    // Check results
    let updatedRequester = false;
    if (menteeResult.status === 'fulfilled' && menteeResult.value.success) {
      updatedRequester = true;
    } else if (requesterMentorResult.status === 'fulfilled' && requesterMentorResult.value.success) {
      updatedRequester = true;
    }

    if (!updatedRequester) {
      console.warn(`⚠️ Could not update requester for meeting ${meetingId}`);
    }

    // Send email notifications
    try {
      console.log(`📧 Preparing to send ${decision} email to: ${meeting.mentee_email}`);
      console.log('Email data:', {
        to: meeting.mentee_email,
        menteeName: meeting.mentee_name,
        mentorName: meeting.mentor_name,
        date: meeting.date,
        time: meeting.time
      });

      if (decision === 'accepted') {
        // Email to mentee: meeting accepted
        await sendEmail({
          to: meeting.mentee_email,
          subject: 'Your Mentorship Meeting is Confirmed - CONNEXT',
          template: 'mentee-meeting-accepted',
          data: {
            menteeName: meeting.mentee_name,
            mentorName: meeting.mentor_name,
            date: meeting.date,
            time: meeting.time,
            googleMeetUrl: meeting.googleMeetUrl || ''
          }
        });
        console.log('✅ Acceptance email sent successfully to:', meeting.mentee_email);
      } else if (decision === 'declined' || decision === 'rejected') {
        // Email to mentee: meeting declined/rejected
        console.log('🔴 Sending decline/reject email...');
        await sendEmail({
          to: meeting.mentee_email,
          subject: 'Meeting Request Update - CONNEXT',
          template: 'mentee-meeting-declined',
          data: {
            menteeName: meeting.mentee_name,
            mentorName: meeting.mentor_name,
            date: meeting.date,
            time: meeting.time
          }
        });
        console.log('✅ Decline email sent successfully to:', meeting.mentee_email);
      }
    } catch (emailError) {
      console.error('❌ Failed to send decision email:', emailError);
      console.error('Email error details:', {
        message: (emailError as Error).message,
        stack: (emailError as Error).stack
      });
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      message: `Meeting ${decision}`,
      meeting: mentor.scheduling[meetingIndex],
      updatedRequester
    });
  } catch (error) {
    console.error('Failed to update meeting:', error);
    return NextResponse.json(
      { 
        message: "Failed to update meeting",
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

