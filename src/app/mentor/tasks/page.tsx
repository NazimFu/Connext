'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Calendar as CalendarIcon, Clock, List, Calendar, ChevronLeft, ChevronRight, Video, ShieldAlert, User, Mail, AlertCircle, FileText, ExternalLink, MessageSquare, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRequireAuth } from '@/hooks/use-auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { convertMeetingTime, DEFAULT_TIMEZONE } from '@/lib/timezone';
import { getFeedbackUrl } from '@/lib/client/get-feedback-url';

interface MeetingRequest {
  meetingId: string;
  menteeUID: string;
  mentorUID: string;
  date: string;
  time: string;
  decision: 'pending' | 'accepted' | 'rejected';
  scheduled_status: string;
  report_status: string;
  cancel_info: any;
  mentee_name: string;
  mentee_email: string;
  mentor_name: string;
  mentor_email: string;
  message: string;
  meetingLink?: string;
  googleMeetUrl?: string;
  feedbackFormSent?: boolean;
  feedbackFormUrl?: string;
  mentor_report?: { status: string; reason: string | null; filed_at: string | null } | null;
  report_reviewed_at?: string | null;
}

interface TaskItem {
  id: string;
  type: 'meeting' | 'in_progress_meeting' | 'past_meeting' | 'pending_request' | 'feedback';
  title: string;
  description: string;
  date: string;
  time: string;
  meetingId: string;
  menteeName: string;
  menteeEmail: string;
  mentorName?: string;
  mentorEmail?: string;
  menteeUID?: string;
  mentorUID?: string;
  message?: string;
  meetingLink?: string;
  googleMeetUrl?: string;
  hoursRemaining?: number;
  meetingUtcMs?: number;
  mentorReport?: { status: string; reason: string | null; filed_at: string | null } | null;
  reportStatus?: string;
  reportReviewedAt?: string | null;
  userRole?: 'mentor' | 'mentee';
  feedbackFormUrl?: string;
  feedbackFormSent?: boolean;
  daysRemaining?: number;
  displayDate?: string;
  displayTime?: string;
  tzLabel?: string;
}

interface CalendarDay {
  date: Date;
  dateString: string;
  tasks: TaskItem[];
  isCurrentMonth: boolean;
}

