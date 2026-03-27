import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';
import { v4 as uuidv4 } from 'uuid';
import type { Scheduling, Mentee, Mentor } from '@/lib/types';

// Fetch schedule for a user (mentee or mentor)
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');

    console.log('API /api/schedule GET called');
    console.log('Received userId:', userId);
    console.log('Received role:', role);

    if (!userId || !role) {
        console.log('Missing userId or role');
        return NextResponse.json({ message: 'User ID and role are required' }, { status: 400 });
    }

    try {
        const container = database.container(role);
        console.log('Fetching user from Cosmos DB:', { container: role, userId });

        const sanitizeScheduleForRole = (
            entries: Scheduling[],
            viewerRole: 'mentee' | 'mentor'
        ): Scheduling[] => {
            return entries.map((entry) => {
                if (!entry.report_status || entry.report_status === 'none') {
                    return entry;
                }

                const filedByRole = entry.report_filed_by_role ?? null;

                const viewerIsReporter = filedByRole === viewerRole;

                if (viewerIsReporter) {
                    return entry;
                }

                // Hide report details from the opposite party for all statuses.
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
            if (!mentee) {
                console.log('Mentee not found in DB');
                return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });
            }
            const schedule: Scheduling[] = mentee.scheduling || [];
            const sanitized = sanitizeScheduleForRole(schedule, 'mentee');
            console.log('Mentee schedule:', sanitized);
            return NextResponse.json(sanitized);
        } else if (role === 'mentor') {
            const { resource: mentor } = await container.item(userId, userId).read<Mentor>();
            if (!mentor) {
                console.log('Mentor not found in DB');
                return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
            }
            const schedule: Scheduling[] = mentor.scheduling || [];
            const sanitized = sanitizeScheduleForRole(schedule, 'mentor');
            console.log('Mentor schedule:', sanitized);
            return NextResponse.json(sanitized);
        } else {
            return NextResponse.json({ message: 'Invalid role specified' }, { status: 400 });
        }

    } catch (error) {
        console.error('Failed to fetch schedule', error);
        return NextResponse.json({ message: 'Failed to fetch schedule', error: (error as Error).message }, { status: 500 });
    }
}

// Check if a time slot is available
const isSlotAvailable = async (mentorId: string, date: string, time: string): Promise<boolean> => {
    try {
        const mentorContainer = database.container('mentor');
        const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read<Mentor>();
        
        if (!mentor || !mentor.scheduling) return true;
        
        const currentTime = new Date();
        
        // Check if slot is already booked
        const conflictingMeeting = mentor.scheduling.find((meeting: any) => {
            if (meeting.date === date && meeting.time === time) {
                if (meeting.decision === 'pending' || meeting.decision === 'accepted') {
                    // Check if slot has expired
                    const scheduledDateTime = new Date(`${meeting.date}T${meeting.time}:00`);
                    const expirationTime = new Date(scheduledDateTime.getTime() + (2 * 60 * 60 * 1000));
                    
                    // If not expired, slot is unavailable
                    return currentTime < expirationTime;
                }
            }
            return false;
        });
        
        return !conflictingMeeting;
    } catch (error) {
        console.error('Error checking slot availability:', error);
        return false; // Err on the side of caution
    }
};

