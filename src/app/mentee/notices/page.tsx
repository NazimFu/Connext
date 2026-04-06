'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Calendar as CalendarIcon, Clock, List, Calendar, ChevronLeft, ChevronRight, Video, User, Mail, AlertCircle, Star, FileText, ExternalLink, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { generateFeedbackFormUrl } from '@/lib/googleForm';

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
  type: 'meeting' | 'past_meeting' | 'pending_request' | 'feedback';
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
  meetingDateTime?: string;
  hasFeedback?: boolean;
  daysRemaining?: number;
  feedbackFormUrl?: string;
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
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [rating, setRating] = useState(0);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<TaskItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    
    try {
      const timestamp = new Date().getTime();
      
      // Fetch meetings where user is MENTEE (sent requests)
      const response = await fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch meeting requests');
      }

      const requests: MeetingRequest[] = await response.json();
      
      const taskItems: TaskItem[] = [];
      const now = new Date();

      console.log('Total meetings fetched:', requests.length);
      console.log('Current user (mentee) ID:', user.id);

      requests.forEach((request) => {
        // Skip cancelled meetings
        if (request.scheduled_status === 'cancelled') {
          console.log('Skipping cancelled meeting:', request.meetingId);
          return;
        }

        // Parse meeting date and time
        let meetingDateTime: Date;
        
        // Parse date string (YYYY-MM-DD) in local timezone, not UTC
        const [year, month, day] = request.date.split('-').map(Number);
        
        if (request.time.includes('AM') || request.time.includes('PM')) {
          const [time, period] = request.time.split(' ');
          const [hours, minutes] = time.split(':').map(Number);
          const hour24 = period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours);
          meetingDateTime = new Date(year, month - 1, day, hour24, minutes, 0, 0);
        } else {
          const [hours, minutes] = request.time.split(':').map(Number);
          meetingDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
        }

        console.log(`Meeting ${request.meetingId}:`, {
          date: request.date,
          time: request.time,
          parsed: meetingDateTime.toISOString(),
          isPast: meetingDateTime < now,
          decision: request.decision
        });

        // Format title with day, date, and time
        const dayName = meetingDateTime.toLocaleDateString('en-US', { weekday: 'long' });
        const formattedDate = meetingDateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const titleDateTime = `${dayName}, ${formattedDate} at ${request.time}`;

        // Add pending requests (waiting for mentor's decision)
        if (request.decision === 'pending') {
          taskItems.push({
            id: `pending-${request.meetingId}`,
            type: 'pending_request',
            title: titleDateTime,
            description: `Waiting for ${request.mentor_name}'s response`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            message: request.message
          });
        }

        // Add upcoming meetings (accepted AND future)
        const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
        
        if (request.decision === 'accepted' && meetingDateTime > now) {
          const minutesUntilMeeting = Math.floor((meetingDateTime.getTime() - now.getTime()) / (1000 * 60));
          const hoursUntilMeeting = Math.floor(minutesUntilMeeting / 60);
          
          taskItems.push({
            id: `meeting-${request.meetingId}`,
            type: 'meeting',
            title: titleDateTime,
            description: `Scheduled meeting with ${request.mentor_name}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            message: request.message,
            meetingLink: request.meetingLink,
            googleMeetUrl: request.googleMeetUrl,
            hoursRemaining: hoursUntilMeeting,
            minutesRemaining: minutesUntilMeeting,
            meetingDateTime: meetingDateTime.toISOString()
          });
        }

        // Add in-progress meetings (meeting has started but less than 2 hours have passed)
        if (request.decision === 'accepted' && meetingDateTime <= now && now < twoHoursAfterMeeting) {
          taskItems.push({
            id: `inprogress-${request.meetingId}`,
            type: 'in_progress_meeting',
            title: titleDateTime,
            description: `Meeting in progress with ${request.mentor_name}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            message: request.message,
            meetingLink: request.meetingLink,
            googleMeetUrl: request.googleMeetUrl,
            meetingDateTime: meetingDateTime.toISOString()
          });
        }

        // Add past meetings (accepted AND 2+ hours have passed)
        if (request.decision === 'accepted' && now >= twoHoursAfterMeeting) {
          const hasFeedback = request.feedbackFormSent ? true : false;
          const hoursAfterMeeting = Math.floor((now.getTime() - meetingDateTime.getTime()) / (1000 * 60 * 60));
          
          console.log(`Past meeting ${request.meetingId} - feedbackFormSent:`, request.feedbackFormSent, 'hasFeedback:', hasFeedback, 'hours after:', hoursAfterMeeting);
          
          // Add to past meetings
          taskItems.push({
            id: `past-meeting-${request.meetingId}`,
            type: 'past_meeting',
            title: titleDateTime,
            description: `Meeting with ${request.mentor_name}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            message: request.message,
            hasFeedback: hasFeedback,
            feedbackFormUrl: request.feedbackFormUrl
          });

          // Create feedback task if:
          // 1. Meeting is at least 2 hours past
          // 2. No feedback submitted yet
          // 3. Within 14 days deadline
          if (hoursAfterMeeting >= 2 && !hasFeedback) {
            const daysAfterMeeting = hoursAfterMeeting / 24;
            const daysRemaining = Math.max(0, 14 - daysAfterMeeting);
            
            console.log(`Checking feedback task for ${request.meetingId} - daysAfter: ${daysAfterMeeting}, daysRemaining: ${daysRemaining}`);
            
            if (daysRemaining > 0) {
              console.log(`✅ Creating feedback task for meeting ${request.meetingId}`);
              taskItems.push({
                id: `feedback-${request.meetingId}`,
                type: 'feedback',
                title: titleDateTime,
                description: `Feedback needed for meeting with ${request.mentor_name}`,
                date: request.date,
                time: request.time,
                meetingId: request.meetingId,
                mentorName: request.mentor_name,
                mentorEmail: request.mentor_email,
                message: request.message,
                daysRemaining: Math.floor(daysRemaining),
                hoursRemaining: Math.floor(daysRemaining * 24),
                feedbackFormUrl: request.feedbackFormUrl
              });
            } else {
              console.log(`❌ Past 14-day deadline for meeting ${request.meetingId}`);
            }
          } else {
            console.log(`❌ Not creating feedback task for ${request.meetingId} - Hours: ${hoursAfterMeeting}, HasFeedback: ${hasFeedback}`);
          }
        }
      });

      // Sort by urgency: pending first, then feedback, then in-progress, then upcoming, then past
      taskItems.sort((a, b) => {
        // Pending requests have highest priority
        if (a.type === 'pending_request' && b.type !== 'pending_request') return -1;
        if (a.type !== 'pending_request' && b.type === 'pending_request') return 1;
        
        // Feedback tasks second priority
        if (a.type === 'feedback' && b.type !== 'pending_request') return -1;
        if (b.type === 'feedback' && a.type !== 'pending_request') return 1;
        
        // In-progress meetings third priority
        if (a.type === 'in_progress_meeting' && !['pending_request', 'feedback'].includes(b.type)) return -1;
        if (b.type === 'in_progress_meeting' && !['pending_request', 'feedback'].includes(a.type)) return 1;
        
        // Upcoming meetings fourth
        if (a.type === 'meeting' && b.type === 'past_meeting') return -1;
        if (b.type === 'meeting' && a.type === 'past_meeting') return 1;
        
        // Feedback tasks third
        if (a.type === 'feedback' && b.type === 'past_meeting') return -1;
        if (a.type === 'past_meeting' && b.type === 'feedback') return 1;
        
        // Within same type, sort by date/urgency
        if (a.type === 'meeting' && b.type === 'meeting') {
          return (a.hoursRemaining || 0) - (b.hoursRemaining || 0);
        }
        
        if (a.type === 'feedback' && b.type === 'feedback') {
          return (a.daysRemaining || 0) - (b.daysRemaining || 0);
        }
        
        if (a.type === 'past_meeting' && b.type === 'past_meeting') {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        
        return 0;
      });

      console.log('Task breakdown:', {
        total: taskItems.length,
        pending: taskItems.filter(t => t.type === 'pending_request').length,
        upcoming: taskItems.filter(t => t.type === 'meeting').length,
        feedback: taskItems.filter(t => t.type === 'feedback').length,
        past: taskItems.filter(t => t.type === 'past_meeting').length
      });

      setTasks(taskItems);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({ 
        variant: 'destructive', 
        title: "Error", 
        description: "Failed to fetch tasks." 
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user, fetchTasks]);

  const handleTaskClick = (task: TaskItem) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
    setFeedbackText('');
    setRating(0);
  };

  const handleSubmitFeedback = async () => {
    if (!selectedTask || !user) return;
    
    setIsSubmittingFeedback(true);
    try {
      const response = await fetch('/api/meetings/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: selectedTask.meetingId,
          menteeId: user.id,
          feedback: feedbackText,
          rating: rating || null
        })
      });

      const data = await response.json();

      if (response.ok) {
        const replenishAtText = data.tokenReplenishAt
          ? new Date(data.tokenReplenishAt).toLocaleString()
          : 'the cycle evaluation time';
        toast({
          title: "Feedback Submitted! 🎉",
          description: `Token will be replenished after ${replenishAtText} if eligible.`,
        });
        setIsDialogOpen(false);
        fetchTasks(); // Refresh the task list
      } else {
        throw new Error(data.message || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: (error as Error).message || "Failed to submit feedback"
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleJoinMeeting = () => {
    const meetingUrl = selectedTask?.googleMeetUrl || selectedTask?.meetingLink;
    
    if (meetingUrl) {
      window.open(meetingUrl, '_blank', 'noopener,noreferrer');
      setIsDialogOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: "Error",
        description: "Meeting link not available. Please contact your mentor.",
      });
    }
  };

  const handleCancelClick = (task: TaskItem) => {
    setMeetingToCancel(task);
    setCancelDialogOpen(true);
    setIsDialogOpen(false); // Close details dialog
  };

  const handleCancelMeeting = async () => {
    if (!meetingToCancel || !user) return;

    try {
      setIsCancelling(true);
      const response = await fetch(`/api/schedule/${meetingToCancel.meetingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelledBy: user.id,
          reason: cancelReason || 'No reason provided',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || 'Failed to cancel meeting');
      }

      const result = await response.json();

      toast({
        title: "Meeting Cancelled",
        description: result.tokenStatus === 'auto-replenished' 
          ? "Your token has been refunded automatically."
          : "Your token refund is pending admin approval.",
      });

      // Refresh tasks
      await fetchTasks();

      setCancelDialogOpen(false);
      setMeetingToCancel(null);
      setCancelReason('');
    } catch (error) {
      console.error('Error cancelling meeting:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel meeting. Please try again.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const formatTimeRemaining = (hours: number): string => {
    if (hours <= 0) return '';
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d left`;
  };

  const formatFeedbackDeadline = (days: number): string => {
    if (days <= 0) return 'Overdue';
    if (days < 1) return 'Due today';
    return `${days}d left`;
  };

  const formatDateTime = (dateString: string, timeString: string) => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dayName}, ${formattedDate} at ${timeString}`;
  };

  const getDateDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return {
      day: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' })
    };
  };

  const getFullDateTime = (dateString: string, timeString: string) => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dayName}, ${formattedDate} at ${timeString}`;
  };

  const getDaysInMonth = (date: Date): CalendarDay[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const startingDayOfWeek = firstDay.getDay();
    const days: CalendarDay[] = [];
    
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date,
        dateString: date.toISOString().split('T')[0],
        tasks: [],
        isCurrentMonth: false
      });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dateString = date.toISOString().split('T')[0];
      const dayTasks = tasks.filter(task => task.date === dateString);
      
      days.push({
        date,
        dateString,
        tasks: dayTasks,
        isCurrentMonth: true
      });
    }
    
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        dateString: date.toISOString().split('T')[0],
        tasks: [],
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const getTaskBadgeColor = (type: string) => {
    switch (type) {
      case 'pending_request':
        return 'bg-amber-500 hover:bg-amber-600';
      case 'meeting':
        return 'bg-green-500 hover:bg-green-600';
      case 'in_progress_meeting':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'feedback':
        return 'bg-orange-500 hover:bg-orange-600';
      case 'past_meeting':
        return 'bg-gray-500 hover:bg-gray-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'pending_request':
        return <Clock className="w-5 h-5 text-amber-600" />;
      case 'meeting':
        return <Video className="w-5 h-5 text-green-600" />;
      case 'feedback':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'past_meeting':
        return <CheckSquare className="w-5 h-5 text-gray-600" />;
      default:
        return <CheckSquare className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTaskLabel = (task: TaskItem): string => {
    switch (task.type) {
      case 'pending_request':
        return 'Pending Requests';
      case 'meeting': {
        // Determine if meeting is upcoming or ongoing
        if (!task.meetingDateTime) return 'Upcoming Meetings';
        const meetingTime = new Date(task.meetingDateTime);
        const now = new Date();
        if (now < meetingTime) {
          return 'Upcoming Meetings';
        } else {
          return 'Ongoing';
        }
      }
      case 'feedback':
        return 'Feedback Due';
      case 'past_meeting':
        return 'Completed Meetings';
      default:
        return 'Task';
    }
  };

  // Helper function to determine meeting status based on current time
  const getMeetingStatus = (task: TaskItem): 'coming-soon' | 'ready-to-join' | 'ongoing' => {
    if (!task.meetingDateTime) return 'coming-soon';
    
    const meetingTime = new Date(task.meetingDateTime);
    const now = new Date();
    const tenMinutesBeforeMeeting = new Date(meetingTime.getTime() - 10 * 60 * 1000);
    const oneHourAfterMeeting = new Date(meetingTime.getTime() + 60 * 60 * 1000);
    
    if (now < tenMinutesBeforeMeeting) {
      return 'coming-soon';
    } else if (now >= tenMinutesBeforeMeeting && now < oneHourAfterMeeting) {
      if (now < meetingTime) {
        return 'ready-to-join';
      } else {
        return 'ongoing';
      }
    } else {
      return 'coming-soon';
    }
  };

  // Helper function to check if join button should be enabled
  const isJoinButtonEnabled = (task: TaskItem): boolean => {
    if (!task.meetingDateTime) return false;
    
    const meetingTime = new Date(task.meetingDateTime);
    const now = new Date();
    const tenMinutesBeforeMeeting = new Date(meetingTime.getTime() - 10 * 60 * 1000);
    const oneHourAfterMeeting = new Date(meetingTime.getTime() + 60 * 60 * 1000);
    
    return now >= tenMinutesBeforeMeeting && now < oneHourAfterMeeting;
  };

  // Helper function to get status label for meetings
  const getMeetingStatusLabel = (task: TaskItem): string => {
    const status = getMeetingStatus(task);
    const meetingTime = new Date(task.meetingDateTime || '');
    const now = new Date();
    
    if (status === 'coming-soon') {
      return 'Coming Soon';
    } else if (status === 'ready-to-join') {
      const minutesRemaining = Math.floor((meetingTime.getTime() - now.getTime()) / (1000 * 60));
      return `Ready in ${minutesRemaining}m`;
    } else {
      return 'Ongoing';
    }
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

  // Count tasks by type
  const pendingCount = tasks.filter(t => t.type === 'pending_request').length;
  const upcomingCount = tasks.filter(t => t.type === 'meeting').length;
  const feedbackCount = tasks.filter(t => t.type === 'feedback').length;
  const completedCount = tasks.filter(t => t.type === 'past_meeting').length;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg flex items-center justify-between">
            <span>My Notices</span>
            <button
              onClick={() => { setLoading(true); fetchTasks(); }}
              aria-label="Refresh"
              className="h-9 w-20 rounded-md bg-white border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="p-6">
        {/* Header (compact) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4"
        >
          <div className="sr-only">Mentee tasks header</div>
        </motion.div>

        {/* Top row: Statistics + compact toolbar */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1"
          >
            {[
              { key: 'pending', label: 'Pending Requests', value: pendingCount, Icon: Clock, accent: 'bg-amber-400' },
              { key: 'upcoming', label: 'Upcoming Meetings', value: upcomingCount, Icon: Video, accent: 'bg-green-400' },
              { key: 'feedback', label: 'Feedback Due', value: feedbackCount, Icon: AlertCircle, accent: 'bg-orange-400' },
              { key: 'completed', label: 'Completed Meetings', value: completedCount, Icon: CheckSquare, accent: 'bg-blue-400' },
            ].map(({ key, label, value, Icon, accent }) => (
              <Card key={key} className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                <div className={`${accent} w-1 h-full hidden sm:block`} />
                <CardContent className="flex-1 py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* Compact toolbar */}
          <div className="flex flex-col items-end gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'timeline' | 'calendar')}>
              <TabsList className="bg-white border border-gray-200 shadow-sm h-auto p-0 w-9 flex flex-col items-center space-y-1 overflow-hidden transform -translate-x-2">
                <TabsTrigger
                  value="timeline"
                  className="w-full h-10 flex items-center justify-center border-0 focus:outline-none focus:ring-0 ring-0 data-[state=active]:ring-0 data-[state=active]:border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700"
                >
                  <List className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="w-full h-10 flex items-center justify-center border-0 focus:outline-none focus:ring-0 ring-0 data-[state=active]:ring-0 data-[state=active]:border-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-700"
                >
                  <Calendar className="w-4 h-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Content Area */}
        {viewMode === 'timeline' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-0"
          >
            {tasks.length === 0 ? (
              <Card className="border-0 shadow-lg bg-white">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="p-5 bg-green-100 rounded-full mb-5">
                    <CheckSquare className="w-14 h-14 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">All caught up!</h3>
                  <p className="text-gray-600 text-center max-w-md">You have no pending tasks or upcoming meetings at the moment.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
                <AnimatePresence mode="popLayout">
                  {tasks.map((task, index) => {
                    const dateInfo = getDateDisplay(task.date);
                    const fullDateTime = getFullDateTime(task.date, task.time);
                    const isLastItem = index === tasks.length - 1;

                    return (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="relative"
                      >
                        {/* Timeline Layout */}
                        <div className="flex gap-6">
                          {/* Left Side - Enhanced Date Circle */}
                          <div className="flex flex-col items-center pt-1">
                            <div className={`relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-lg ${
                              task.type === 'pending_request' 
                                ? 'bg-gradient-to-br from-amber-400 to-yellow-600' 
                                : task.type === 'meeting'
                                ? 'bg-gradient-to-br from-green-400 to-green-600'
                                : task.type === 'in_progress_meeting'
                                ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                : task.type === 'feedback'
                                ? 'bg-gradient-to-br from-orange-400 to-amber-600'
                                : 'bg-gradient-to-br from-gray-400 to-gray-600'
                            } flex-shrink-0 ring-4 ring-white transform hover:scale-105 transition-transform duration-200`}>
                              {/* Icon Badge */}
                              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border-2 border-white">
                                {task.type === 'pending_request' ? (
                                  <Clock className="w-4 h-4 text-amber-600" />
                                ) : task.type === 'meeting' ? (
                                  <Video className="w-4 h-4 text-green-600" />
                                ) : task.type === 'in_progress_meeting' ? (
                                  <Video className="w-4 h-4 text-blue-600" />
                                ) : task.type === 'feedback' ? (
                                  <AlertCircle className="w-4 h-4 text-orange-600" />
                                ) : (
                                  <CheckSquare className="w-4 h-4 text-gray-600" />
                                )}
                              </div>
                              
                              {/* Date Display */}
                              <span className="text-2xl font-bold text-white leading-none tracking-tight">{dateInfo.day}</span>
                              <span className="text-[10px] font-bold text-white uppercase mt-1 tracking-wider opacity-90">{dateInfo.month}</span>
                            </div>
                            
                            {/* Enhanced Vertical Line with Gradient */}
                            {!isLastItem && (
                              <div className={`w-1 flex-1 mt-4 rounded-full ${
                                task.type === 'pending_request'
                                  ? 'bg-gradient-to-b from-amber-200 to-gray-200'
                                  : task.type === 'meeting'
                                  ? 'bg-gradient-to-b from-green-200 to-gray-200'
                                  : task.type === 'feedback'
                                  ? 'bg-gradient-to-b from-orange-200 to-gray-200'
                                  : 'bg-gradient-to-b from-gray-200 to-gray-100'
                              }`}></div>
                            )}
                          </div>

                          {/* Right Side - Enhanced Card */}
                          <div className={`flex-1 ${!isLastItem ? 'pb-8' : 'pb-2'}`}>
                            <Card 
                              className="border-2 border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden bg-white hover:border-amber-300 transform hover:-translate-y-1"
                              onClick={() => handleTaskClick(task)}
                            >
                              <CardContent className="p-6">
                                {/* Enhanced Badge with Icon */}
                                <div className="flex items-center justify-between mb-5">
                                  <Badge className={`${getTaskBadgeColor(task.type)} text-white text-xs px-4 py-1.5 font-semibold shadow-sm flex items-center gap-1.5`}>
                                    {task.type === 'pending_request' ? (
                                      <Clock className="w-3.5 h-3.5" />
                                    ) : task.type === 'meeting' ? (
                                      <Video className="w-3.5 h-3.5" />
                                    ) : task.type === 'feedback' ? (
                                      <AlertCircle className="w-3.5 h-3.5" />
                                    ) : (
                                      <CheckSquare className="w-3.5 h-3.5" />
                                    )}
                                    {getTaskLabel(task)}
                                  </Badge>
                                  
                                  {/* Time/Deadline Indicators */}
                                  {task.type === 'meeting' && task.hoursRemaining !== undefined && task.meetingDateTime && (() => {
                                    const meetingTime = new Date(task.meetingDateTime);
                                    const now = new Date();
                                    return now < meetingTime;
                                  })() && (
                                    <Badge variant="outline" className="text-xs px-3 py-1 border-blue-300 text-blue-700 font-medium">
                                      {task.hoursRemaining <= 0 
                                        ? 'Starting soon' 
                                        : task.hoursRemaining < 24
                                        ? `${task.hoursRemaining}h left`
                                        : `${Math.floor(task.hoursRemaining / 24)}d left`
                                      }
                                    </Badge>
                                  )}
                                  
                                  {task.type === 'feedback' && task.daysRemaining !== undefined && (
                                    <Badge variant="outline" className="text-xs px-3 py-1 border-orange-300 text-orange-700 font-medium">
                                      {formatFeedbackDeadline(task.daysRemaining)}
                                    </Badge>
                                  )}
                                </div>

                                {/* Enhanced Mentor Name and DateTime */}
                                <div className="space-y-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg ring-2 ring-blue-100">
                                      <User className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-gray-500 font-medium mb-0.5">Mentor</p>
                                      <p className="font-bold text-gray-900 text-lg leading-tight">{task.mentorName}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg ring-2 ring-purple-100">
                                      <Clock className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-gray-500 font-medium mb-0.5">
                                        {task.type === 'pending_request' ? 'Requested Time' : 'Scheduled Time'}
                                      </p>
                                      <p className="font-semibold text-gray-700 text-sm leading-tight">{fullDateTime}</p>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-0 shadow-lg bg-white">
              <CardHeader className="border-b bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">{monthYear}</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')} className="border-amber-300 hover:bg-amber-50">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="border-amber-300 hover:bg-amber-50 font-medium">
                      Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('next')} className="border-amber-300 hover:bg-amber-50">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-7 gap-3 mb-4">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center font-semibold text-sm text-gray-700 py-3">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-3">
                  {calendarDays.map((day, index) => (
                    <div
                      key={index}
                      className={`min-h-28 p-3 rounded-xl border-2 transition-all duration-200 ${
                        day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                      } ${
                        day.dateString === new Date().toISOString().split('T')[0]
                          ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm'
                          : 'border-gray-200 hover:border-amber-300 hover:shadow-sm'
                      }`}
                    >
                      <div className={`text-sm font-semibold mb-2 ${
                        day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {day.date.getDate()}
                      </div>
                      <div className="space-y-1.5">
                        {day.tasks.map(task => (
                          <div
                            key={task.id}
                            onClick={() => handleTaskClick(task)}
                            className={`text-xs p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                              task.type === 'pending_request'
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                                : task.type === 'meeting'
                                ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-200'
                                : task.type === 'feedback'
                                ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                            }`}
                            title={task.title}
                          >
                            <div className="font-semibold truncate">{task.time}</div>
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

        {/* Task Details Dialog */}
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
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <CalendarIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Date:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {new Date(selectedTask.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Time:</span>
                      <span className="ml-2 font-semibold text-gray-900">{selectedTask.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <User className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Mentor:</span>
                      <span className="ml-2 font-semibold text-gray-900">{selectedTask.mentorName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <Mail className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Email:</span>
                      <span className="ml-2 text-blue-600 font-medium">{selectedTask.mentorEmail}</span>
                    </div>
                  </div>
                </div>

                {selectedTask.message && (
                  <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                    <p className="font-semibold text-sm text-blue-900 mb-2">Your Message:</p>
                    <p className="text-sm text-blue-800 leading-relaxed">{selectedTask.message}</p>
                  </div>
                )}

                {selectedTask.type === 'pending_request' && (
                  <div className="p-4 bg-amber-50 rounded-xl border-2 border-amber-200">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-base text-amber-800 mb-1">Pending Approval</p>
                        <p className="text-sm text-amber-700">
                          Waiting for {selectedTask.mentorName} to accept or decline your meeting request.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTask.type === 'feedback' && (
                  <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-orange-700 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-base text-orange-800 mb-1">Feedback Required</p>
                        <p className="text-sm text-orange-700">
                          Please submit your feedback for this meeting. Your token will be replenished once submitted!
                          {selectedTask.daysRemaining !== undefined && (
                            <span className="font-semibold"> Deadline: {formatFeedbackDeadline(selectedTask.daysRemaining)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-3 mt-2">
              {selectedTask?.type === 'meeting' ? (
                <>
                  <Button 
                    onClick={handleJoinMeeting} 
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-11 shadow-md"
                    disabled={!isJoinButtonEnabled(selectedTask) || !selectedTask.googleMeetUrl && !selectedTask.meetingLink}
                    title={!isJoinButtonEnabled(selectedTask) ? `Join available 10 minutes before the meeting` : 'Click to join the meeting'}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {isJoinButtonEnabled(selectedTask) ? 'Join Meeting' : 'Not Available Yet'}
                  </Button>
                  <Button 
                    onClick={() => handleCancelClick(selectedTask)}
                    variant="destructive"
                    className="flex-1 h-11 shadow-md"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel Meeting
                  </Button>
                </>
              ) : selectedTask?.type === 'feedback' ? (
                <>
                  <Button 
                    onClick={async () => {
                      let formUrl = selectedTask.feedbackFormUrl;
                      
                      // Generate URL on the fly if not present
                      if (!formUrl && user) {
                        formUrl = generateFeedbackFormUrl({
                          menteeName: user.name || user.mentee_name || 'Mentee',
                          mentorName: selectedTask.mentorName,
                          sessionDate: selectedTask.date,
                          sessionTime: selectedTask.time
                        });
                      }
                      
                      if (formUrl) {
                        // Open form and close dialog
                        toast({
                          title: "Feedback Form Opened",
                          description: "The button will disappear only after you submit the Google Form.",
                        });
                        window.open(formUrl, '_blank');
                        setIsDialogOpen(false);
                        
                        // Refresh tasks after a short delay
                        setTimeout(() => {
                          fetchTasks();
                        }, 1000);
                      }
                    }}
                    className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 h-11 shadow-md"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Fill Feedback Form
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)} 
                    className="flex-1 h-11 border-gray-300 hover:bg-gray-50"
                  >
                    Close
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)} 
                  className="w-full h-11 border-amber-300 hover:bg-amber-50"
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Meeting Dialog */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) {
            // If closing cancel dialog, reopen the details dialog with the same task
            if (meetingToCancel) {
              setSelectedTask(meetingToCancel);
              setIsDialogOpen(true);
            }
            setCancelReason('');
            setMeetingToCancel(null);
            setIsCancelling(false);
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Meeting</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel this meeting with {meetingToCancel?.mentorName}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="cancel-reason">Reason for cancellation <span className="text-red-500">*</span></Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Let the mentor know why you need to cancel..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-2"
                  rows={3}
                  required
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancelling}>Keep Meeting</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelMeeting}
                disabled={isCancelling || !cancelReason.trim()}
                className="bg-red-600 hover:bg-red-700"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Meeting'
                )}
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
