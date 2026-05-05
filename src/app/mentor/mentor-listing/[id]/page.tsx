"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
import { format, getDay } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getGoogleDriveImageUrl } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { DEFAULT_TIMEZONE, convertMeetingTime, getUserTimezone } from "@/lib/timezone";
import { getRequestWindowBounds } from "@/lib/token-cycle";

const MY_TZ = DEFAULT_TIMEZONE;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ALLOWED_FIELDS = new Set([
  "specialization",
  "field_of_consultation",
  "biography",
  "experience",
  "skills",
  "achievement",
]);

const formatLabel = (() => {
  const cache = new Map<string, string>();
  return (key: string): string => {
    if (cache.has(key)) return cache.get(key)!;
    const formatted = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    cache.set(key, formatted);
    return formatted;
  };
})();

export default function MentorDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const { user } = useRequireAuth(["mentee", "mentor"]);

  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | undefined>(); // Malaysia time HH:mm
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showSlotTakenDialog, setShowSlotTakenDialog] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]); // Malaysia times
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const isSubmittedRef = useRef(false);

  const userTz = getUserTimezone(user as any);
  const isNonDefaultTz = userTz !== MY_TZ;

  const mentorData = useMemo(() => {
    if (!mentor) return { name: "", image: "", logos: [] };
    const name = mentor.mentor_name || "Mentor";
    const image = mentor.mentor_photo || "";
    const logos = Array.isArray(mentor.institution_photo)
      ? mentor.institution_photo
          .map((photo) => (typeof photo === "string" ? { url: photo, name: "Institution" } : photo))
          .filter((photo) => photo.url?.trim())
      : [];
    return { name, image, logos };
  }, [mentor]);

  const availableDays = useMemo(() => {
    if (!mentor?.available_slots || !Array.isArray(mentor.available_slots)) return new Set<string>();
    const days = new Set<string>();
    mentor.available_slots.forEach((slot: any) => {
      if (slot?.day && Array.isArray(slot.time) && slot.time.some((t: string) => t?.trim())) {
        days.add(slot.day.toLowerCase());
      }
    });
    return days;
  }, [mentor?.available_slots]);

  const displayFields = useMemo(() => {
    if (!mentor) return [];
    return Object.entries(mentor)
      .filter(([key, value]) => ALLOWED_FIELDS.has(key) && value)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((item) => item && String(item).trim()) : value,
      ] as [string, any]);
  }, [mentor]);

  const fetchBookedSlots = useCallback(async (selectedDate: Date) => {
    if (!mentor?.id) return;
    setIsLoadingSlots(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const res = await fetch(`/api/booked-slots?mentorId=${mentor.id}&date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setBookedSlots(data.bookedSlots || []);
      }
    } catch (error) {
      console.error("Failed to fetch booked slots:", error);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [mentor?.id]);

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
      const userDateStr = format(converted.utcDate, "yyyy-MM-dd");
      if (userDateStr !== dateStr && isNonDefaultTz) continue;

      const key = `${myTime}-${converted.displayTime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        myTime,
        displayTime: converted.displayTime,
        booked: bookedSlots.includes(myTime),
      });
    }

    return result
      .filter((s) => !s.booked)
      .sort((a, b) => a.myTime.localeCompare(b.myTime));
  }, [mentor, date, userTz, bookedSlots, isNonDefaultTz]);

  // Compute date bounds once — dates must be >= 7 days from now and <= 30 days from now
  const { earliestMeetingDate, latestMeetingDate } = useMemo(
    () => getRequestWindowBounds(new Date()),
    []
  );

  // Disable function for Calendar — dates outside the [+7d, +30d] window are not selectable
  const isDateDisabled = useCallback(
    (day: Date) => {
      return day < earliestMeetingDate || day > latestMeetingDate;
    },
    [earliestMeetingDate, latestMeetingDate]
  );

  const calendarModifiers = useMemo(() => ({
    available: (day: Date) =>
      day >= earliestMeetingDate &&
      day <= latestMeetingDate &&
      availableDays.has(WEEKDAYS[getDay(day)].toLowerCase()),
  }), [availableDays, earliestMeetingDate, latestMeetingDate]);

  const fetchMentor = useCallback(async () => {
    if (!params?.id) return;
    try {
      const res = await fetch("/api/mentors");
      if (!res.ok) throw new Error("Failed to fetch mentors");
      const mentors: Mentor[] = await res.json();
      const found = mentors.find((x) => x.id === params.id);
      if (found) setMentor(found);
    } catch (err) {
      console.error("Failed to fetch mentor:", err);
      toast({ variant: "destructive", title: "Error", description: "Could not load mentor details." });
    } finally {
      setIsLoading(false);
    }
  }, [params?.id, toast]);

  useEffect(() => { fetchMentor(); }, [fetchMentor]);

  useEffect(() => {
    if (date && mentor) {
      fetchBookedSlots(date);
      setTime(undefined);
    }
  }, [date, mentor, fetchBookedSlots]);

  useEffect(() => {
    if (!date || !mentor) return;
    const interval = setInterval(() => fetchBookedSlots(date), 30000);
    return () => clearInterval(interval);
  }, [date, mentor, fetchBookedSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittedRef.current || isSubmitting) return;
    if (!date || !time || !user || !mentor || !user.email) {
      toast({
        variant: "destructive",
        title: "Incomplete Selection",
        description: "Please select a date and time.",
      });
      return;
    }

    isSubmittedRef.current = true;
    setIsSubmitting(true);

    try {
      const myDate = format(date, "yyyy-MM-dd");
      const myTime = time; // Already in Malaysia time

      const response = await fetch("/api/meeting-requests", {
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

      const responseData = await response.json();

      if (!response.ok) {
        if (responseData.error === "SLOT_UNAVAILABLE") {
          setShowSlotTakenDialog(true);
          await fetchBookedSlots(date);
          setTime(undefined);
          return;
        }
        throw new Error(responseData.message || "Failed to submit request");
      }

      setShowSuccessDialog(true);
      setDate(new Date());
      setTime(undefined);
      setMessage("");
      setTimeout(() => setShowSuccessDialog(false), 3000);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: err?.message ?? "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => { isSubmittedRef.current = false; }, 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-12">
        <Skeleton className="h-12 w-48 mb-8" />
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
                        <img
                          src={getGoogleDriveImageUrl(p.url)}
                          alt={p.name}
                          className="h-full w-full object-contain"
                          onError={(e) => { e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo"; }}
                        />
                      </div>
                    ))}
                    {mentorData.logos.length > 3 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-12 w-12 bg-gray-50 border border-gray-200 rounded flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-help">+{mentorData.logos.length - 3}</div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-white border-gray-200 shadow-xl p-3 rounded-lg">
                            <p className="text-xs font-semibold text-gray-700 mb-2">Additional Institutions</p>
                            <div className="grid grid-cols-2 gap-2 max-w-[240px]">
                              {mentorData.logos.slice(3).map((p, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-white rounded border border-gray-200 p-1 flex items-center justify-center">
                                    <img
                                      src={getGoogleDriveImageUrl(p.url)}
                                      alt={p.name}
                                      className="max-w-full max-h-full object-contain"
                                      onError={(e) => { e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo"; }}
                                    />
                                  </div>
                                  <p className="text-[11px] text-gray-600 break-words max-w-[78px]">{p.name}</p>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
                          {value.map((item, i) => (
                            <Badge key={i} className="bg-gray-100 text-gray-700 border border-gray-200 text-xs">{String(item)}</Badge>
                          ))}
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
                    // Use the `disabled` prop directly — the correct way to prevent
                    // selection of out-of-window dates in shadcn Calendar.
                    disabled={isDateDisabled}
                    modifiers={calendarModifiers}
                    modifiersStyles={{
                      available: {
                        backgroundColor: "rgb(34 197 94 / 0.1)",
                        color: "rgb(22 101 52)",
                        fontWeight: "600",
                      },
                    }}
                  />
                  <div className="mt-3 text-xs text-gray-500">Your timezone: {userTz}</div>
                  <div className="mt-1 text-xs text-green-700 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-200 border border-green-600/50" />
                    Available dates highlighted in green
                  </div>
                  <div className="mt-1 text-xs text-amber-700">
                    You can request only for dates between 1 week and 1 month from today.
                  </div>
                </div>

                {/* Time Selection */}
                <div className="mt-5">
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Time</Label>
                  {isLoadingSlots ? (
                    <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                    </div>
                  ) : availableTimesForDay.length === 0 ? (
                    <div className="text-sm text-gray-500 py-8 text-center border border-gray-200 rounded-lg bg-gray-50">
                      No available times for this date.<br />
                      <span className="text-xs mt-1">Please select a highlighted date.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-600 font-medium">
                        Available times{isNonDefaultTz ? ` (in your timezone)` : ""}:
                      </div>
                      <RadioGroup value={time} onValueChange={setTime} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {availableTimesForDay.map(({ myTime, displayTime }, index) => (
                          <div key={`${myTime}-${index}`}>
                            <RadioGroupItem value={myTime} id={`slot-${myTime}-${index}`} className="sr-only" />
                            <Label
                              htmlFor={`slot-${myTime}-${index}`}
                              className={`flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer ${
                                time === myTime
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                  : "bg-white text-gray-800 border-gray-300 hover:border-indigo-500 hover:bg-indigo-50"
                              }`}
                            >
                              {displayTime}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  )}
                </div>

                {isNonDefaultTz && (
                  <div className="mt-3 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-3 py-2">
                    🌍 Times are shown in your timezone ({userTz}).<br />
                    All bookings are saved in Malaysia time.
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Leave a Message</Label>
                <Textarea
                  placeholder={`Share:\n- what you want to ask\n- your current status\n- any difficulties you are facing\n- etc.`}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="rounded-lg border-gray-300 bg-gray-50 focus:bg-white"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting || !date || !time}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Booking Successful!</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Your meeting request has been sent to {mentorData.name}.</p>
            <p className="text-sm text-muted-foreground mt-2">
              You will be notified when they approve your request.
            </p>
          </div>
          <Button onClick={() => setShowSuccessDialog(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      {/* Slot Taken Dialog */}
      <Dialog open={showSlotTakenDialog} onOpenChange={setShowSlotTakenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Time Slot Unavailable
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Sorry, this time slot has already been booked by another user.
                Please select a different time.
              </AlertDescription>
            </Alert>
          </div>
          <Button onClick={() => setShowSlotTakenDialog(false)}>
            Choose Another Time
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}