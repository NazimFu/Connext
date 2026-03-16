/**
 * Google Form configuration and utilities for feedback collection
 */

export const GOOGLE_FORM_CONFIG = {
  baseUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdVEs5LL2tLlH5yshUYpPW5XhNlB9_rtV5-PkE6438qpqJg5g/viewform',
  entryIds: {
    menteeName: 'entry.1761271270',
    mentorName: 'entry.768740967',
    sessionDate: 'entry.1198034537',
    sessionTime: 'entry.183080322'
  }
};

interface FeedbackFormParams {
  menteeName: string;
  mentorName: string;
  sessionDate: string; // Format: YYYY-MM-DD
  sessionTime: string; // Format: HH:MM
}

/**
 * Generate a pre-filled Google Form URL with session details
 */
export function generateFeedbackFormUrl({
  menteeName,
  mentorName,
  sessionDate,
  sessionTime
}: FeedbackFormParams): string {
  const params = new URLSearchParams({
    'usp': 'pp_url',
    [GOOGLE_FORM_CONFIG.entryIds.menteeName]: menteeName,
    [GOOGLE_FORM_CONFIG.entryIds.mentorName]: mentorName,
    [GOOGLE_FORM_CONFIG.entryIds.sessionDate]: sessionDate,
    [GOOGLE_FORM_CONFIG.entryIds.sessionTime]: sessionTime
  });

  return `${GOOGLE_FORM_CONFIG.baseUrl}?${params.toString()}`;
}
