'use client';

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle2, Clock, Loader2, MessageSquare, User, XCircle } from "lucide-react";

export const dynamic = 'force-dynamic';

type MeetingDetails = {
  meetingId: string;
  date: string;
  time: string;
  message: string;
  decision: string;
  menteeName: string;
  menteeEmail: string;
  mentorName: string;
  timezone: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'already-resolved'; decision: string }
  | { status: 'ready'; meeting: MeetingDetails };

function RespondPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const intent = searchParams.get('intent') === 'decline' ? 'decline' : 'accept';

  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState<'accepted' | 'declined' | null>(null);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);
  const [submitError, setSubmitError] = useState('');

  const loadDetails = useCallback(async () => {
    if (!token) {
      setLoadState({ status: 'error', message: 'This link is missing its token and cannot be used.' });
      return;
    }
    try {
      const res = await fetch(`/api/meeting-requests/respond?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoadState({ status: 'error', message: data.reason || 'This link is no longer valid.' });
        return;
      }
      if (data.meeting.decision !== 'pending') {
        setLoadState({ status: 'already-resolved', decision: data.meeting.decision });
        return;
      }
      setLoadState({ status: 'ready', meeting: data.meeting });
    } catch {
      setLoadState({ status: 'error', message: 'Failed to load this request. Please try again.' });
    }
  }, [token]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const respond = async (decision: 'accepted' | 'declined') => {
    setSubmitting(decision);
    setSubmitError('');
    try {
      const res = await fetch('/api/meeting-requests/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.reason || 'Failed to submit your response. Please try again.');
        return;
      }
      setResult(decision);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40 py-12 px-4">
      <Card className="w-full max-w-md border-yellow-100/50 shadow-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto">
            <Link href="/">
              <img src="/name.jpg" alt="Connext" className="h-12 w-auto mx-auto cursor-pointer rounded-xl" />
            </Link>
          </div>
          <CardTitle className="text-2xl font-headline text-gray-900">Meeting Request</CardTitle>
          <CardDescription className="text-gray-600">
            Respond to this mentorship meeting request
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {loadState.status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading request details...</p>
            </div>
          )}

          {loadState.status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-sm text-red-800">{loadState.message}</p>
            </div>
          )}

          {loadState.status === 'already-resolved' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <p className="text-sm text-amber-800">
                This request has already been {loadState.decision === 'accepted' ? 'accepted' : 'declined'}. No further action is needed.
              </p>
            </div>
          )}

          {loadState.status === 'ready' && result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-800 font-medium">
                {result === 'accepted'
                  ? '✅ Request accepted — a Google Meet invite is on its way.'
                  : '✅ Request declined. The mentee has been notified.'}
              </p>
            </div>
          )}

          {loadState.status === 'ready' && !result && (
            <>
              <div className="bg-yellow-50/60 border border-yellow-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-gray-800 text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  <span><strong>{loadState.meeting.menteeName}</strong> ({loadState.meeting.menteeEmail})</span>
                </div>
                <div className="flex items-center gap-2 text-gray-800 text-sm">
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                  <span>{loadState.meeting.date}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-800 text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>{loadState.meeting.time} ({loadState.meeting.timezone})</span>
                </div>
                {loadState.meeting.message && (
                  <div className="flex items-start gap-2 text-gray-800 text-sm">
                    <MessageSquare className="h-4 w-4 text-gray-400 mt-0.5" />
                    <span>{loadState.meeting.message}</span>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-sm text-red-800">{submitError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => respond('accepted')}
                  disabled={submitting !== null}
                  className={`bg-green-600 hover:bg-green-700 shadow-md ${intent === 'accept' ? 'ring-2 ring-green-300' : ''}`}
                >
                  {submitting === 'accepted' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Accept
                </Button>
                <Button
                  onClick={() => respond('declined')}
                  disabled={submitting !== null}
                  variant="outline"
                  className={`border-red-300 text-red-600 hover:bg-red-50 ${intent === 'decline' ? 'ring-2 ring-red-200' : ''}`}
                >
                  {submitting === 'declined' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Decline
                </Button>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-center">
          <Link href="/login" className="text-sm text-gray-600 hover:text-amber-600 underline">
            Go to dashboard instead
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function MentorRespondPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    }>
      <RespondPageInner />
    </Suspense>
  );
}
