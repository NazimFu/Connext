'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Users, Mail, Building2, Briefcase, Calendar, Github, Linkedin, FileText, Search, Filter, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRequireAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MenteeInfo {
  menteeUID: string;
  mentee_name: string;
  mentee_email: string;
  mentee_institution?: string;
  mentee_occupation?: string;
  mentee_age?: string;
  linkedin?: string;
  github?: string;
  cv_link?: string;
  image?: string;
  totalSessions: number;
  completedSessions: number;
  upcomingSessions: number;
  lastMeetingDate: string | null;
  status: 'ongoing' | 'past';
}

export default function MentorMenteesPage() {
  const { user, isLoading: authLoading } = useRequireAuth('mentor');
  const { toast } = useToast();
  const [mentees, setMentees] = useState<MenteeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ongoing' | 'past'>('all');

  const fetchMentees = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch all meetings where user is mentor
      const response = await fetch(`/api/meeting-requests?mentorId=${user.id}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch meetings');
      }

      const meetings = await response.json();
      
      const parseMeetingDateTime = (date: string, time: string): Date => {
        const [year, month, day] = date.split('-').map(Number);

        if (time.includes('AM') || time.includes('PM')) {
          const [timePart, period] = time.split(' ');
          const [rawHours, minutes] = timePart.split(':').map(Number);
          const hours =
            period === 'PM' && rawHours !== 12
              ? rawHours + 12
              : period === 'AM' && rawHours === 12
              ? 0
              : rawHours;
          return new Date(year, month - 1, day, hours, minutes, 0, 0);
        }

        const [hours, minutes] = time.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0, 0);
      };

      // Group meetings by mentee and collect statistics
      const menteeMap = new Map<string, {
        info: any;
        meetings: any[];
      }>();

      for (const meeting of meetings) {
        if (meeting.decision === 'accepted' && meeting.scheduled_status !== 'cancelled') {
          const menteeKey =
            meeting.menteeUID ||
            meeting.mentee_email ||
            `${meeting.mentee_name || 'Unknown'}-${meeting.meetingId}`;

          if (!menteeMap.has(menteeKey)) {
            // Always set a fallback profile so past mentees are still displayed
            menteeMap.set(menteeKey, {
              info: {
                mentee_name: meeting.mentee_name,
                name: meeting.mentee_name,
                mentee_email: meeting.mentee_email,
                email: meeting.mentee_email,
              },
              meetings: [],
            });

            // Enrich with user profile data when mentee UID is available
            if (meeting.menteeUID) {
              try {
                const menteeResponse = await fetch(`/api/users/${meeting.menteeUID}`);
                if (menteeResponse.ok) {
                  const menteeData = await menteeResponse.json();
                  menteeMap.set(menteeKey, {
                    info: { ...menteeMap.get(menteeKey)!.info, ...menteeData },
                    meetings: menteeMap.get(menteeKey)!.meetings,
                  });
                }
              } catch (error) {
                console.error('Error fetching mentee details:', error);
              }
            }
          }

          menteeMap.get(menteeKey)!.meetings.push(meeting);
        }
      }

      // Process mentees data
      const now = new Date();
      const menteesData: MenteeInfo[] = [];

      menteeMap.forEach((data, menteeKey) => {
        const { info, meetings } = data;
        
        const completedMeetings = meetings.filter(m => {
          const meetingDate = parseMeetingDateTime(m.date, m.time);
          return meetingDate < now;
        });

        const upcomingMeetings = meetings.filter(m => {
          const meetingDate = parseMeetingDateTime(m.date, m.time);
          return meetingDate >= now;
        });

        const lastMeeting = completedMeetings.length > 0
          ? completedMeetings.sort((a, b) => {
              const dateA = parseMeetingDateTime(a.date, a.time);
              const dateB = parseMeetingDateTime(b.date, b.time);
              return dateB.getTime() - dateA.getTime();
            })[0]
          : null;

        menteesData.push({
          menteeUID: String(info.menteeUID || menteeKey),
          mentee_name: info.mentee_name || info.name,
          mentee_email: info.mentee_email || info.email,
          mentee_institution: info.mentee_institution,
          mentee_occupation: info.mentee_occupation,
          mentee_age: info.mentee_age,
          linkedin: info.linkedin,
          github: info.github,
          cv_link: info.cv_link,
          image: info.image,
          totalSessions: meetings.length,
          completedSessions: completedMeetings.length,
          upcomingSessions: upcomingMeetings.length,
          lastMeetingDate: lastMeeting ? lastMeeting.date : null,
          status: upcomingMeetings.length > 0 ? 'ongoing' : 'past'
        });
      });

      // Sort by status (ongoing first) then by last meeting date
      menteesData.sort((a, b) => {
        if (a.status === 'ongoing' && b.status === 'past') return -1;
        if (a.status === 'past' && b.status === 'ongoing') return 1;
        
        if (a.lastMeetingDate && b.lastMeetingDate) {
          return new Date(b.lastMeetingDate).getTime() - new Date(a.lastMeetingDate).getTime();
        }
        return 0;
      });

      setMentees(menteesData);
    } catch (error) {
      console.error('Error fetching mentees:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch mentees data.',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      fetchMentees();
    }
  }, [user, fetchMentees]);

  const filteredMentees = mentees.filter(mentee => {
    const matchesSearch = 
      mentee.mentee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mentee.mentee_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mentee.mentee_institution?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mentee.mentee_occupation?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = 
      filterStatus === 'all' || mentee.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const ongoingCount = mentees.filter(m => m.status === 'ongoing').length;
  const pastCount = mentees.filter(m => m.status === 'past').length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-400">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg">My Mentees</div>
              <button
                onClick={fetchMentees}
                aria-label="Refresh"
                className="h-9 w-9 rounded-md bg-white border border-gray-400 flex items-center justify-center shadow-sm hover:bg-gray-50"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 text-gray-600 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 text-gray-600" />
                )}
              </button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-6"
          >
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-blue-400 w-1 h-full hidden sm:block" />
                <CardContent className="flex-1 py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Total Mentees</p>
                      <div className="text-2xl font-semibold text-gray-900 mt-1">{mentees.length}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm">
                        <Users className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-green-400 w-1 h-full hidden sm:block" />
                <CardContent className="flex-1 py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Ongoing</p>
                      <div className="text-2xl font-semibold text-gray-900 mt-1">{ongoingCount}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm">
                        <Calendar className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="flex items-center bg-white border border-gray-400 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-purple-400 w-1 h-full hidden sm:block" />
                <CardContent className="flex-1 py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Past</p>
                      <div className="text-2xl font-semibold text-gray-900 mt-1">{pastCount}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="bg-gray-50 p-2 rounded-md shadow-sm">
                        <Users className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Filter */}
            <Card className="mb-6 border-gray-400 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      placeholder="Search by name, email, institution, or occupation..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                    <SelectTrigger className="w-full md:w-[200px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Mentees</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="past">Past</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Mentees List */}
            {filteredMentees.length === 0 ? (
              <Card className="border-gray-400 shadow-sm">
                <CardContent className="p-12 text-center">
                  <Users className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">
                    {searchQuery || filterStatus !== 'all' 
                      ? 'No mentees found matching your criteria'
                      : 'No mentees yet. Accept meeting requests to get started!'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredMentees.map((mentee) => (
              <Card key={mentee.menteeUID} className="border-gray-400 shadow-sm hover:shadow-md transition-all">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 border-4 border-gray-300 shadow-sm">
                        <AvatarImage src={mentee.image} alt={mentee.mentee_name} />
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-xl font-bold">
                          {mentee.mentee_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg mb-1">{mentee.mentee_name}</CardTitle>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-4 w-4" />
                          <span>{mentee.mentee_email}</span>
                        </div>
                      </div>
                    </div>
                    <Badge 
                      className={mentee.status === 'ongoing' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-gray-400 hover:bg-gray-500'}
                    >
                      {mentee.status === 'ongoing' ? 'Ongoing' : 'Past'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Institution and Occupation */}
                  {(mentee.mentee_institution || mentee.mentee_occupation) && (
                    <div className="grid grid-cols-1 gap-3">
                      {mentee.mentee_institution && (
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="h-4 w-4 text-gray-600" />
                          <span className="text-gray-700">{mentee.mentee_institution}</span>
                        </div>
                      )}
                      {mentee.mentee_occupation && (
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase className="h-4 w-4 text-gray-600" />
                          <span className="text-gray-700">{mentee.mentee_occupation}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Session Statistics */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-400">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{mentee.totalSessions}</div>
                      <div className="text-xs text-gray-600">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{mentee.completedSessions}</div>
                      <div className="text-xs text-gray-600">Completed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{mentee.upcomingSessions}</div>
                      <div className="text-xs text-gray-600">Upcoming</div>
                    </div>
                  </div>

                  {/* Last Meeting */}
                  {mentee.lastMeetingDate && (
                    <div className="text-sm text-gray-600 pt-3 border-t border-gray-400">
                      <span className="font-medium">Last meeting:</span>{' '}
                      {new Date(mentee.lastMeetingDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  )}

                  {/* Links */}
                  {(mentee.linkedin || mentee.github || mentee.cv_link) && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-400">
                      {mentee.linkedin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-gray-700 hover:bg-gray-100 border-gray-400"
                          onClick={() => window.open(
                            mentee.linkedin!.startsWith('http') 
                              ? mentee.linkedin 
                              : `https://${mentee.linkedin}`,
                            '_blank'
                          )}
                        >
                          <Linkedin className="h-4 w-4 mr-1" />
                          LinkedIn
                        </Button>
                      )}
                      {mentee.github && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-gray-700 hover:bg-gray-100 border-gray-400"
                          onClick={() => window.open(
                            mentee.github!.startsWith('http') 
                              ? mentee.github 
                              : `https://github.com/${mentee.github}`,
                            '_blank'
                          )}
                        >
                          <Github className="h-4 w-4 mr-1" />
                          GitHub
                        </Button>
                      )}
                      {mentee.cv_link && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-gray-700 hover:bg-gray-100 border-gray-400"
                          onClick={() => window.open(mentee.cv_link!, '_blank')}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          CV
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
