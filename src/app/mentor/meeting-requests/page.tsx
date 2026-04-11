"use client";

import { motion } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MessageSquare, Video, User, Mail, CheckCircle2, XCircle, AlertCircle, CalendarDays, RefreshCw, Send } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDistance } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { convertMeetingTime, DEFAULT_TIMEZONE } from "@/lib/timezone";

interface MeetingRequest {
  meetingId: string;
  menteeUID: string;
  mentorUID: string;
  date: string;
  time: string;
  decision: "pending" | "accepted" | "rejected";
  scheduled_status: string;
  mentee_name: string;
  mentee_email: string;
  mentor_name: string;
  mentor_email: string;
  message: string;
  meetingLink?: string;
  googleMeetUrl?: string;
  userRole?: 'mentor' | 'mentee';
}

export default function MeetingRequestsPage() {
  const { user, isLoading } = useRequireAuth("mentor");
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const { toast } = useToast();

  const userTz = (user as any)?.timezone || DEFAULT_TIMEZONE;
  const isNonDefaultTz = userTz !== DEFAULT_TIMEZONE;

  const fetchMeetingRequests = useCallback(async () => {
    if (!user) return;
    try {
      setFetchingData(true);
      const ts = new Date().getTime();
      const [mentorRes, menteeRes] = await Promise.all([
        fetch(`/api/meeting-requests?mentorId=${user.id}&_t=${ts}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
        fetch(`/api/meeting-requests?menteeId=${user.id}&_t=${ts}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
      ]);
      const mentorRequests = mentorRes.ok ? await mentorRes.json() : [];
      const menteeRequests = menteeRes.ok ? await menteeRes.json() : [];

      const combined = [
        ...mentorRequests.filter((r: MeetingRequest) => r.scheduled_status !== 'cancelled').map((r: MeetingRequest) => ({ ...r, userRole: 'mentor' as const })),
        ...menteeRequests.filter((r: MeetingRequest) => r.scheduled_status !== 'cancelled').map((r: MeetingRequest) => ({ ...r, userRole: 'mentee' as const })),
      ];
      setRequests(combined);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to fetch meeting requests." });
    } finally {
      setFetchingData(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchMeetingRequests(); }, [fetchMeetingRequests]);

  const handleMeetingAction = async (meetingId: string, action: "accepted" | "rejected") => {
    setLoadingAction(meetingId);
    try {
      const r = await fetch("/api/meeting-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId: user?.id, meetingId, decision: action }),
      });
      if (!r.ok) throw new Error("Failed to update meeting");

      if (action === 'accepted') {
        const req = requests.find(r => r.meetingId === meetingId);
        if (req) {
          try {
            // Stored in MYT — use MYT for the meeting creation
            const { utcDate } = convertMeetingTime(req.date, req.time, DEFAULT_TIMEZONE);
            const end = new Date(utcDate.getTime() + 3600000);
            await fetch("/api/create-meet", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                summary: `Mentorship Session with ${req.mentee_name}`,
                description: `Message: ${req.message || 'No message'}`,
                startDateTime: utcDate.toISOString(), endDateTime: end.toISOString(),
                attendees: [req.mentee_email, user?.email].filter(Boolean),
                mentorId: user?.id, meetingId, menteeId: req.menteeUID,
              }),
            });
            toast({ title: "Success ✅", description: `Meeting accepted and Google Meet link sent to ${req.mentee_name}` });
          } catch {
            toast({ title: "Partial Success", description: "Meeting accepted but failed to create Google Meet link." });
          }
        }
      } else {
        toast({ title: "Success", description: "Meeting request rejected." });
      }
      setIsDialogOpen(false);
      await new Promise(r => setTimeout(r, 1000));
      await fetchMeetingRequests();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update meeting request." });
    } finally {
      setLoadingAction(null); }
  };

  const handleJoinMeeting = (meetingLink?: string, googleMeetUrl?: string) => {
    const link = meetingLink || googleMeetUrl;
    if (link) window.open(link, '_blank');
    else toast({ variant: "destructive", title: "No Meeting Link", description: "Meeting link is not available yet." });
  };

  if (isLoading || !user) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  // Use UTC-based comparisons for bucketing
  const now = Date.now();
  const getUtcMs = (r: MeetingRequest) => convertMeetingTime(r.date, r.time, DEFAULT_TIMEZONE).utcDate.getTime();

  const receivedPending = requests.filter(r => r.decision === "pending" && r.userRole === 'mentor');
  const sentPending = requests.filter(r => r.decision === "pending" && r.userRole === 'mentee');
  const accepted = requests.filter(r => r.decision === "accepted");
  const rejected = requests.filter(r => r.decision === "rejected");
  const upcomingMeetings = accepted.filter(m => now < getUtcMs(m) + 2 * 3600000);
  const pastMeetings = accepted.filter(m => now >= getUtcMs(m) + 2 * 3600000);

  // Helper to format for display
  const fmt = (r: MeetingRequest) => convertMeetingTime(r.date, r.time, userTz);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="font-semibold text-lg">Meeting Requests</div>
              <button onClick={fetchMeetingRequests} aria-label="Refresh"
                className="h-9 w-9 rounded-md bg-white border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50" disabled={fetchingData}>
                {fetchingData ? <Loader2 className="h-4 w-4 text-gray-600 animate-spin" /> : <RefreshCw className="h-4 w-4 text-gray-600" />}
              </button>
            </div>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6">

            {isNonDefaultTz && (
              <div className="mb-4 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm text-teal-800 flex items-center gap-2">
                <span>🌐</span>
                <span>Times shown in your preferred timezone. Go to <strong>My Profile</strong> to change.</span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                { key: 'received', label: 'Received', value: receivedPending.length, Icon: AlertCircle, accent: 'bg-yellow-400' },
                { key: 'requested', label: 'Requested', value: sentPending.length, Icon: Send, accent: 'bg-purple-400' },
                { key: 'upcoming', label: 'Upcoming', value: upcomingMeetings.length, Icon: CalendarDays, accent: 'bg-green-400' },
                { key: 'completed', label: 'Completed', value: pastMeetings.length, Icon: CheckCircle2, accent: 'bg-blue-400' },
                { key: 'rejected', label: 'Rejected', value: rejected.length, Icon: XCircle, accent: 'bg-red-400' },
              ].map(({ key, label, value, Icon, accent }) => (
                <Card key={key} className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                  <div className={`${accent} w-1 self-stretch hidden sm:block`} />
                  <CardContent className="flex-1 py-4 px-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p><div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div></div>
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm"><Icon className="w-5 h-5 text-gray-600" /></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="pending" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5 bg-white shadow-md h-12">
                {[
                  { value: 'pending', label: 'Received', count: receivedPending.length, color: 'data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-900' },
                  { value: 'requested', label: 'Requested', count: sentPending.length, color: 'data-[state=active]:bg-purple-100 data-[state=active]:text-purple-900' },
                  { value: 'upcoming', label: 'Upcoming', count: upcomingMeetings.length, color: 'data-[state=active]:bg-green-100 data-[state=active]:text-green-900' },
                  { value: 'past', label: 'Past', count: pastMeetings.length, color: 'data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900' },
                  { value: 'rejected', label: 'Rejected', count: rejected.length, color: 'data-[state=active]:bg-red-100 data-[state=active]:text-red-900' },
                ].map(({ value, label, count, color }) => (
                  <TabsTrigger key={value} value={value} className={color}>
                    {label}{count > 0 && <Badge className="ml-2 bg-gray-500 text-white text-xs">{count}</Badge>}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Received Pending */}
              <TabsContent value="pending">
                <div className="space-y-4">
                  {receivedPending.length === 0 ? (
                    <Card><CardContent className="text-center py-16"><AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold mb-2">No pending requests</h3></CardContent></Card>
                  ) : receivedPending.map(req => {
                    const { displayDate, displayTime, tzLabel } = fmt(req);
                    return (
                      <Card key={req.meetingId} className="border-l-4 border-l-yellow-500 shadow-md hover:shadow-lg transition-all">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center"><User className="h-6 w-6 text-yellow-600" /></div>
                                <div><h3 className="font-semibold text-xl">{req.mentee_name}</h3><p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{req.mentee_email}</p></div>
                                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">New Request</Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Calendar className="h-4 w-4 text-blue-500" /><span className="font-medium">{displayDate}</span></div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                                  <Clock className="h-4 w-4 text-purple-500" />
                                  <span className="font-medium">{displayTime}{isNonDefaultTz ? ` (${tzLabel})` : ''}</span>
                                </div>
                              </div>
                              {req.message && <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg"><p className="text-sm font-medium text-blue-900 mb-1 flex items-center gap-2"><MessageSquare className="h-4 w-4" />Message:</p><p className="text-sm text-blue-800">{req.message}</p></div>}
                            </div>
                            <div className="flex flex-col gap-3 min-w-[160px]">
                              <Button onClick={() => { setSelectedRequest(req); setIsDialogOpen(true); }} className="bg-green-600 hover:bg-green-700 shadow-md"><CheckCircle2 className="h-4 w-4 mr-2" />Accept</Button>
                              <Button onClick={() => handleMeetingAction(req.meetingId, "rejected")} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"><XCircle className="h-4 w-4 mr-2" />Reject</Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Sent (as mentee) */}
              <TabsContent value="requested">
                <div className="space-y-4">
                  {sentPending.length === 0 ? (
                    <Card><CardContent className="text-center py-16"><Send className="h-10 w-10 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold mb-2">No pending requests</h3></CardContent></Card>
                  ) : sentPending.map(req => {
                    const { displayDate, displayTime, tzLabel } = fmt(req);
                    return (
                      <Card key={req.meetingId} className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-all">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center"><User className="h-6 w-6 text-purple-600" /></div>
                                <div><h3 className="font-semibold text-xl">{req.mentor_name}</h3><p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{req.mentor_email}</p></div>
                                <Badge className="bg-purple-100 text-purple-800 border-purple-300">Awaiting Response</Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Calendar className="h-4 w-4 text-blue-500" /><span className="font-medium">{displayDate}</span></div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Clock className="h-4 w-4 text-purple-500" /><span className="font-medium">{displayTime}{isNonDefaultTz ? ` (${tzLabel})` : ''}</span></div>
                              </div>
                              {req.message && <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg"><p className="text-sm font-medium text-purple-900 mb-1 flex items-center gap-2"><MessageSquare className="h-4 w-4" />Your message:</p><p className="text-sm text-purple-800">{req.message}</p></div>}
                            </div>
                            <div className="min-w-[160px] text-center p-4 bg-purple-50 rounded-lg">
                              <Clock className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                              <p className="text-sm font-medium text-purple-700">Waiting for mentor to respond</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Upcoming */}
              <TabsContent value="upcoming">
                <div className="space-y-4">
                  {upcomingMeetings.length === 0 ? (
                    <Card><CardContent className="text-center py-16"><CalendarDays className="h-10 w-10 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold mb-2">No upcoming meetings</h3></CardContent></Card>
                  ) : upcomingMeetings.map(req => {
                    const { utcDate, displayDate, displayTime, tzLabel } = fmt(req);
                    const timeUntil = formatDistance(utcDate, new Date(), { addSuffix: true });
                    const userIsMentor = req.userRole === 'mentor';
                    const displayName = userIsMentor ? req.mentee_name : req.mentor_name;
                    const displayEmail = userIsMentor ? req.mentee_email : req.mentor_email;
                    return (
                      <Card key={req.meetingId} className="border-l-4 border-l-green-500 shadow-md hover:shadow-lg transition-all">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center"><User className="h-6 w-6 text-green-600" /></div>
                                <div><p className="text-xs text-gray-500 font-medium">{userIsMentor ? 'Mentee' : 'Mentor'}</p><h3 className="font-semibold text-xl">{displayName}</h3><p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{displayEmail}</p></div>
                                <Badge className="bg-green-100 text-green-800 border-green-300">{userIsMentor ? 'Confirmed' : 'You Requested'}</Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Calendar className="h-4 w-4 text-blue-500" /><span className="font-medium">{displayDate}</span></div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Clock className="h-4 w-4 text-purple-500" /><span className="font-medium">{displayTime}{isNonDefaultTz ? ` (${tzLabel})` : ''}</span></div>
                                <div className="flex items-center gap-2 text-sm bg-green-50 p-3 rounded-lg"><CalendarDays className="h-4 w-4 text-green-500" /><span className="font-medium text-green-700">{timeUntil}</span></div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 min-w-[160px]">
                              <Button onClick={() => handleJoinMeeting(req.meetingLink, req.googleMeetUrl)} className="bg-blue-600 hover:bg-blue-700 shadow-md" disabled={!req.meetingLink && !req.googleMeetUrl}>
                                <Video className="h-4 w-4 mr-2" /> Join Meeting
                              </Button>
                              {!req.meetingLink && !req.googleMeetUrl && <p className="text-xs text-center text-muted-foreground">Link available soon</p>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Past */}
              <TabsContent value="past">
                <div className="space-y-4">
                  {pastMeetings.length === 0 ? (
                    <Card><CardContent className="text-center py-16"><CheckCircle2 className="h-10 w-10 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold mb-2">No past meetings</h3></CardContent></Card>
                  ) : pastMeetings.map(req => {
                    const { displayDate, displayTime, tzLabel } = fmt(req);
                    const userIsMentor = req.userRole === 'mentor';
                    const displayName = userIsMentor ? req.mentee_name : req.mentor_name;
                    const displayEmail = userIsMentor ? req.mentee_email : req.mentor_email;
                    return (
                      <Card key={req.meetingId} className="border-l-4 border-l-blue-500 shadow-md opacity-75 hover:opacity-100 transition-all">
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center"><User className="h-6 w-6 text-blue-600" /></div>
                                <div><p className="text-xs text-gray-500 font-medium">{userIsMentor ? 'Mentee' : 'Mentor'}</p><h3 className="font-semibold text-xl">{displayName}</h3><p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{displayEmail}</p></div>
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800">{userIsMentor ? 'Completed' : 'You Requested'}</Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Calendar className="h-4 w-4 text-gray-500" /><span>{displayDate}</span></div>
                                <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Clock className="h-4 w-4 text-gray-500" /><span>{displayTime}{isNonDefaultTz ? ` (${tzLabel})` : ''}</span></div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Rejected */}
              <TabsContent value="rejected">
                <div className="space-y-4">
                  {rejected.length === 0 ? (
                    <Card><CardContent className="text-center py-16"><XCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold mb-2">No rejected requests</h3></CardContent></Card>
                  ) : rejected.map(req => {
                    const { displayDate, displayTime, tzLabel } = fmt(req);
                    return (
                      <Card key={req.meetingId} className="border-l-4 border-l-red-500 shadow-md opacity-75 hover:opacity-100 transition-all">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center"><User className="h-6 w-6 text-red-600" /></div>
                            <div><h3 className="font-semibold text-xl">{req.mentee_name}</h3><p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{req.mentee_email}</p></div>
                            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Calendar className="h-4 w-4 text-gray-500" /><span>{displayDate}</span></div>
                            <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-lg"><Clock className="h-4 w-4 text-gray-500" /><span>{displayTime}{isNonDefaultTz ? ` (${tzLabel})` : ''}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>

      {/* Accept confirmation dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Accept Meeting Request</DialogTitle>
            <DialogDescription className="text-base">Are you sure you want to accept this request?</DialogDescription>
          </DialogHeader>
          {selectedRequest && (() => {
            const { displayDate, displayTime, tzLabel } = fmt(selectedRequest);
            return (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <User className="h-8 w-8 text-blue-600" />
                  <div><p className="font-semibold text-lg">{selectedRequest.mentee_name}</p><p className="text-sm text-muted-foreground">{selectedRequest.mentee_email}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"><Calendar className="h-4 w-4 text-blue-500" /><div><p className="text-xs text-muted-foreground">Date</p><p className="text-sm font-medium">{displayDate}</p></div></div>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"><Clock className="h-4 w-4 text-purple-500" /><div><p className="text-xs text-muted-foreground">Time{isNonDefaultTz ? ` (${tzLabel})` : ''}</p><p className="text-sm font-medium">{displayTime}</p></div></div>
                </div>
                {selectedRequest.message && <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400"><p className="text-sm font-medium text-blue-900 mb-1">Message:</p><p className="text-sm text-blue-800">{selectedRequest.message}</p></div>}
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={loadingAction === selectedRequest?.meetingId}>Cancel</Button>
            <Button onClick={() => selectedRequest && handleMeetingAction(selectedRequest.meetingId, "accepted")} disabled={loadingAction === selectedRequest?.meetingId} className="bg-green-600 hover:bg-green-700">
              {loadingAction === selectedRequest?.meetingId ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Accepting...</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Accept & Create Meeting</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}