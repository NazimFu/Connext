// src/app/api/create-meet/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { CosmosClient } from '@azure/cosmos';
import { getAuthenticatedClient } from '@/lib/google-token-manager';

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});
const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE_ID!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      summary,
      description,
      startTime,
      endTime,
      startDateTime,
      endDateTime,
      attendees,
      mentorId,
      meetingId,
      menteeId,
    } = body;

    const start = startTime || startDateTime;
    const end = endTime || endDateTime;

    if (!summary || !start || !end) {
      return NextResponse.json(
        { message: 'Missing required fields: summary, start time, end time' },
        { status: 400 }
      );
    }

    if (!mentorId || !menteeId) {
      return NextResponse.json(
        { message: 'Missing required fields: mentorId, menteeId' },
        { status: 400 }
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ message: 'Invalid datetime format' }, { status: 400 });
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { message: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // Get the authenticated OAuth2 client (auto-refreshes + persists tokens)
    let oauth2Client: google.auth.OAuth2;
    try {
      oauth2Client = await getAuthenticatedClient();
    } catch (authError: any) {
      const isNotSetup = authError.message?.startsWith('NO_TOKENS_STORED');
      const isExpired = authError.message?.startsWith('REFRESH_TOKEN_EXPIRED');

      return NextResponse.json(
        {
          success: false,
          message: isNotSetup
            ? 'Google Calendar not set up yet. Visit /internal/google-auth to authorize.'
            : isExpired
            ? 'Google authorization expired. Visit /internal/google-auth to re-authorize.'
            : authError.message,
          error: isNotSetup ? 'not_authorized' : isExpired ? 'token_expired' : 'auth_failed',
          setup_url: '/internal/google-auth',
        },
        { status: 401 }
      );
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
      summary: `[CONNEXT] ${summary}`,
      description: `${description || ''}\n\n---\nOrganized by CONNEXT Mentorship Platform`,
      organizer: { displayName: 'CONNEXT', email: process.env.EMAIL_USER },
      start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Kuala_Lumpur' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Kuala_Lumpur' },
      attendees: attendees?.map((email: string) => ({ email })) || [],
      conferenceData: {
        createRequest: {
          requestId: meetingId || `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    const meetLink = response.data.hangoutLink;
    const eventId = response.data.id;

    console.log('Calendar event created:', eventId);

    // Update mentor and mentee documents in parallel
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
    const menteeContainer = database.container('mentee');

    await Promise.all([
      // Update mentor
      (async () => {
        try {
          const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read();
          if (mentor?.scheduling) {
            const idx = mentor.scheduling.findIndex((m: any) => m.meetingId === meetingId);
            if (idx >= 0) {
              mentor.scheduling[idx].googleMeetUrl = meetLink;
              mentor.scheduling[idx].meetingLink = meetLink;
              mentor.scheduling[idx].eventId = eventId;
              mentor.scheduling[idx].updated_at = new Date().toISOString();
              await mentorContainer.item(mentorId, mentorId).replace(mentor);
            }
          }
        } catch (e) {
          console.error('Error updating mentor:', e);
        }
      })(),

      // Update mentee (or mentor acting as mentee)
      (async () => {
        try {
          const { resources } = await menteeContainer.items
            .query({
              query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id',
              parameters: [{ name: '@id', value: menteeId }],
            })
            .fetchAll();

          if (resources?.length > 0) {
            const mentee = resources[0];
            const pk = mentee.menteeUID || mentee.id;
            const idx = mentee.scheduling?.findIndex((m: any) => m.meetingId === meetingId);
            if (idx >= 0) {
              mentee.scheduling[idx].googleMeetUrl = meetLink;
              mentee.scheduling[idx].meetingLink = meetLink;
              mentee.scheduling[idx].eventId = eventId;
              mentee.scheduling[idx].updated_at = new Date().toISOString();
              await menteeContainer.item(mentee.id, pk).replace(mentee);
            }
          } else {
            // Mentor acting as mentee
            const { resources: mentors } = await mentorContainer.items
              .query({
                query: 'SELECT * FROM c WHERE c.mentee_id = @id',
                parameters: [{ name: '@id', value: menteeId }],
              })
              .fetchAll();
            if (mentors?.length > 0) {
              const m = mentors[0];
              const idx = m.scheduling?.findIndex((s: any) => s.meetingId === meetingId);
              if (idx >= 0) {
                m.scheduling[idx].googleMeetUrl = meetLink;
                m.scheduling[idx].meetingLink = meetLink;
                m.scheduling[idx].eventId = eventId;
                m.scheduling[idx].updated_at = new Date().toISOString();
                await mentorContainer.item(m.id, m.id).replace(m);
              }
            }
          }
        } catch (e) {
          console.error('Error updating mentee:', e);
        }
      })(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Google Meet created successfully',
      meetLink,
      eventId,
      htmlLink: response.data.htmlLink,
      event: {
        id: eventId,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end,
        hangoutLink: meetLink,
      },
    });
  } catch (error: any) {
    console.error('Failed to create Google Meet:', error);

    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Google authorization expired. Visit /internal/google-auth to re-authorize.',
          error: 'invalid_grant',
          setup_url: '/internal/google-auth',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to create Google Meet', error: error.message },
      { status: 500 }
    );
  }
}