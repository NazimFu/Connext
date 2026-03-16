import { createEvents, DateArray, EventAttributes } from 'ics';

interface CalendarEventParams {
  meetingId: string;
  mentorEmail: string;
  menteeEmail: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  googleMeetUrl: string;
}

export async function createCalendarEvent({
  meetingId,
  mentorEmail,
  menteeEmail,
  startTime,
  endTime,
  googleMeetUrl,
}: CalendarEventParams): Promise<string> {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Convert to DateArray format required by ics
  const startArray: DateArray = [
    start.getFullYear(),
    start.getMonth() + 1,
    start.getDate(),
    start.getHours(),
    start.getMinutes(),
  ];

  const endArray: DateArray = [
    end.getFullYear(),
    end.getMonth() + 1,
    end.getDate(),
    end.getHours(),
    end.getMinutes(),
  ];

  const event: EventAttributes = {
    start: startArray,
    end: endArray,
    title: 'Mentoring Session',
    description: `Join the meeting: ${googleMeetUrl}`,
    location: googleMeetUrl,
    url: googleMeetUrl,
    attendees: [
      {
        name: 'Mentor',
        email: mentorEmail,
        rsvp: true,
        partstat: 'ACCEPTED',
        role: 'REQ-PARTICIPANT',
      },
      {
        name: 'Mentee',
        email: menteeEmail,
        rsvp: true,
        partstat: 'ACCEPTED',
        role: 'REQ-PARTICIPANT',
      },
    ],
    organizer: {
      name: 'Luminiktyo Admin',
      email: process.env.EMAIL_USER || 'admin@luminiktyo.com',
    },
    productId: 'luminiktyo/ics',
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
  };

  return new Promise((resolve, reject) => {
    createEvents([event], (error: Error | undefined, value: string) => {
      if (error) {
        reject(error);
      }
      resolve(value);
    });
  });
}