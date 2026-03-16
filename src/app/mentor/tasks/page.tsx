'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Calendar as CalendarIcon, Clock, List, Calendar, ChevronLeft, ChevronRight, Video, ShieldAlert, User, Mail, Coins, AlertCircle, FileText, ExternalLink, MessageSquare, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRequireAuth } from '@/hooks/use-auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  mentor_report?: {
    status: string;
    reason: string | null;
    filedAt: string | null;
  } | null;
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
  mentorReport?: {
    status: string;
    reason: string | null;
    filedAt: string | null;
  } | null;
  userRole?: 'mentor' | 'mentee';
  feedbackFormUrl?: string;
  feedbackFormSent?: boolean;
  daysRemaining?: number;
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
  
  // Add missing state for accepting requests
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  // Report state
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedMeetingToReport, setSelectedMeetingToReport] = useState<TaskItem | null>(null);
  const [reportReason, setReportReason] = useState('');
  
  // Mentee details state
  const [menteeDetails, setMenteeDetails] = useState<any>(null);
  const [loadingMenteeDetails, setLoadingMenteeDetails] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  
  // Cancel meeting state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<TaskItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchMeetingRequests = useCallback(async () => {
    if (!user) return;
    
    try {
      const timestamp = new Date().getTime();
      
      // Fetch meetings where user is MENTOR (receiving requests)
      const mentorResponse = await fetch(`/api/meeting-requests?mentorId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // **NEW: Also fetch meetings where user is MENTEE (sent requests)**
      const menteeResponse = await fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!mentorResponse.ok) {
        throw new Error('Failed to fetch meeting requests');
      }

      const mentorRequests: MeetingRequest[] = await mentorResponse.json();
      let menteeRequests: MeetingRequest[] = [];
      
      if (menteeResponse.ok) {
        menteeRequests = await menteeResponse.json();
        console.log('Fetched requests sent by user (as mentee):', menteeRequests.length);
      }

      // Combine both arrays
      const allRequests = [...mentorRequests, ...menteeRequests];
      
      const taskItems: TaskItem[] = [];
      const now = new Date();

      console.log('Total meetings fetched:', allRequests.length);
      console.log('Current user (mentor) ID:', user.id);

      allRequests.forEach((request) => {
        // Skip cancelled meetings
        if (request.scheduled_status === 'cancelled') {
          console.log('Skipping cancelled meeting:', request.meetingId);
          return;
        }

        // **IMPORTANT: Different filtering logic based on decision status**
        
        // For PENDING requests: Show for both roles (mentor receiving OR mentee who sent)
        // (User could be either the mentor receiving the request or the mentee who sent it)
        
        // For ACCEPTED/REJECTED meetings: Show regardless of role
        // (User could be either mentor or mentee in accepted meetings)

        // Parse meeting date and time
        let meetingDateTime: Date;
        
        if (request.time.includes('AM') || request.time.includes('PM')) {
          const [time, period] = request.time.split(' ');
          const [hours, minutes] = time.split(':').map(Number);
          const hour24 = period === 'PM' && hours !== 12 ? hours + 12 : (period === 'AM' && hours === 12 ? 0 : hours);
          meetingDateTime = new Date(request.date);
          meetingDateTime.setHours(hour24, minutes, 0, 0);
        } else {
          const [hours, minutes] = request.time.split(':').map(Number);
          meetingDateTime = new Date(request.date);
          meetingDateTime.setHours(hours, minutes, 0, 0);
        }

        // **NEW: Determine if user is mentor or mentee in this meeting**
        const userIsMentor = request.mentorUID === user.id;

        console.log(`Meeting ${request.meetingId}:`, {
          date: request.date,
          time: request.time,
          parsed: meetingDateTime.toISOString(),
          isPast: meetingDateTime < now,
          decision: request.decision,
          mentorUID: request.mentorUID,
          menteeUID: request.menteeUID,
          currentUserID: user.id,
          userRole: userIsMentor ? 'mentor' : 'mentee'
        });

        // Format title with day, date, and time
        const dayName = meetingDateTime.toLocaleDateString('en-US', { weekday: 'long' });
        const formattedDate = meetingDateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const titleDateTime = `${dayName}, ${formattedDate} at ${request.time}`;

        // Add pending requests (for both mentor receiving AND mentee who sent)
        if (request.decision === 'pending') {
          taskItems.push({
            id: `pending-${request.meetingId}`,
            type: 'pending_request',
            title: titleDateTime,
            description: userIsMentor 
              ? `Meeting request from ${request.mentee_name}`
              : `Meeting request sent to ${request.mentor_name}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            menteeName: userIsMentor ? request.mentee_name : request.mentor_name,
            menteeEmail: userIsMentor ? request.mentee_email : request.mentor_email,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            menteeUID: request.menteeUID,
            mentorUID: request.mentorUID,
            message: request.message,
            // Track the user's role in this request
            userRole: userIsMentor ? 'mentor' : 'mentee'
          });
        }

        // Add upcoming meetings (accepted AND future - for both mentor and mentee)
        const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
        
        if (request.decision === 'accepted' && meetingDateTime > now) {
          const hoursUntilMeeting = Math.floor((meetingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60));
          
          taskItems.push({
            id: `meeting-${request.meetingId}`,
            type: 'meeting',
            title: titleDateTime,
            description: `Scheduled meeting at ${request.time}${userIsMentor ? '' : ' (You requested)'}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            // **FIX: Show the OTHER person's name (mentor if user was mentee, mentee if user was mentor)**
            menteeName: userIsMentor ? request.mentee_name : request.mentor_name,
            menteeEmail: userIsMentor ? request.mentee_email : request.mentor_email,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            menteeUID: request.menteeUID,
            mentorUID: request.mentorUID,
            message: request.message,
            meetingLink: request.meetingLink,
            googleMeetUrl: request.googleMeetUrl,
            hoursRemaining: hoursUntilMeeting,
            // **NEW: Add flag to identify user's role**
            userRole: userIsMentor ? 'mentor' : 'mentee'
          });
        }

        // Add in-progress meetings (meeting has started but less than 2 hours have passed)
        if (request.decision === 'accepted' && meetingDateTime <= now && now < twoHoursAfterMeeting) {
          taskItems.push({
            id: `inprogress-${request.meetingId}`,
            type: 'in_progress_meeting',
            title: titleDateTime,
            description: `Meeting in progress${userIsMentor ? '' : ' (You requested)'}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            menteeName: userIsMentor ? request.mentee_name : request.mentor_name,
            menteeEmail: userIsMentor ? request.mentee_email : request.mentor_email,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            menteeUID: request.menteeUID,
            mentorUID: request.mentorUID,
            message: request.message,
            meetingLink: request.meetingLink,
            googleMeetUrl: request.googleMeetUrl,
            userRole: userIsMentor ? 'mentor' : 'mentee'
          });
        }

        // Add past meetings (accepted AND 2+ hours have passed - for both mentor and mentee)
        if (request.decision === 'accepted' && now >= twoHoursAfterMeeting) {
          const hasFeedback = request.feedbackFormSent ? true : false;
          const hoursAfterMeeting = Math.floor((now.getTime() - meetingDateTime.getTime()) / (1000 * 60 * 60));
          
          console.log(`Past meeting ${request.meetingId} - userIsMentor: ${userIsMentor}, feedbackFormSent:`, request.feedbackFormSent, 'hasFeedback:', hasFeedback, 'hours after:', hoursAfterMeeting);
          
          taskItems.push({
            id: `past-meeting-${request.meetingId}`,
            type: 'past_meeting',
            title: titleDateTime,
            description: `Meeting held on ${request.date} at ${request.time}${userIsMentor ? '' : ' (You requested)'}`,
            date: request.date,
            time: request.time,
            meetingId: request.meetingId,
            // **FIX: Show the OTHER person's name**
            menteeName: userIsMentor ? request.mentee_name : request.mentor_name,
            menteeEmail: userIsMentor ? request.mentee_email : request.mentor_email,
            mentorName: request.mentor_name,
            mentorEmail: request.mentor_email,
            menteeUID: request.menteeUID,
            mentorUID: request.mentorUID,
            message: request.message,
            mentorReport: request.mentor_report,
            feedbackFormUrl: request.feedbackFormUrl,
            feedbackFormSent: request.feedbackFormSent,
            // **NEW: Add flag to identify user's role**
            userRole: userIsMentor ? 'mentor' : 'mentee'
          });
          
          // Create feedback task if user was mentee (requester) and feedback is needed
          if (!userIsMentor && hoursAfterMeeting >= 2 && !hasFeedback) {
            const daysAfterMeeting = hoursAfterMeeting / 24;
            const daysRemaining = Math.max(0, 5 - daysAfterMeeting);
            
            console.log(`Checking feedback task for ${request.meetingId} (mentor as mentee) - daysAfter: ${daysAfterMeeting}, daysRemaining: ${daysRemaining}`);
            
            if (daysRemaining > 0) {
              console.log(`✅ Creating feedback task for mentor-as-mentee meeting ${request.meetingId}`);
              taskItems.push({
                id: `feedback-${request.meetingId}`,
                type: 'feedback',
                title: titleDateTime,
                description: `Feedback needed for meeting with ${request.mentor_name}`,
                date: request.date,
                time: request.time,
                meetingId: request.meetingId,
                menteeName: request.mentor_name,
                menteeEmail: request.mentor_email,
                mentorName: request.mentor_name,
                mentorEmail: request.mentor_email,
                menteeUID: request.menteeUID,
                mentorUID: request.mentorUID,
                message: request.message,
                daysRemaining: Math.floor(daysRemaining),
                hoursRemaining: Math.floor(daysRemaining * 24),
                feedbackFormUrl: request.feedbackFormUrl,
                userRole: 'mentee'
              });
            } else {
              console.log(`❌ Past 5-day deadline for meeting ${request.meetingId}`);
            }
          } else {
            console.log(`❌ Not creating feedback task for ${request.meetingId} - UserIsMentor: ${userIsMentor}, Hours: ${hoursAfterMeeting}, HasFeedback: ${hasFeedback}`);
          }
        }
      });

      // Sort by urgency
      taskItems.sort((a, b) => {
        // Priority order: pending_request > feedback > in_progress_meeting > meeting > past_meeting
        if (a.type === 'pending_request' && b.type !== 'pending_request') return -1;
        if (a.type !== 'pending_request' && b.type === 'pending_request') return 1;
        
        if (a.type === 'feedback' && b.type !== 'pending_request') return -1;
        if (b.type === 'feedback' && a.type !== 'pending_request') return 1;
        
        if (a.type === 'in_progress_meeting' && !['pending_request', 'feedback'].includes(b.type)) return -1;
        if (b.type === 'in_progress_meeting' && !['pending_request', 'feedback'].includes(a.type)) return 1;
        
        if (a.type === 'meeting' && b.type === 'past_meeting') return -1;
        if (a.type === 'past_meeting' && b.type === 'meeting') return 1;
        
        if (a.type === 'meeting' && b.type === 'meeting') {
          return (a.hoursRemaining || 0) - (b.hoursRemaining || 0);
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
      fetchMeetingRequests();
    }
  }, [user, fetchMeetingRequests]);

  // Fetch mentee details when dialog opens
  const fetchMenteeDetails = useCallback(async (menteeUID: string) => {
    if (!menteeUID) return;
    
    setLoadingMenteeDetails(true);
    try {
      const response = await fetch(`/api/users/${menteeUID}`);
      if (response.ok) {
        const data = await response.json();
        setMenteeDetails(data);
      } else {
        console.error('Failed to fetch mentee details');
      }
    } catch (error) {
      console.error('Error fetching mentee details:', error);
    } finally {
      setLoadingMenteeDetails(false);
    }
  }, []);

  const handleTaskClick = (task: TaskItem) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
    setMenteeDetails(null); // Reset previous details
    
    // Fetch mentee details if viewing as mentor AND acting as mentor in this meeting
    // userRole on the task tells us if the current user was mentor or mentee in THIS meeting
    if (task.menteeUID && user?.role === 'mentor' && task.userRole === 'mentor') {
      fetchMenteeDetails(task.menteeUID);
    }
  };

  const handleAcceptRequest = async (meetingId: string) => {
    if (!selectedTask || !user) return;
    
    try {
      setIsAccepting(meetingId);
      setActionLoading(true);

      // Accept the meeting first
      const response = await fetch("/api/meeting-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: user.id,
          meetingId,
          decision: "accepted",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to accept meeting");
      }

      console.log('Meeting accepted, creating Google Meet link...');

      // Create Google Meet link
      try {
        const [year, month, day] = selectedTask.date.split('-').map(Number);
        
        let hours: number, minutes: number;
        if (selectedTask.time.includes('AM') || selectedTask.time.includes('PM')) {
          const [time, period] = selectedTask.time.split(' ');
          const [h, m] = time.split(':').map(Number);
          hours = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
          minutes = m;
        } else {
          [hours, minutes] = selectedTask.time.split(':').map(Number);
        }
        
        const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        
        const startDateTime = startDate.toISOString();
        const endDateTime = endDate.toISOString();

        const meetResponse = await fetch("/api/create-meet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `Mentorship Session with ${selectedTask.menteeName}`,
            description: `Meeting requested by ${selectedTask.menteeName}\n\nMessage: ${selectedTask.message || 'No message provided'}`,
            startDateTime,
            endDateTime,
            attendees: [selectedTask.menteeEmail, user.email].filter(Boolean),
            mentorId: user.id,
            meetingId: selectedTask.meetingId,
            menteeId: selectedTask.menteeUID, // Add this
          }),
        });

        const meetData = await meetResponse.json();

        if (meetResponse.ok) {
          console.log('Google Meet created successfully:', meetData);
          toast({
            title: "Meeting Accepted ✅",
            description: `Google Meet link created and sent to ${selectedTask.menteeName}`,
          });
        } else {
          console.error('Failed to create Google Meet link:', meetData);
          toast({
            title: "Partial Success",
            description: meetData.message || "Meeting accepted but failed to create Google Meet link.",
            variant: "default",
          });
        }
      } catch (meetError) {
        console.error("Error creating Google Meet:", meetError);
        toast({
          title: "Partial Success",
          description: "Meeting accepted but failed to create Google Meet link.",
          variant: "default",
        });
      }

      // Close dialog
      setIsDialogOpen(false);
      
      // Wait a moment for database to update, then refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchMeetingRequests();
      
    } catch (error) {
      console.error("Error accepting request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to accept meeting request",
      });
    } finally {
      setIsAccepting(null);
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedTask) return;
    
    setActionLoading(true);
    try {
      const response = await fetch('/api/meeting-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mentorId: user?.id,
          meetingId: selectedTask.meetingId,
          decision: 'rejected'
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Meeting request rejected.",
        });
        setIsDialogOpen(false);
        await fetchMeetingRequests();
      } else {
        throw new Error('Failed to reject meeting');
      }
    } catch (error) {
      console.error('Failed to reject meeting:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: "Failed to reject meeting request.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinMeeting = () => {
    // Try googleMeetUrl first, then fall back to meetingLink
    const meetingUrl = selectedTask?.googleMeetUrl || selectedTask?.meetingLink;
    
    if (meetingUrl) {
      window.open(meetingUrl, '_blank', 'noopener,noreferrer');
      setIsDialogOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: "Error",
        description: "Meeting link not available. Please contact support.",
      });
    }
  };

  const generateFeedbackFormUrl = (task: TaskItem) => {
    // If form URL already exists, use it
    if (task.feedbackFormUrl) {
      return task.feedbackFormUrl;
    }
    
    // Otherwise generate it - use current user's name as the mentee (feedback giver)
    const menteeName = user?.name || 'Mentor';
    const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdVEs5LL2tLlH5yshUYpPW5XhNlB9_rtV5-PkE6438qpqJg5g/viewform';
    const params = new URLSearchParams({
      'usp': 'pp_url',
      'entry.1761271270': menteeName,
      'entry.768740967': task.mentorName || '',
      'entry.1198034537': task.date,
      'entry.183080322': task.time
    });
    
    return `${baseUrl}?${params.toString()}`;
  };

  const handleOpenFeedbackForm = async () => {
    if (!selectedTask) return;
    const formUrl = generateFeedbackFormUrl(selectedTask);
    
    // Mark feedback as submitted and replenish token (only once)
    try {
      const response = await fetch('/api/meetings/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: selectedTask.meetingId,
          menteeId: user?.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.alreadySubmitted) {
          toast({
            title: "Already Submitted",
            description: "Feedback for this meeting was already submitted.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Feedback Form Opened",
            description: `Token replenished! New balance: ${data.newTokenBalance} tokens`,
          });
        }
        
        // Refresh to update status
        await fetchMeetingRequests();
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
    
    // Open form and close dialog
    window.open(formUrl, '_blank', 'noopener,noreferrer');
    setIsDialogOpen(false);
  };

  const openReportDialog = (meeting: TaskItem, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setIsDialogOpen(false);
    setSelectedMeetingToReport(meeting);
    setReportReason('');
    setReportDialogOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!selectedMeetingToReport || !user) {
      return;
    }

    const trimmedReason = reportReason.trim();
    if (trimmedReason.length < 10) {
      toast({
        variant: 'destructive',
        title: 'More details needed',
        description: 'Please provide at least 10 characters describing the issue.',
      });
      return;
    }

    setIsReporting(true);
    try {
      const res = await fetch(
        `/api/schedule/${selectedMeetingToReport.meetingId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'report',
            reporterRole: 'mentor',
            reporterId: user.id,
            reason: trimmedReason,
          }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to submit report.');
      }

      toast({
        title: 'Report submitted',
        description:
          "Thanks for flagging this session. We'll review it shortly.",
      });

      setReportDialogOpen(false);
      setSelectedMeetingToReport(null);
      setReportReason('');
      await fetchMeetingRequests();
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast({
        variant: 'destructive',
        title: 'Report failed',
        description:
          (error as Error).message || 'Unable to submit report right now.',
      });
    } finally {
      setIsReporting(false);
    }
  };

  const handleCancelClick = (task: TaskItem) => {
    setMeetingToCancel(task);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const handleCancelMeeting = async () => {
    if (!meetingToCancel || !user) return;

    if (!cancelReason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Reason Required',
        description: 'Please provide a reason for cancellation.',
      });
      return;
    }

    setIsCancelling(true);
    try {
      const response = await fetch(`/api/schedule/${meetingToCancel.meetingId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: cancelReason,
          cancelledBy: user.id, // Mentor cancelling
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to cancel meeting' }));
        console.error('Cancel meeting error:', errorData);
        throw new Error(errorData.message || 'Failed to cancel meeting');
      }

      const result = await response.json();

      toast({
        title: 'Meeting Cancelled',
        description: result.tokenStatus === 'auto-replenished' 
          ? 'Meeting cancelled successfully. Token refunded to the requester.'
          : 'Meeting cancelled. Token refund pending admin approval.',
      });

      setCancelDialogOpen(false);
      setMeetingToCancel(null);
      setCancelReason('');
      await fetchMeetingRequests();
    } catch (error) {
      console.error('Failed to cancel meeting:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel meeting. Please try again.',
      });
    } finally {
      setIsCancelling(false);
    }
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
      // Create date string in local timezone format (YYYY-MM-DD)
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      // Include both accepted (meetings, past_meetings) and pending requests
      const dayTasks = tasks.filter(task => 
        task.date === dateString && 
        (task.type === 'meeting' || task.type === 'pending_request' || task.type === 'past_meeting')
      );
      
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
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'meeting':
        return 'bg-green-500 hover:bg-green-600';
      case 'in_progress_meeting':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'past_meeting':
        return 'bg-red-500 hover:bg-red-600';
      case 'feedback':
        return 'bg-orange-500 hover:bg-orange-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getTimelineCircleColor = (type: string) => {
    switch (type) {
      case 'pending_request':
        return 'bg-yellow-500';
      case 'meeting':
        return 'bg-green-500';
      case 'in_progress_meeting':
        return 'bg-blue-500';
      case 'past_meeting':
        return 'bg-red-500';
      case 'feedback':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'pending_request':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'meeting':
        return <Video className="w-5 h-5 text-blue-600" />;
      case 'past_meeting':
        return <CheckSquare className="w-5 h-5 text-gray-600" />;
      case 'feedback':
        return <MessageSquare className="w-5 h-5 text-orange-600" />;
      default:
        return <CheckSquare className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTaskLabel = (type: string) => {
    switch (type) {
      case 'pending_request':
        return 'Pending';
      case 'meeting':
        return 'Upcoming';
      case 'in_progress_meeting':
        return 'Meeting In Progress';
      case 'past_meeting':
        return 'Finished';
      case 'feedback':
        return 'Feedback Due';
      default:
        return 'Task';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Loading tasks...</p>
        </div>
      </div>
    );
  }

  const calendarDays = getDaysInMonth(currentDate);
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Count tasks by type
  const pendingCount = tasks.filter(t => t.type === 'pending_request').length;
  const upcomingCount = tasks.filter(t => t.type === 'meeting').length;
  const inProgressCount = tasks.filter(t => t.type === 'in_progress_meeting').length;
  const feedbackCount = tasks.filter(t => t.type === 'feedback').length;
  const completedCount = tasks.filter(t => t.type === 'past_meeting').length;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg flex items-center justify-between">
            <span>Your Tasks</span>
            <button
              onClick={() => { setLoading(true); fetchMeetingRequests(); }}
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
          <div className="sr-only">Mentor tasks header</div>
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
              { key: 'pending', label: 'Pending Requests', value: pendingCount, Icon: Clock, accent: 'bg-yellow-400' },
              { key: 'upcoming', label: 'Upcoming', value: upcomingCount, Icon: Video, accent: 'bg-blue-400' },
              { key: 'feedback', label: 'Feedback Due', value: feedbackCount, Icon: MessageSquare, accent: 'bg-purple-400' },
              { key: 'completed', label: 'Completed', value: completedCount, Icon: CheckSquare, accent: 'bg-green-400' },
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
                    const mentorReportStatus = task.mentorReport?.status;
                    const myReportPending = mentorReportStatus === 'pending';
                    const myReportResolved = mentorReportStatus === 'resolved';
                    const dateInfo = getDateDisplay(task.date);
                    const fullDateTime = getFullDateTime(task.date, task.time);
                    const isLastItem = index === tasks.length - 1;
                    
                    // **NEW: Determine the label to display**
                    const displayLabel = task.userRole === 'mentee' ? 'Mentor' : 'Mentee';

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
                                ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' 
                                : task.type === 'meeting'
                                ? 'bg-gradient-to-br from-green-400 to-green-600'
                                : task.type === 'in_progress_meeting'
                                ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                : 'bg-gradient-to-br from-gray-400 to-gray-600'
                            } flex-shrink-0 ring-4 ring-white transform hover:scale-105 transition-transform duration-200`}>
                              {/* Icon Badge */}
                              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border-2 border-white">
                                {task.type === 'pending_request' ? (
                                  <Clock className="w-4 h-4 text-yellow-600" />
                                ) : task.type === 'meeting' ? (
                                  <Video className="w-4 h-4 text-green-600" />
                                ) : task.type === 'in_progress_meeting' ? (
                                  <Video className="w-4 h-4 text-blue-600" />
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
                                  ? 'bg-gradient-to-b from-yellow-200 to-gray-200'
                                  : task.type === 'meeting'
                                  ? 'bg-gradient-to-b from-green-200 to-gray-200'
                                  : 'bg-gradient-to-b from-gray-200 to-gray-100'
                              }`}></div>
                            )}
                          </div>

                          {/* Right Side - Enhanced Card */}
                          <div className={`flex-1 ${!isLastItem ? 'pb-8' : 'pb-2'}`}>
                            <Card 
                              className="border-2 border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden bg-white hover:border-gray-400 transform hover:-translate-y-1"
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
                                    ) : (
                                      <CheckSquare className="w-3.5 h-3.5" />
                                    )}
                                    {getTaskLabel(task.type)}
                                  </Badge>
                                  
                                  {/* Hours Remaining Indicator for Upcoming Meetings */}
                                  {task.type === 'meeting' && task.hoursRemaining !== undefined && (
                                    <Badge variant="outline" className="text-xs px-3 py-1 border-blue-300 text-blue-700 font-medium">
                                      {task.hoursRemaining <= 0 
                                        ? 'Starting soon' 
                                        : task.hoursRemaining < 24
                                        ? `${task.hoursRemaining}h left`
                                        : `${Math.floor(task.hoursRemaining / 24)}d left`
                                      }
                                    </Badge>
                                  )}
                                  
                                  {/* Days Remaining Indicator for Feedback Tasks */}
                                  {task.type === 'feedback' && task.daysRemaining !== undefined && (
                                    <Badge variant="outline" className="text-xs px-3 py-1 border-orange-300 text-orange-700 font-semibold">
                                      {formatFeedbackDeadline(task.daysRemaining)}
                                    </Badge>
                                  )}
                                </div>

                                {/* Enhanced Mentee/Mentor Name and DateTime */}
                                <div className="space-y-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg ring-2 ring-blue-100">
                                      <User className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                    </div>
                                    <div className="flex-1">
                                      {/* **FIX: Display correct label based on user's role** */}
                                      <p className="text-xs text-gray-500 font-medium mb-0.5">{displayLabel}</p>
                                      <p className="font-bold text-gray-900 text-lg leading-tight">{task.menteeName}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg ring-2 ring-purple-100">
                                      <Clock className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-gray-500 font-medium mb-0.5">Scheduled Time</p>
                                      <p className="font-semibold text-gray-700 text-sm leading-tight">{fullDateTime}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Enhanced Report Badges */}
                                {(myReportPending || myReportResolved) && (
                                  <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t-2 border-gray-400">
                                    {myReportPending && (
                                      <Badge variant="outline" className="border-2 border-yellow-400 text-yellow-700 text-xs font-semibold px-3 py-1 bg-yellow-50">
                                        <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                                        Report Pending Review
                                      </Badge>
                                    )}
                                    {myReportResolved && (
                                      <Badge variant="outline" className="border-2 border-green-400 text-green-700 text-xs font-semibold px-3 py-1 bg-green-50">
                                        <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                                        Report Resolved
                                      </Badge>
                                    )}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-0 shadow-lg bg-white">
              <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-white px-6 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">{monthYear}</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')} className="border-gray-500 hover:bg-gray-50">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="border-gray-500 hover:bg-gray-50 font-medium">
                      Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('next')} className="border-gray-500 hover:bg-gray-50">
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
                            ? 'border-yellow-400 ring-2 ring-yellow-100 shadow-sm'
                            : 'border-gray-400 hover:border-gray-500 hover:shadow-sm'
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
                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200'
                                : task.type === 'meeting'
                                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-400'
                            }`}
                            title={task.title}
                          >
                            <div className="font-semibold truncate">{task.time}</div>
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

        {/* Task Details Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-xl sm:max-w-2xl">
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 bg-gray-100 rounded-xl">
                  {selectedTask && getTaskIcon(selectedTask.type)}
                </div>
                <DialogTitle className="text-xl font-semibold">Meeting Details</DialogTitle>
              </div>
              <DialogDescription className="text-gray-600 text-base">
                {selectedTask?.description}
              </DialogDescription>
            </DialogHeader>

            {selectedTask && (
              <div className="space-y-5 py-2">
                <Badge className={`${getTaskBadgeColor(selectedTask.type)} text-white px-3 py-1 text-sm font-medium`}>
                  {getTaskLabel(selectedTask.type)}
                </Badge>

                <div className="space-y-4 p-5 bg-gray-50 rounded-xl border border-gray-400">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <CalendarIcon className="w-4 h-4 text-gray-600 flex-shrink-0" />
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
                      <Clock className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Time:</span>
                      <span className="ml-2 font-semibold text-gray-900">{selectedTask.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <User className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    </div>
                    <div>
                      {/* **FIX: Display correct label in dialog** */}
                      <span className="text-gray-600 font-medium">
                        {selectedTask.userRole === 'mentee' ? 'Mentor:' : 'Mentee:'}
                      </span>
                      <span className="ml-2 font-semibold text-gray-900">{selectedTask.menteeName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white rounded-lg">
                      <Mail className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    </div>
                    <div>
                      <span className="text-gray-600 font-medium">Email:</span>
                      <span className="ml-2 text-blue-600 font-medium">{selectedTask.menteeEmail}</span>
                    </div>
                  </div>
                </div>

                {/* Mentee Full Details Section (for all meeting types when mentor is viewing and acting as mentor) */}
                {user?.role === 'mentor' && selectedTask.menteeUID && selectedTask.userRole === 'mentor' && (
                  <div className="space-y-3">
                    {loadingMenteeDetails ? (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-400 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />
                        <span className="text-sm text-gray-600">Loading mentee details...</span>
                      </div>
                    ) : menteeDetails ? (
                      <div className="p-5 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200">
                        <h3 className="font-semibold text-base text-purple-900 mb-4 flex items-center gap-2">
                          <User className="w-5 h-5" />
                          Mentee Profile
                        </h3>
                        <div className="space-y-3 text-sm">
                          {menteeDetails.mentee_institution && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">Institution:</span>
                              <span className="text-purple-900">{menteeDetails.mentee_institution}</span>
                            </div>
                          )}
                          {menteeDetails.mentee_occupation && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">Occupation:</span>
                              <span className="text-purple-900">{menteeDetails.mentee_occupation}</span>
                            </div>
                          )}
                          {menteeDetails.mentee_age && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">Age:</span>
                              <span className="text-purple-900">{menteeDetails.mentee_age}</span>
                            </div>
                          )}
                          {menteeDetails.linkedin && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">LinkedIn:</span>
                              <a 
                                href={menteeDetails.linkedin.startsWith('http') ? menteeDetails.linkedin : `https://${menteeDetails.linkedin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-all"
                              >
                                {menteeDetails.linkedin}
                              </a>
                            </div>
                          )}
                          {menteeDetails.github && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">GitHub:</span>
                              <a 
                                href={menteeDetails.github.startsWith('http') ? menteeDetails.github : `https://github.com/${menteeDetails.github}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-all"
                              >
                                {menteeDetails.github}
                              </a>
                            </div>
                          )}
                          {(menteeDetails.attachmentPath || menteeDetails.cv_link) && menteeDetails.allowCVShare && (
                            <div className="flex items-start gap-2">
                              <span className="text-purple-700 font-medium min-w-[100px]">CV:</span>
                              <button 
                                onClick={() => {
                                  const cvUrl = (menteeDetails.attachmentPath || menteeDetails.cv_link)!.startsWith('http') 
                                    ? (menteeDetails.attachmentPath || menteeDetails.cv_link)
                                    : `/api/attachment-proxy?url=${encodeURIComponent((menteeDetails.attachmentPath || menteeDetails.cv_link)!)}`;
                                  window.open(cvUrl, '_blank');
                                }}
                                className="text-blue-600 hover:underline break-all text-left cursor-pointer"
                              >
                                View CV
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {selectedTask.message && (
                  <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                    <p className="font-semibold text-sm text-blue-900 mb-2">Message:</p>
                    <p className="text-sm text-blue-800 leading-relaxed">{selectedTask.message}</p>
                  </div>
                )}

                {selectedTask.type === 'feedback' && (
                  <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-5 h-5 text-orange-700 mt-0.5 flex-shrink-0" />
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

                {selectedTask.type === 'past_meeting' && selectedTask.mentorReport && (
                  <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-orange-700 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-base text-orange-800 mb-1">Report Submitted</p>
                        <p className="text-sm text-orange-700 mb-2">
                          Status: <span className="font-semibold">{selectedTask.mentorReport.status}</span>
                        </p>
                        {selectedTask.mentorReport.reason && (
                          <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                            {selectedTask.mentorReport.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-3 mt-2">
              {selectedTask?.type === 'pending_request' ? (
                <>
                  {/* Show different buttons based on user's role */}
                  {selectedTask.userRole === 'mentor' ? (
                    // User is mentor receiving the request - show Accept/Reject
                    <>
                      <Button
                        variant="outline"
                        className="flex-1 h-11"
                        onClick={handleRejectRequest}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                      </Button>
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 h-11"
                        onClick={() => handleAcceptRequest(selectedTask.meetingId)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                      </Button>
                    </>
                  ) : (
                    // User is mentee who sent the request - show Cancel
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                        className="flex-1 h-11"
                      >
                        Close
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleCancelClick(selectedTask)}
                        className="flex-1 h-11"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel Request
                      </Button>
                    </>
                  )}
                </>
              ) : selectedTask?.type === 'meeting' ? (
                <>
                  <Button 
                    variant="outline"
                    onClick={() => handleCancelClick(selectedTask)}
                    className="flex-1 h-11 border-red-300 hover:bg-red-50 text-red-600 hover:text-red-700"
                  >
                    Cancel Meeting
                  </Button>
                  <Button 
                    onClick={handleJoinMeeting} 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 h-11"
                    disabled={!selectedTask.googleMeetUrl && !selectedTask.meetingLink}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Join Meeting
                  </Button>
                </>
              ) : selectedTask?.type === 'past_meeting' ? (
                <>
                  {/* Show feedback form button for past meetings where user was mentee and hasn't submitted feedback yet */}
                  {selectedTask.userRole === 'mentee' && !selectedTask.feedbackFormSent && (
                    <Button 
                      onClick={handleOpenFeedbackForm}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 h-11"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Fill Feedback Form
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)} 
                    className={selectedTask.userRole === 'mentee' && !selectedTask.feedbackFormSent ? 'flex-1 h-11' : 'flex-1 h-11'}
                  >
                    Close
                  </Button>
                  {!selectedTask.mentorReport && selectedTask.userRole === 'mentor' && (
                    <Button 
                      onClick={() => openReportDialog(selectedTask)}
                      variant="destructive"
                      className="flex-1 h-11"
                    >
                      <ShieldAlert className="w-4 h-4 mr-2" />
                      Report
                    </Button>
                  )}
                </>
              ) : selectedTask?.type === 'feedback' ? (
                <>
                  <Button 
                    onClick={handleOpenFeedbackForm}
                    className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 h-11"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Fill Feedback Form
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)} 
                    className="flex-1 h-11"
                  >
                    Close
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)} 
                  className="w-full h-11"
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Report Meeting Dialog */}
        <Dialog
          open={reportDialogOpen}
          onOpenChange={(open) => {
            setReportDialogOpen(open);
            if (!open) {
              setSelectedMeetingToReport(null);
              setReportReason('');
            }
          }}
        >
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader className="space-y-3">
              <DialogTitle className="flex items-center gap-2 text-orange-700 text-xl">
                <ShieldAlert className="h-6 w-6" />
                Report Meeting
              </DialogTitle>
              <DialogDescription className="text-base">
                Flag inappropriate behavior from this session
              </DialogDescription>
            </DialogHeader>

            {selectedMeetingToReport && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-400 mb-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">Meeting Details:</p>
                <p className="text-sm text-gray-700 mb-1">
                  <span className="font-medium">Mentee:</span> {selectedMeetingToReport.menteeName}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Date:</span> {selectedMeetingToReport.date} at {selectedMeetingToReport.time}
                </p>
              </div>
            )}

            <div className="bg-orange-50 border-2 border-orange-200 p-4 rounded-xl mb-4">
              <p className="text-sm text-orange-800 leading-relaxed">
                Your report is confidential and helps maintain platform quality.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="mentor-report-reason" className="text-sm font-semibold">
                What happened? <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="mentor-report-reason"
                placeholder="Describe the issue in detail..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="min-h-[140px] resize-none"
              />
              <p className="text-xs text-gray-500">
                Minimum 10 characters required
              </p>
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReportDialogOpen(false);
                  setSelectedMeetingToReport(null);
                  setReportReason('');
                }}
                disabled={isReporting}
                className="flex-1 h-11"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmitReport}
                disabled={isReporting}
                className="flex-1 h-11"
              >
                {isReporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Report'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Meeting Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader className="space-y-3">
              <DialogTitle className="flex items-center gap-2 text-red-700 text-xl">
                <AlertCircle className="h-6 w-6" />
                Cancel Meeting
              </DialogTitle>
              <DialogDescription className="text-base">
                Please provide a reason for cancelling this meeting. The token will be immediately refunded to the requester.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label htmlFor="cancel-reason" className="text-sm font-semibold">
                Cancellation Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder="Explain why you need to cancel this meeting..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="min-h-[140px] resize-none"
              />
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCancelDialogOpen(false);
                  setMeetingToCancel(null);
                  setCancelReason('');
                }}
                disabled={isCancelling}
                className="flex-1 h-11"
              >
                Keep Meeting
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelMeeting}
                disabled={isCancelling}
                className="flex-1 h-11"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Meeting'
                )}
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