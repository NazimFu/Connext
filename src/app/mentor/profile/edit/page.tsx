'use client';

// src/app/mentor/profile/edit/page.tsx

import React, { useState, useEffect, useRef, KeyboardEvent, Suspense } from 'react';
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
import { TimezoneSelector } from "@/components/ui/timezone-selector";
import {
  DEFAULT_TIMEZONE,
  MY_TZ,
  localTimeToMY,
  myTimeToLocal,
  TIMEZONE_OPTIONS,
  type TimezoneOption,
} from '@/lib/timezone';

const ALLOWED_CV_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_CV_EXTENSIONS = ['.pdf', '.docx'];
const MAX_CV_SIZE_BYTES = 2 * 1024 * 1024;

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
    purple: { badge: 'bg-gradient-to-r from-purple-500 to-purple-600', container: 'bg-purple-50 border-purple-100', focus: 'focus-within:border-purple-400 focus-within:ring-purple-400/20' },
    indigo: { badge: 'bg-gradient-to-r from-indigo-500 to-indigo-600', container: 'bg-indigo-50 border-indigo-100', focus: 'focus-within:border-indigo-400 focus-within:ring-indigo-400/20' },
    teal:   { badge: 'bg-gradient-to-r from-teal-500 to-teal-600',   container: 'bg-teal-50 border-teal-100',   focus: 'focus-within:border-teal-400 focus-within:ring-teal-400/20' },
    green:  { badge: 'bg-gradient-to-r from-green-500 to-green-600',  container: 'bg-green-50 border-green-100',  focus: 'focus-within:border-green-400 focus-within:ring-green-400/20' },
    amber:  { badge: 'bg-gradient-to-r from-amber-500 to-amber-600',  container: 'bg-amber-50 border-amber-100',  focus: 'focus-within:border-amber-400 focus-within:ring-amber-400/20' },
    blue:   { badge: 'bg-gradient-to-r from-blue-500 to-blue-600',    container: 'bg-blue-50 border-blue-100',    focus: 'focus-within:border-blue-400 focus-within:ring-blue-400/20' },
  };
  const colors = colorClasses[accentColor];

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) setTags([...tags, inputValue.trim()]);
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap gap-2 p-3 min-h-[52px] rounded-lg border ${colors.container} ${colors.focus} transition-all focus-within:ring-2`}>
        {tags.map((tag, index) => (
          <Badge key={index} className={`${colors.badge} text-white pl-3 pr-2 py-1.5`}>
            {tag}
            <button type="button" onClick={() => setTags(tags.filter((_, i) => i !== index))} className="ml-2 hover:bg-white/20 rounded-full p-0.5">
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
        Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono">Enter</kbd> or
        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono">,</kbd> to add •
        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono">Backspace</kbd> to remove last
      </p>
    </div>
  );
}

// ============================================
// SCHEDULE/AVAILABILITY COMPONENT
// ============================================
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_PRESETS = [
  { label: 'Morning',   times: ['09:00', '10:00', '11:00'] },
  { label: 'Afternoon', times: ['13:00', '14:00', '15:00', '16:00'] },
  { label: 'Evening',   times: ['18:00', '19:00', '20:00'] },
];
const COMMON_TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

interface ScheduleSelectorProps {
  schedule: Record<string, string[]>;
  setSchedule: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  /** The timezone label to show next to the section heading */
  timezoneLabel: string;
}

function ScheduleSelector({ schedule, setSchedule, timezoneLabel }: ScheduleSelectorProps) {
  const [customTimeInput, setCustomTimeInput] = useState<Record<string, string>>({});
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleTimeSlot = (day: string, time: string) => {
    setSchedule(prev => {
      const slots = prev[day] || [];
      const next = slots.includes(time) ? slots.filter(t => t !== time) : [...slots, time].sort();
      if (next.length === 0) { const { [day]: _, ...rest } = prev; return rest; }
      return { ...prev, [day]: next };
    });
  };

  const addPresetTimes = (day: string, times: string[]) => {
    setSchedule(prev => ({ ...prev, [day]: [...new Set([...(prev[day] || []), ...times])].sort() }));
  };

  const clearDaySlots = (day: string) => {
    setSchedule(prev => { const { [day]: _, ...rest } = prev; return rest; });
  };

  const toggleDayExpanded = (day: string) => {
    setExpandedDays(prev => {
      const s = new Set(prev);
      s.has(day) ? s.delete(day) : s.add(day);
      return s;
    });
  };

  const formatTime = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    const minute = time.split(':')[1];
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute} ${period}`;
  };

  return (
    <div className="space-y-4">
      {/* Timezone badge — makes it clear what timezone times are shown in */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Times shown in:</span>
        <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs font-semibold">
          🌐 {timezoneLabel}
        </span>
      </div>

      {/* Summary Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200 flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-600" />
          <span className="text-emerald-700 font-semibold">{Object.values(schedule).flat().length} slots</span>
        </div>
        <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-600" />
          <span className="text-blue-700 font-semibold">{Object.keys(schedule).length} days active</span>
        </div>
      </div>

      {/* Days Grid */}
      <div className="space-y-3">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = schedule[day] || [];
          const isActive = daySlots.length > 0;
          const isExpanded = expandedDays.has(day) || isActive;

          return (
            <div key={day} className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${isActive ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/50 to-teal-50/50' : 'border-neutral-200 bg-gray-50/50 hover:border-gray-500'}`}>
              <button type="button" onClick={() => toggleDayExpanded(day)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${isActive ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-200 text-gray-500'}`}>
                    {day.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">{day}</h4>
                    <p className="text-xs text-gray-500">{daySlots.length > 0 ? `${daySlots.length} time${daySlots.length > 1 ? 's' : ''} selected` : 'Click to add availability'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && (
                    <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                      {daySlots.slice(0, 3).map(t => (
                        <span key={t} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{formatTime(t)}</span>
                      ))}
                      {daySlots.length > 3 && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">+{daySlots.length - 3}</span>}
                    </div>
                  )}
                  <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-neutral-200 pt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {TIME_PRESETS.map(preset => (
                      <button key={preset.label} type="button" onClick={() => addPresetTimes(day, preset.times)}
                        className="px-3 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-lg text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm">
                        + {preset.label}
                      </button>
                    ))}
                    {isActive && (
                      <button type="button" onClick={() => clearDaySlots(day)}
                        className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg">
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {COMMON_TIMES.map(time => {
                      const isSelected = daySlots.includes(time);
                      return (
                        <button key={time} type="button" onClick={() => toggleTimeSlot(day, time)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isSelected ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg scale-105' : 'bg-white border border-neutral-200 text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 shadow-sm'}`}>
                          {formatTime(time)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                    <span className="text-sm text-gray-500">Custom:</span>
                    <input type="time" value={customTimeInput[day] || ''}
                      onChange={(e) => setCustomTimeInput(prev => ({ ...prev, [day]: e.target.value }))}
                      className="px-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                    <Button type="button" size="sm" disabled={!customTimeInput[day]}
                      onClick={() => { if (customTimeInput[day]) { toggleTimeSlot(day, customTimeInput[day]); setCustomTimeInput(prev => ({ ...prev, [day]: '' })); } }}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
                      Add
                    </Button>
                  </div>

                  {daySlots.length > 0 && (
                    <div className="pt-2 border-t border-neutral-200">
                      <p className="text-xs text-gray-500 mb-2">Selected times (click to remove):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...daySlots].sort().map(time => (
                          <button key={time} type="button" onClick={() => toggleTimeSlot(day, time)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-700 transition-colors group">
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
      <div className="flex justify-center items-center h-screen bg-yellow-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-yellow-600 mx-auto mb-4" />
          <p className="text-neutral-500 font-medium">Loading your profile...</p>
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

  // ── Schedule state: always stored as HH:mm in the CURRENTLY SELECTED timezone ──
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});

  // ── storedMyTimes: the raw Malaysia-time slots from the DB.
  //    We keep this as the canonical source so re-conversion on TZ change is pure
  //    frontend math — no extra API call needed. ──────────────────────────────────
  const storedMyTimesRef = useRef<Array<{ day: string; time: string[] }>>([]);

  const [formData, setFormData] = useState({
    mentor_name: '',
    mentor_email: '',
    mentor_photo: '',
    institution_photo: [] as any[],
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

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [allowCVShare, setAllowCVShare] = useState(false);

  // ── timezone: the currently selected display timezone ───────────────────────
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  // Email change states
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
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  // ── Email URL param check ────────────────────────────────────────────────────
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

  // ── Fetch mentor profile ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchMentorProfile = async () => {
      if (!user?.id) return;
      try {
        setIsLoadingProfile(true);
        const res = await fetch(`/api/mentor/profile?mentorId=${user.id}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        });
        if (!res.ok) throw new Error('Failed to fetch mentor profile');

        const mentorData = await res.json();

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
          cv_link: mentorData.cv_link || '',
        });
        setAllowCVShare(mentorData.allowCVShare ?? false);

        const savedTz = mentorData.timezone || DEFAULT_TIMEZONE;
        setTimezone(savedTz);

        // ── Store the raw MY-time slots as canonical source ──────────────────
        if (mentorData.available_slots && Array.isArray(mentorData.available_slots)) {
          storedMyTimesRef.current = mentorData.available_slots;

          // Convert MY times → mentor's saved display timezone
          const scheduleData: Record<string, string[]> = {};
          mentorData.available_slots.forEach((slot: { day: string; time: string[] }) => {
            if (slot.day && Array.isArray(slot.time)) {
              scheduleData[slot.day] = slot.time
                .map((t: string) => myTimeToLocal(t, savedTz))
                .filter((t): t is string => t !== null)
                .sort();
            }
          });
          setSchedule(scheduleData);
        }
      } catch (err) {
        console.error('Error fetching mentor profile:', err);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load profile data.' });
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchMentorProfile();
  }, [user, toast]);

  // ── Institution suggestions ─────────────────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/mentors');
        if (!res.ok) return;
        const mentors = await res.json();
        const s = new Set<string>();
        mentors.forEach((m: any) => {
          if (Array.isArray(m.institution_photo)) {
            m.institution_photo.forEach((p: any) => {
              const name = typeof p === 'string' ? null : p.name;
              if (name && name !== 'Institution') s.add(name);
            });
          }
        });
        setInstitutionSuggestions(Array.from(s).sort());
      } catch {}
    };
    fetch_();
  }, []);

  // ── KEY FIX: Re-convert schedule when timezone changes ──────────────────────
  // We always convert from the stored MY-time (storedMyTimesRef) → new timezone.
  // This is pure frontend math — no API call — and avoids the stale-closure bug
  // where the previous code tried to convert from the old local timezone.
  useEffect(() => {
    if (storedMyTimesRef.current.length === 0) return; // nothing loaded yet

    const newSchedule: Record<string, string[]> = {};
    storedMyTimesRef.current.forEach(({ day, time }) => {
      if (day && Array.isArray(time)) {
        const converted = time
          .map(t => myTimeToLocal(t, timezone))
          .filter((t): t is string => t !== null)
          .sort();
        if (converted.length > 0) newSchedule[day] = converted;
      }
    });
    setSchedule(newSchedule);
  }, [timezone]); // runs every time the mentor picks a new timezone

  // ── Broadcast timezone change to the whole app ──────────────────────────────
  // Any component listening for 'timezone-changed' can re-render its times
  // without a full page reload.
  const broadcastTimezoneChange = (newTz: string) => {
    // 1. Persist in localStorage so other tabs / reloads pick it up instantly
    try { localStorage.setItem('userTimezone', newTz); } catch {}

    // 2. Dispatch a custom DOM event for same-tab listeners
    window.dispatchEvent(new CustomEvent('timezone-changed', { detail: { timezone: newTz } }));

    // 3. Soft-refresh: router.refresh() tells Next.js to re-fetch Server Components
    //    without unmounting the current page's client state.
    router.refresh();
  };

  const handleTimezoneChange = (newTz: string) => {
    setTimezone(newTz);
    broadcastTimezoneChange(newTz);

    const tzOpt = TIMEZONE_OPTIONS.find(o => o.value === newTz);
    const label = tzOpt ? `${tzOpt.label} (${tzOpt.offset})` : newTz;
    toast({
      title: '🌐 Timezone Updated',
      description: `Availability times are now shown in ${label}`,
    });
  };

  // ── When the mentor edits a time slot manually, keep storedMyTimesRef in sync ─
  // This means: convert the new display-timezone times back to MY time and store them.
  const handleScheduleChange: React.Dispatch<React.SetStateAction<Record<string, string[]>>> = (action) => {
    setSchedule(prev => {
      const next = typeof action === 'function' ? action(prev) : action;

      // Re-compute the canonical MY-time store from the new local-tz schedule
      storedMyTimesRef.current = Object.entries(next)
        .filter(([, times]) => times.length > 0)
        .map(([day, localTimes]) => ({
          day,
          time: localTimes
            .map(t => localTimeToMY(t, timezone))
            .filter((t): t is string => t !== null)
            .sort(),
        }));

      return next;
    });
  };

  // ── Save profile ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.mentor_name || !formData.biography || formData.specialization.length === 0) {
      toast({ variant: 'destructive', title: 'Missing Required Fields', description: 'Please fill in your name, biography, and at least one specialization.' });
      return;
    }
    if (!user?.id) {
      toast({ title: 'Error', description: 'User ID not found. Please log in again.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // Use the canonical MY-time store — no conversion needed here
      const availableSlots = storedMyTimesRef.current.filter(s => s.time.length > 0);

      const payload = {
        id: user.id,
        ...formData,
        available_slots: availableSlots,
        allowCVShare,
        timezone,
      };

      const res = await fetch('/api/mentor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update profile');
      }

      toast({ title: 'Profile Updated ✅', description: 'Your mentor profile has been successfully updated.' });

      // Broadcast so any other open page refreshes its displayed times
      broadcastTimezoneChange(timezone);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to update profile.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Email verification handlers ──────────────────────────────────────────────
  const handleSendVerificationCode = async () => {
    if (!newEmailInput.trim()) { toast({ variant: 'destructive', title: 'Error', description: 'Please enter a new email address.' }); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmailInput)) { toast({ variant: 'destructive', title: 'Invalid Email', description: 'Please enter a valid email address.' }); return; }
    if (newEmailInput.toLowerCase() === formData.mentor_email.toLowerCase()) { toast({ variant: 'destructive', title: 'Same Email', description: 'New email must be different from your current email.' }); return; }
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/mentor/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: user?.id, currentEmail: formData.mentor_email, newEmail: newEmailInput }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to send verification code');
      toast({ title: 'Code Sent! 📧', description: `A 6-digit code was sent to ${newEmailInput}` });
      setEmailChangeStep('verify');
      setCountdown(300);
      setCanResend(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to send code.' });
    } finally { setIsSendingCode(false); }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) { toast({ variant: 'destructive', title: 'Invalid Code', description: 'Please enter the 6-digit code.' }); return; }
    setIsVerifyingCode(true);
    try {
      const res = await fetch('/api/mentor/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: user?.id, newEmail: newEmailInput, code: verificationCode.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to verify code');
      setFormData(prev => ({ ...prev, mentor_email: newEmailInput }));
      toast({ title: 'Email Updated! ✅', description: `Your email has been changed to ${newEmailInput}` });
      setEmailChangeStep('success');
      setTimeout(() => handleCancelEmailChange(), 2000);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Verification Failed', description: err instanceof Error ? err.message : 'Failed to verify code.' });
    } finally { setIsVerifyingCode(false); }
  };

  const handleCancelEmailChange = () => {
    setEmailDialogOpen(false); setNewEmailInput(''); setVerificationCode('');
    setEmailChangeStep('input'); setCountdown(0); setCanResend(true);
  };

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Image handlers ───────────────────────────────────────────────────────────
  const handleProfileImageCropped = (url: string) => setFormData(prev => ({ ...prev, mentor_photo: url }));
  const handleInstitutionImageCropped = (url: string) => {
    const name = newInstitutionName.trim();
    if (!name) { toast({ variant: 'destructive', title: 'Missing Name', description: 'Enter institution name before cropping.' }); return; }
    setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] }));
    setNewInstitutionName('');
  };

  const validateCvFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_CV_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasAllowedMimeType = ALLOWED_CV_MIME_TYPES.includes(file.type);

    if (!hasAllowedExtension && !hasAllowedMimeType) {
      return 'Only PDF or DOCX files are allowed.';
    }

    if (file.size > MAX_CV_SIZE_BYTES) {
      return 'CV file must be 2MB or smaller.';
    }

    return null;
  };

  const handleCVUpload = async () => {
    if (!cvFile) { toast({ title: 'Error', description: 'Please select a file.', variant: 'destructive' }); return; }

    const cvValidationError = validateCvFile(cvFile);
    if (cvValidationError) {
      toast({ title: 'Error', description: cvValidationError, variant: 'destructive' });
      return;
    }

    setIsUploadingCV(true);
    try {
      const fd = new FormData();
      fd.append('file', cvFile);
      fd.append('folder', 'mentor');
      const upRes = await fetch('/api/uploadFirebase', { method: 'POST', body: fd });
      const uploadData = await upRes.json();
      if (!upRes.ok) throw new Error(uploadData.error || 'Failed to upload CV');
      const { path: cvPath } = uploadData;
      setFormData(prev => ({ ...prev, cv_link: cvPath }));
      const saveRes = await fetch('/api/mentor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user?.id, cv_link: cvPath }),
      });
      if (!saveRes.ok) throw new Error('Failed to save CV to profile');
      setCvFile(null);
      toast({ title: 'CV Updated ✅', description: 'Your CV has been successfully uploaded.' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to upload CV.', variant: 'destructive' });
    } finally { setIsUploadingCV(false); }
  };

  // ── Current timezone label for display ──────────────────────────────────────
  const currentTzOption = TIMEZONE_OPTIONS.find(o => o.value === timezone);
  const timezoneLabel = currentTzOption
    ? `${currentTzOption.label} (${currentTzOption.offset})`
    : timezone;

  if (isLoading || !user || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-screen bg-neutral-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-neutral-500 mx-auto mb-4" />
          <p className="text-neutral-500 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 font-semibold text-lg">Edit Your Profile</div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="p-6">

            {/* Avatar Section */}
            <Card className="mb-6 border border-neutral-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="relative group">
                    <Avatar className="h-32 w-32 ring-2 ring-neutral-200 ring-offset-2 transition-all group-hover:ring-yellow-400 group-hover:scale-105">
                      <AvatarImage src={formData.mentor_photo?.startsWith('data:') ? formData.mentor_photo : getGoogleDriveImageUrl(formData.mentor_photo)} alt={formData.mentor_name || 'Mentor'} />
                      <AvatarFallback className="bg-yellow-100 text-yellow-600 text-3xl font-bold">{formData.mentor_name?.slice(0, 2).toUpperCase() || 'MN'}</AvatarFallback>
                    </Avatar>
                    <Button size="icon" className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-yellow-500 hover:bg-yellow-600 shadow-lg" onClick={() => setProfileCropperOpen(true)}>
                      <Camera className="h-5 w-5" />
                    </Button>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">{formData.mentor_name || 'Mentor Name'}</h2>
                    <p className="text-neutral-500 mb-3">{formData.mentor_email}</p>
                    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                      <Badge className="bg-neutral-100 text-neutral-700 border-neutral-200"><Star className="w-3 h-3 mr-1" />Mentor</Badge>
                      {formData.specialization.length > 0 && <Badge className="bg-neutral-100 text-neutral-700 border-neutral-200"><Target className="w-3 h-3 mr-1" />{formData.specialization.length} Specialization{formData.specialization.length > 1 ? 's' : ''}</Badge>}
                      {Object.keys(schedule).length > 0 && <Badge className="bg-neutral-100 text-neutral-700 border-neutral-200"><Calendar className="w-3 h-3 mr-1" />{Object.values(schedule).flat().length} Time Slots</Badge>}
                      {/* Live timezone badge */}
                      <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">
                        🌐 {currentTzOption?.offset ?? timezone}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Main Form */}
            <Card className="border border-neutral-200 shadow-sm">
              <CardContent className="p-6 md:p-8 space-y-8">

                {/* Basic Information */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg"><User className="h-5 w-5 text-yellow-600" /></div>
                    <div><h3 className="text-lg font-semibold text-neutral-900">Basic Information</h3><p className="text-sm text-neutral-500">Your personal details</p></div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="mentor_name" className="text-sm font-semibold text-gray-700">Full Name <span className="text-red-500">*</span></Label>
                      <Input id="mentor_name" value={formData.mentor_name} onChange={(e) => setFormData(prev => ({ ...prev, mentor_name: e.target.value }))} placeholder="Enter your full name" className="border-neutral-200 focus:border-yellow-400" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mentor_email" className="text-sm font-semibold text-gray-700">Email Address</Label>
                      <div className="flex gap-2">
                        <Input id="mentor_email" value={formData.mentor_email} disabled className="bg-gray-50 border-neutral-200 text-gray-500 flex-1" />
                        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="whitespace-nowrap border-neutral-200 text-neutral-700 hover:bg-neutral-50">
                              <Mail className="h-4 w-4 mr-2" />Change
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-blue-600" />Change Email Address</DialogTitle>
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
                                <><div className="space-y-2"><Label>New Email Address</Label><Input type="email" placeholder="your.new.email@example.com" value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} /></div>
                                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className="text-sm">A 6-digit verification code will be sent to this email address.</AlertDescription></Alert></>
                              )}
                              {emailChangeStep === 'verify' && (
                                <><div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /><p className="font-medium text-gray-900">{newEmailInput}</p></div>
                                <div className="space-y-2"><Label>Verification Code</Label><Input type="text" placeholder="000000" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl font-mono tracking-widest" /></div>
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /><span className={countdown < 60 ? 'text-red-600 font-medium' : 'text-neutral-500 font-medium'}>{formatCountdown(countdown)}</span></div>
                                  <Button variant="link" size="sm" onClick={() => { setVerificationCode(''); handleSendVerificationCode(); }} disabled={!canResend || isSendingCode} className="text-blue-600 h-auto p-0">{isSendingCode ? 'Sending...' : 'Resend Code'}</Button>
                                </div></>
                              )}
                              {emailChangeStep === 'success' && (
                                <div className="text-center py-6">
                                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
                                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Email Updated Successfully!</h3>
                                  <p className="text-sm text-neutral-500">Your email has been changed to</p>
                                  <p className="text-sm font-medium text-blue-600 mt-1">{newEmailInput}</p>
                                </div>
                              )}
                            </div>
                            <DialogFooter>
                              {emailChangeStep === 'input' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isSendingCode}>Cancel</Button><Button onClick={handleSendVerificationCode} disabled={isSendingCode || !newEmailInput.trim()} className="bg-yellow-500 hover:bg-yellow-600 text-white">{isSendingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Mail className="h-4 w-4 mr-2" />Send Code</>}</Button></>)}
                              {emailChangeStep === 'verify' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isVerifyingCode}>Cancel</Button><Button onClick={handleVerifyCode} disabled={isVerifyingCode || verificationCode.length !== 6} className="bg-yellow-500 hover:bg-yellow-600 text-white">{isVerifyingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Verify</>}</Button></>)}
                              {emailChangeStep === 'success' && <Button onClick={handleCancelEmailChange} className="w-full bg-green-600 hover:bg-green-700">Done</Button>}
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <p className="text-xs text-gray-500">Email changes require verification</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="linkedin" className="text-sm font-semibold text-gray-700">LinkedIn Profile</Label>
                      <Input id="linkedin" value={formData.linkedin} onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/yourprofile" className="border-neutral-200 focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="github" className="text-sm font-semibold text-gray-700">GitHub Profile</Label>
                      <Input id="github" value={formData.github} onChange={(e) => setFormData(prev => ({ ...prev, github: e.target.value }))} placeholder="https://github.com/yourusername" className="border-neutral-200 focus:border-yellow-400" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mentor_photo" className="text-sm font-semibold text-gray-700">Profile Photo</Label>
                    <div className="flex gap-2">
                      <Input id="mentor_photo" value={formData.mentor_photo?.startsWith('data:') ? '(Cropped Image)' : formData.mentor_photo} onChange={(e) => setFormData(prev => ({ ...prev, mentor_photo: e.target.value }))} placeholder="https://example.com/your-photo.jpg" className="border-neutral-200 focus:border-yellow-400 flex-1" disabled={formData.mentor_photo?.startsWith('data:')} />
                      <Button type="button" variant="outline" onClick={() => setProfileCropperOpen(true)} className="whitespace-nowrap border-neutral-200 text-neutral-700 hover:bg-neutral-50"><CropIcon className="h-4 w-4 mr-2" />Crop Image</Button>
                    </div>
                  </div>

                  {formData.cv_link && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
                      <div><p className="text-sm font-medium text-green-900">CV/Resume Uploaded</p><p className="text-xs text-green-700">Click to view your current CV</p></div>
                      <Button type="button" size="sm" variant="outline" className="border-green-300 hover:bg-green-100" onClick={() => { const u = formData.cv_link!.startsWith('http') ? formData.cv_link : `/api/attachment-proxy?url=${encodeURIComponent(formData.cv_link!)}`; window.open(u, '_blank'); }}>
                        <Eye className="h-4 w-4 mr-1" />View CV
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Update CV/Resume</Label>
                    <div className="flex gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0] || null;

                          if (!selectedFile) {
                            setCvFile(null);
                            return;
                          }

                          const cvValidationError = validateCvFile(selectedFile);
                          if (cvValidationError) {
                            toast({ title: 'Error', description: cvValidationError, variant: 'destructive' });
                            setCvFile(null);
                            e.target.value = '';
                            return;
                          }

                          setCvFile(selectedFile);
                        }}
                        className="border-neutral-200"
                        disabled={isUploadingCV}
                      />
                      <Button type="button" onClick={handleCVUpload} disabled={!cvFile || isUploadingCV} className="bg-neutral-900 hover:bg-neutral-800 text-white whitespace-nowrap">
                        {isUploadingCV ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Uploading...</> : <><Upload className="h-4 w-4 mr-1" />Upload</>}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">Accepted: PDF, DOCX.</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox id="allow-cv-share-mentor" checked={allowCVShare} onCheckedChange={(c) => setAllowCVShare(c as boolean)} className="mt-1" />
                      <div className="flex-1">
                        <label htmlFor="allow-cv-share-mentor" className="text-sm font-medium text-amber-900 cursor-pointer">Allow mentor to view my CV</label>
                        <p className="text-xs text-amber-700 mt-1">Sharing your CV with mentors increases the likelihood of receiving and accepting meeting requests.</p>
                      </div>
                    </div>
                  </div>

                  {/* Institution Photos */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Institution Photos <span className="ml-2 text-xs text-gray-500 font-normal">(Drag to reorder • First 3 shown on profile)</span></Label>
                    <div className="space-y-4">
                      {formData.institution_photo.length > 0 && (
                        <div className="space-y-2">
                          {formData.institution_photo.map((photo, index) => {
                            const photoObj = typeof photo === 'string' ? { url: photo, name: 'Institution' } : photo;
                            return (
                              <div key={index} draggable
                                onDragStart={() => setDraggedIndex(index)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (draggedIndex === null || draggedIndex === index) return;
                                  const photos = [...formData.institution_photo];
                                  const [item] = photos.splice(draggedIndex, 1);
                                  photos.splice(index, 0, item);
                                  setFormData(prev => ({ ...prev, institution_photo: photos }));
                                  setDraggedIndex(null);
                                }}
                                onDragEnd={() => setDraggedIndex(null)}
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-move ${draggedIndex === index ? 'opacity-50 border-yellow-400' : 'border-gray-300 hover:border-yellow-400'} ${index < 3 ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 'bg-gray-50'}`}>
                                <GripVertical className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                <div className="w-16 h-16 rounded-lg border border-gray-200 bg-white flex items-center justify-center p-2 flex-shrink-0">
                                  <img src={photoObj.url.startsWith('data:') ? photoObj.url : getGoogleDriveImageUrl(photoObj.url)} alt={photoObj.name} className="max-h-full max-w-full object-contain" onError={(e) => { e.currentTarget.src = 'https://placehold.co/64x64?text=Logo'; }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm text-gray-900 truncate">{photoObj.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{index < 3 ? <span className="text-green-600 font-medium">✓ Displayed on profile (Position {index + 1})</span> : <span>Hidden (Position {index + 1})</span>}</p>
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => setFormData(prev => ({ ...prev, institution_photo: prev.institution_photo.filter((_, i) => i !== index) }))} className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><Building2 className="h-4 w-4" /><span>Add New Institution</span></div>
                        <div className="space-y-2">
                          <div className="relative">
                            <Input type="text" placeholder="Institution name (e.g., MIT, Stanford, Google)" value={newInstitutionName}
                              onChange={(e) => { setNewInstitutionName(e.target.value); setShowSuggestions(e.target.value.length > 0); }}
                              onFocus={() => setShowSuggestions(newInstitutionName.length > 0)}
                              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                              className="border-neutral-200 focus:border-yellow-400" />
                            {showSuggestions && institutionSuggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {institutionSuggestions.filter(s => s.toLowerCase().includes(newInstitutionName.toLowerCase())).slice(0, 10).map((s, i) => (
                                  <div key={i} onClick={() => { setNewInstitutionName(s); setShowSuggestions(false); }} className="px-3 py-2 hover:bg-yellow-50 cursor-pointer text-sm border-b border-gray-100 last:border-0">{s}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input type="text" placeholder="https://example.com/logo.jpg or Google Drive link" value={newInstitutionUrl} onChange={(e) => setNewInstitutionUrl(e.target.value)} className="border-neutral-200 focus:border-yellow-400 flex-1"
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const url = newInstitutionUrl.trim(); const name = newInstitutionName.trim(); if (url && name) { setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] })); setNewInstitutionUrl(''); setNewInstitutionName(''); } } }} />
                            <Button type="button" variant="outline" size="sm" onClick={() => { const url = newInstitutionUrl.trim(); const name = newInstitutionName.trim(); if (url && name) { setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] })); setNewInstitutionUrl(''); setNewInstitutionName(''); } else toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide both institution name and URL.' }); }} className="whitespace-nowrap border-neutral-200 text-neutral-500 hover:bg-neutral-50">Add</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => { if (!newInstitutionName.trim()) { toast({ variant: 'destructive', title: 'Missing Name', description: 'Enter institution name first.' }); return; } setInstitutionCropperOpen(true); }} className="whitespace-nowrap border-amber-300 text-amber-600 hover:bg-amber-50"><CropIcon className="h-4 w-4 mr-1" />Crop & Add</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Timezone Preference ─────────────────────────────────────── */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">Timezone Preference</h3>
                      <p className="text-sm text-neutral-500">
                        All times on the site will display in your chosen timezone
                      </p>
                    </div>
                  </div>

                  {/* Live preview banner */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                    <span className="text-lg">🌐</span>
                    <span>Currently showing times in <strong>{timezoneLabel}</strong>. Changing this will instantly update your availability schedule below.</span>
                  </div>

                  <TimezoneSelector value={timezone} onChange={handleTimezoneChange} />
                </div>

                {/* Biography */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg"><BookOpen className="h-5 w-5 text-yellow-600" /></div>
                    <div><h3 className="text-lg font-semibold text-neutral-900">About You</h3><p className="text-sm text-neutral-500">Tell your story and what makes you unique</p></div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="biography" className="text-sm font-semibold text-gray-700">Biography <span className="text-red-500">*</span></Label>
                    <Textarea id="biography" value={formData.biography} onChange={(e) => setFormData(prev => ({ ...prev, biography: e.target.value }))} placeholder="Tell mentees about yourself..." rows={6} className="border-neutral-200 focus:border-blue-400 resize-none" required />
                    <p className="text-xs text-gray-500">{formData.biography.length} characters</p>
                  </div>
                </div>

                {/* Expertise */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg"><Target className="h-5 w-5 text-yellow-600" /></div>
                    <div><h3 className="text-lg font-semibold text-neutral-900">Expertise</h3></div>
                  </div>
                  <div className="space-y-3"><Label className="text-sm font-semibold text-gray-700">Specializations <span className="text-red-500">*</span></Label><TagInput tags={formData.specialization} setTags={(t) => setFormData(prev => ({ ...prev, specialization: t }))} placeholder="e.g., Web Development, Data Science" accentColor="purple" /></div>
                  <div className="space-y-3"><Label className="text-sm font-semibold text-gray-700">Fields of Consultation</Label><TagInput tags={formData.field_of_consultation} setTags={(t) => setFormData(prev => ({ ...prev, field_of_consultation: t }))} placeholder="e.g., Career Planning, Technical Skills" accentColor="indigo" /></div>
                  <div className="space-y-3"><Label className="text-sm font-semibold text-gray-700">Skills</Label><TagInput tags={formData.skills} setTags={(t) => setFormData(prev => ({ ...prev, skills: t }))} placeholder="e.g., JavaScript, Leadership" accentColor="teal" /></div>
                </div>

                {/* Professional Background */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg"><Briefcase className="h-5 w-5 text-yellow-600" /></div>
                    <div><h3 className="text-lg font-semibold text-neutral-900">Professional Background</h3></div>
                  </div>
                  <div className="space-y-3"><Label className="text-sm font-semibold text-gray-700">Experience</Label><TagInput tags={formData.experience} setTags={(t) => setFormData(prev => ({ ...prev, experience: t }))} placeholder="e.g., 5 years as Senior Developer at Tech Co" accentColor="green" /></div>
                  <div className="space-y-3"><Label className="text-sm font-semibold text-gray-700">Achievements</Label><TagInput tags={formData.achievement} setTags={(t) => setFormData(prev => ({ ...prev, achievement: t }))} placeholder="e.g., Published author, Award winner" accentColor="amber" /></div>
                </div>

                {/* ── Availability Schedule ──────────────────────────────────── */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-yellow-100">
                    <div className="p-2 bg-yellow-100 rounded-lg"><Calendar className="h-5 w-5 text-yellow-600" /></div>
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">Availability Schedule</h3>
                      <p className="text-sm text-gray-600">Times are displayed in your selected timezone and automatically stored in Malaysia time (UTC+8)</p>
                    </div>
                  </div>

                  <ScheduleSelector
                    schedule={schedule}
                    setSchedule={handleScheduleChange}
                    timezoneLabel={timezoneLabel}
                  />
                </div>

                {/* Save */}
                <div className="pt-6 border-t border-yellow-100">
                  <Button onClick={handleSave} size="lg" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold shadow-lg text-lg py-6" disabled={isSaving}>
                    {isSaving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Saving Your Profile...</> : <><Award className="mr-2 h-5 w-5" />Save Changes</>}
                  </Button>
                  <p className="text-center text-sm text-gray-500 mt-3">Your changes will be visible to mentees immediately</p>
                </div>
              </CardContent>
            </Card>

            <ImageCropper open={profileCropperOpen} onOpenChange={setProfileCropperOpen} onCropComplete={handleProfileImageCropped} aspectRatio={1} circularCrop={true} title="Crop Profile Photo" description="Adjust your profile photo to fit perfectly in a circle" />
            <ImageCropper open={institutionCropperOpen} onOpenChange={setInstitutionCropperOpen} onCropComplete={handleInstitutionImageCropped} aspectRatio={16 / 9} circularCrop={false} title="Crop Institution Logo" description="Adjust the institution logo for best display" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}