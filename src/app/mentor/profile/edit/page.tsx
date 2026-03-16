// src/app/mentor/profile/edit/page.tsx

'use client';

import React, { useState, useEffect, KeyboardEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { X, Loader2, Camera, User, Award, Briefcase, Target, Star, BookOpen, Mail, Shield, CheckCircle2, AlertCircle, Calendar, Clock, Crop as CropIcon, Eye, Upload, GripVertical, Building2 } from 'lucide-react';
import { InstitutionPhoto } from '@/lib/types';
import { useRequireAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { getGoogleDriveImageUrl } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageCropper } from '@/components/ui/image-cropper';

// ============================================
// TAG INPUT COMPONENT
// ============================================
interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder: string;
  accentColor: 'purple' | 'indigo' | 'teal' | 'green' | 'amber' | 'blue';
}

function TagInput({ tags, setTags, placeholder, accentColor }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const colorClasses = {
    purple: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      badge: 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
      container: 'bg-purple-50 border-purple-100',
      focus: 'focus-within:border-purple-400 focus-within:ring-purple-400/20',
    },
    indigo: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-700',
      badge: 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700',
      container: 'bg-indigo-50 border-indigo-100',
      focus: 'focus-within:border-indigo-400 focus-within:ring-indigo-400/20',
    },
    teal: {
      bg: 'bg-teal-100',
      text: 'text-teal-700',
      badge: 'bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700',
      container: 'bg-teal-50 border-teal-100',
      focus: 'focus-within:border-teal-400 focus-within:ring-teal-400/20',
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      badge: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
      container: 'bg-green-50 border-green-100',
      focus: 'focus-within:border-green-400 focus-within:ring-green-400/20',
    },
    amber: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      badge: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700',
      container: 'bg-amber-50 border-amber-100',
      focus: 'focus-within:border-amber-400 focus-within:ring-amber-400/20',
    },
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      badge: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
      container: 'bg-blue-50 border-blue-100',
      focus: 'focus-within:border-blue-400 focus-within:ring-blue-400/20',
    },
  };

  const colors = colorClasses[accentColor];

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        setTags([...tags, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const removeTag = (indexToRemove: number) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap gap-2 p-3 min-h-[52px] rounded-lg border ${colors.container} ${colors.focus} transition-all focus-within:ring-2`}>
        {tags.map((tag, index) => (
          <Badge
            key={index}
            className={`${colors.badge} text-white pl-3 pr-2 py-1.5 animate-in fade-in zoom-in-95 duration-200`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="ml-2 hover:bg-white/20 rounded-full p-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.replace(',', ''))}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : 'Add more...'}
          className="flex-1 min-w-[180px] bg-transparent border-0 outline-none text-gray-700 placeholder-gray-400 text-sm"
        />
      </div>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        Press
        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono font-medium">Enter</kbd>
        or
        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono font-medium">,</kbd>
        to add • 
        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono font-medium">Backspace</kbd>
        to remove last
      </p>
    </div>
  );
}

// ============================================
// SCHEDULE/AVAILABILITY COMPONENT
// ============================================
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TIME_PRESETS = [
  { label: 'Morning', times: ['09:00', '10:00', '11:00'] },
  { label: 'Afternoon', times: ['13:00', '14:00', '15:00', '16:00'] },
  { label: 'Evening', times: ['18:00', '19:00', '20:00'] },
];

const COMMON_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

interface ScheduleSelectorProps {
  schedule: Record<string, string[]>;
  setSchedule: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

function ScheduleSelector({ schedule, setSchedule }: ScheduleSelectorProps) {
  const [customTimeInput, setCustomTimeInput] = useState<Record<string, string>>({});
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleTimeSlot = (day: string, time: string) => {
    setSchedule(prev => {
      const daySlots = prev[day] || [];
      if (daySlots.includes(time)) {
        const newSlots = daySlots.filter(t => t !== time);
        if (newSlots.length === 0) {
          const { [day]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [day]: newSlots };
      } else {
        return { ...prev, [day]: [...daySlots, time].sort() };
      }
    });
  };

  const addPresetTimes = (day: string, times: string[]) => {
    setSchedule(prev => {
      const daySlots = prev[day] || [];
      const newSlots = [...new Set([...daySlots, ...times])].sort();
      return { ...prev, [day]: newSlots };
    });
  };

  const clearDaySlots = (day: string) => {
    setSchedule(prev => {
      const { [day]: _, ...rest } = prev;
      return rest;
    });
  };

  const addCustomTime = (day: string) => {
    const time = customTimeInput[day];
    if (time) {
      toggleTimeSlot(day, time);
      setCustomTimeInput(prev => ({ ...prev, [day]: '' }));
    }
  };

  const toggleDayExpanded = (day: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  const formatTime = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    const minute = time.split(':')[1];
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute} ${period}`;
  };

  const totalSlots = Object.values(schedule).flat().length;
  const activeDays = Object.keys(schedule).length;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            <span className="text-emerald-700 font-semibold">{totalSlots} slots</span>
          </div>
        </div>
        <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-blue-700 font-semibold">{activeDays} days active</span>
          </div>
        </div>
      </div>

      {/* Days Grid */}
      <div className="space-y-3">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = schedule[day] || [];
          const isActive = daySlots.length > 0;
          const isExpanded = expandedDays.has(day) || isActive;

          return (
            <div
              key={day}
              className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                isActive
                  ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/50 to-teal-50/50'
                  : 'border-gray-400 bg-gray-50/50 hover:border-gray-500'
              }`}
            >
              {/* Day Header */}
              <button
                type="button"
                onClick={() => toggleDayExpanded(day)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-colors ${
                      isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {day.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">{day}</h4>
                    <p className="text-xs text-gray-500">
                      {daySlots.length > 0
                        ? `${daySlots.length} time${daySlots.length > 1 ? 's' : ''} selected`
                        : 'Click to add availability'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && (
                    <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                      {daySlots.slice(0, 3).map(time => (
                        <span key={time} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                          {formatTime(time)}
                        </span>
                      ))}
                      {daySlots.length > 3 && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                          +{daySlots.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-400 pt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-2">
                    {TIME_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => addPresetTimes(day, preset.times)}
                        className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-400 rounded-lg text-gray-600 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm hover:shadow"
                      >
                        + {preset.label}
                      </button>
                    ))}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() => clearDaySlots(day)}
                        className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Time Slots Grid */}
                  <div className="flex flex-wrap gap-2">
                    {COMMON_TIMES.map(time => {
                      const isSelected = daySlots.includes(time);
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => toggleTimeSlot(day, time)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                            isSelected
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 scale-105'
                              : 'bg-white border border-gray-400 text-gray-600 hover:border-emerald-300 hover:text-emerald-600 shadow-sm'
                          }`}
                        >
                          {formatTime(time)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Time Input */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-400">
                    <span className="text-sm text-gray-500">Custom:</span>
                    <input
                      type="time"
                      value={customTimeInput[day] || ''}
                      onChange={(e) => setCustomTimeInput(prev => ({ ...prev, [day]: e.target.value }))}
                      className="px-3 py-1.5 border border-gray-400 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => addCustomTime(day)}
                      disabled={!customTimeInput[day]}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                    >
                      Add
                    </Button>
                  </div>

                  {/* Selected Times Summary */}
                  {daySlots.length > 0 && (
                    <div className="pt-2 border-t border-gray-400">
                      <p className="text-xs text-gray-500 mb-2">Selected times (click to remove):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {daySlots.sort().map(time => (
                          <button
                            key={time}
                            type="button"
                            onClick={() => toggleTimeSlot(day, time)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-700 transition-colors group"
                          >
                            {formatTime(time)}
                            <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function MentorProfileEditPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-yellow-50 via-white to-amber-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-yellow-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    }>
      <MentorProfileEdit />
    </Suspense>
  );
}

function MentorProfileEdit() {
  const { user, isLoading } = useRequireAuth('mentor');
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [pendingEmailUpdate, setPendingEmailUpdate] = useState(false);
  
  // Schedule state
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});

  const [formData, setFormData] = useState({
    mentor_name: '',
    mentor_email: '',
    mentor_photo: '',
    institution_photo: [] as string[],
    specialization: [] as string[],
    field_of_consultation: [] as string[],
    biography: '',
    experience: [] as string[],
    skills: [] as string[],
    achievement: [] as string[],
    linkedin: '',
    github: '',
    cv_link: ''
  });

  // CV upload state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [allowCVShare, setAllowCVShare] = useState(false);

  // Email change dialog states
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState<'input' | 'verify' | 'success'>('input');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [canResend, setCanResend] = useState(true);

  // Image cropper states
  const [profileCropperOpen, setProfileCropperOpen] = useState(false);
  const [institutionCropperOpen, setInstitutionCropperOpen] = useState(false);
  
  // Institution photo states
  const [newInstitutionUrl, setNewInstitutionUrl] = useState('');
  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [institutionSuggestions, setInstitutionSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  // Check for email update flow from URL params
  useEffect(() => {
    const emailUpdate = searchParams.get('emailUpdate');
    if (emailUpdate === 'pending') {
      setPendingEmailUpdate(true);
      setEmailDialogOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('emailUpdate');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // Fetch mentor profile from database
  useEffect(() => {
    const fetchMentorProfile = async () => {
      if (!user?.id) return;

      try {
        setIsLoadingProfile(true);
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/mentor/profile?mentorId=${user.id}&_t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch mentor profile');
        }

        const mentorData = await response.json();
        console.log('Fetched mentor data:', mentorData);

        setFormData({
          mentor_name: mentorData.mentor_name || '',
          mentor_email: mentorData.mentor_email || user.email || '',
          mentor_photo: mentorData.mentor_photo || '',
          institution_photo: mentorData.institution_photo || [],
          specialization: mentorData.specialization || [],
          field_of_consultation: mentorData.field_of_consultation || [],
          biography: mentorData.biography || '',
          experience: mentorData.experience || [],
          skills: mentorData.skills || [],
          achievement: mentorData.achievement || [],
          linkedin: mentorData.linkedin || '',
          github: mentorData.github || '',
          cv_link: mentorData.cv_link || ''
        });

        // Set allowCVShare from database
        setAllowCVShare(mentorData.allowCVShare ?? false);

        // Convert available_slots to schedule format
        if (mentorData.available_slots && Array.isArray(mentorData.available_slots)) {
          const scheduleData: Record<string, string[]> = {};
          mentorData.available_slots.forEach((slot: { day: string; time: string[] }) => {
            if (slot.day && slot.time) {
              scheduleData[slot.day] = slot.time;
            }
          });
          setSchedule(scheduleData);
        }
      } catch (error) {
        console.error('Error fetching mentor profile:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load profile data. Please try again.',
        });
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchMentorProfile();
  }, [user, toast]);

  // Fetch institution suggestions from all mentors
  useEffect(() => {
    const fetchInstitutionSuggestions = async () => {
      try {
        const response = await fetch('/api/mentors');
        if (response.ok) {
          const mentors = await response.json();
          const institutionSet = new Set<string>();
          mentors.forEach((mentor: any) => {
            if (mentor.institution_photo && Array.isArray(mentor.institution_photo)) {
              mentor.institution_photo.forEach((photo: any) => {
                const name = typeof photo === 'string' ? null : photo.name;
                if (name && name !== 'Institution') {
                  institutionSet.add(name);
                }
              });
            }
          });
          setInstitutionSuggestions(Array.from(institutionSet).sort());
        }
      } catch (error) {
        console.error('Error fetching institution suggestions:', error);
      }
    };

    fetchInstitutionSuggestions();
  }, []);

  // Convert schedule to API format
  const getAvailableSlotsForAPI = () => {
    return Object.entries(schedule)
      .filter(([_, times]) => times.length > 0)
      .map(([day, time]) => ({ day, time }));
  };

  const handleSendVerificationCode = async () => {
    if (!newEmailInput.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a new email address.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmailInput)) {
      toast({
        variant: 'destructive',
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
      });
      return;
    }

    if (newEmailInput.toLowerCase() === formData.mentor_email.toLowerCase()) {
      toast({
        variant: 'destructive',
        title: 'Same Email',
        description: 'New email must be different from your current email.',
      });
      return;
    }

    setIsSendingCode(true);

    try {
      const response = await fetch('/api/mentor/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentorId: user?.id,
          currentEmail: formData.mentor_email,
          newEmail: newEmailInput,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to send verification code');
      }

      toast({
        title: 'Code Sent! 📧',
        description: `A 6-digit verification code has been sent to ${newEmailInput}`,
      });

      setEmailChangeStep('verify');
      setCountdown(300);
      setCanResend(false);
    } catch (error) {
      console.error('Error sending verification code:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send verification code. Please try again.',
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      toast({
        variant: 'destructive',
        title: 'Invalid Code',
        description: 'Please enter the 6-digit verification code.',
      });
      return;
    }

    setIsVerifyingCode(true);

    try {
      const response = await fetch('/api/mentor/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentorId: user?.id,
          newEmail: newEmailInput,
          code: verificationCode.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to verify code');
      }

      setFormData(prev => ({ ...prev, mentor_email: newEmailInput }));

      toast({
        title: 'Email Updated! ✅',
        description: `Your email has been successfully changed to ${newEmailInput}`,
      });

      setEmailChangeStep('success');
      setTimeout(() => handleCancelEmailChange(), 2000);
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : 'Failed to verify code. Please try again.',
      });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleCancelEmailChange = () => {
    setEmailDialogOpen(false);
    setNewEmailInput('');
    setVerificationCode('');
    setEmailChangeStep('input');
    setCountdown(0);
    setCanResend(true);
  };

  const handleResendCode = () => {
    setVerificationCode('');
    handleSendVerificationCode();
  };

  const formatCountdownTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!formData.mentor_name || !formData.biography || formData.specialization.length === 0) {
      toast({
        variant: "destructive",
        title: "Missing Required Fields",
        description: "Please fill in your name, biography, and at least one specialization."
      });
      return;
    }

    const userId = user?.id;
    
    if (!userId) {
      toast({
        title: 'Error',
        description: 'User ID not found. Please log in again.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const availableSlots = getAvailableSlotsForAPI();
      console.log('Available slots to save:', availableSlots);
      console.log('Schedule state:', schedule);

      const payload = {
        id: userId,
        ...formData,
        available_slots: availableSlots,
        allowCVShare: allowCVShare,
      };

      console.log('Full payload being sent:', payload);

      const response = await fetch('/api/mentor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const result = await response.json();
      console.log('Server response:', result);

      toast({
        title: 'Profile Updated ✅',
        description: 'Your mentor profile has been successfully updated.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update profile. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cropped profile image
  const handleProfileImageCropped = (croppedImageUrl: string) => {
    setFormData(prev => ({ ...prev, mentor_photo: croppedImageUrl }));
  };

  // Handle cropped institution image
  const handleInstitutionImageCropped = (croppedImageUrl: string) => {
    // Add the cropped image with the name provided
    const name = newInstitutionName.trim();
    if (!name) {
      toast({
        variant: 'destructive',
        title: 'Missing Name',
        description: 'Please enter the institution name before cropping.'
      });
      return;
    }
    setFormData(prev => ({
      ...prev,
      institution_photo: [...prev.institution_photo, { url: croppedImageUrl, name }]
    }));
    // Clear the institution name after adding
    setNewInstitutionName('');
  };

  // Handle CV upload
  const handleCVUpload = async () => {
    if (!cvFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload.',
        variant: 'destructive'
      });
      return;
    }

    setIsUploadingCV(true);
    try {
      const formDataObj = new FormData();
      formDataObj.append('file', cvFile);
      formDataObj.append('folder', 'mentor');
      
      const uploadRes = await fetch('/api/uploadFirebase', {
        method: 'POST',
        body: formDataObj
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload CV');
      }

      const uploadData = await uploadRes.json();
      const cvPath = uploadData.path; // Will be "mentor/timestamp_filename.pdf"
      
      // Update form data with new CV path
      setFormData(prev => ({ ...prev, cv_link: cvPath }));
      
      // Update in database
      const userId = user?.id;
      const response = await fetch('/api/mentor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: userId, 
          cv_link: cvPath 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('CV save error response:', errorData);
        throw new Error(errorData.message || 'Failed to save CV to profile');
      }

      setCvFile(null);
      toast({
        title: 'CV Updated ✅',
        description: 'Your CV has been successfully uploaded.'
      });
    } catch (error) {
      console.error('Error uploading CV:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload CV. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsUploadingCV(false);
    }
  };

  if (isLoading || !user || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg">
            Edit Your Profile
          </div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-6"
          >

        {/* Avatar Section - Updated */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="mb-6 border-yellow-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="relative group">
                  <Avatar className="h-32 w-32 ring-4 ring-yellow-200 ring-offset-4 transition-all group-hover:ring-yellow-400 group-hover:scale-105">
                    <AvatarImage 
                      src={formData.mentor_photo?.startsWith('data:') 
                        ? formData.mentor_photo 
                        : getGoogleDriveImageUrl(formData.mentor_photo)} 
                      alt={formData.mentor_name || 'Mentor'}
                    />
                    <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-amber-500 text-white text-3xl font-bold">
                      {formData.mentor_name?.slice(0, 2).toUpperCase() || 'MN'}
                    </AvatarFallback>
                  </Avatar>
                  <Button 
                    size="icon" 
                    className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 shadow-lg"
                    onClick={() => setProfileCropperOpen(true)}
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    {formData.mentor_name || 'Mentor Name'}
                  </h2>
                  <p className="text-gray-600 mb-3">{formData.mentor_email}</p>
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                      <Star className="w-3 h-3 mr-1" />
                      Mentor
                    </Badge>
                    {formData.specialization.length > 0 && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                        <Target className="w-3 h-3 mr-1" />
                        {formData.specialization.length} Specialization{formData.specialization.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {formData.experience.length > 0 && (
                      <Badge className="bg-green-100 text-green-800 border-green-300">
                        <Briefcase className="w-3 h-3 mr-1" />
                        {formData.experience.length} Experience{formData.experience.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {Object.keys(schedule).length > 0 && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                        <Calendar className="w-3 h-3 mr-1" />
                        {Object.values(schedule).flat().length} Time Slots
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="border-yellow-200 shadow-lg">
            <CardContent className="p-6 md:p-8 space-y-8">
              {/* Basic Information */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                  <div className="p-2 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Basic Information</h3>
                    <p className="text-sm text-gray-600">Your personal details</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="mentor_name" className="text-sm font-semibold text-gray-700">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="mentor_name"
                      value={formData.mentor_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, mentor_name: e.target.value }))}
                      placeholder="Enter your full name"
                      className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                      required
                    />
                  </div>
                  
                  {/* Email Address with Verification */}
                  <div className="space-y-2">
                    <Label htmlFor="mentor_email" className="text-sm font-semibold text-gray-700">
                      Email Address
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="mentor_email"
                        value={formData.mentor_email}
                        disabled
                        className="bg-gray-50 border-gray-400 text-gray-500 flex-1"
                      />
                      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="whitespace-nowrap border-blue-300 text-blue-600 hover:bg-blue-50"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Change
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Shield className="h-5 w-5 text-blue-600" />
                              Change Email Address
                            </DialogTitle>
                            <DialogDescription>
                              {emailChangeStep === 'input' && 'Enter your new email address to receive a verification code'}
                              {emailChangeStep === 'verify' && 'Enter the 6-digit code sent to your new email'}
                              {emailChangeStep === 'success' && 'Email successfully updated!'}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <p className="text-sm text-gray-500 mb-1">Current Email</p>
                              <p className="font-medium text-gray-900">{formData.mentor_email}</p>
                            </div>

                            {emailChangeStep === 'input' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="new-email">New Email Address</Label>
                                  <Input
                                    id="new-email"
                                    type="email"
                                    placeholder="your.new.email@example.com"
                                    value={newEmailInput}
                                    onChange={(e) => setNewEmailInput(e.target.value)}
                                  />
                                </div>
                                <Alert>
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertDescription className="text-sm">
                                    A 6-digit verification code will be sent to this email address.
                                  </AlertDescription>
                                </Alert>
                              </>
                            )}

                            {emailChangeStep === 'verify' && (
                              <>
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <p className="text-sm text-blue-600 mb-1">New Email</p>
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                                    <p className="font-medium text-gray-900">{newEmailInput}</p>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="verification-code">Verification Code</Label>
                                  <Input
                                    id="verification-code"
                                    type="text"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    className="text-center text-2xl font-mono tracking-widest"
                                  />
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-orange-500" />
                                    <span className={`font-medium ${countdown < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                                      {formatCountdownTime(countdown)}
                                    </span>
                                  </div>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    onClick={handleResendCode}
                                    disabled={!canResend || isSendingCode}
                                    className="text-blue-600 h-auto p-0"
                                  >
                                    {isSendingCode ? 'Sending...' : 'Resend Code'}
                                  </Button>
                                </div>
                              </>
                            )}

                            {emailChangeStep === 'success' && (
                              <div className="text-center py-6">
                                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                  Email Updated Successfully!
                                </h3>
                                <p className="text-sm text-gray-600">
                                  Your email has been changed to
                                </p>
                                <p className="text-sm font-medium text-blue-600 mt-1">
                                  {newEmailInput}
                                </p>
                              </div>
                            )}
                          </div>

                          <DialogFooter className="flex gap-2 sm:gap-0">
                            {emailChangeStep === 'input' && (
                              <>
                                <Button variant="outline" onClick={handleCancelEmailChange} disabled={isSendingCode}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleSendVerificationCode}
                                  disabled={isSendingCode || !newEmailInput.trim()}
                                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                                >
                                  {isSendingCode ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                                  ) : (
                                    <><Mail className="h-4 w-4 mr-2" />Send Code</>
                                  )}
                                </Button>
                              </>
                            )}
                            {emailChangeStep === 'verify' && (
                              <>
                                <Button variant="outline" onClick={handleCancelEmailChange} disabled={isVerifyingCode}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleVerifyCode}
                                  disabled={isVerifyingCode || verificationCode.length !== 6}
                                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                                >
                                  {isVerifyingCode ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
                                  ) : (
                                    <><CheckCircle2 className="h-4 w-4 mr-2" />Verify</>
                                  )}
                                </Button>
                              </>
                            )}
                            {emailChangeStep === 'success' && (
                              <Button onClick={handleCancelEmailChange} className="w-full bg-green-600 hover:bg-green-700">
                                Done
                              </Button>
                            )}
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <p className="text-xs text-gray-500">Email changes require verification</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="linkedin" className="text-sm font-semibold text-gray-700">
                      LinkedIn Profile
                    </Label>
                    <Input
                      id="linkedin"
                      value={formData.linkedin}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                      placeholder="https://linkedin.com/in/yourprofile"
                      className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                    />
                    <p className="text-xs text-gray-500">Your LinkedIn profile URL</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="github" className="text-sm font-semibold text-gray-700">
                      GitHub Profile
                    </Label>
                    <Input
                      id="github"
                      value={formData.github}
                      onChange={(e) => setFormData(prev => ({ ...prev, github: e.target.value }))}
                      placeholder="https://github.com/yourusername"
                      className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                    />
                    <p className="text-xs text-gray-500">Your GitHub profile URL</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mentor_photo" className="text-sm font-semibold text-gray-700">
                    Profile Photo
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="mentor_photo"
                      value={formData.mentor_photo?.startsWith('data:') ? '(Cropped Image)' : formData.mentor_photo}
                      onChange={(e) => setFormData(prev => ({ ...prev, mentor_photo: e.target.value }))}
                      placeholder="https://example.com/your-photo.jpg"
                      className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20 flex-1"
                      disabled={formData.mentor_photo?.startsWith('data:')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setProfileCropperOpen(true)}
                      className="whitespace-nowrap border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                    >
                      <CropIcon className="h-4 w-4 mr-2" />
                      Crop Image
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Paste a URL or click "Crop Image" to upload and crop your photo
                  </p>
                </div>

                {/* CV/Resume Section */}
                {formData.cv_link && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-900">CV/Resume Uploaded</p>
                        <p className="text-xs text-green-700">Click to view your current CV</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-green-300 hover:bg-green-100"
                        onClick={() => {
                          const cvUrl = formData.cv_link!.startsWith('http') 
                            ? formData.cv_link 
                            : `/api/attachment-proxy?url=${encodeURIComponent(formData.cv_link!)}`;
                          window.open(cvUrl, '_blank');
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View CV
                      </Button>
                    </div>
                  </div>
                )}

                {/* CV Upload Section */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">Update CV/Resume</Label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                      className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                      disabled={isUploadingCV}
                    />
                    <Button
                      type="button"
                      onClick={handleCVUpload}
                      disabled={!cvFile || isUploadingCV}
                      className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                    >
                      {isUploadingCV ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" />
                          Upload
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">Upload a PDF file (recommended: max 5MB)</p>
                </div>

                {/* CV Sharing Consent Checkbox */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox 
                      id="allow-cv-share-mentor"
                      checked={allowCVShare}
                      onCheckedChange={(checked) => setAllowCVShare(checked as boolean)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label 
                        htmlFor="allow-cv-share-mentor"
                        className="text-sm font-medium text-amber-900 cursor-pointer"
                      >
                        Allow mentor to view my CV
                      </label>
                      <p className="text-xs text-amber-700 mt-1">
                        Sharing your CV with mentors increases the likelihood of receiving and accepting meeting requests.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Institution Photos - Updated */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Institution Photos
                    <span className="ml-2 text-xs text-gray-500 font-normal">(Drag to reorder • First 3 shown on profile)</span>
                  </Label>
                  <div className="space-y-4">
                    {/* Display existing institution photos with drag-drop */}
                    {formData.institution_photo.length > 0 && (
                      <div className="space-y-2">
                        {formData.institution_photo.map((photo, index) => {
                          const photoObj = typeof photo === 'string' ? { url: photo, name: 'Institution' } : photo;
                          const isTopFive = index < 3;
                          return (
                            <div
                              key={index}
                              draggable
                              onDragStart={() => setDraggedIndex(index)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggedIndex === null || draggedIndex === index) return;
                                const newPhotos = [...formData.institution_photo];
                                const [draggedItem] = newPhotos.splice(draggedIndex, 1);
                                newPhotos.splice(index, 0, draggedItem);
                                setFormData(prev => ({ ...prev, institution_photo: newPhotos }));
                                setDraggedIndex(null);
                              }}
                              onDragEnd={() => setDraggedIndex(null)}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-move ${
                                draggedIndex === index ? 'opacity-50 border-yellow-400' : 'border-gray-300 hover:border-yellow-400'
                              } ${isTopFive ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 'bg-gray-50'}`}
                            >
                              <GripVertical className="h-5 w-5 text-gray-400 flex-shrink-0" />
                              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-white flex items-center justify-center p-2 flex-shrink-0">
                                <img
                                  src={photoObj.url.startsWith('data:') ? photoObj.url : getGoogleDriveImageUrl(photoObj.url)}
                                  alt={photoObj.name}
                                  className="max-h-full max-w-full object-contain"
                                  onError={(e) => {
                                    e.currentTarget.src = 'https://placehold.co/64x64?text=Logo';
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-gray-900 truncate">{photoObj.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {isTopFive ? (
                                    <span className="text-green-600 font-medium">✓ Displayed on profile (Position {index + 1})</span>
                                  ) : (
                                    <span className="text-gray-500">Hidden (Position {index + 1})</span>
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newPhotos = formData.institution_photo.filter((_, i) => i !== index);
                                  setFormData(prev => ({ ...prev, institution_photo: newPhotos }));
                                }}
                                className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new institution photo */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Building2 className="h-4 w-4" />
                        <span>Add New Institution</span>
                      </div>
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            id="institution_name_input"
                            type="text"
                            placeholder="Institution name (e.g., MIT, Stanford, Google)"
                            value={newInstitutionName}
                            onChange={(e) => {
                              setNewInstitutionName(e.target.value);
                              setShowSuggestions(e.target.value.length > 0);
                            }}
                            onFocus={() => setShowSuggestions(newInstitutionName.length > 0)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20"
                          />
                          {showSuggestions && institutionSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {institutionSuggestions
                                .filter(suggestion => 
                                  suggestion.toLowerCase().includes(newInstitutionName.toLowerCase())
                                )
                                .slice(0, 10)
                                .map((suggestion, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      setNewInstitutionName(suggestion);
                                      setShowSuggestions(false);
                                    }}
                                    className="px-3 py-2 hover:bg-yellow-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                                  >
                                    {suggestion}
                                  </div>
                                ))}
                              {institutionSuggestions.filter(suggestion => 
                                suggestion.toLowerCase().includes(newInstitutionName.toLowerCase())
                              ).length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-500 italic">
                                  No matching institutions found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            id="institution_photo_input"
                            type="text"
                            placeholder="https://example.com/logo.jpg or Google Drive link"
                            value={newInstitutionUrl}
                            onChange={(e) => setNewInstitutionUrl(e.target.value)}
                            className="border-gray-400 focus:border-yellow-400 focus:ring-yellow-400/20 flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const url = newInstitutionUrl.trim();
                                const name = newInstitutionName.trim();
                                if (url && name) {
                                  setFormData(prev => ({
                                    ...prev,
                                    institution_photo: [...prev.institution_photo, { url, name }]
                                  }));
                                  setNewInstitutionUrl('');
                                  setNewInstitutionName('');
                                }
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const url = newInstitutionUrl.trim();
                              const name = newInstitutionName.trim();
                              if (url && name) {
                                setFormData(prev => ({
                                  ...prev,
                                  institution_photo: [...prev.institution_photo, { url, name }]
                                }));
                                setNewInstitutionUrl('');
                                setNewInstitutionName('');
                              } else {
                                toast({
                                  variant: 'destructive',
                                  title: 'Missing Information',
                                  description: 'Please provide both institution name and photo URL.'
                                });
                              }
                            }}
                            className="whitespace-nowrap border-gray-400 text-gray-600 hover:bg-gray-100"
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!newInstitutionName.trim()) {
                                toast({
                                  variant: 'destructive',
                                  title: 'Missing Name',
                                  description: 'Please enter the institution name first.'
                                });
                                return;
                              }
                              setInstitutionCropperOpen(true);
                            }}
                            className="whitespace-nowrap border-amber-300 text-amber-600 hover:bg-amber-50"
                          >
                            <CropIcon className="h-4 w-4 mr-1" />
                            Crop & Add
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        💡 Enter name first, then add URL or crop an image • First 3 photos will be displayed on your profile
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Biography */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                  <div className="p-2 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">About You</h3>
                    <p className="text-sm text-gray-600">Tell your story and what makes you unique</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biography" className="text-sm font-semibold text-gray-700">
                    Biography <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="biography"
                    value={formData.biography}
                    onChange={(e) => setFormData(prev => ({ ...prev, biography: e.target.value }))}
                    placeholder="Tell mentees about yourself, your background, and what you can help them with..."
                    rows={6}
                    className="border-gray-400 focus:border-blue-400 focus:ring-blue-400/20 resize-none"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    {formData.biography.length} characters • Make it engaging and informative
                  </p>
                </div>
              </div>

              {/* Expertise - Now with TagInput */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                  <div className="p-2 bg-gradient-to-br from-purple-400 to-purple-600 rounded-lg">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Expertise</h3>
                    <p className="text-sm text-gray-600">Share your areas of knowledge and specialization</p>
                  </div>
                </div>

                {/* Specializations */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Specializations <span className="text-red-500">*</span>
                  </Label>
                  <TagInput
                    tags={formData.specialization}
                    setTags={(tags) => setFormData(prev => ({ ...prev, specialization: tags }))}
                    placeholder="Type a specialization (e.g., Web Development, Data Science)"
                    accentColor="purple"
                  />
                </div>

                {/* Fields of Consultation */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Fields of Consultation
                  </Label>
                  <TagInput
                    tags={formData.field_of_consultation}
                    setTags={(tags) => setFormData(prev => ({ ...prev, field_of_consultation: tags }))}
                    placeholder="Type a field (e.g., Career Planning, Technical Skills)"
                    accentColor="indigo"
                  />
                </div>

                {/* Skills */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Skills
                  </Label>
                  <TagInput
                    tags={formData.skills}
                    setTags={(tags) => setFormData(prev => ({ ...prev, skills: tags }))}
                    placeholder="Type a skill (e.g., JavaScript, Leadership, Communication)"
                    accentColor="teal"
                  />
                </div>
              </div>

              {/* Professional Background */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                  <div className="p-2 bg-gradient-to-br from-green-400 to-green-600 rounded-lg">
                    <Briefcase className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Professional Background</h3>
                    <p className="text-sm text-gray-600">Your journey and accomplishments</p>
                  </div>
                </div>
                
                {/* Experience */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Experience
                  </Label>
                  <TagInput
                    tags={formData.experience}
                    setTags={(tags) => setFormData(prev => ({ ...prev, experience: tags }))}
                    placeholder="Type an experience (e.g., 5 years as Senior Developer at Tech Co)"
                    accentColor="green"
                  />
                </div>

                {/* Achievements */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">
                    Achievements
                  </Label>
                  <TagInput
                    tags={formData.achievement}
                    setTags={(tags) => setFormData(prev => ({ ...prev, achievement: tags }))}
                    placeholder="Type an achievement (e.g., Published author, Award winner)"
                    accentColor="amber"
                  />
                </div>
              </div>

              {/* Availability Schedule - NEW SECTION */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                  <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg">
                    <Calendar className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-900">Availability Schedule</h3>
                    <p className="text-sm text-gray-600">Set your available time slots for mentoring sessions</p>
                  </div>
                </div>

                <ScheduleSelector schedule={schedule} setSchedule={setSchedule} />
              </div>

              {/* Save Button */}
              <div className="pt-6 border-t border-yellow-100">
                <Button 
                  onClick={handleSave} 
                  size="lg" 
                  className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all text-lg py-6"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving Your Profile...
                    </>
                  ) : (
                    <>
                      <Award className="mr-2 h-5 w-5" />
                      Save Changes
                    </>
                  )}
                </Button>
                <p className="text-center text-sm text-gray-500 mt-3">
                  Your changes will be visible to mentees immediately
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <ImageCropper
          open={profileCropperOpen}
          onOpenChange={setProfileCropperOpen}
          onCropComplete={handleProfileImageCropped}
          aspectRatio={1}
          circularCrop={true}
          title="Crop Profile Photo"
          description="Adjust your profile photo to fit perfectly in a circle"
        />

        <ImageCropper
          open={institutionCropperOpen}
          onOpenChange={setInstitutionCropperOpen}
          onCropComplete={handleInstitutionImageCropped}
          aspectRatio={16 / 9}
          circularCrop={false}
          title="Crop Institution Logo"
          description="Adjust the institution logo for best display"
        />
          </motion.div>
        </div>
      </div>
    </div>
  );
}