"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
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

// Whitelisted fields to display (empty values will be filtered out)
const ALLOWED_FIELDS = new Set([
  "specialization",
  "field_of_consultation",
  "biography",
  "experience",
  "skills",
  "achievement",
]);

const MY_TIMEZONE = "Asia/Kuala_Lumpur";
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Fast label formatter with memoization
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

// Fast timezone detection
const getUserTimezone = (() => {
  let userTz: string | null = null;
  return (): string => {
    if (userTz) return userTz;
    userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return userTz;
  };
})();

export default function MentorDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const { user } = useRequireAuth(["mentee", "mentor"]);

  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | undefined>();
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showSlotTakenDialog, setShowSlotTakenDialog] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Prevent duplicate submissions
  const isSubmittedRef = useRef(false);
  const userTimezone = getUserTimezone();

  // Memoized mentor data extractors
  const mentorData = useMemo(() => {
    if (!mentor) return { name: "", image: "", logos: [] };

    const name = mentor.mentor_name || "Mentor";
    const image = mentor.mentor_photo || "";
    const logos = Array.isArray(mentor.institution_photo)
      ? mentor.institution_photo.map((photo) => {
          if (typeof photo === 'string') {
            return { url: photo, name: 'Institution' };
          }
          return photo;
        }).filter((photo) => photo.url && photo.url.trim())
      : [];

    return { name, image, logos };
  }, [mentor]);

  // Memoized available days calculation
  const availableDays = useMemo(() => {
    if (!mentor?.available_slots || !Array.isArray(mentor.available_slots))
      return new Set();

    const days = new Set<string>();
    mentor.available_slots.forEach((slot: any) => {
      if (
        slot?.day &&
        Array.isArray(slot.time) &&
        slot.time.some((t: string) => t && t.trim())
      ) {
        days.add(slot.day.toLowerCase());
      }
    });
    return days;
  }, [mentor?.available_slots]);

  // Memoized filtered fields
  const displayFields = useMemo(() => {
    if (!mentor) return [];

    return Object.entries(mentor)
      .filter(([key, value]) => {
        if (!ALLOWED_FIELDS.has(key)) return false;

        // Filter empty values
        if (!value) return false;
        if (typeof value === "string" && !value.trim()) return false;
        if (Array.isArray(value)) {
          const nonEmpty = value.filter((item) => item && String(item).trim());
          return nonEmpty.length > 0;
        }
        return true;
      })
      .map(([key, value]) => {
        // Clean array values
        const cleanValue = Array.isArray(value)
          ? value.filter((item) => item && String(item).trim())
          : value;
        return [key, cleanValue] as [string, any];
      });
  }, [mentor]);

  // Fetch booked slots for selected date
  const fetchBookedSlots = useCallback(
    async (selectedDate: Date) => {
      if (!mentor?.id) return;

      setIsLoadingSlots(true);
      try {
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        const response = await fetch(
          `/api/booked-slots?mentorId=${mentor.id}&date=${dateStr}`
        );

        if (response.ok) {
          const data = await response.json();
          setBookedSlots(data.bookedSlots || []);
        }
      } catch (error) {
        console.error("Failed to fetch booked slots:", error);
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [mentor?.id]
  );

  // Memoized timezone conversion for available times - FIXED DUPLICATE KEYS
  const availableTimesForDay = useMemo(() => {
    if (!mentor || !date) return [];

    const selectedWeekday = WEEKDAYS[getDay(date)];
    const availableSlot = mentor.available_slots?.find(
      (slot: any) =>
        slot?.day && slot.day.toLowerCase() === selectedWeekday.toLowerCase()
    );

    if (!availableSlot?.time || !Array.isArray(availableSlot.time)) return [];

    const timeSlots = new Set<string>(); // Use Set to prevent duplicates
    const validTimes: string[] = [];

    availableSlot.time.forEach((myTime: string) => {
      if (!myTime || !myTime.trim()) return;

      try {
        // Create a date-time in Malaysia timezone
        const dateStr = format(date, "yyyy-MM-dd");
        const malaysiaDateTime = new Date(
          `${dateStr}T${myTime.padStart(5, "0")}:00`
        );

        // Convert Malaysia time to user's timezone
        const userDateTime = toZonedTime(malaysiaDateTime, userTimezone);
        const convertedTime = format(userDateTime, "HH:mm");

        // Check if the converted time is still on the selected date
        const selectedDateStr = format(date, "yyyy-MM-dd");
        const userDateStr = format(userDateTime, "yyyy-MM-dd");

        // Only add if it's on the same date and not already added
        if (userDateStr === selectedDateStr && !timeSlots.has(convertedTime)) {
          timeSlots.add(convertedTime);
          validTimes.push(convertedTime);
        }
      } catch (error) {
        console.warn("Failed to convert time:", myTime, error);
      }
    });

    return validTimes
      .sort()
      .filter((timeSlot) => !bookedSlots.includes(timeSlot)); // Filter out booked slots
  }, [mentor, date, userTimezone, bookedSlots]);

  // Calendar day modifier to highlight available days
  const calendarModifiers = useMemo(() => {
    const today = new Date();
    const maxDate = addDays(today, 60);

    return {
      disabled: (day: Date) => day < today || day > maxDate,
      available: (day: Date) => {
        const weekday = WEEKDAYS[getDay(day)];
        return availableDays.has(weekday.toLowerCase());
      },
    };
  }, [availableDays]);

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
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load mentor details.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [params?.id, toast]);

  useEffect(() => {
    fetchMentor();
  }, [fetchMentor]);

  // Fetch booked slots when date changes
  useEffect(() => {
    if (date && mentor) {
      fetchBookedSlots(date);
      setTime(undefined); // Reset selected time when date changes
    }
  }, [date, mentor, fetchBookedSlots]);

  // Real-time updates every 30 seconds
  useEffect(() => {
    if (!date || !mentor) return;

    const interval = setInterval(() => {
      fetchBookedSlots(date);
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [date, mentor, fetchBookedSlots]);

  const isTimeDisabled = useCallback(
    (timeSlot: string) => {
      if (!date) return true;
      if (!availableTimesForDay.includes(timeSlot)) return true;
      if (bookedSlots.includes(timeSlot)) return true;

      // Build a Date in user's timezone for the selected date+time
      const [hours, minutes] = timeSlot.split(":").map(Number);
      const slotDate = new Date(date);
      slotDate.setHours(hours, minutes, 0, 0);

      return slotDate < new Date();
    },
    [date, availableTimesForDay, bookedSlots]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isSubmittedRef.current || isSubmitting) {
      return;
    }

    if (!date || !time) {
      toast({
        variant: "destructive",
        title: "Incomplete Selection",
        description: "Please select a date and time for your meeting.",
      });
      return;
    }

    if (!user || !mentor || !user.email) {
      toast({
        variant: "destructive",
        title: "User or Mentor data missing",
        description: "You must be logged in and a mentor must be selected.",
      });
      return;
    }

    isSubmittedRef.current = true;
    setIsSubmitting(true);

    try {
      // Convert user's local time back to Malaysia time
      const [hours, minutes] = time.split(":").map(Number);
      const userDateTime = new Date(date);
      userDateTime.setHours(hours, minutes, 0, 0);

      // Convert user's timezone to Malaysia timezone
      const malaysiaDateTime = fromZonedTime(userDateTime, userTimezone);
      const malaysiaZoned = toZonedTime(malaysiaDateTime, MY_TIMEZONE);

      const myDate = format(malaysiaZoned, "yyyy-MM-dd");
      const myTime = format(malaysiaZoned, "HH:mm");

      const response = await fetch("/api/meeting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: mentor.id,
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
          // Refresh available slots
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
      // Reset duplicate prevention after a delay
      setTimeout(() => {
        isSubmittedRef.current = false;
      }, 2000);
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

  if (!mentor)
    return <div className="text-center py-12">Mentor not found.</div>;

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
                <AvatarFallback className="bg-gradient-to-br from-gray-700 to-gray-900 text-white text-3xl font-bold">
                  {mentorData.name?.[0]}
                </AvatarFallback>
              </Avatar>

              <h1 className="mt-4 text-2xl font-semibold text-gray-900">
                {mentorData.name}
              </h1>

              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {Array.isArray(mentor?.experience)
                  ? mentor.experience.map((e, i) => (
                      <Badge
                        key={i}
                        className="bg-gray-100 text-gray-700 border border-gray-200"
                      >
                        {e}
                      </Badge>
                    ))
                  : mentor?.experience && (
                      <Badge className="bg-gray-100 text-gray-700 border border-gray-200">
                        {mentor.experience}
                      </Badge>
                    )}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-gray-600">
                {mentor?.biography}
              </p>

              {/* Institution Logos */}
              {mentorData.logos.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">
                    Affiliated Institutions
                  </h3>
                  <div className="flex flex-wrap justify-center gap-3">
                    {mentorData.logos.slice(0, 3).map((photoObj, idx) => (
                      <div
                        key={idx}
                        className="group h-12 w-12 bg-white p-2 rounded border border-gray-200 shadow-sm flex items-center justify-center relative hover:border-yellow-400 transition-all cursor-pointer"
                        title={photoObj.name}
                      >
                        <img
                          src={getGoogleDriveImageUrl(photoObj.url)}
                          alt={photoObj.name}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo";
                          }}
                        />
                        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          {photoObj.name}
                        </div>
                      </div>
                    ))}
                    {mentorData.logos.length > 3 && (
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <div className="h-12 w-12 bg-gray-50 border border-gray-200 rounded flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-help">
                              +{mentorData.logos.length - 3}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="center"
                            sideOffset={8}
                            className="bg-white border-gray-200 shadow-xl p-3 rounded-lg"
                          >
                            <p className="text-xs font-semibold text-gray-700 mb-2">
                              Additional Institutions
                            </p>
                            <div className="grid grid-cols-2 gap-2.5 max-w-[240px]">
                              {mentorData.logos.slice(3).map((photoObj, idx) => (
                                <div key={`extra-institution-${idx}`} className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-white rounded border border-gray-200 p-1 flex items-center justify-center">
                                    <img
                                      src={getGoogleDriveImageUrl(photoObj.url)}
                                      alt={photoObj.name}
                                      className="max-w-full max-h-full object-contain"
                                      onError={(e) => {
                                        e.currentTarget.src = "https://placehold.co/40x40/e5e7eb/6b7280?text=Logo";
                                      }}
                                    />
                                  </div>
                                  <p className="text-[11px] leading-tight text-gray-600 max-w-[78px] break-words">
                                    {photoObj.name}
                                  </p>
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

              {/* Dynamic Fields Inside Mentor Card */}
              {displayFields.length > 0 && (
                <div className="mt-8 pt-8 border-t border-gray-200 space-y-6">
                  {displayFields.map(([key, value]) => (
                    <div key={key} className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        {formatLabel(key)}
                      </h3>
                      {Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2">
                          {value.map((item: any, idx: number) => (
                            <Badge
                              key={idx}
                              className="bg-gray-100 text-gray-700 border border-gray-200 text-xs"
                            >
                              {String(item)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {String(value)}
                        </p>
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
            <CardTitle className="text-xl font-semibold text-gray-900">
              Schedule a Meeting
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid gap-6">
              <div className="grid gap-6">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    Select Date
                  </Label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 overflow-x-auto">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      modifiers={calendarModifiers}
                      modifiersStyles={{
                        available: {
                          backgroundColor: "rgb(34 197 94 / 0.1)",
                          color: "rgb(22 101 52)",
                          fontWeight: "600",
                        },
                      }}
                    />
                    <div className="mt-3 text-xs text-gray-500">
                      Your timezone: {userTimezone}
                    </div>
                    <div className="mt-1 text-xs text-green-700 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-200 border border-green-600/50"></div>
                      Available dates highlighted in green
                    </div>
                  </div>

                  {/* Available times moved under the calendar */}
                  <div className="mt-5">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">
                      Select Time
                    </Label>
                    {isLoadingSlots ? (
                      <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                      </div>
                    ) : availableTimesForDay.length === 0 ? (
                      <div className="text-sm text-gray-500 py-8 text-center border border-gray-200 rounded-lg bg-gray-50">
                        <p>No available times for this date.</p>
                        <p className="text-xs mt-1">Please select a highlighted date.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600 font-medium">
                          Available times:
                        </div>
                        <RadioGroup
                          value={time}
                          onValueChange={setTime}
                          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                        >
                          {availableTimesForDay.map((t, index) => {
                            const disabled = isTimeDisabled(t);
                            const isBooked = bookedSlots.includes(t);
                            const uniqueKey = `${t}-${index}`;

                            return (
                              <div key={uniqueKey}>
                                <RadioGroupItem
                                  value={t}
                                  id={uniqueKey}
                                  className="sr-only"
                                  disabled={disabled}
                                />
                                <Label
                                  htmlFor={uniqueKey}
                                  className={`
                                    flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer
                                    ${
                                      disabled
                                        ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                                        : isBooked
                                        ? "bg-red-50 text-red-600 border-red-200 cursor-not-allowed line-through"
                                        : "bg-white text-gray-800 border-gray-300 hover:border-indigo-500 hover:bg-indigo-50"
                                    }
                                    ${
                                      time === t
                                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                        : ""
                                    }
                                  `}
                                >
                                  {t}
                                </Label>
                              </div>
                            );
                          })}
                        </RadioGroup>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">
                  Leave a Message
                </Label>
                <Textarea
                  id="message"
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
      <Dialog
        open={showSlotTakenDialog}
        onOpenChange={setShowSlotTakenDialog}
      >
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
