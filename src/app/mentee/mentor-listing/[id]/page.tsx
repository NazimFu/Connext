"use client";

// src/app/mentee/mentor-listing/[id]/page.tsx
// Slot times are stored in Malaysia time (UTC+8).
// We convert them to the user's preferred timezone for display,
// but submit them back in Malaysia time so the backend stays consistent.

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Mentor } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAuth } from "@/hooks/use-auth";
import { format, addDays, getDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getGoogleDriveImageUrl } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_TIMEZONE, convertMeetingTime, getUserTimezone } from "@/lib/timezone";

const MY_TZ = DEFAULT_TIMEZONE; // "Asia/Kuala_Lumpur"
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ALLOWED_FIELDS = new Set(["specialization", "field_of_consultation", "biography", "experience", "skills", "achievement"]);

const formatLabel = (() => {
  const cache = new Map<string, string>();
  return (key: string) => {
    if (cache.has(key)) return cache.get(key)!;
    const f = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    cache.set(key, f);
    return f;
  };
})();

export default function MentorDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const { user } = useRequireAuth(["mentee", "mentor"]);

  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | undefined>(); // stored as Malaysia HH:mm
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showSlotTakenDialog, setShowSlotTakenDialog] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]); // in Malaysia HH:mm
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const isSubmittedRef = useRef(false);

  // User's preferred timezone
  const userTz = getUserTimezone(user as any);
  const isNonDefaultTz = userTz !== MY_TZ;

  const mentorData = useMemo(() => {
    if (!mentor) return { name: "", image: "", logos: [] };
    return {
      name: mentor.mentor_name || "Mentor",
      image: mentor.mentor_photo || "",
      logos: (Array.isArray(mentor.institution_photo) ? mentor.institution_photo : [])
        .map(p => typeof p === 'string' ? { url: p, name: 'Institution' } : p)
        .filter(p => p.url?.trim()),
    };
  }, [mentor]);

  const availableDays = useMemo(() => {
    if (!mentor?.available_slots) return new Set<string>();
    const s = new Set<string>();
    mentor.available_slots.forEach((slot: any) => {
      if (slot?.day && Array.isArray(slot.time) && slot.time.some((t: string) => t?.trim()))
        s.add(slot.day.toLowerCase());
    });
    return s;
  }, [mentor?.available_slots]);

  const displayFields = useMemo(() => {
    if (!mentor) return [];
    return Object.entries(mentor).filter(([key, value]) => {
      if (!ALLOWED_FIELDS.has(key) || !value) return false;
      if (typeof value === "string" && !value.trim()) return false;
      if (Array.isArray(value)) return value.some(i => i && String(i).trim());
      return true;
    }).map(([key, value]) => [key, Array.isArray(value) ? value.filter(i => i && String(i).trim()) : value] as [string, any]);
  }, [mentor]);

  const fetchBookedSlots = useCallback(async (selectedDate: Date) => {
    if (!mentor?.id) return;
    setIsLoadingSlots(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const r = await fetch(`/api/booked-slots?mentorId=${mentor.id}&date=${dateStr}`);
      if (r.ok) setBookedSlots((await r.json()).bookedSlots || []);
    } catch { /* silent */ }
    finally { setIsLoadingSlots(false); }
  }, [mentor?.id]);

  /**
   * Convert Malaysia slot times to the user's timezone for display.
   * Each entry has { myTime: "HH:mm", displayTime: "HH:mm" }
   * We keep myTime as the submission value and displayTime for rendering.
   */
  const availableTimesForDay = useMemo(() => {
  if (!mentor || !date) return [];

  const weekday = WEEKDAYS[getDay(date)];
  const slot = mentor.available_slots?.find(
    (s: any) => s?.day?.toLowerCase() === weekday.toLowerCase()
  );
  if (!slot?.time || !Array.isArray(slot.time)) return [];

  const seen = new Set<string>();
  const result: Array<{ myTime: string; displayTime: string; booked: boolean }> = [];
  const dateStr = format(date, "yyyy-MM-dd");

  for (const myTime of slot.time) {
    if (!myTime?.trim()) continue;

    const converted = convertMeetingTime(dateStr, myTime, userTz);

    // Hide slots that shift to a different calendar day in the user's timezone
    const userDateStr = format(converted.utcDate, "yyyy-MM-dd");  // ← use utcDate, not dateShifted
    if (userDateStr !== dateStr && isNonDefaultTz) continue;

    const key = `${myTime}-${converted.displayTime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      myTime,                          // Malaysia time — sent to backend
      displayTime: converted.displayTime, // User's local time — shown in UI
      booked: bookedSlots.includes(myTime),
    });
  }

  return result
    .filter((s) => !s.booked)
    .sort((a, b) => a.myTime.localeCompare(b.myTime));
}, [mentor, date, userTz, bookedSlots, isNonDefaultTz]);

  const calendarModifiers = useMemo(() => {
    const today = new Date();
    const maxDate = addDays(today, 60);
    return {
      disabled: (day: Date) => day < today || day > maxDate,
      available: (day: Date) => availableDays.has(WEEKDAYS[getDay(day)].toLowerCase()),
    };
  }, [availableDays]);

  const fetchMentor = useCallback(async () => {
    if (!params?.id) return;
    try {
      const r = await fetch("/api/mentors");
      const mentors: Mentor[] = await r.json();
      const found = mentors.find(x => x.id === params.id);
      if (found) setMentor(found);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not load mentor details." });
    } finally { setIsLoading(false); }
  }, [params?.id, toast]);

  useEffect(() => { fetchMentor(); }, [fetchMentor]);
  useEffect(() => { if (date && mentor) { fetchBookedSlots(date); setTime(undefined); } }, [date, mentor, fetchBookedSlots]);
  useEffect(() => {
    if (!date || !mentor) return;
    const id = setInterval(() => fetchBookedSlots(date), 30000);
    return () => clearInterval(id);
  }, [date, mentor, fetchBookedSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittedRef.current || isSubmitting) return;
    if (!date || !time || !user || !mentor || !user.email) {
      toast({ variant: "destructive", title: "Incomplete Selection", description: "Please select a date and time." });
      return;
    }

    isSubmittedRef.current = true;
    setIsSubmitting(true);
    try {
      // `time` is already in Malaysia HH:mm — send it directly
      const myDate = format(date, "yyyy-MM-dd");
      const myTime = time;

      const r = await fetch("/api/meeting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: mentor.mentorUID || mentor.id,
          menteeId: user.id,
          mentee_name: user.name,
          mentee_email: user.email,
          date: myDate,
          time: myTime,
          message,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === "SLOT_UNAVAILABLE") { setShowSlotTakenDialog(true); await fetchBookedSlots(date); setTime(undefined); return; }
        throw new Error(data.message || "Failed to submit request");
      }
      setShowSuccessDialog(true);
      setDate(new Date());
      setTime(undefined);
      setMessage("");
      setTimeout(() => setShowSuccessDialog(false), 3000);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission Error", description: err?.message ?? "Unknown error" });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => { isSubmittedRef.current = false; }, 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8">
          <Skeleton className="h-[600px] col-span-2" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (!mentor) return <div className="text-center py-12">Mentor not found.</div>;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-16">
      <div className="grid md:grid-cols-5 gap-10">
        {/* Mentor Card */}
        <Card className="md:col-span-3 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="h-20 bg-gradient-to-r from-gray-800 to-gray-900 rounded-t-xl" />
            <div className="-mt-14 px-6 pb-8 text-center">
              <Avatar className="mx-auto h-32 w-32 border-4 border-white shadow-sm">
                <AvatarImage src={mentorData.image} />
                <AvatarFallback className="bg-gradient-to-br from-gray-700 to-gray-900 text-white text-3xl font-bold">{mentorData.name?.[0]}</AvatarFallback>
              </Avatar>
              <h1 className="mt-4 text-2xl font-semibold text-gray-900">{mentorData.name}</h1>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {(Array.isArray(mentor?.experience) ? mentor.experience : mentor?.experience ? [mentor.experience] : []).map((e, i) => (
                  <Badge key={i} className="bg-gray-100 text-gray-700 border border-gray-200">{e}</Badge>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-600">{mentor?.biography}</p>

              {mentorData.logos.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Affiliated Institutions</h3>
                  <div className="flex flex-wrap justify-center gap-3">
                    {mentorData.logos.slice(0, 3).map((p, i) => (
                      <div key={i} className="group h-12 w-12 bg-white p-2 rounded border border-gray-200 shadow-sm flex items-center justify-center relative hover:border-yellow-400 transition-all cursor-pointer" title={p.name}>
                        <img src={getGoogleDriveImageUrl(p.url)} alt={p.name} className="h-full w-full object-contain" onError={e => { e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo"; }} />
                      </div>
                    ))}
                    {mentorData.logos.length > 3 && (
                      <TooltipProvider><Tooltip>
                        <TooltipTrigger asChild>
                          <div className="h-12 w-12 bg-gray-50 border border-gray-200 rounded flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-help">+{mentorData.logos.length - 3}</div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white border-gray-200 shadow-xl p-3 rounded-lg">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Additional Institutions</p>
                          <div className="grid grid-cols-2 gap-2 max-w-[240px]">
                            {mentorData.logos.slice(3).map((p, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-white rounded border border-gray-200 p-1 flex items-center justify-center">
                                  <img src={getGoogleDriveImageUrl(p.url)} alt={p.name} className="max-w-full max-h-full object-contain" onError={e => { e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo"; }} />
                                </div>
                                <p className="text-[11px] text-gray-600 break-words max-w-[78px]">{p.name}</p>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip></TooltipProvider>
                    )}
                  </div>
                </div>
              )}

              {displayFields.length > 0 && (
                <div className="mt-8 pt-8 border-t border-gray-200 space-y-6">
                  {displayFields.map(([key, value]) => (
                    <div key={key} className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">{formatLabel(key)}</h3>
                      {Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2">
                          {value.map((item, i) => <Badge key={i} className="bg-gray-100 text-gray-700 border border-gray-200 text-xs">{String(item)}</Badge>)}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 leading-relaxed">{String(value)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Scheduler */}
        <Card className="md:col-span-2 rounded-xl border border-gray-200 shadow-sm">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-xl font-semibold text-gray-900">Schedule a Meeting</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid gap-6">
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Date</Label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 overflow-x-auto">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    modifiers={calendarModifiers}
                    modifiersStyles={{ available: { backgroundColor: "rgb(34 197 94 / 0.1)", color: "rgb(22 101 52)", fontWeight: "600" } }}
                  />
                  {isNonDefaultTz && (
                    <div className="mt-2 text-xs text-teal-700 bg-teal-50 rounded px-2 py-1">
                      🌐 Slots shown in your timezone. Submitted in Malaysia time.
                    </div>
                  )}
                  <div className="mt-1 text-xs text-green-700 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-200 border border-green-600/50" />
                    Available dates highlighted in green
                  </div>
                </div>

                <div className="mt-5">
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Time</Label>
                  {isLoadingSlots ? (
                    <div className="flex justify-center items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-gray-600" /></div>
                  ) : availableTimesForDay.length === 0 ? (
                    <div className="text-sm text-gray-500 py-8 text-center border border-gray-200 rounded-lg bg-gray-50">
                      <p>No available times for this date.</p>
                      <p className="text-xs mt-1">Please select a highlighted date.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-600 font-medium">Available times{isNonDefaultTz ? ` (your timezone)` : ''}:</div>
                      <RadioGroup value={time} onValueChange={setTime} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {availableTimesForDay.map(({ myTime, displayTime }, i) => {
                          const isSelected = time === myTime;
                          return (
                            <div key={`${myTime}-${i}`}>
                              <RadioGroupItem value={myTime} id={`slot-${myTime}-${i}`} className="sr-only" />
                              <Label htmlFor={`slot-${myTime}-${i}`}
                                className={`flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer ${
                                  isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                  : "bg-white text-gray-800 border-gray-300 hover:border-indigo-500 hover:bg-indigo-50"
                                }`}>
                                {displayTime}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Leave a Message</Label>
                <Textarea id="message" placeholder={`Share:\n- what you want to ask\n- your current status\n- any difficulties you are facing`}
                  rows={6} value={message} onChange={(e) => setMessage(e.target.value)}
                  className="rounded-lg border-gray-300 bg-gray-50 focus:bg-white" />
              </div>

              <Button type="submit" size="lg" disabled={isSubmitting || !date || !time}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                {isSubmitting ? <><Loader2 className="animate-spin mr-2 h-4 w-4" />Submitting...</> : "Submit Request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Booking Successful!</DialogTitle></DialogHeader>
          <div className="py-4">
            <p>Your meeting request has been sent to {mentorData.name}.</p>
            <p className="text-sm text-muted-foreground mt-2">You will be notified when they approve your request.</p>
          </div>
          <Button onClick={() => setShowSuccessDialog(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showSlotTakenDialog} onOpenChange={setShowSlotTakenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-red-500" />Time Slot Unavailable</DialogTitle></DialogHeader>
          <div className="py-4">
            <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Sorry, this time slot has already been booked. Please select a different time.</AlertDescription></Alert>
          </div>
          <Button onClick={() => setShowSlotTakenDialog(false)}>Choose Another Time</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}