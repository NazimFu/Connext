"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MessageSquare,
  Video,
  User,
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Send,
  Coins,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useRequireAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistance } from "date-fns";
import { motion } from "framer-motion";

interface MeetingRequest {
  meetingId: string;
  menteeUID: string;
  mentorUID: string;
  date: string;
  time: string;
  decision: "pending" | "accepted" | "rejected";
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
  feedbackFormUrl?: string;
  feedbackFormSent?: boolean;
}

export default function MenteeDashboardPage() {
  const { user, isLoading } = useRequireAuth("mentee");
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [fetchingData, setFetchingData] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [meetingToCancel, setMeetingToCancel] = useState<MeetingRequest | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();

  const fetchMeetingRequests = useCallback(async () => {
    if (!user) return;
    try {
      setFetchingData(true);
      const timestamp = new Date().getTime();
      
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

      const data = await response.json();
      
      // Filter out cancelled meetings
      const filteredRequests = data.filter((req: MeetingRequest) => 
        req.scheduled_status !== 'cancelled'
      );

      setRequests(filteredRequests);
    } catch (error) {
      console.error("Failed to fetch meeting requests:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch meeting requests.",
      });
    } finally {
      setFetchingData(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchMeetingRequests();
  }, [fetchMeetingRequests]);

  const handleJoinMeeting = (meetingLink?: string, googleMeetUrl?: string) => {
    const link = meetingLink || googleMeetUrl;
    if (link) {
      window.open(link, '_blank');
    } else {
      toast({
        variant: "destructive",
        title: "No Meeting Link",
        description: "Meeting link is not available yet.",
      });
    }
  };

  const generateFeedbackFormUrl = (meeting: MeetingRequest) => {
    // If form URL already exists, use it
    if (meeting.feedbackFormUrl) {
      return meeting.feedbackFormUrl;
    }
    
    // Otherwise generate it
    const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdVEs5LL2tLlH5yshUYpPW5XhNlB9_rtV5-PkE6438qpqJg5g/viewform';
    const params = new URLSearchParams({
      'usp': 'pp_url',
      'entry.1761271270': meeting.mentee_name,
      'entry.768740967': meeting.mentor_name,
      'entry.1198034537': meeting.date,
      'entry.183080322': meeting.time
    });
    
    return `${baseUrl}?${params.toString()}`;
  };

  const handleOpenFeedbackForm = async (meeting: MeetingRequest) => {
    const formUrl = generateFeedbackFormUrl(meeting);

    toast({
      title: "Feedback Form Opened",
      description: "The button will disappear only after you submit the Google Form.",
    });

    // Open the form
    window.open(formUrl, '_blank');
  };

  const handleCancelClick = (meeting: MeetingRequest) => {
    setMeetingToCancel(meeting);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const handleCancelMeeting = async () => {
    if (!meetingToCancel || !user) return;

    if (!cancelReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for cancellation.",
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
          cancelledBy: user.id,
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

      setCancelDialogOpen(false);
      setMeetingToCancel(null);
      setCancelReason("");
      await fetchMeetingRequests();
    } catch (error) {
      console.error('Failed to cancel meeting:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel meeting. Please try again.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const now = new Date();

  const pendingRequests = requests.filter((r) => r.decision === "pending");
  const acceptedRequests = requests.filter((r) => r.decision === "accepted");
  const rejectedRequests = requests.filter((r) => r.decision === "rejected");

  const upcomingMeetings = acceptedRequests.filter((m) => {
    let meetingDateTime: Date;
    if (m.time.includes('AM') || m.time.includes('PM')) {
      const [time, period] = m.time.split(" ");
      const [hours, minutes] = time.split(":").map(Number);
      const hour24 = period === "PM" && hours !== 12 ? hours + 12 : (period === "AM" && hours === 12 ? 0 : hours);
      meetingDateTime = new Date(m.date);
      meetingDateTime.setHours(hour24, minutes, 0, 0);
    } else {
      const [hours, minutes] = m.time.split(':').map(Number);
      meetingDateTime = new Date(m.date);
      meetingDateTime.setHours(hours, minutes, 0, 0);
    }
    const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
    return twoHoursAfterMeeting >= now;
  });

  const pastMeetings = acceptedRequests.filter((m) => {
    let meetingDateTime: Date;
    if (m.time.includes('AM') || m.time.includes('PM')) {
      const [time, period] = m.time.split(" ");
      const [hours, minutes] = time.split(":").map(Number);
      const hour24 = period === "PM" && hours !== 12 ? hours + 12 : (period === "AM" && hours === 12 ? 0 : hours);
      meetingDateTime = new Date(m.date);
      meetingDateTime.setHours(hour24, minutes, 0, 0);
    } else {
      const [hours, minutes] = m.time.split(':').map(Number);
      meetingDateTime = new Date(m.date);
      meetingDateTime.setHours(hours, minutes, 0, 0);
    }
    const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
    return twoHoursAfterMeeting < now;
  });

  const renderMeetingCard = (meeting: MeetingRequest, showActions = false) => {
    let meetingDateTime: Date;
    if (meeting.time.includes('AM') || meeting.time.includes('PM')) {
      const [time, period] = meeting.time.split(" ");
      const [hours, minutes] = time.split(":").map(Number);
      const hour24 = period === "PM" && hours !== 12 ? hours + 12 : (period === "AM" && hours === 12 ? 0 : hours);
      meetingDateTime = new Date(meeting.date);
      meetingDateTime.setHours(hour24, minutes, 0, 0);
    } else {
      const [hours, minutes] = meeting.time.split(':').map(Number);
      meetingDateTime = new Date(meeting.date);
      meetingDateTime.setHours(hours, minutes, 0, 0);
    }

    const timeUntil = formatDistance(meetingDateTime, now, { addSuffix: true });

    return (
      <Card key={meeting.meetingId} className="hover:shadow-lg transition-all duration-200 border-gray-400 border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-yellow-600" />
                <CardTitle className="text-lg">{meeting.mentor_name}</CardTitle>
                <Badge
                  variant={
                    meeting.decision === "accepted"
                      ? "default"
                      : meeting.decision === "pending"
                      ? "secondary"
                      : "destructive"
                  }
                  className={
                    meeting.decision === "accepted"
                      ? (() => {
                          const oneHourAfterMeeting = new Date(meetingDateTime.getTime() + 60 * 60 * 1000);
                          if (now >= meetingDateTime && now < oneHourAfterMeeting) {
                            return "bg-orange-500"; // Ongoing
                          } else if (now >= oneHourAfterMeeting) {
                            return "bg-blue-500"; // Done
                          } else {
                            return "bg-green-500"; // Upcoming
                          }
                        })()
                      : meeting.decision === "pending"
                      ? "bg-yellow-500"
                      : ""
                  }
                >
                  {meeting.decision === "accepted"
                    ? (() => {
                        const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
                        if (now >= meetingDateTime && now < twoHoursAfterMeeting) {
                          return "In Progress";
                        } else if (now >= twoHoursAfterMeeting) {
                          return "Done";
                        } else {
                          return "Upcoming";
                        }
                      })()
                    : meeting.decision.charAt(0).toUpperCase() + meeting.decision.slice(1)}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-2 text-sm">
                <Mail className="h-3 w-3" />
                {meeting.mentor_email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-yellow-600" />
              <span>{format(new Date(meeting.date), "MMM dd, yyyy")}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span>{meeting.time}</span>
            </div>
          </div>

          {meeting.decision === "accepted" && meetingDateTime >= now && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-900">
                {timeUntil}
              </p>
            </div>
          )}

          {meeting.message && (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-1">Your Message:</p>
                  <p className="text-sm text-muted-foreground">{meeting.message}</p>
                </div>
              </div>
            </div>
          )}

          {meeting.decision === "accepted" && (() => {
            const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
            return now >= meetingDateTime && now < twoHoursAfterMeeting && (meeting.meetingLink || meeting.googleMeetUrl);
          })() && (
            <Button
              onClick={() => handleJoinMeeting(meeting.meetingLink, meeting.googleMeetUrl)}
              className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700"
            >
              <Video className="h-4 w-4 mr-2" />
              Join Meeting
            </Button>
          )}

          {/* Show feedback form button for past meetings where feedback hasn't been submitted */}
          {meeting.decision === "accepted" && (() => {
            const twoHoursAfterMeeting = new Date(meetingDateTime.getTime() + 2 * 60 * 60 * 1000);
            return now >= twoHoursAfterMeeting && !meeting.feedbackFormSent;
          })() && (
            <Button
              onClick={() => handleOpenFeedbackForm(meeting)}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              <FileText className="h-4 w-4 mr-2" />
              Fill Feedback Form
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          )}

          {(meeting.decision === "pending" || (meeting.decision === "accepted" && meetingDateTime > now)) && (
            <Button
              onClick={() => handleCancelClick(meeting)}
              variant="destructive"
              className="w-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Meeting
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg flex items-center justify-between">
            <span>Meeting Requests</span>
            <button
              onClick={() => { setFetchingData(true); fetchMeetingRequests(); }}
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
          <div className="sr-only">Mentee meetings header</div>
        </motion.div>

        {/* Top row: Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6"
        >
          {[
            { key: 'pending', label: 'Pending', value: pendingRequests.length, Icon: Send, accent: 'bg-yellow-400' },
            { key: 'upcoming', label: 'Upcoming', value: upcomingMeetings.length, Icon: CalendarDays, accent: 'bg-green-400' },
            { key: 'completed', label: 'Completed', value: pastMeetings.length, Icon: CheckCircle2, accent: 'bg-blue-400' },
            { key: 'rejected', label: 'Rejected', value: rejectedRequests.length, Icon: XCircle, accent: 'bg-red-400' },
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

        {/* Tabs */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white border border-gray-400">
            <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-white">
              Pending ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Upcoming ({upcomingMeetings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              Completed ({pastMeetings.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
              Rejected ({rejectedRequests.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Requests */}
          <TabsContent value="pending" className="space-y-4">
            {pendingRequests.length === 0 ? (
              <Card className="border-gray-300 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Send className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700">No pending requests</p>
                  <p className="text-sm text-gray-500">Your pending meeting requests will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingRequests.map((request) => renderMeetingCard(request, true))}
              </div>
            )}
          </TabsContent>

          {/* Upcoming Meetings */}
          <TabsContent value="upcoming" className="space-y-4">
            {upcomingMeetings.length === 0 ? (
              <Card className="border-gray-300 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CalendarDays className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700">No upcoming meetings</p>
                  <p className="text-sm text-gray-500">Schedule a meeting to see it here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {upcomingMeetings.map((meeting) => renderMeetingCard(meeting))}
              </div>
            )}
          </TabsContent>

          {/* Past Meetings */}
          <TabsContent value="past" className="space-y-4">
            {pastMeetings.length === 0 ? (
              <Card className="border-gray-300 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700">No completed meetings</p>
                  <p className="text-sm text-gray-500">Your completed meetings will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pastMeetings.map((meeting) => renderMeetingCard(meeting))}
              </div>
            )}
          </TabsContent>

          {/* Rejected Requests */}
          <TabsContent value="rejected" className="space-y-4">
            {rejectedRequests.length === 0 ? (
              <Card className="border-gray-300 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700">No rejected requests</p>
                  <p className="text-sm text-gray-500">Rejected meeting requests will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rejectedRequests.map((request) => renderMeetingCard(request))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) {
          setCancelReason('');
          setMeetingToCancel(null);
          setIsCancelling(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this meeting with {meetingToCancel?.mentor_name}?
              {meetingToCancel && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm">
                    <strong>Date:</strong> {format(new Date(meetingToCancel.date), "MMM dd, yyyy")}
                  </p>
                  <p className="text-sm">
                    <strong>Time:</strong> {meetingToCancel.time}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label htmlFor="cancel-reason" className="text-sm font-medium mb-2 block">
              Reason for cancellation <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="cancel-reason"
              placeholder="Please provide a reason for cancelling this meeting..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={isCancelling}
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, keep it</AlertDialogCancel>
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
                "Yes, cancel meeting"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </div>
      </div>
    </div>
  );
}
