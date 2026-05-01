// src/lib/client/get-feedback-url.ts
//
// Client-side helper: returns a working feedbackFormUrl for a given meeting.
// If the URL is already on the task object it's returned immediately.
// Otherwise it calls the on-demand generation endpoint, which also persists the
// URL to the database so future loads find it without hitting the endpoint again.

export async function getFeedbackUrl(params: {
  meetingId: string;
  userId: string;
  existingUrl?: string | null;
}): Promise<{ url: string; fromCache: boolean } | { error: string; availableAt?: string }> {
  const { meetingId, userId, existingUrl } = params;

  // Fast path: URL already known
  if (existingUrl) {
    return { url: existingUrl, fromCache: true };
  }

  // Slow path: ask the server to generate + persist it
  try {
    const res = await fetch('/api/meetings/ensure-feedback-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, userId }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.error || 'Failed to get feedback link', availableAt: data.availableAt };
    }

    return { url: data.feedbackFormUrl, fromCache: data.cached ?? false };
  } catch (err: any) {
    return { error: err.message || 'Network error' };
  }
}