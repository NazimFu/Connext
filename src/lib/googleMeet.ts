import { google } from 'googleapis';

/**
 * Creates a Google Calendar event with a Google Meet link and returns the Meet URL + eventId.
 * Uses OAuth2 refresh token to act as the configured Google account (EMAIL_USER).
 */
export async function createGoogleMeetMeeting(params: {
  summary: string;
  description?: string;
  startISO: string; // ISO datetime string
  endISO: string;   // ISO datetime string
  attendees?: string[]; // list of emails
  timeZone?: string; // e.g., 'UTC' | 'Asia/Kuala_Lumpur'
}): Promise<{ meetLink: string; eventId: string }> {
  const {
    summary,
    description = '',
    startISO,
    endISO,
    attendees = [],
    timeZone = 'UTC',
  } = params;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN)');
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const requestId = `meet_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const insertRes = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO, timeZone },
      end: { dateTime: endISO, timeZone },
      attendees: attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const data = insertRes.data;
  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
    '';

  if (!meetLink) {
    throw new Error('Failed to create Google Meet link (hangoutLink not returned)');
  }

  return { meetLink, eventId: data.id as string };
}