// Create a new meeting request
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { mentorId, menteeId, menteeName, menteeEmail, date, time, message } = body;

        console.log('POST /api/schedule called with:', { mentorId, menteeId, menteeName, menteeEmail, date, time, message });

        if (!mentorId || !menteeId || !menteeName || !menteeEmail || !date || !time) {
            return NextResponse.json({ message: 'Missing required fields for schedule request' }, { status: 400 });
        }

        // Check if slot is still available
        const isAvailable = await isSlotAvailable(mentorId, date, time);
        if (!isAvailable) {
            return NextResponse.json({ 
                message: 'This time slot has already been booked by another user. Please select a different time.',
                error: 'SLOT_UNAVAILABLE'
            }, { status: 409 });
        }
        
        const meetingId = `meet_${uuidv4()}`;

        // Get mentor and mentee containers/documents
        const mentorContainer = database.container('mentor');
        const menteeContainer = database.container('mentee');
        
        console.log('Fetching mentor with ID:', mentorId);
        const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read<Mentor>();
        if (!mentor) {
            console.log('Mentor not found');
            return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
        }
        
        // Requester could be a mentee OR a mentor acting as mentee
        console.log('Fetching requester (mentee) with ID:', menteeId);
        let mentee: any = null;
        let requesterContainer = menteeContainer;
        let isRequesterMentor = false;
        
        try {
            const { resource: menteeResource } = await menteeContainer.item(menteeId, menteeId).read<Mentee>();
            mentee = menteeResource;
        } catch (error: any) {
            if (error.code === 404) {
                // Not found in mentee container, check if it's a mentor
                console.log('Not found in mentee container, checking mentor container...');
                try {
                    const { resource: mentorResource } = await mentorContainer.item(menteeId, menteeId).read<Mentor>();
                    mentee = mentorResource;
                    requesterContainer = mentorContainer;
                    isRequesterMentor = true;
                    console.log('Found requester in mentor container (mentor acting as mentee)');
                } catch (mentorError: any) {
                    console.log('Requester not found in either container');
                    return NextResponse.json({ message: 'Requester not found' }, { status: 404 });
                }
            } else {
                throw error;
            }
        }
        
        if (!mentee) {
            console.log('Requester not found');
            return NextResponse.json({ message: 'Requester not found' }, { status: 404 });
        }
        
        // Check if requester has tokens (for mentors acting as mentees, check their tokens)
        const currentTokens = mentee.tokens || 0;
        console.log('🔍 Current token balance before deduction:', currentTokens);
        console.log('🔍 Requester ID:', menteeId);
        console.log('🔍 Is requester a mentor?', isRequesterMentor);
        
        if (currentTokens < 1) {
            console.log('❌ Insufficient tokens. Current:', currentTokens);
            return NextResponse.json({ 
                message: 'Insufficient tokens. You need at least 1 token to request a meeting.',
                error: 'INSUFFICIENT_TOKENS'
            }, { status: 403 });
        }

        // Double-check availability right before creating (race condition protection)
        const stillAvailable = await isSlotAvailable(mentorId, date, time);
        if (!stillAvailable) {
            return NextResponse.json({ 
                message: 'This time slot was just booked by another user. Please select a different time.',
                error: 'SLOT_UNAVAILABLE'
            }, { status: 409 });
        }

        // Deduct 1 token from requester immediately when creating the request
        const newTokenBalance = currentTokens - 1;
        mentee.tokens = newTokenBalance;
        console.log(`💰 DEDUCTING TOKEN: ${currentTokens} → ${newTokenBalance}`);
        
        // Get requester's name and email (different field names for mentor vs mentee)
        const requesterName = isRequesterMentor ? mentee.mentor_name : mentee.mentee_name;
        const requesterEmail = isRequesterMentor ? mentee.mentor_email : mentee.mentee_email;
        const requesterUID = isRequesterMentor ? mentee.mentorUID : mentee.menteeUID;

        // Create the scheduling object for the MENTOR (standardized field names)
        const newMeetingForMentor: Scheduling = {
            meetingId,
            menteeUID: requesterUID,
            date,
            time,
            decision: 'pending',
            scheduled_status: 'upcoming',
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
            cancel_info: null,
            mentee_name: requesterName,
            mentee_email: requesterEmail,
            message,
        };

        // Create the scheduling object for the REQUESTER (mentee or mentor acting as mentee)
        const newMeetingForMentee: Scheduling = {
            meetingId,
            mentorUID: mentorId,
            date,
            time,
            decision: 'pending',
            scheduled_status: 'upcoming',
            feedback_form: null,
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
            cancel_info: null,
            mentor_name: mentor.mentor_name,
            mentor_email: mentor.mentor_email,
            message,
        };

        // Ensure scheduling arrays exist
        const mentorScheduling = mentor.scheduling || [];
        const menteeScheduling = mentee.scheduling || [];

        // Add new meeting to mentor's scheduling
        mentor.scheduling = [...mentorScheduling, newMeetingForMentor];
        
        // Add new meeting to requester's scheduling
        mentee.scheduling = [...menteeScheduling, newMeetingForMentee];

        console.log('Updating mentor scheduling...');
        await mentorContainer.item(mentorId, mentorId).replace(mentor);
        console.log('✅ Mentor document updated');
        
        console.log('Updating requester scheduling and token balance...');
        console.log('📝 Requester container:', isRequesterMentor ? 'mentor' : 'mentee');
        console.log('📝 Requester ID:', menteeId);
        console.log('📝 Token value being saved:', mentee.tokens);
        console.log('📝 Requester document keys:', Object.keys(mentee));
        
        const savedDoc = await requesterContainer.item(menteeId, menteeId).replace(mentee);
        console.log('✅ Requester document updated successfully');
        console.log('✅ Saved token value:', savedDoc.resource?.tokens);

        console.log('Meeting request created successfully:', meetingId);
        console.log('New token balance for requester:', mentee.tokens);
        return NextResponse.json({ 
            success: true, 
            meetingId, 
            message: 'Meeting request created successfully',
            meeting: newMeetingForMentee,
            newTokenBalance: mentee.tokens
        }, { status: 201 });

    } catch (error) {
        console.error('Failed to create meeting request', error);
        return NextResponse.json({ 
            message: 'Failed to create meeting request', 
            error: (error as Error).message 
        }, { status: 500 });
    }
}

// REMOVED THE PATCH METHOD FROM HERE - IT'S NOW ONLY IN /schedule/[meetingId]/route.ts
