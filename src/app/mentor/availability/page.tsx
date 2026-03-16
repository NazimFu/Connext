
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useRequireAuth } from '@/hooks/use-auth';
import { type Mentor } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const allPossibleTimes = [
  '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM',
  '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'
];

export default function AvailabilityPage() {
  const { user, isLoading } = useRequireAuth('mentor');
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isFetchingMentor, setIsFetchingMentor] = useState(true);

  useEffect(() => {
    async function fetchMentor() {
        if (!user) return;
        setIsFetchingMentor(true);
        try {
            // Assuming the mentor's user ID is in the format 'mentor-1'
            const mentorId = user.id.split('-')[1];
            const response = await fetch('/api/mentors');
            const allMentors = await response.json();
            const currentMentor = allMentors.find((m: Mentor) => m.id === mentorId);
            setMentor(currentMentor || null);
        } catch (error) {
            console.error("Failed to fetch mentor data", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch mentor data.' });
        } finally {
            setIsFetchingMentor(false);
        }
    }
    fetchMentor();
  }, [user, toast]);

  useEffect(() => {
    // When the date or mentor changes, load the availability for that date.
    if (date && mentor) {
      const dateString = format(date, 'yyyy-MM-dd');
      setAvailableTimes(mentor.availability[dateString] || []);
    }
  }, [date, mentor]);
  
  const handleTimeChange = (time: string, checked: boolean) => {
    setAvailableTimes(prev => 
      checked ? [...prev, time] : prev.filter(t => t !== time)
    );
  };

  const handleSaveChanges = () => {
    if (mentor && date) {
      const dateString = format(date, 'yyyy-MM-dd');
      // In a real app, you would send this to your backend to save.
      console.log("Saving availability for", dateString, ":", availableTimes);
      
      toast({
        title: 'Availability Updated',
        description: `Your available times for ${format(date, 'PPP')} have been saved.`,
      });
    }
  };

  if (isLoading || isFetchingMentor || !user || !mentor) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Manage Availability</CardTitle>
          <CardDescription>
            Select a date and check the time slots you are available for mentoring.
            This will override your default availability for the selected day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-medium text-lg mb-2">1. Select a Date</h3>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border"
                disabled={(d) => d < new Date(new Date().setDate(new Date().getDate() - 1))}
              />
            </div>
            <div>
              <h3 className="font-medium text-lg mb-2">2. Set Available Times for {date ? format(date, 'PPP') : ''}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                {allPossibleTimes.map(time => (
                  <div key={time} className="flex items-center space-x-2 p-3 rounded-md border border-muted">
                    <Checkbox
                      id={time}
                      checked={availableTimes.includes(time)}
                      onCheckedChange={(checked) => handleTimeChange(time, !!checked)}
                    />
                    <label
                      htmlFor={time}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {time}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={handleSaveChanges}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
