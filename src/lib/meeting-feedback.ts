export type SubmittedResponse = {
  question: string;
  answer: string;
};

export type MeetingFeedbackRecord = {
  source: 'google_form' | 'direct_form';
  submittedAt: string;
  responses: SubmittedResponse[];
};

export const normalizeSubmittedResponse = (value: Partial<SubmittedResponse>): SubmittedResponse => ({
  question: String(value.question ?? '').trim(),
  answer: String(value.answer ?? '').trim(),
});

export const sanitizeSubmittedResponses = (responses: SubmittedResponse[]): SubmittedResponse[] =>
  responses
    .map(normalizeSubmittedResponse)
    .filter((response) => response.question.length > 0);

export const buildMeetingFeedbackRecord = (
  source: MeetingFeedbackRecord['source'],
  responses: SubmittedResponse[],
  submittedAt: string
): MeetingFeedbackRecord => ({
  source,
  submittedAt,
  responses: sanitizeSubmittedResponses(responses),
});

export const buildDirectFeedbackRecord = (
  feedback: string,
  rating: number | null,
  submittedAt: string
): MeetingFeedbackRecord => {
  const responses: SubmittedResponse[] = [];

  if (typeof rating === 'number' && Number.isFinite(rating)) {
    responses.push({
      question: 'Rating',
      answer: String(rating),
    });
  }

  if (feedback.trim().length > 0) {
    responses.push({
      question: 'Feedback',
      answer: feedback.trim(),
    });
  }

  return buildMeetingFeedbackRecord('direct_form', responses, submittedAt);
};

export const isMeetingFeedbackRecord = (value: unknown): value is MeetingFeedbackRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MeetingFeedbackRecord>;
  return (
    (candidate.source === 'google_form' || candidate.source === 'direct_form') &&
    typeof candidate.submittedAt === 'string' &&
    Array.isArray(candidate.responses)
  );
};

export const isGoogleFormFeedbackRecord = (value: unknown): value is MeetingFeedbackRecord =>
  isMeetingFeedbackRecord(value) && value.source === 'google_form';
