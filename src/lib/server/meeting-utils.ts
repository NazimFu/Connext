import { database } from '@/lib/cosmos';
import type { Mentor, Mentee, Scheduling } from '@/lib/types';

export type MeetingLookupResult = {
  mentor: Mentor | null;
  mentorScheduleIndex: number;
  mentee: Mentee | null;
  menteeScheduleIndex: number;
  meeting: Scheduling | null;
  menteeIsInMentorContainer?: boolean; // Track if "mentee" is actually a mentor acting as mentee
};

export const findScheduleIndex = (
  scheduling: Scheduling[] | undefined,
  meetingId: string
): number => {
  if (!scheduling) {
    return -1;
  }
  return scheduling.findIndex((s) => s.meetingId === meetingId);
};

export async function locateMeeting(meetingId: string): Promise<MeetingLookupResult | null> {
  const trimmedId = meetingId.trim();

  if (!trimmedId) {
    return null;
  }

  console.log('🔍 locateMeeting called for:', trimmedId);

  const mentorContainer = database.container('mentor');
  const menteeContainer = database.container('mentee');

  let mentor: Mentor | null = null;
  let mentorScheduleIndex = -1;
  let mentee: Mentee | null = null;
  let menteeScheduleIndex = -1;
  let meeting: Scheduling | null = null;
  let menteeIsInMentorContainer = false; // Track which container the mentee/requester is in

  try {
    const mentorQuery = {
      query: 'SELECT * FROM c WHERE EXISTS (SELECT VALUE s FROM s IN c.scheduling WHERE s.meetingId = @meetingId)',
      parameters: [{ name: '@meetingId', value: trimmedId }],
    };

    const { resources: mentorDocs } = await mentorContainer.items
      .query<Mentor>(mentorQuery)
      .fetchAll();

    console.log('📊 Mentor query results:', mentorDocs.length, 'documents found');

    if (mentorDocs.length > 0) {
      mentor = mentorDocs[0];
      mentorScheduleIndex = findScheduleIndex(mentor.scheduling, trimmedId);
      meeting = mentor.scheduling?.[mentorScheduleIndex] ?? null;
      console.log('✅ Found meeting in mentor container:', {
        mentorId: mentor.id,
        mentorScheduleIndex,
        hasMeeting: !!meeting,
      });
    }

    if (!meeting) {
      const menteeQuery = {
        query: 'SELECT * FROM c WHERE EXISTS (SELECT VALUE s FROM s IN c.scheduling WHERE s.meetingId = @meetingId)',
        parameters: [{ name: '@meetingId', value: trimmedId }],
      };

      const { resources: menteeDocs } = await menteeContainer.items
        .query<Mentee>(menteeQuery)
        .fetchAll();

      console.log('📊 Mentee query results:', menteeDocs.length, 'documents found');

      if (menteeDocs.length > 0) {
        mentee = menteeDocs[0];
        menteeScheduleIndex = findScheduleIndex(mentee.scheduling, trimmedId);
        meeting = mentee.scheduling?.[menteeScheduleIndex] ?? null;
        console.log('✅ Found meeting in mentee container:', {
          menteeId: mentee.id,
          menteeScheduleIndex,
          hasMeeting: !!meeting,
        });
      }
    }

    if (!meeting) {
      console.log('❌ Meeting not found in either container:', trimmedId);
      return null;
    }

    console.log('📋 Meeting details:', {
      meetingId: meeting.meetingId,
      mentorUID: meeting.mentorUID,
      menteeUID: meeting.menteeUID,
      decision: meeting.decision,
      scheduled_status: meeting.scheduled_status,
    });

    if (meeting?.menteeUID && !mentee) {
      console.log('🔄 Attempting to load mentee/requester:', meeting.menteeUID);
      
      // Strip the 'mentee_' prefix if present to get the actual user ID
      const actualMenteeUID = meeting.menteeUID.replace(/^mentee_/, '');
      console.log('🔧 Stripped menteeUID:', { original: meeting.menteeUID, stripped: actualMenteeUID });
      
      try {
        // Try mentee container first
        const { resource: menteeDoc } = await menteeContainer
          .item(actualMenteeUID, actualMenteeUID)
          .read<Mentee>();

        if (menteeDoc) {
          mentee = menteeDoc;
          menteeScheduleIndex = findScheduleIndex(menteeDoc.scheduling, trimmedId);
          console.log('✅ Loaded requester from mentee container:', menteeDoc.id);
        } else {
          console.log('⚠️ Mentee document not found (returned undefined), trying mentor container...');
        }
      } catch (error: any) {
        console.log('❌ Error reading from mentee container:', {
          actualMenteeUID,
          errorCode: error.code,
          errorMessage: error.message,
          fullError: JSON.stringify(error, null, 2)
        });
      }
      
      // If not found in mentee container (either undefined or error), try mentor container
      if (!mentee) {
        console.log('🔄 Not in mentee container, trying mentor container...');
        try {
          const { resource: mentorAsRequestor } = await mentorContainer
            .item(actualMenteeUID, actualMenteeUID)
            .read<Mentor>();

          if (mentorAsRequestor) {
            // Store as "mentee" even though it's a mentor (for consistency)
            mentee = mentorAsRequestor as any;
            menteeScheduleIndex = findScheduleIndex(mentorAsRequestor.scheduling, trimmedId);
            menteeIsInMentorContainer = true; // Mark that this mentee is in mentor container
            console.log('✅ Found mentor acting as mentee:', {
              mentorUID: actualMenteeUID,
              mentorId: mentorAsRequestor.id,
            });
          } else {
            console.log('⚠️ Mentor document also not found (returned undefined)');
          }
        } catch (mentorError: any) {
          console.warn('⚠️ Failed to load mentor document (as requester)', {
            meetingId: trimmedId,
            menteeUID: meeting.menteeUID,
            actualMenteeUID,
            errorCode: mentorError.code,
            errorMessage: mentorError.message,
          });
        }
      }
    }

    if (meeting?.mentorUID && !mentor) {
      console.log('🔄 Attempting to load mentor:', meeting.mentorUID);
      try {
        const { resource: mentorDoc } = await mentorContainer
          .item(meeting.mentorUID, meeting.mentorUID)
          .read<Mentor>();

        if (mentorDoc) {
          mentor = mentorDoc;
          mentorScheduleIndex = findScheduleIndex(mentorDoc.scheduling, trimmedId);
          console.log('✅ Loaded mentor:', mentorDoc.id);
        }
      } catch (error) {
        console.warn('⚠️ Failed to load mentor document', {
          meetingId: trimmedId,
          mentorUID: meeting.mentorUID,
          error,
        });
      }
    }
  } catch (error) {
    console.error('❌ locateMeeting failed', { meetingId: trimmedId, error });
    return null;
  }

  console.log('📊 Final lookup result:', {
    hasMentor: !!mentor,
    hasMentee: !!mentee,
    hasMeeting: !!meeting,
    mentorId: mentor?.id,
    menteeId: mentee?.id,
  });

  if (!meeting) {
    return null;
  }

  return {
    mentor,
    mentorScheduleIndex,
    mentee,
    menteeScheduleIndex,
    meeting,
    menteeIsInMentorContainer,
  };
}
