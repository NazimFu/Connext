"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { type Mentor } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

// A full list of possible times to ensure consistent layout
const allPossibleTimes = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
  "07:00 PM",
  "08:00 PM",
];

export default function SchedulePage() {
  const params = useParams();
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useRequireAuth(["mentee", "mentor"]);

  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | undefined>();
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [availableTimesForDay, setAvailableTimesForDay] = useState<string[]>(
    []
  );

  useEffect(() => {
    async function fetchMentor() {
      if (!params.id) return;
      try {
        const response = await fetch("/api/mentors");
        const mentors: Mentor[] = await response.json();

        const foundMentor = mentors.find((m) => m.id === params.id);
        if (foundMentor) {
          setMentor(foundMentor);
        }
      } catch (error) {
        console.error("Failed to fetch mentor:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMentor();
  }, [params.id]);

  useEffect(() => {
    if (mentor && date) {
      // Get the day name (e.g., "Monday", "Tuesday") from the selected date
      const selectedDayName = format(date, "EEEE"); // This gives you "Monday", "Tuesday", etc.

      // Find the availability for the selected day
      const daySlot = mentor.available_slots?.find(
        (slot: any) =>
          slot.day && slot.day.toLowerCase() === selectedDayName.toLowerCase()
      );

      // Get the times for that day, or empty array if no slots
      const timesForDay = daySlot?.time || [];

      // Convert 24-hour format to 12-hour format with AM/PM
      const formattedTimes = timesForDay.map((time: string) => {
        const [hours, minutes] = time.split(":");
        const hour24 = parseInt(hours);
        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        const ampm = hour24 >= 12 ? "PM" : "AM";
        return `${hour12.toString().padStart(2, "0")}:${minutes} ${ampm}`;
      });

      setAvailableTimesForDay(formattedTimes);
      setTime(undefined); // Reset time selection when date changes
    }
  }, [mentor, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setIsSubmitting(true);

    try {
      // Change this from '/api/schedule' to '/api/meeting-requests'
      const response = await fetch("/api/meeting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: mentor.mentorUID || mentor.id,
          menteeId: user.id,
          mentee_name: user.name || "Unknown User",
          mentee_email: user.email,
          date: format(date, "yyyy-MM-dd"),
          time: time,
          message: message,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Failed to submit request");
      }

      // Show success message with notification info
      toast({
        title: "Request Sent Successfully! 📧",
        description: `Your meeting request has been sent to ${
          mentor.mentor_name
        }. ${
          responseData.mentorNotified
            ? "They have been notified via email."
            : ""
        } You will receive an email when they respond.`,
      });

      // Redirect to mentee dashboard
      router.push("/mentee/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: (error as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTimeDisabled = (timeSlot: string) => {
    if (!date || !mentor) return true;

    if (!availableTimesForDay.includes(timeSlot)) {
      return true;
    }

    const currentDateTime = new Date();

    const match = timeSlot.match(/(\d+):(\d+)\s*(AM|PM)/);
    if (!match) return true; // Invalid time format, disable it.

    const [, hours, minutes, period] = match;
    let hours24 = parseInt(hours);
    if (period === "PM" && hours24 < 12) {
      hours24 += 12;
    } else if (period === "AM" && hours24 === 12) {
      hours24 = 0;
    }
    const slotDateTime = new Date(date);
    slotDateTime.setHours(hours24, parseInt(minutes), 0, 0);

    if (slotDateTime < currentDateTime) {
      return true;
    }

    return false; // For now, we don't check for existing bookings as API will handle it
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1 flex flex-col items-center text-center space-y-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="md:col-span-2">
            <Skeleton className="h-[500px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return <div className="text-center py-12">Mentor not found.</div>;
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
        <div className="md:col-span-1">
          <Card className="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50 border border-indigo-100/50 shadow-lg overflow-hidden">
            <CardContent className="p-0">
              {/* Header Background */}
              <div className="h-24 bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400"></div>
              
              {/* Avatar Section */}
              <div className="px-6 pb-6 flex flex-col items-center -mt-16 relative z-10">
                <Avatar className="h-40 w-40 mb-4 ring-4 ring-white shadow-xl border-2 border-indigo-100">
                  <AvatarImage src={mentor.mentor_photo} data-ai-hint={mentor.role} />
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-emerald-500 text-white text-4xl font-bold">
                    {mentor.mentor_name?.charAt(0).toUpperCase() || "M"}
                  </AvatarFallback>
                </Avatar>

                {/* Name and Title */}
                <h1 className="text-3xl font-bold font-headline text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-emerald-600 mb-2">
                  {mentor.mentor_name}
                </h1>

                {/* Experience Badges */}
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {Array.isArray(mentor.experience) ? (
                    mentor.experience.map((exp, idx) => (
                      <Badge 
                        key={idx}
                        className="bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200 transition-colors"
                      >
                        {exp}
                      </Badge>
                    ))
                  ) : mentor.experience ? (
                    <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200 transition-colors">
                      {mentor.experience}
                    </Badge>
                  ) : null}
                </div>

                {/* Biography */}
                <div className="space-y-4 w-full">
                  <p className="text-sm leading-relaxed text-gray-700 text-center">
                    {mentor.biography}
                  </p>

                  {/* Quick Stats or Divider */}
                  <div className="pt-4 border-t border-indigo-100/50">
                    <div className="flex items-center justify-center gap-1 text-xs text-emerald-600 font-semibold">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      Available for Mentoring
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2">
          <Card className="rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden">
            <CardHeader>
              <CardTitle className="font-headline bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-emerald-500">
                Schedule a Meeting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 overflow-hidden">
                  <div className="min-w-0 overflow-hidden">
                    <Label className="font-medium text-lg mb-2 block">
                      1. Select a Date
                    </Label>
                    <div className="min-w-0 overflow-x-auto">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        className="rounded-md border w-full"
                        disabled={(d) =>
                          d <
                          new Date(new Date().setDate(new Date().getDate() - 1))
                        }
                      />
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <Label className="font-medium text-lg mb-2 block">
                      2. Select a Time
                    </Label>
                    <RadioGroup
                      value={time}
                      onValueChange={setTime}
                      className="grid grid-cols-3 gap-2 pt-2 min-w-0 overflow-hidden"
                    >
                      {allPossibleTimes.map((t) => (
                        <div key={t}>
                          <RadioGroupItem
                            value={t}
                            id={t}
                            className="sr-only"
                            disabled={isTimeDisabled(t)}
                          />
                          <Label
                            htmlFor={t}
                            className={`flex flex-col items-center justify-center rounded-md border-2 p-3 cursor-pointer transition-colors text-sm leading-tight
                              ${
                                isTimeDisabled(t)
                                  ? "border-muted bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                                  : "border-gray-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-gray-800"
                              }
                              ${
                                time === t
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                  : ""
                              }
                            `}
                          >
                            <Clock className="mb-1 h-5 w-5 text-indigo-400" />
                            <span className="font-medium">{t}</span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
                <div>
                  <Label
                    htmlFor="message"
                    className="font-medium text-lg mb-2 block"
                  >
                    3. Leave a Message
                  </Label>
                  <Textarea
                    id="message"
                    placeholder={`Share:\n- what you want to ask\n- your current status\n- any difficulties you are facing\n- etc.`}
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-gradient-to-r from-indigo-600 to-emerald-500 hover:opacity-95 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
