'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Calendar as CalendarIcon, Clock, List, Calendar, ChevronLeft, ChevronRight, Video, User, Mail, AlertCircle, FileText, ExternalLink, XCircle, Gift, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRequireAuth } from '@/hooks/use-auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { convertMeetingTime, DEFAULT_TIMEZONE } from '@/lib/timezone';
import { useTokenCycleState } from '@/hooks/use-token-cycle-state';
import { getFeedbackUrl } from '@/lib/client/get-feedback-url';
// ↑ shared helper that calls /api/meetings/ensure-feedback-url when URL is absent
import type { TokenCycle } from '@/lib/token-cycle';

interface MeetingRequest {
  meetingId: string;
  menteeUID: string;
  mentorUID: string;
  date: string;
  time: string;
  decision: 'pending' | 'accepted' | 'rejected';
  scheduled_status: string;
  report_status: string;
  report_reason: string | null;
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
}

interface TaskItem {
  id: string;
  type: 'meeting' | 'past_meeting' | 'pending_request' | 'feedback' | 'in_progress_meeting';
  title: string;
  description: string;
  date: string;
  time: string;
  meetingId: string;
  mentorName: string;
  mentorEmail: string;
  message?: string;
  meetingLink?: string;
  googleMeetUrl?: string;
  hoursRemaining?: number;
  minutesRemaining?: number;
  meetingUtcMs?: number;
  hasFeedback?: boolean;
  daysRemaining?: number;
  feedbackFormUrl?: string;
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

export default function MenteeNoticesPage() {
  const { user, isLoading: authLoading } = useRequireAuth('mentee');
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<TaskItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [tokenCycle, setTokenCycle] = useState<TokenCycle | null>(null);
  const [isReplenishing, setIsReplenishing] = useState(false);
  // Track per-meeting loading state for feedback button
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({});

  const userTz = (user as any)?.timezone || DEFAULT_TIMEZONE;
  const isNonDefaultTz = userTz !== DEFAULT_TIMEZONE;

  const tokenCycleState = useTokenCycleState({
    tokenCycle,
    timezone: userTz,
    userId: user?.id,
  });

  const fetchTasks = useCallback(async () => {
    if (!user) return;

    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });

      if (!response.ok) throw new Error('Failed to fetch meeting requests');

      const requests: MeetingRequest[] = await response.json();
      const taskItems: TaskItem[] = [];
      const now = new Date();

      const tcResponse = await fetch(`/api/token-cycle/status?userId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });

      if (tcResponse.ok) {
        const tcData = await tcResponse.json();
        setTokenCycle(tcData.tokenCycle);
      }

      requests.forEach((request) => {
        if (request.scheduled_status === 'cancelled') return;

        const converted = convertMeetingTime(request.date, request.time, userTz);
        const meetingUtcMs = converted.utcDate.getTime();
        const twoHoursAfterMs = meetingUtcMs + 2 * 60 * 60 * 1000;

        const baseTask = {
          date: request.date,
          time: request.time,
          meetingId: request.meetingId,
          mentorName: request.mentor_name,
          mentorEmail: request.mentor_email,
          message: request.message,
          meetingLink: request.meetingLink,
          googleMeetUrl: request.googleMeetUrl,
          displayDate: converted.displayDateFull,
          displayTime: converted.displayTime,
          tzLabel: converted.tzLabel,
          meetingUtcMs,
        };

        const titleDateTime = `${converted.displayDateFull} at ${converted.displayTime}`;

        if (request.decision === 'pending') {
          taskItems.push({
            ...baseTask,
            id: `pending-${request.meetingId}`,
            type: 'pending_request',
            title: titleDateTime,
            description: `Waiting for ${request.mentor_name}'s response`,
          });
        }

        if (request.decision === 'accepted' && now.getTime() < meetingUtcMs) {
          const minutesRemaining = Math.floor((meetingUtcMs - now.getTime()) / (1000 * 60));
          taskItems.push({
            ...baseTask,
            id: `meeting-${request.meetingId}`,
            type: 'meeting',
            title: titleDateTime,
            description: `Scheduled meeting with ${request.mentor_name}`,
            hoursRemaining: Math.floor(minutesRemaining / 60),
            minutesRemaining,
          });
        }

        if (request.decision === 'accepted' && now.getTime() >= meetingUtcMs && now.getTime() < twoHoursAfterMs) {
          taskItems.push({
            ...baseTask,
            id: `inprogress-${request.meetingId}`,
            type: 'in_progress_meeting',
            title: titleDateTime,
            description: `Meeting in progress with ${request.mentor_name}`,
          });
        }

        // Mutually exclusive: shows "Feedback Due" until submitted, then
        // switches to "Completed" — never both at once for the same meeting.
        if (request.decision === 'accepted' && now.getTime() >= twoHoursAfterMs) {
          const hasFeedback = !!request.feedbackFormSent;

          if (hasFeedback) {
            taskItems.push({
              ...baseTask,
              id: `past-meeting-${request.meetingId}`,
              type: 'past_meeting',
              title: titleDateTime,
              description: `Meeting with ${request.mentor_name}`,
              hasFeedback,
              feedbackFormUrl: request.feedbackFormUrl,
            });
          } else {
            taskItems.push({
              ...baseTask,
              id: `feedback-${request.meetingId}`,
              type: 'feedback',
              title: titleDateTime,
              description: `Feedback needed for meeting with ${request.mentor_name}`,
              feedbackFormUrl: request.feedbackFormUrl,
            });
          }
        }
      });

      const order: Record<string, number> = { pending_request: 0, feedback: 1, in_progress_meeting: 2, meeting: 3, past_meeting: 4 };
      taskItems.sort((a, b) => {
        const ao = order[a.type] ?? 5;
        const bo = order[b.type] ?? 5;
        if (ao !== bo) return ao - bo;
        if (a.type === 'meeting') return (a.hoursRemaining || 0) - (b.hoursRemaining || 0);
        if (a.type === 'feedback') return (a.meetingUtcMs || 0) - (b.meetingUtcMs || 0);
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

  const fetchTokenCycleState = useCallback(async () => {
    if (!user?.id) return;
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/token-cycle/status?userId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (response.ok) {
        const data = await response.json();
        setTokenCycle(data.tokenCycle);
      }
    } catch (error) {
      console.error('Failed to refresh token cycle state:', error);
    }
  }, [user?.id]);

  useEffect(() => { if (user) fetchTasks(); }, [user, fetchTasks]);

  useEffect(() => {
    if (!user?.id) return;
    fetchTokenCycleState();
    const interval = setInterval(fetchTokenCycleState, 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, fetchTokenCycleState]);

  const handleTaskClick = (task: TaskItem) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
  };

  const handleManualReplenish = async () => {
    if (!user?.id) return;

    setIsReplenishing(true);
    try {
      await tokenCycleState.triggerReplenishment();
      await new Promise(r => setTimeout(r, 1000));

      toast({
        title: 'Success!',
        description: 'Your token has been replenished! You can now schedule your next meeting.',
      });

      fetchTasks();
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: tokenCycleState.replenishError || 'Failed to replenish token',
      });
    } finally {
      setIsReplenishing(false);
    }
  };

  const handleJoinMeeting = () => {
    const url = selectedTask?.googleMeetUrl || selectedTask?.meetingLink;
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); setIsDialogOpen(false); }
    else { toast({ variant: 'destructive', title: 'Error', description: 'Meeting link not available.' }); }
  };

  /**
   * Opens the feedback form for a given task.
   * If feedbackFormUrl is missing, calls the on-demand generation endpoint
   * which also persists the URL to the database.
   */
  const openFeedbackForm = async (task: TaskItem) => {
    if (!user?.id) return;

    setFeedbackLoading(prev => ({ ...prev, [task.meetingId]: true }));

    try {
      const result = await getFeedbackUrl({
        meetingId: task.meetingId,
        userId: user.id,
        existingUrl: task.feedbackFormUrl,
      });

      if ('error' in result) {
        toast({
          variant: 'destructive',
          title: 'Feedback link unavailable',
          description: result.error,
        });
        return;
      }

      // Update the task in state so re-opens are instant
      setTasks(prev =>
        prev.map(t =>
          t.meetingId === task.meetingId
            ? { ...t, feedbackFormUrl: result.url }
            : t
        )
      );
      if (selectedTask?.meetingId === task.meetingId) {
        setSelectedTask(prev => prev ? { ...prev, feedbackFormUrl: result.url } : prev);
      }

      toast({
        title: 'Feedback Form Opened',
        description: 'The button will disappear only after you submit the Google Form.',
      });

      window.open(result.url, '_blank');
      setIsDialogOpen(false);

      // Refresh to pick up feedbackFormSent status changes
      setTimeout(() => fetchTasks(), 1500);
    } finally {
      setFeedbackLoading(prev => ({ ...prev, [task.meetingId]: false }));
    }
  };

  const handleCancelClick = (task: TaskItem) => {
    setMeetingToCancel(task);
    setCancelDialogOpen(true);
    setIsDialogOpen(false);
  };

  const handleCancelMeeting = async () => {
    if (!meetingToCancel || !user) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/schedule/${meetingToCancel.meetingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelledBy: user.id, reason: cancelReason || 'No reason provided' }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(err.message);
      }
      const result = await response.json();
      toast({
        title: 'Meeting Cancelled',
        description: result.tokenStatus === 'auto-replenished'
          ? 'Token refunded automatically.'
          : 'Token refund pending admin approval.',
      });
      await fetchTasks();
      setCancelDialogOpen(false);
      setMeetingToCancel(null);
      setCancelReason('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'Failed to cancel meeting.' });
    } finally {
      setIsCancelling(false);
    }
  };

  const isJoinButtonEnabled = (task: TaskItem): boolean => {
    return task.decision === 'accepted' && (!!task.meetingLink || !!task.googleMeetUrl);
  };

  const getDaysInMonth = (date: Date): CalendarDay[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: CalendarDay[] = [];

    for (let i = firstDay.getDay() - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, new Date(year, month, 0).getDate() - i);
      days.push({ date: d, dateString: d.toISOString().split('T')[0], tasks: [], isCurrentMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ date: d, dateString, tasks: tasks.filter(t => t.date === dateString), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, dateString: d.toISOString().split('T')[0], tasks: [], isCurrentMonth: false });
    }
    return days;
  };

  const getTaskBadgeColor = (type: string) => ({
    pending_request: 'bg-amber-500 hover:bg-amber-600',
    meeting: 'bg-green-500 hover:bg-green-600',
    in_progress_meeting: 'bg-blue-500 hover:bg-blue-600',
    feedback: 'bg-orange-500 hover:bg-orange-600',
    past_meeting: 'bg-gray-500 hover:bg-gray-600',
  }[type] || 'bg-gray-500');

  const getTaskLabel = (type: string) => ({
    pending_request: 'Pending Requests',
    meeting: 'Upcoming Meetings',
    in_progress_meeting: 'In Progress',
    feedback: 'Feedback Due',
    past_meeting: 'Completed Meetings',
  }[type] || 'Task');

  const getTaskIcon = (type: string) => ({
    pending_request: <Clock className="w-5 h-5 text-amber-600" />,
    meeting: <Video className="w-5 h-5 text-green-600" />,
    in_progress_meeting: <Video className="w-5 h-5 text-blue-600" />,
    feedback: <AlertCircle className="w-5 h-5 text-orange-600" />,
    past_meeting: <CheckSquare className="w-5 h-5 text-gray-600" />,
  }[type] || <CheckSquare className="w-5 h-5 text-gray-600" />);

  const getDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    return { day: d.getDate(), month: d.toLocaleDateString('en-US', { month: 'short' }) };
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading tasks...</p>
        </div>
      </div>
    );
  }

  const calendarDays = getDaysInMonth(currentDate);
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pendingCount = tasks.filter(t => t.type === 'pending_request').length;
  const upcomingCount = tasks.filter(t => t.type === 'meeting').length;
  const inProgressCount = tasks.filter(t => t.type === 'in_progress_meeting').length;
  const feedbackCount = tasks.filter(t => t.type === 'feedback').length;
  const completedCount = tasks.filter(t => t.type === 'past_meeting').length;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg flex items-center justify-between">
            <span>My Notices</span>
            <button onClick={() => { setLoading(true); fetchTasks(); }} aria-label="Refresh"
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

            {upcomingCount + inProgressCount > 0 && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Google Meet account reminder</p>
                  <p>
                    Your Google Meet account should use the same email linked to your Connext account.
                    If you use an Outlook or other email address, that is still fine - just create or sign in to a Google account with that same email before your session.
                  </p>
                </div>
              </div>
            )}

            {/* Stats + toolbar row */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1">
                {[
                  { key: 'pending', label: 'Pending Requests', value: pendingCount, Icon: Clock, accent: 'bg-amber-400' },
                  { key: 'upcoming', label: 'Upcoming Meetings', value: upcomingCount, Icon: Video, accent: 'bg-green-400' },
                  { key: 'feedback', label: 'Feedback Due', value: feedbackCount, Icon: AlertCircle, accent: 'bg-orange-400' },
                  { key: 'completed', label: 'Completed Meetings', value: completedCount, Icon: CheckSquare, accent: 'bg-blue-400' },
                ].map(({ key, label, value, Icon, accent }) => (
                  <div key={key} className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                    <div className={`${accent} w-1 self-stretch hidden sm:block`} />
                    <div className="flex-1 py-4 px-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                        <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'calendar')}>
                  <TabsList className="bg-white border border-gray-200 shadow-sm h-auto p-0 w-9 flex flex-col items-center space-y-1 overflow-hidden -translate-x-2">
                    <TabsTrigger value="timeline" className="w-full h-10 flex items-center justify-center border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700">
                      <List className="w-4 h-4" />
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="w-full h-10 flex items-center justify-center border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700">
                      <Calendar className="w-4 h-4" />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Timeline view */}
            {viewMode === 'timeline' ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                {tasks.length === 0 ? (
                  <div className="border-0 shadow-lg bg-white rounded-xl flex flex-col items-center justify-center py-20">
                    <div className="p-5 bg-green-100 rounded-full mb-5">
                      <CheckSquare className="w-14 h-14 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-2">All caught up!</h3>
                    <p className="text-gray-600 text-center max-w-md">No pending tasks or upcoming meetings.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
                    <AnimatePresence mode="popLayout">
                      {tasks.map((task, index) => {
                        const dateInfo = getDateDisplay(task.date);
                        const isLast = index === tasks.length - 1;
                        return (
                          <motion.div key={task.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="relative">
                            <div className="flex gap-6">
                              <div className="flex flex-col items-center pt-1">
                                <div className={`relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-lg flex-shrink-0 ring-4 ring-white transform hover:scale-105 transition-transform duration-200 ${
                                  task.type === 'pending_request' ? 'bg-gradient-to-br from-amber-400 to-yellow-600'
                                  : task.type === 'meeting' ? 'bg-gradient-to-br from-green-400 to-green-600'
                                  : task.type === 'in_progress_meeting' ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                  : task.type === 'feedback' ? 'bg-gradient-to-br from-orange-400 to-amber-600'
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
                                    task.type === 'pending_request' ? 'bg-gradient-to-b from-amber-200 to-gray-200'
                                    : task.type === 'meeting' ? 'bg-gradient-to-b from-green-200 to-gray-200'
                                    : task.type === 'feedback' ? 'bg-gradient-to-b from-orange-200 to-gray-200'
                                    : 'bg-gradient-to-b from-gray-200 to-gray-100'
                                  }`} />
                                )}
                              </div>

                              <div className={`flex-1 ${!isLast ? 'pb-8' : 'pb-2'}`}>
                                <Card className="border-2 border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden bg-white hover:border-amber-300 transform hover:-translate-y-1"
                                  onClick={() => handleTaskClick(task)}>
                                  <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-5">
                                      <Badge className={`${getTaskBadgeColor(task.type)} text-white text-xs px-4 py-1.5 font-semibold shadow-sm flex items-center gap-1.5`}>
                                        {getTaskLabel(task.type)}
                                      </Badge>
                                      {task.type === 'meeting' && task.hoursRemaining !== undefined && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 border-blue-300 text-blue-700 font-medium">
                                          {task.hoursRemaining < 1 ? `${task.minutesRemaining}m left`
                                            : task.hoursRemaining < 24 ? `${task.hoursRemaining}h left`
                                            : `${Math.floor(task.hoursRemaining / 24)}d left`}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="space-y-3.5">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg ring-2 ring-blue-100">
                                          <User className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-500 font-medium mb-0.5">Mentor</p>
                                          <p className="font-bold text-gray-900 text-lg leading-tight">{task.mentorName}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg ring-2 ring-purple-100">
                                          <Clock className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-500 font-medium mb-0.5">
                                            {task.type === 'pending_request' ? 'Requested Time' : 'Scheduled Time'}
                                            {isNonDefaultTz && task.tzLabel ? ` (${task.tzLabel})` : ''}
                                          </p>
                                          <p className="font-semibold text-gray-700 text-sm leading-tight">
                                            {task.displayDate} at {task.displayTime}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <Card className="border-0 shadow-lg bg-white">
                  <CardHeader className="border-b bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">{monthYear}</h2>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="border-amber-300 hover:bg-amber-50"><ChevronLeft className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="border-amber-300 hover:bg-amber-50 font-medium">Today</Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="border-amber-300 hover:bg-amber-50"><ChevronRight className="w-4 h-4" /></Button>
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
                        <div key={i} className={`min-h-28 p-3 rounded-xl border-2 transition-all duration-200 ${
                          day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                        } ${day.dateString === new Date().toISOString().split('T')[0]
                          ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm'
                          : 'border-gray-200 hover:border-amber-300 hover:shadow-sm'}`}>
                          <div className={`text-sm font-semibold mb-2 ${day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                            {day.date.getDate()}
                          </div>
                          <div className="space-y-1.5">
                            {day.tasks.map(task => (
                              <div key={task.id} onClick={() => handleTaskClick(task)}
                                className={`text-xs p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                  task.type === 'pending_request' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                                  : task.type === 'meeting' ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-200'
                                  : task.type === 'feedback' ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                                }`}>
                                <div className="font-semibold truncate">{task.displayTime || task.time}</div>
                                <div className="truncate opacity-75 text-[11px]">{task.mentorName}</div>
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
                    <div className="p-2.5 bg-amber-100 rounded-xl">
                      {selectedTask && getTaskIcon(selectedTask.type)}
                    </div>
                    <DialogTitle className="text-xl font-semibold">
                      {selectedTask?.type === 'feedback' ? 'Feedback Required' : 'Meeting Details'}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-gray-600 text-base">
                    {selectedTask?.description}
                  </DialogDescription>
                </DialogHeader>

                {selectedTask && (
                  <div className="space-y-5 py-2">
                    <div className="space-y-4 p-5 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200">
                      {[
                        { Icon: CalendarIcon, label: 'Date', value: selectedTask.displayDate || selectedTask.date },
                        { Icon: Clock, label: `Time${isNonDefaultTz && selectedTask.tzLabel ? ` (${selectedTask.tzLabel})` : ''}`, value: selectedTask.displayTime || selectedTask.time },
                        { Icon: User, label: 'Mentor', value: selectedTask.mentorName },
                        { Icon: Mail, label: 'Email', value: selectedTask.mentorEmail, blue: true },
                      ].map(({ Icon, label, value, blue }) => (
                        <div key={label} className="flex items-center gap-3 text-sm">
                          <div className="p-2 bg-white rounded-lg"><Icon className="w-4 h-4 text-amber-600" /></div>
                          <div>
                            <span className="text-gray-600 font-medium">{label}:</span>
                            <span className={`ml-2 font-semibold ${blue ? 'text-blue-600' : 'text-gray-900'}`}>{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {isNonDefaultTz && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                        🌐 Displayed in your timezone. Stored in Malaysia time (UTC+8).
                      </div>
                    )}

                    {(selectedTask.type === 'pending_request' || selectedTask.type === 'meeting' || selectedTask.type === 'in_progress_meeting') && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-amber-600" />
                        <div className="space-y-1">
                          <p className="font-semibold">Google Meet account reminder</p>
                          <p>
                            Your Google Meet account should use the same email linked to your Connext account.
                            If you use an Outlook or other email address, that is still fine - just create or sign in to a Google account with that same email before your session.
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedTask.message && (
                      <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                        <p className="font-semibold text-sm text-blue-900 mb-2">Your Message:</p>
                        <p className="text-sm text-blue-800 leading-relaxed">{selectedTask.message}</p>
                      </div>
                    )}

                    {selectedTask.type === 'feedback' && (
                      <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-orange-700 mt-0.5" />
                          <div>
                            <p className="font-semibold text-base text-orange-800 mb-1">Feedback Required</p>
                            <p className="text-sm text-orange-700">
                              Submit feedback to complete your cycle.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {tokenCycle && (selectedTask.type === 'past_meeting' || selectedTask.type === 'feedback') && (
                      <div className={`p-4 rounded-xl border-2 ${
                        tokenCycleState.status === 'ready_to_replenish'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-indigo-50 border-indigo-200'
                      }`}>
                        <div className="flex items-start gap-3">
                          {tokenCycleState.status === 'ready_to_replenish' ? (
                            <Gift className="w-5 h-5 text-green-700 mt-0.5" />
                          ) : (
                            <Zap className="w-5 h-5 text-indigo-700 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className={`font-semibold text-base mb-1 ${
                              tokenCycleState.status === 'ready_to_replenish' ? 'text-green-800' : 'text-indigo-800'
                            }`}>
                              {tokenCycleState.status === 'ready_to_replenish' ? '🎉 Ready to Replenish!' : '⏳ Token Replenishment Status'}
                            </p>
                            <p className={`text-sm ${
                              tokenCycleState.status === 'ready_to_replenish' ? 'text-green-700' : 'text-indigo-700'
                            }`}>
                              {tokenCycleState.message}
                            </p>
                            {tokenCycleState.daysRemaining !== undefined && (
                              <p className="text-xs text-gray-600 mt-2">{tokenCycleState.daysRemaining} days remaining</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter className="gap-3 mt-2">
                  {selectedTask?.type === 'meeting' ? (
                    <>
                      <div className="flex-1 space-y-2">
                        <Button
                          onClick={handleJoinMeeting}
                          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-11 shadow-md"
                          disabled={!selectedTask.googleMeetUrl && !selectedTask.meetingLink}
                          title="Click to join the meeting"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Join Meeting
                        </Button>
                        <p className="text-xs text-gray-500 text-center leading-relaxed">
                          The meeting link is ready, but the session may not have started yet.
                        </p>
                      </div>
                      <Button onClick={() => handleCancelClick(selectedTask)} variant="destructive" className="flex-1 h-11 shadow-md">
                        <XCircle className="w-4 h-4 mr-2" /> Cancel Meeting
                      </Button>
                    </>
                  ) : selectedTask?.type === 'feedback' ? (
                    <>
                      <Button
                        onClick={() => openFeedbackForm(selectedTask)}
                        disabled={feedbackLoading[selectedTask.meetingId]}
                        className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 h-11 shadow-md"
                      >
                        {feedbackLoading[selectedTask.meetingId] ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                        ) : (
                          <><FileText className="w-4 h-4 mr-2" />Fill Feedback Form<ExternalLink className="w-3 h-3 ml-2" /></>
                        )}
                      </Button>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 h-11 border-gray-300 hover:bg-gray-50">
                        Close
                      </Button>
                    </>
                  ) : selectedTask?.type === 'past_meeting' && tokenCycleState.status === 'ready_to_replenish' ? (
                    <>
                      <Button
                        onClick={handleManualReplenish}
                        disabled={isReplenishing}
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-11 shadow-md"
                      >
                        {isReplenishing ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Replenishing...</>
                        ) : (
                          <><Gift className="w-4 h-4 mr-2" />Replenish Token</>
                        )}
                      </Button>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 h-11 border-gray-300 hover:bg-gray-50">
                        Close
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full h-11 border-amber-300 hover:bg-amber-50">
                      Close
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Cancel dialog */}
            <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
              setCancelDialogOpen(open);
              if (!open) { if (meetingToCancel) { setSelectedTask(meetingToCancel); setIsDialogOpen(true); } setCancelReason(''); setMeetingToCancel(null); setIsCancelling(false); }
            }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Meeting</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel with {meetingToCancel?.mentorName}?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="cancel-reason">Reason <span className="text-red-500">*</span></Label>
                    <Textarea id="cancel-reason" placeholder="Let the mentor know why you need to cancel..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-2" rows={3} required />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isCancelling}>Keep Meeting</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancelMeeting} disabled={isCancelling || !cancelReason.trim()} className="bg-red-600 hover:bg-red-700">
                    {isCancelling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</> : 'Cancel Meeting'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}