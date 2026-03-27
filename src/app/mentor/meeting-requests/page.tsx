"use client";
import { motion } from 'framer-motion';

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
} from "lucide-react";
import { useRequireAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistance } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  userRole?: 'mentor' | 'mentee'; // Flag to distinguish requests
}

export default function MeetingRequestsPage() {
  const { user, isLoading } = useRequireAuth("mentor");
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const { toast } = useToast();

  const fetchMeetingRequests = useCallback(async () => {
    if (!user) return;
    try {
      setFetchingData(true);
      const timestamp = new Date().getTime();
      
      // Fetch meetings where user is MENTOR (receiving requests)
      const mentorResponse = await fetch(`/api/meeting-requests?mentorId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // Fetch meetings where user is MENTEE (sent requests to other mentors)
      const menteeResponse = await fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!mentorResponse.ok) {
        throw new Error('Failed to fetch meeting requests as mentor');
      }

      const mentorRequests = await mentorResponse.json();
      let menteeRequests = [];
      
      if (menteeResponse.ok) {
        menteeRequests = await menteeResponse.json();
        console.log('Fetched requests sent by user (as mentee):', menteeRequests.length);
      } else {
        console.error('Failed to fetch mentee requests:', await menteeResponse.text());
      }

      console.log('Raw mentor requests:', mentorRequests);
      console.log('Raw mentee requests:', menteeRequests);

      // Filter out cancelled meetings and add userRole flag
      const filteredMentorRequests = mentorRequests
        .filter((req: MeetingRequest) => {
          const isValid = req.scheduled_status !== 'cancelled';
          console.log(`Mentor request ${req.meetingId}: mentorUID=${req.mentorUID}, userID=${user.id}, valid=${isValid}`);
          return isValid;
        })
        .map((req: MeetingRequest) => ({
          ...req,
          userRole: 'mentor' as const // User is receiving this request
        }));

      const filteredMenteeRequests = menteeRequests
        .filter((req: MeetingRequest) => {
          const isValid = req.scheduled_status !== 'cancelled';
          console.log(`Mentee request ${req.meetingId}: mentorUID=${req.mentorUID}, userID=${user.id}, valid=${isValid}`);
          return isValid;
        })
        .map((req: MeetingRequest) => ({
          ...req,
          userRole: 'mentee' as const // User sent this request
        }));

      // Combine both types
      const combinedRequests = [...filteredMentorRequests, ...filteredMenteeRequests];

      console.log('📊 Final breakdown:');
      console.log('  - As mentor (receiving):', filteredMentorRequests.length);
      console.log('  - As mentee (sent):', filteredMenteeRequests.length);
      console.log('  - Total combined:', combinedRequests.length);

      setRequests(combinedRequests);
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

  const handleMeetingAction = async (
    meetingId: string,
    action: "accepted" | "rejected"
  ) => {
    setLoadingAction(meetingId);
    try {
      const response = await fetch("/api/meeting-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mentorId: user?.id,
          meetingId,
          decision: action,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update meeting");
      }

      // If accepted, create Google Meet link
      if (action === 'accepted') {
        const request = requests.find(r => r.meetingId === meetingId);
        if (request) {
          try {
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
            
            const endDateTime = new Date(meetingDateTime.getTime() + 60 * 60 * 1000);

            const meetResponse = await fetch("/api/create-meet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                summary: `Mentorship Session with ${request.mentee_name}`,
                description: `Meeting with ${request.mentee_name}\n\nMessage: ${request.message || 'No message provided'}`,
                startDateTime: meetingDateTime.toISOString(),
                endDateTime: endDateTime.toISOString(),
                attendees: [request.mentee_email, user?.email].filter(Boolean),
                mentorId: user?.id,
                meetingId: meetingId,
                menteeId: request.menteeUID,
              }),
            });

            if (meetResponse.ok) {
              toast({
                title: "Success ✅",
                description: `Meeting accepted and Google Meet link sent to ${request.mentee_name}`,
              });
            } else {
              toast({
                title: "Partial Success",
                description: "Meeting accepted but failed to create Google Meet link.",
              });
            }
          } catch (meetError) {
            console.error("Error creating Google Meet:", meetError);
          }
        }
      } else {
        toast({
          title: "Success",
          description: "Meeting request rejected.",
        });
      }

      setIsDialogOpen(false);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchMeetingRequests();
    } catch (error) {
      console.error("Failed to update meeting:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update meeting request.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

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

  const openRequestDialog = (request: MeetingRequest) => {
    setSelectedRequest(request);
    setIsDialogOpen(true);
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const now = new Date();

  // **Separate requests based on userRole**
  const receivedPendingRequests = requests.filter((r) => r.decision === "pending" && r.userRole === 'mentor');
  const sentPendingRequests = requests.filter((r) => r.decision === "pending" && r.userRole === 'mentee');
  
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="font-semibold text-lg">Meeting Requests</div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchMeetingRequests}
                  aria-label="Refresh"
                  className="h-9 w-9 rounded-md bg-white border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50"
                  disabled={fetchingData}
                >
                  {fetchingData ? (
                    <Loader2 className="h-4 w-4 text-gray-600 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-gray-600" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-6"
          >

            {/* Statistics Cards (tasks-style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { key: 'received', label: 'Received', value: receivedPendingRequests.length, Icon: AlertCircle, accent: 'bg-yellow-400' },
            { key: 'requested', label: 'Requested', value: sentPendingRequests.length, Icon: Send, accent: 'bg-purple-400' },
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
        </div>

        {/* Redesigned Tabs Section with NEW "Requested" Tab */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-white shadow-md h-12">
            <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-900">
              <AlertCircle className="h-4 w-4 mr-2" />
              Received
              {receivedPendingRequests.length > 0 && (
                <Badge className="ml-2 bg-yellow-500">{receivedPendingRequests.length}</Badge>
              )}
            </TabsTrigger>
            
            {/* **NEW: Requested Tab** */}
            <TabsTrigger value="requested" className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-900">
              <Send className="h-4 w-4 mr-2" />
              Requested
              {sentPendingRequests.length > 0 && (
                <Badge className="ml-2 bg-purple-500">{sentPendingRequests.length}</Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="upcoming" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900">
              <CalendarDays className="h-4 w-4 mr-2" />
              Upcoming
              {upcomingMeetings.length > 0 && (
                <Badge className="ml-2 bg-green-500">{upcomingMeetings.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="past" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Past
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-900">
              <XCircle className="h-4 w-4 mr-2" />
              Rejected
            </TabsTrigger>
          </TabsList>

          {/* Received Pending Requests Tab (formerly "pending") */}
          <TabsContent value="pending">
            <div className="space-y-4">
              {receivedPendingRequests.length > 0 ? (
                receivedPendingRequests.map((req) => (
                  <Card key={req.meetingId} className="border-l-4 border-l-yellow-500 shadow-md hover:shadow-lg transition-all">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-yellow-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-xl">{req.mentee_name}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {req.mentee_email}
                              </p>
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                              New Request
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Calendar className="h-4 w-4 text-blue-500" />
                              <span className="font-medium">{format(new Date(req.date), "EEEE, MMMM do, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Clock className="h-4 w-4 text-purple-500" />
                              <span className="font-medium">{req.time}</span>
                            </div>
                          </div>

                          {req.message && (
                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                              <p className="text-sm font-medium text-blue-900 mb-1 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Message from mentee:
                              </p>
                              <p className="text-sm text-blue-800">{req.message}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-3 min-w-[160px]">
                          <Button
                            onClick={() => openRequestDialog(req)}
                            className="bg-green-600 hover:bg-green-700 shadow-md"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Accept
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedRequest(req);
                              handleMeetingAction(req.meetingId, "rejected");
                            }}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-none shadow-lg">
                  <CardContent className="text-center py-16">
                    <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                      <AlertCircle className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No pending requests</h3>
                    <p className="text-muted-foreground">
                      New mentorship requests will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* **NEW: Requested Tab - Shows meetings where user is mentee** */}
          <TabsContent value="requested">
            <div className="space-y-4">
              {sentPendingRequests.length > 0 ? (
                sentPendingRequests.map((req) => (
                  <Card key={req.meetingId} className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-all">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-xl">{req.mentor_name}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {req.mentor_email}
                              </p>
                            </div>
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                              Awaiting Response
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Calendar className="h-4 w-4 text-blue-500" />
                              <span className="font-medium">{format(new Date(req.date), "EEEE, MMMM do, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Clock className="h-4 w-4 text-purple-500" />
                              <span className="font-medium">{req.time}</span>
                            </div>
                          </div>

                          {req.message && (
                            <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                              <p className="text-sm font-medium text-purple-900 mb-1 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Your message:
                              </p>
                              <p className="text-sm text-purple-800">{req.message}</p>
                            </div>
                          )}
                        </div>

                        <div className="min-w-[160px] text-center p-4 bg-purple-50 rounded-lg">
                          <Clock className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                          <p className="text-sm font-medium text-purple-700">
                            Waiting for mentor to respond
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-none shadow-lg">
                  <CardContent className="text-center py-16">
                    <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                      <Send className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No pending requests</h3>
                    <p className="text-muted-foreground">
                      Meetings you've requested will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Upcoming Meetings Tab - UPDATED */}
          <TabsContent value="upcoming">
            <div className="space-y-4">
              {upcomingMeetings.length > 0 ? (
                upcomingMeetings.map((req) => {
                  let meetingDateTime: Date;
                  if (req.time.includes('AM') || req.time.includes('PM')) {
                    const [time, period] = req.time.split(" ");
                    const [hours, minutes] = time.split(":").map(Number);
                    const hour24 = period === "PM" && hours !== 12 ? hours + 12 : (period === "AM" && hours === 12 ? 0 : hours);
                    meetingDateTime = new Date(req.date);
                    meetingDateTime.setHours(hour24, minutes, 0, 0);
                  } else {
                    const [hours, minutes] = req.time.split(':').map(Number);
                    meetingDateTime = new Date(req.date);
                    meetingDateTime.setHours(hours, minutes, 0, 0);
                  }

                  const timeUntil = formatDistance(meetingDateTime, now, { addSuffix: true });
                  
                  // **NEW: Determine if user is mentor or mentee in this meeting**
                  const userIsMentor = req.userRole === 'mentor';
                  const displayName = userIsMentor ? req.mentee_name : req.mentor_name;
                  const displayEmail = userIsMentor ? req.mentee_email : req.mentor_email;
                  const displayLabel = userIsMentor ? 'Mentee' : 'Mentor';

                  return (
                    <Card key={req.meetingId} className="border-l-4 border-l-green-500 shadow-md hover:shadow-lg transition-all">
                      <CardContent className="p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                <User className="h-6 w-6 text-green-600" />
                              </div>
                              <div>
                                {/* **UPDATED: Show role label and correct name** */}
                                <p className="text-xs text-gray-500 font-medium">{displayLabel}</p>
                                <h3 className="font-semibold text-xl">{displayName}</h3>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {displayEmail}
                                </p>
                              </div>
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                {userIsMentor ? 'Confirmed' : 'You Requested'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                                <Calendar className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{format(meetingDateTime, "MMM do, yyyy")}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                                <Clock className="h-4 w-4 text-purple-500" />
                                <span className="font-medium">{req.time}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm bg-green-50 p-3 rounded-lg">
                                <CalendarDays className="h-4 w-4 text-green-500" />
                                <span className="font-medium text-green-700">{timeUntil}</span>
                              </div>
                            </div>

                            {req.message && (
                              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                                <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                                  <MessageSquare className="h-4 w-4" />
                                  {userIsMentor ? 'Session topic:' : 'Your message:'}
                                </p>
                                <p className="text-sm text-blue-800">{req.message}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3 min-w-[160px]">
                            <Button
                              onClick={() => handleJoinMeeting(req.meetingLink, req.googleMeetUrl)}
                              className="bg-blue-600 hover:bg-blue-700 shadow-md"
                              disabled={!req.meetingLink && !req.googleMeetUrl}
                            >
                              <Video className="h-4 w-4 mr-2" />
                              Join Meeting
                            </Button>
                            {(!req.meetingLink && !req.googleMeetUrl) && (
                              <p className="text-xs text-center text-muted-foreground">
                                Link will be available soon
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card className="border-none shadow-lg">
                  <CardContent className="text-center py-16">
                    <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                      <CalendarDays className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No upcoming meetings</h3>
                    <p className="text-muted-foreground">
                      Accepted requests will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Past Meetings Tab - UPDATED */}
          <TabsContent value="past">
            <div className="space-y-4">
              {pastMeetings.length > 0 ? (
                pastMeetings.map((req) => {
                  // **NEW: Determine if user is mentor or mentee**
                  const userIsMentor = req.userRole === 'mentor';
                  const displayName = userIsMentor ? req.mentee_name : req.mentor_name;
                  const displayEmail = userIsMentor ? req.mentee_email : req.mentor_email;
                  const displayLabel = userIsMentor ? 'Mentee' : 'Mentor';

                  return (
                    <Card key={req.meetingId} className="border-l-4 border-l-blue-500 shadow-md opacity-75 hover:opacity-100 transition-all">
                      <CardContent className="p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <User className="h-6 w-6 text-blue-600" />
                              </div>
                              <div>
                                {/* **UPDATED: Show role label and correct name** */}
                                <p className="text-xs text-gray-500 font-medium">{displayLabel}</p>
                                <h3 className="font-semibold text-xl">{displayName}</h3>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {displayEmail}
                                </p>
                              </div>
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {userIsMentor ? 'Completed' : 'You Requested'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                                <Calendar className="h-4 w-4 text-gray-500" />
                                <span>{format(new Date(req.date), "MMMM do, yyyy")}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                                <Clock className="h-4 w-4 text-gray-500" />
                                <span>{req.time}</span>
                              </div>
                            </div>

                            {req.message && (
                              <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
                                <p className="text-sm font-medium text-gray-700 mb-1">
                                  {userIsMentor ? 'Session topic:' : 'Your message:'}
                                </p>
                                <p className="text-sm text-gray-600">{req.message}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card className="border-none shadow-lg">
                  <CardContent className="text-center py-16">
                    <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                      <CheckCircle2 className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No past meetings</h3>
                    <p className="text-muted-foreground">
                      Completed sessions will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Rejected Requests Tab - Keep existing code */}
          <TabsContent value="rejected">
            <div className="space-y-4">
              {rejectedRequests.length > 0 ? (
                rejectedRequests.map((req) => (
                  <Card key={req.meetingId} className="border-l-4 border-l-red-500 shadow-md opacity-75 hover:opacity-100 transition-all">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-red-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-xl">{req.mentee_name}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {req.mentee_email}
                              </p>
                            </div>
                            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">
                              Rejected
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Calendar className="h-4 w-4 text-gray-500" />
                              <span>{format(new Date(req.date), "MMMM do, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span>{req.time}</span>
                            </div>
                          </div>

                          {req.message && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                              <p className="text-sm font-medium text-red-900 mb-1">Original request:</p>
                              <p className="text-sm text-red-800">{req.message}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-none shadow-lg">
                  <CardContent className="text-center py-16">
                    <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                      <XCircle className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No rejected requests</h3>
                    <p className="text-muted-foreground">
                      Declined requests will appear here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
          </motion.div>
        </div>
      </div>

      {/* Accept Request Confirmation Dialog - Keep existing */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Accept Meeting Request</DialogTitle>
            <DialogDescription className="text-base">
              Are you sure you want to accept this meeting request?
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <User className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-semibold text-lg">{selectedRequest.mentee_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.mentee_email}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium">{format(new Date(selectedRequest.date), "MMM do, yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Clock className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="text-sm font-medium">{selectedRequest.time}</p>
                  </div>
                </div>
              </div>

              {selectedRequest.message && (
                <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                  <p className="text-sm font-medium text-blue-900 mb-1">Message:</p>
                  <p className="text-sm text-blue-800">{selectedRequest.message}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={loadingAction === selectedRequest?.meetingId}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedRequest && handleMeetingAction(selectedRequest.meetingId, "accepted")}
              disabled={loadingAction === selectedRequest?.meetingId}
              className="bg-green-600 hover:bg-green-700"
            >
              {loadingAction === selectedRequest?.meetingId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Accept & Create Meeting
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