export default function MentorTasksPage() {
  const { user, isLoading: authLoading } = useRequireAuth('mentor');
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedMeetingToReport, setSelectedMeetingToReport] = useState<TaskItem | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [menteeDetails, setMenteeDetails] = useState<any>(null);
  const [loadingMenteeDetails, setLoadingMenteeDetails] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<TaskItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({});

  const userTz = (user as any)?.timezone || DEFAULT_TIMEZONE;
  const isNonDefaultTz = userTz !== DEFAULT_TIMEZONE;

  const fetchMeetingRequests = useCallback(async () => {
    if (!user) return;
    try {
      const ts = new Date().getTime();
      const [mentorRes, menteeRes] = await Promise.all([
        fetch(`/api/meeting-requests?mentorId=${user.id}&_t=${ts}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
        fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${ts}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
      ]);
      const mentorRequests: MeetingRequest[] = mentorRes.ok ? await mentorRes.json() : [];
      const menteeRequests: MeetingRequest[] = menteeRes.ok ? await menteeRes.json() : [];
      const allRequests = [...mentorRequests, ...menteeRequests];

      const taskItems: TaskItem[] = [];
      const now = new Date();

      allRequests.forEach((request) => {
        const ns = String(request.scheduled_status || '').trim().toLowerCase();
        if (ns === 'cancelled' || ns === 'canceled') return;
        const nd = request.decision === 'declined' ? 'rejected' : request.decision;
        if (nd === 'rejected') return;

        const converted = convertMeetingTime(request.date, request.time, userTz);
        const meetingUtcMs = converted.utcDate.getTime();
        const twoHoursAfterMs = meetingUtcMs + 2 * 60 * 60 * 1000;
        const nowMs = now.getTime();

        const userIsMentor = request.mentorUID === user.id;
        const displayName = userIsMentor ? request.mentee_name : request.mentor_name;
        const displayEmail = userIsMentor ? request.mentee_email : request.mentor_email;

        const baseTask = {
          date: request.date,
          time: request.time,
          meetingId: request.meetingId,
          menteeName: displayName,
          menteeEmail: displayEmail,
          mentorName: request.mentor_name,
          mentorEmail: request.mentor_email,
          menteeUID: request.menteeUID,
          mentorUID: request.mentorUID,
          message: request.message,
          meetingLink: request.meetingLink,
          googleMeetUrl: request.googleMeetUrl,
          userRole: (userIsMentor ? 'mentor' : 'mentee') as 'mentor' | 'mentee',
          displayDate: converted.displayDateFull,
          displayTime: converted.displayTime,
          tzLabel: converted.tzLabel,
          meetingUtcMs,
        };

        const titleDateTime = `${converted.displayDateFull} at ${converted.displayTime}`;

        if (nd === 'pending' && request.scheduled_status === 'pending') {
          taskItems.push({
            ...baseTask, id: `pending-${request.meetingId}`, type: 'pending_request',
            title: titleDateTime,
            description: userIsMentor ? `Meeting request from ${request.mentee_name}` : `Request sent to ${request.mentor_name}`,
          });
        }

        if (nd === 'accepted' && request.scheduled_status === 'upcoming' && nowMs < meetingUtcMs) {
          taskItems.push({
            ...baseTask, id: `meeting-${request.meetingId}`, type: 'meeting',
            title: titleDateTime,
            description: `Scheduled meeting at ${converted.displayTime}`,
            hoursRemaining: Math.floor((meetingUtcMs - nowMs) / 3600000),
          });
        }

        if (nd === 'accepted' && request.scheduled_status === 'upcoming' && nowMs >= meetingUtcMs && nowMs < twoHoursAfterMs) {
          taskItems.push({
            ...baseTask, id: `inprogress-${request.meetingId}`, type: 'in_progress_meeting',
            title: titleDateTime, description: 'Meeting in progress',
          });
        }

        if (nd === 'accepted' && nowMs >= twoHoursAfterMs) {
          taskItems.push({
            ...baseTask, id: `past-meeting-${request.meetingId}`, type: 'past_meeting',
            title: titleDateTime,
            description: `Meeting held on ${converted.displayDate}`,
            mentorReport: request.mentor_report,
            reportStatus: request.report_status,
            reportReviewedAt: request.report_reviewed_at ?? null,
            feedbackFormUrl: request.feedbackFormUrl,
            feedbackFormSent: request.feedbackFormSent,
          });

          if (!userIsMentor && !request.feedbackFormSent) {
            taskItems.push({
              ...baseTask, id: `feedback-${request.meetingId}`, type: 'feedback',
              title: titleDateTime,
              description: `Feedback needed for meeting with ${request.mentor_name}`,
              feedbackFormUrl: request.feedbackFormUrl,
            });
          }
        }
      });

      const order: Record<string, number> = { pending_request: 0, feedback: 1, in_progress_meeting: 2, meeting: 3, past_meeting: 4 };
      taskItems.sort((a, b) => {
        const ao = order[a.type] ?? 5, bo = order[b.type] ?? 5;
        if (ao !== bo) return ao - bo;
        if (a.type === 'meeting') return (a.hoursRemaining || 0) - (b.hoursRemaining || 0);
        if (a.type === 'past_meeting') return (b.meetingUtcMs || 0) - (a.meetingUtcMs || 0);
        return 0;
      });

      setTasks(taskItems);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch tasks.' });
    } finally {
      setLoading(false);
    }
  }, [user, toast, userTz]);

  useEffect(() => { if (user) fetchMeetingRequests(); }, [user, fetchMeetingRequests]);

  const fetchMenteeDetails = useCallback(async (menteeUID: string) => {
    if (!menteeUID) return;
    setLoadingMenteeDetails(true);
    try {
      const r = await fetch(`/api/users/${menteeUID}`);
      if (r.ok) setMenteeDetails(await r.json());
    } catch { /* silent */ }
    finally { setLoadingMenteeDetails(false); }
  }, []);

  const handleTaskClick = (task: TaskItem) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
    setMenteeDetails(null);
    if (task.menteeUID && user?.role === 'mentor' && task.userRole === 'mentor') {
      fetchMenteeDetails(task.menteeUID);
    }
  };

  const handleAcceptRequest = async (meetingId: string) => {
    if (!selectedTask || !user) return;
    setIsAccepting(meetingId);
    setActionLoading(true);
    try {
      const r = await fetch('/api/meeting-requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: user.id, meetingId, decision: 'accepted' }),
      });
      if (!r.ok) throw new Error((await r.json()).message || 'Failed to accept');

      try {
        const [y, mo, d] = selectedTask.date.split('-').map(Number);
        let h = 0, m = 0;
        if (selectedTask.time.includes('AM') || selectedTask.time.includes('PM')) {
          const [t, p] = selectedTask.time.split(' ');
          const [hh, mm] = t.split(':').map(Number);
          h = p === 'PM' && hh !== 12 ? hh + 12 : p === 'AM' && hh === 12 ? 0 : hh; m = mm;
        } else { [h, m] = selectedTask.time.split(':').map(Number); }
        const start = new Date(y, mo - 1, d, h, m, 0, 0);
        const end = new Date(start.getTime() + 3600000);
        await fetch('/api/create-meet', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `Mentorship Session with ${selectedTask.menteeName}`,
            description: `Message: ${selectedTask.message || 'No message'}`,
            startDateTime: start.toISOString(), endDateTime: end.toISOString(),
            attendees: [selectedTask.menteeEmail, user.email].filter(Boolean),
            mentorId: user.id, meetingId, menteeId: selectedTask.menteeUID,
          }),
        });
      } catch { /* meet creation failure is non-fatal */ }

      toast({ title: 'Meeting Accepted ✅', description: `Google Meet link created and sent to ${selectedTask.menteeName}` });
      setIsDialogOpen(false);
      await new Promise(r => setTimeout(r, 1000));
      await fetchMeetingRequests();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsAccepting(null);
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedTask) return;
    setActionLoading(true);
    try {
      const r = await fetch('/api/meeting-requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: user?.id, meetingId: selectedTask.meetingId, decision: 'rejected' }),
      });
      if (!r.ok) throw new Error('Failed to reject');
      toast({ title: 'Success', description: 'Meeting request rejected.' });
      setIsDialogOpen(false);
      await fetchMeetingRequests();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to reject meeting.' });
    } finally { setActionLoading(false); }
  };

  const handleJoinMeeting = () => {
    const meetingUrl = selectedTask?.googleMeetUrl || selectedTask?.meetingLink;
    if (meetingUrl) {
      window.open(meetingUrl, '_blank', 'noopener,noreferrer');
      setIsDialogOpen(false);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Meeting link not available. Please contact support.' });
    }
  };

  // FIX: This is now a proper async function that takes a task parameter.
  // It must NOT be called as handleOpenFeedbackForm(task) directly inside JSX onClick,
  // because that invokes it immediately and passes the Promise as the handler.
  // Always wrap in a lambda: onClick={() => handleOpenFeedbackForm(task)}
  const handleOpenFeedbackForm = async (task: TaskItem) => {
    if (!task || !user?.id) return;

    setFeedbackLoading(prev => ({ ...prev, [task.meetingId]: true }));
    try {
      const result = await getFeedbackUrl({
        meetingId: task.meetingId,
        userId: user.id,
        existingUrl: task.feedbackFormUrl,
      });

      if ('error' in result) {
        toast({ variant: 'destructive', title: 'Feedback link unavailable', description: result.error });
        return;
      }

      // Cache URL in local state so re-clicks are instant
      setTasks(prev =>
        prev.map(t => t.meetingId === task.meetingId ? { ...t, feedbackFormUrl: result.url } : t)
      );
      if (selectedTask?.meetingId === task.meetingId) {
        setSelectedTask(prev => prev ? { ...prev, feedbackFormUrl: result.url } : prev);
      }

      toast({ title: 'Feedback Form Opened', description: 'The button will disappear only after you submit.' });
      window.open(result.url, '_blank', 'noopener,noreferrer');
      setIsDialogOpen(false);
      setTimeout(() => fetchMeetingRequests(), 1500);
    } finally {
      setFeedbackLoading(prev => ({ ...prev, [task.meetingId]: false }));
    }
  };

  const openReportDialog = (meeting: TaskItem) => {
    setIsDialogOpen(false);
    setSelectedMeetingToReport(meeting);
    setReportReason('');
    setReportDialogOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!selectedMeetingToReport || !user || reportReason.trim().length < 10) {
      toast({ variant: 'destructive', title: 'More details needed', description: 'Provide at least 10 characters.' });
      return;
    }
    setIsReporting(true);
    try {
      const r = await fetch(`/api/schedule/${selectedMeetingToReport.meetingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', reporterRole: selectedMeetingToReport.userRole === 'mentee' ? 'mentee' : 'mentor', reporterId: user.id, reason: reportReason.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || 'Failed to submit report.');
      toast({ title: 'Report submitted', description: "We'll review it shortly." });
      setReportDialogOpen(false);
      setSelectedMeetingToReport(null);
      setReportReason('');
      await fetchMeetingRequests();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Report failed', description: (error as Error).message });
    } finally { setIsReporting(false); }
  };

  const handleCancelMeeting = async () => {
    if (!meetingToCancel || !user || !cancelReason.trim()) {
      toast({ variant: 'destructive', title: 'Reason Required', description: 'Please provide a reason.' });
      return;
    }
    setIsCancelling(true);
    try {
      const r = await fetch(`/api/schedule/${meetingToCancel.meetingId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason, cancelledBy: user.id }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({ message: 'Unknown' }))).message);
      const result = await r.json();
      toast({ title: 'Meeting Cancelled', description: result.tokenStatus === 'auto-replenished' ? 'Token refunded to requester.' : 'Token refund pending admin approval.' });
      setCancelDialogOpen(false);
      setMeetingToCancel(null);
      setCancelReason('');
      await fetchMeetingRequests();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally { setIsCancelling(false); }
  };

  const isJoinEnabled = (task: TaskItem) => {
    if (!task.meetingUtcMs) return false;
    const now = Date.now();
    return now >= task.meetingUtcMs - 10 * 60 * 1000 && now < task.meetingUtcMs + 60 * 60 * 1000;
  };

  const getTaskBadgeColor = (type: string) => ({
    pending_request: 'bg-yellow-500 hover:bg-yellow-600',
    meeting: 'bg-green-500 hover:bg-green-600',
    in_progress_meeting: 'bg-blue-500 hover:bg-blue-600',
    past_meeting: 'bg-red-500 hover:bg-red-600',
    feedback: 'bg-orange-500 hover:bg-orange-600',
  }[type] || 'bg-gray-500');

  const getTaskLabel = (type: string) => ({
    pending_request: 'Pending',
    meeting: 'Upcoming Meetings',
    in_progress_meeting: 'Meeting In Progress',
    past_meeting: 'Completed Meetings',
    feedback: 'Feedback Due',
  }[type] || 'Task');

  const getTaskIcon = (type: string) => ({
    pending_request: <Clock className="w-5 h-5 text-yellow-600" />,
    meeting: <Video className="w-5 h-5 text-blue-600" />,
    in_progress_meeting: <Video className="w-5 h-5 text-blue-600" />,
    past_meeting: <CheckSquare className="w-5 h-5 text-gray-600" />,
    feedback: <MessageSquare className="w-5 h-5 text-orange-600" />,
  }[type] || <CheckSquare className="w-5 h-5 text-gray-600" />);

  const getDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    return { day: d.getDate(), month: d.toLocaleDateString('en-US', { month: 'short' }) };
  };

  const getDaysInMonth = (date: Date): CalendarDay[] => {
    const year = date.getFullYear(), month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: CalendarDay[] = [];
    for (let i = firstDay.getDay() - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, new Date(year, month, 0).getDate() - i);
      days.push({ date: d, dateString: d.toISOString().split('T')[0], tasks: [], isCurrentMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ date: d, dateString: ds, tasks: tasks.filter(t => t.date === ds && ['meeting', 'pending_request', 'past_meeting'].includes(t.type)), isCurrentMonth: true });
    }
    const rem = 42 - days.length;
    for (let i = 1; i <= rem; i++) { const d = new Date(year, month + 1, i); days.push({ date: d, dateString: d.toISOString().split('T')[0], tasks: [], isCurrentMonth: false }); }
    return days;
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-center"><Loader2 className="h-10 w-10 animate-spin text-yellow-500 mx-auto mb-3" /><p className="text-gray-600 text-sm">Loading tasks...</p></div>
      </div>
    );
  }

  const calendarDays = getDaysInMonth(currentDate);
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pendingCount = tasks.filter(t => t.type === 'pending_request').length;
  const upcomingCount = tasks.filter(t => t.type === 'meeting').length;
  const feedbackCount = tasks.filter(t => t.type === 'feedback').length;
  const completedCount = tasks.filter(t => t.type === 'past_meeting').length;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg flex items-center justify-between">
            <span>Your Tasks</span>
            <button onClick={() => { setLoading(true); fetchMeetingRequests(); }} aria-label="Refresh"
              className="h-9 w-20 rounded-md bg-white border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="p-6">

            {isNonDefaultTz && (
              <div className="mb-4 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm text-teal-800 flex items-center gap-2">
                <span>🌐</span>
                <span>Times shown in your preferred timezone. Go to <strong>My Profile</strong> to change.</span>
              </div>
            )}

            {/* Stats + toolbar */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1">
                {[
                  { key: 'pending', label: 'Pending Requests', value: pendingCount, Icon: Clock, accent: 'bg-yellow-400' },
                  { key: 'upcoming', label: 'Upcoming Meetings', value: upcomingCount, Icon: Video, accent: 'bg-blue-400' },
                  { key: 'feedback', label: 'Feedback Due', value: feedbackCount, Icon: MessageSquare, accent: 'bg-purple-400' },
                  { key: 'completed', label: 'Completed Meetings', value: completedCount, Icon: CheckSquare, accent: 'bg-green-400' },
                ].map(({ key, label, value, Icon, accent }) => (
                  <div key={key} className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                    <div className={`${accent} w-1 self-stretch hidden sm:block`} />
                    <div className="flex-1 py-4 px-4 flex items-center justify-between">
                      <div><p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p><div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div></div>
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm"><Icon className="w-5 h-5 text-gray-600" /></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'calendar')}>
                  <TabsList className="bg-white border border-gray-200 shadow-sm h-auto p-0 w-9 flex flex-col items-center space-y-1 overflow-hidden -translate-x-2">
                    <TabsTrigger value="timeline" className="w-full h-10 flex items-center justify-center border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700"><List className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="calendar" className="w-full h-10 flex items-center justify-center border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700"><Calendar className="w-4 h-4" /></TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Timeline */}
            {viewMode === 'timeline' ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                {tasks.length === 0 ? (
                  <div className="border-0 shadow-lg bg-white rounded-xl flex flex-col items-center justify-center py-20">
                    <div className="p-5 bg-green-100 rounded-full mb-5"><CheckSquare className="w-14 h-14 text-green-600" /></div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-2">All caught up!</h3>
                    <p className="text-gray-600 text-center max-w-md">No pending tasks or upcoming meetings.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
                    <AnimatePresence mode="popLayout">
                      {tasks.map((task, index) => {
                        const mentorReportStatus = task.userRole === 'mentor' ? (task.mentorReport?.status ?? task.reportStatus) : undefined;
                        const myReportPending = mentorReportStatus === 'pending' && !task.reportReviewedAt;
                        const myReportResolved = mentorReportStatus === 'resolved';
                        const myReportRejected = mentorReportStatus === 'rejected';
                        const dateInfo = getDateDisplay(task.date);
                        const isLast = index === tasks.length - 1;
                        const displayLabel = task.userRole === 'mentee' ? 'Mentor' : 'Mentee';

                        return (
                          <motion.div key={task.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="relative">
                            <div className="flex gap-6">
                              <div className="flex flex-col items-center pt-1">
                                <div className={`relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-lg flex-shrink-0 ring-4 ring-white transform hover:scale-105 transition-transform duration-200 ${
                                  task.type === 'pending_request' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600'
                                  : task.type === 'meeting' ? 'bg-gradient-to-br from-green-400 to-green-600'
                                  : task.type === 'in_progress_meeting' ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                  : 'bg-gradient-to-br from-gray-400 to-gray-600'
                                }`}>
                                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border-2 border-white">
                                    {getTaskIcon(task.type)}
                                  </div>
                                  <span className="text-2xl font-bold text-white leading-none tracking-tight">{dateInfo.day}</span>
                                  <span className="text-[10px] font-bold text-white uppercase mt-1 tracking-wider opacity-90">{dateInfo.month}</span>
                                </div>
                                {!isLast && (
                                  <div className={`w-1 flex-1 mt-4 rounded-full ${
                                    task.type === 'pending_request' ? 'bg-gradient-to-b from-yellow-200 to-gray-200'
                                    : task.type === 'meeting' ? 'bg-gradient-to-b from-green-200 to-gray-200'
                                    : 'bg-gradient-to-b from-gray-200 to-gray-100'
                                  }`} />
                                )}
                              </div>

                              <div className={`flex-1 ${!isLast ? 'pb-8' : 'pb-2'}`}>
                                <Card className="border-2 border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden bg-white hover:border-gray-400 transform hover:-translate-y-1"
                                  onClick={() => handleTaskClick(task)}>
                                  <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-5">
                                      <Badge className={`${getTaskBadgeColor(task.type)} text-white text-xs px-4 py-1.5 font-semibold shadow-sm flex items-center gap-1.5`}>
                                        {getTaskLabel(task.type)}
                                      </Badge>
                                      {task.type === 'meeting' && task.hoursRemaining !== undefined && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 border-blue-300 text-blue-700 font-medium">
                                          {task.hoursRemaining < 1 ? 'Starting soon' : task.hoursRemaining < 24 ? `${task.hoursRemaining}h left` : `${Math.floor(task.hoursRemaining / 24)}d left`}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="space-y-3.5">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg ring-2 ring-blue-100">
                                          <User className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-500 font-medium mb-0.5">{displayLabel}</p>
                                          <p className="font-bold text-gray-900 text-lg leading-tight">{task.menteeName}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg ring-2 ring-purple-100">
                                          <Clock className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-500 font-medium mb-0.5">
                                            Scheduled Time{isNonDefaultTz && task.tzLabel ? ` (${task.tzLabel})` : ''}
                                          </p>
                                          <p className="font-semibold text-gray-700 text-sm leading-tight">
                                            {task.displayDate} at {task.displayTime}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {(myReportPending || myReportResolved || myReportRejected) && (
                                      <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t-2 border-gray-400">
                                        {myReportPending && <Badge variant="outline" className="border-2 border-yellow-400 text-yellow-700 text-xs font-semibold px-3 py-1 bg-yellow-50"><ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Report Pending Review</Badge>}
                                        {myReportResolved && <Badge variant="outline" className="border-2 border-green-400 text-green-700 text-xs font-semibold px-3 py-1 bg-green-50"><CheckSquare className="w-3.5 h-3.5 mr-1.5" />Report Resolved</Badge>}
                                        {myReportRejected && <Badge variant="outline" className="border-2 border-red-400 text-red-700 text-xs font-semibold px-3 py-1 bg-red-50"><XCircle className="w-3.5 h-3.5 mr-1.5" />Report Rejected</Badge>}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : (
              /* Calendar view */
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <Card className="border-0 shadow-lg bg-white">
                  <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white px-6 py-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">{monthYear}</h2>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="border-gray-500 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="border-gray-500 hover:bg-gray-50 font-medium">Today</Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="border-gray-500 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-7 gap-3 mb-4">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-center font-semibold text-sm text-gray-700 py-3">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                      {calendarDays.map((day, i) => (
                        <div key={i} className={`min-h-28 p-3 rounded-xl border-2 transition-all duration-200 ${day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'} ${day.dateString === new Date().toISOString().split('T')[0] ? 'border-yellow-400 ring-2 ring-yellow-100 shadow-sm' : 'border-gray-400 hover:border-gray-500 hover:shadow-sm'}`}>
                          <div className={`text-sm font-semibold mb-2 ${day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>{day.date.getDate()}</div>
                          <div className="space-y-1.5">
                            {day.tasks.map(task => (
                              <div key={task.id} onClick={() => handleTaskClick(task)}
                                className={`text-xs p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                  task.type === 'pending_request' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200'
                                  : task.type === 'meeting' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-400'
                                }`}>
                                <div className="font-semibold truncate">{task.displayTime || task.time}</div>
                                <div className="truncate opacity-75 text-[11px]">{task.menteeName}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Task details dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogContent className="max-w-xl sm:max-w-2xl">
                <DialogHeader className="space-y-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 bg-gray-100 rounded-xl">{selectedTask && getTaskIcon(selectedTask.type)}</div>
                    <DialogTitle className="text-xl font-semibold">Meeting Details</DialogTitle>
                  </div>
                  <DialogDescription className="text-gray-600 text-base">{selectedTask?.description}</DialogDescription>
                </DialogHeader>

                {selectedTask && (
                  <div className="space-y-5 py-2">
                    <div className="space-y-4 p-5 bg-gray-50 rounded-xl border border-gray-400">
                      {[
                        { Icon: CalendarIcon, label: 'Date', value: selectedTask.displayDate || selectedTask.date },
                        { Icon: Clock, label: `Time${isNonDefaultTz && selectedTask.tzLabel ? ` (${selectedTask.tzLabel})` : ''}`, value: selectedTask.displayTime || selectedTask.time },
                        { Icon: User, label: selectedTask.userRole === 'mentee' ? 'Mentor' : 'Mentee', value: selectedTask.menteeName },
                        { Icon: Mail, label: 'Email', value: selectedTask.menteeEmail, blue: true },
                      ].map(({ Icon, label, value, blue }) => (
                        <div key={label} className="flex items-center gap-3 text-sm">
                          <div className="p-2 bg-white rounded-lg"><Icon className="w-4 h-4 text-gray-600" /></div>
                          <div><span className="text-gray-600 font-medium">{label}:</span><span className={`ml-2 font-semibold ${blue ? 'text-blue-600' : 'text-gray-900'}`}>{value}</span></div>
                        </div>
                      ))}
                    </div>

                    {isNonDefaultTz && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                        🌐 Displayed in your timezone. Stored in Malaysia time (UTC+8).
                      </div>
                    )}

                    {/* Mentee details (for mentor viewing their own request inbox) */}
                    {user?.role === 'mentor' && selectedTask.menteeUID && selectedTask.userRole === 'mentor' && (
                      loadingMenteeDetails ? (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-400 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" /><span className="text-sm text-gray-600">Loading mentee details...</span>
                        </div>
                      ) : menteeDetails && (
                        <div className="p-5 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200">
                          <h3 className="font-semibold text-base text-purple-900 mb-4 flex items-center gap-2"><User className="w-5 h-5" />Mentee Profile</h3>
                          <div className="space-y-3 text-sm">
                            {menteeDetails.mentee_institution && <div className="flex gap-2"><span className="text-purple-700 font-medium min-w-[100px]">Institution:</span><span className="text-purple-900">{menteeDetails.mentee_institution}</span></div>}
                            {menteeDetails.mentee_occupation && <div className="flex gap-2"><span className="text-purple-700 font-medium min-w-[100px]">Occupation:</span><span className="text-purple-900">{menteeDetails.mentee_occupation}</span></div>}
                            {menteeDetails.linkedin && <div className="flex gap-2"><span className="text-purple-700 font-medium min-w-[100px]">LinkedIn:</span><a href={menteeDetails.linkedin.startsWith('http') ? menteeDetails.linkedin : `https://${menteeDetails.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{menteeDetails.linkedin}</a></div>}
                            {menteeDetails.github && <div className="flex gap-2"><span className="text-purple-700 font-medium min-w-[100px]">GitHub:</span><a href={menteeDetails.github.startsWith('http') ? menteeDetails.github : `https://github.com/${menteeDetails.github}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{menteeDetails.github}</a></div>}
                            {menteeDetails.cv_link && menteeDetails.allowCVShare && (
                              <div className="flex gap-2"><span className="text-purple-700 font-medium min-w-[100px]">CV:</span>
                                <button onClick={() => window.open(menteeDetails.cv_link.startsWith('http') ? menteeDetails.cv_link : `/api/attachment-proxy?url=${encodeURIComponent(menteeDetails.cv_link)}`, '_blank')} className="text-blue-600 hover:underline text-left cursor-pointer">View CV</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {selectedTask.message && (
                      <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                        <p className="font-semibold text-sm text-blue-900 mb-2">Message:</p>
                        <p className="text-sm text-blue-800 leading-relaxed">{selectedTask.message}</p>
                      </div>
                    )}

                    {selectedTask.type === 'past_meeting' && selectedTask.userRole === 'mentor' && selectedTask.mentorReport && (
                      <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="w-5 h-5 text-orange-700 mt-0.5" />
                          <div>
                            <p className="font-semibold text-base text-orange-800 mb-1">Report Submitted</p>
                            <p className="text-sm text-orange-700">Status: <span className="font-semibold">{selectedTask.mentorReport.status}</span></p>
                            {selectedTask.mentorReport.reason && <p className="text-sm text-gray-700 mt-2">{selectedTask.mentorReport.reason}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter className="gap-3 mt-2">
                  {selectedTask?.type === 'pending_request' ? (
                    selectedTask.userRole === 'mentor' ? (
                      <>
                        <Button variant="outline" className="flex-1 h-11" onClick={handleRejectRequest} disabled={actionLoading}>
                          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                        </Button>
                        <Button className="flex-1 bg-green-600 hover:bg-green-700 h-11" onClick={() => handleAcceptRequest(selectedTask.meetingId)} disabled={actionLoading}>
                          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 h-11">Close</Button>
                        <Button variant="destructive" onClick={() => { setMeetingToCancel(selectedTask); setCancelReason(''); setCancelDialogOpen(true); setIsDialogOpen(false); }} className="flex-1 h-11">
                          <XCircle className="w-4 h-4 mr-2" /> Cancel Request
                        </Button>
                      </>
                    )
                  ) : selectedTask?.type === 'meeting' ? (
                    <>
                      <Button variant="outline" onClick={() => { setMeetingToCancel(selectedTask); setCancelReason(''); setCancelDialogOpen(true); setIsDialogOpen(false); }} className="flex-1 h-11 border-red-300 hover:bg-red-50 text-red-600">Cancel Meeting</Button>
                      <Button onClick={handleJoinMeeting} className="flex-1 bg-blue-600 hover:bg-blue-700 h-11" disabled={!selectedTask.googleMeetUrl && !selectedTask.meetingLink}>
                        <Video className="w-4 h-4 mr-2" /> Join Meeting
                      </Button>
                    </>
                  ) : selectedTask?.type === 'past_meeting' ? (
                    <>
                      {/* FIX: use arrow function () => handleOpenFeedbackForm(selectedTask) not handleOpenFeedbackForm(selectedTask) */}
                      {selectedTask.userRole === 'mentee' && !selectedTask.feedbackFormSent && (
                        <Button
                          onClick={() => handleOpenFeedbackForm(selectedTask)}
                          disabled={feedbackLoading[selectedTask.meetingId]}
                          className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 h-11"
                        >
                          {feedbackLoading[selectedTask.meetingId]
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                            : <><FileText className="w-4 h-4 mr-2" />Fill Feedback Form<ExternalLink className="w-3 h-3 ml-2" /></>
                          }
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 h-11">Close</Button>
                      {!selectedTask.mentorReport && selectedTask.userRole === 'mentor' && (
                        <Button onClick={() => openReportDialog(selectedTask)} variant="destructive" className="flex-1 h-11">
                          <ShieldAlert className="w-4 h-4 mr-2" /> Report
                        </Button>
                      )}
                    </>
                  ) : selectedTask?.type === 'feedback' ? (
                    <>
                      {/* FIX: use arrow function () => handleOpenFeedbackForm(selectedTask) not handleOpenFeedbackForm(selectedTask) */}
                      <Button
                        onClick={() => handleOpenFeedbackForm(selectedTask)}
                        disabled={feedbackLoading[selectedTask.meetingId]}
                        className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 h-11"
                      >
                        {feedbackLoading[selectedTask.meetingId]
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                          : <><FileText className="w-4 h-4 mr-2" />Fill Feedback Form<ExternalLink className="w-3 h-3 ml-2" /></>
                        }
                      </Button>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 h-11">Close</Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full h-11">Close</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Report dialog */}
            <Dialog open={reportDialogOpen} onOpenChange={(open) => { setReportDialogOpen(open); if (!open) { setSelectedMeetingToReport(null); setReportReason(''); } }}>
              <DialogContent className="sm:max-w-[540px]">
                <DialogHeader className="space-y-3">
                  <DialogTitle className="flex items-center gap-2 text-orange-700 text-xl"><ShieldAlert className="h-6 w-6" />Report Meeting</DialogTitle>
                  <DialogDescription className="text-base">Flag inappropriate behavior from this session</DialogDescription>
                </DialogHeader>
                {selectedMeetingToReport && (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-400 mb-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Meeting Details:</p>
                    <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Mentee:</span> {selectedMeetingToReport.menteeName}</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">Date:</span> {selectedMeetingToReport.displayDate} at {selectedMeetingToReport.displayTime}</p>
                  </div>
                )}
                <div className="bg-orange-50 border-2 border-orange-200 p-4 rounded-xl mb-4">
                  <p className="text-sm text-orange-800">Your report is confidential and helps maintain platform quality.</p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="mentor-report-reason" className="text-sm font-semibold">What happened? <span className="text-red-500">*</span></Label>
                  <Textarea id="mentor-report-reason" placeholder="Describe the issue in detail..." value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="min-h-[140px] resize-none" />
                  <p className="text-xs text-gray-500">Minimum 10 characters required</p>
                </div>
                <DialogFooter className="gap-3 mt-2">
                  <Button variant="outline" onClick={() => { setReportDialogOpen(false); setSelectedMeetingToReport(null); setReportReason(''); }} disabled={isReporting} className="flex-1 h-11">Cancel</Button>
                  <Button variant="destructive" onClick={handleSubmitReport} disabled={isReporting} className="flex-1 h-11">
                    {isReporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : 'Submit Report'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Cancel dialog */}
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogContent className="sm:max-w-[540px]">
                <DialogHeader className="space-y-3">
                  <DialogTitle className="flex items-center gap-2 text-red-700 text-xl"><AlertCircle className="h-6 w-6" />Cancel Meeting</DialogTitle>
                  <DialogDescription className="text-base">
                    {meetingToCancel?.userRole === 'mentor' ? 'The token will be automatically refunded to the requester.' : 'Token refund requires admin approval.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Label htmlFor="cancel-reason" className="text-sm font-semibold">Cancellation Reason <span className="text-red-500">*</span></Label>
                  <Textarea id="cancel-reason" placeholder="Explain why you need to cancel..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="min-h-[140px] resize-none" />
                </div>
                <DialogFooter className="gap-3 mt-2">
                  <Button variant="outline" onClick={() => { setCancelDialogOpen(false); setMeetingToCancel(null); setCancelReason(''); }} disabled={isCancelling} className="flex-1 h-11">Keep Meeting</Button>
                  <Button variant="destructive" onClick={handleCancelMeeting} disabled={isCancelling} className="flex-1 h-11">
                    {isCancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling...</> : 'Cancel Meeting'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}