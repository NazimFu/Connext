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
          mentorId: mentor.id,
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
    <div className="container mx-auto px-4 md:px-6 py-12">
      <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
        <div className="md:col-span-1 flex flex-col items-center text-center">
          <Avatar className="h-32 w-32 mb-4 border-2 border-primary/50">
            <AvatarImage src={mentor.mentor_photo} data-ai-hint={mentor.role} />
            <AvatarFallback>
              {mentor.mentor_name?.charAt(0).toUpperCase() || "M"}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold font-headline">
            {mentor.mentor_name}
          </h1>
          <Badge variant="secondary" className="mt-2">
            {Array.isArray(mentor.experience)
              ? mentor.experience.join(", ")
              : mentor.experience || ""}
          </Badge>
          <p className="mt-4 text-sm text-muted-foreground">
            {mentor.biography}
          </p>
        </div>
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">
                Schedule a Meeting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label className="font-medium text-lg mb-2 block">
                      1. Select a Date
                    </Label>
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      className="rounded-md border"
                      disabled={(d) =>
                        d <
                        new Date(new Date().setDate(new Date().getDate() - 1))
                      }
                    />
                  </div>
                  <div>
                    <Label className="font-medium text-lg mb-2 block">
                      2. Select a Time
                    </Label>
                    <RadioGroup
                      value={time}
                      onValueChange={setTime}
                      className="grid grid-cols-3 gap-2 pt-2"
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
                            className={`flex flex-col items-center justify-center rounded-md border-2 p-4 cursor-pointer transition-colors
                              ${
                                isTimeDisabled(t)
                                  ? "border-muted bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                                  : "border-muted bg-popover hover:bg-accent hover:text-accent-foreground"
                              }
                              ${
                                time === t
                                  ? "border-primary bg-primary/10 text-primary"
                                  : ""
                              }
                            `}
                          >
                            <Clock className="mb-2 h-6 w-6" />
                            {t}
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
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
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
