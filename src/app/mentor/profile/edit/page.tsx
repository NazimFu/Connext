'use client';

// src/app/mentor/profile/edit/page.tsx
//
// REDESIGN v4 — rebalanced two-column layout
// ----------------------------------------------------
// LEFT  (identity / personal — narrow, stacks vertically):
//     Identity summary · Basic information (name, email, photo, links) · Timezone
// RIGHT (professional content — wide sections):
//     About · Expertise · Professional background · CV & resume · Institutions · Availability
// Yellow brand + neutral + minimal semantic colors. Schedule toggle is overlap-proof.

import React, { useState, useEffect, useRef, KeyboardEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  X, Loader2, Pencil, Mail, CheckCircle2, AlertCircle, Clock,
  Crop as CropIcon, Eye, Upload, GripVertical, Plus, Trash2,
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { getGoogleDriveImageUrl } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageCropper } from '@/components/ui/image-cropper';
import { TimezoneSelector } from '@/components/ui/timezone-selector';
import {
  DEFAULT_TIMEZONE,
  localTimeToMY,
  myTimeToLocal,
  TIMEZONE_OPTIONS,
} from '@/lib/timezone';

const ALLOWED_CV_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_CV_EXTENSIONS = ['.pdf', '.docx'];
const MAX_CV_SIZE_BYTES = 2 * 1024 * 1024;

const CARD = 'bg-white rounded-2xl border border-neutral-200/70 shadow-sm';
const LABEL = 'text-sm font-medium text-neutral-700';
const INPUT = 'border-neutral-200 focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-600/20';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className={`${CARD} p-6 sm:p-8`}>
      <div className="border-b border-neutral-100 pb-4 mb-6">
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

// Display-only field row (Fresha left-card style): label on top, value below.
// Empty value renders "+ Add" as the value line.
function FieldRow({ label, value, onAdd }: { label: string; value?: string; onAdd?: () => void }) {
  return (
    <div className="py-3 w-full">
      <p className="text-sm font-semibold text-neutral-900">{label}</p>
      {value
        ? <p className="text-sm text-neutral-500 break-words">{value}</p>
        : <button type="button" onClick={onAdd} className="text-sm text-amber-600 hover:text-amber-700">+ Add</button>}
    </div>
  );
}

interface TagInputProps { tags: string[]; setTags: (tags: string[]) => void; placeholder: string; }
function TagInput({ tags, setTags, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 p-2 min-h-[44px] rounded-xl border border-neutral-200 bg-white transition-colors focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/20">
        {tags.map((tag, index) => (
          <span key={index} className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 border border-neutral-200 pl-2.5 pr-1.5 py-1 text-sm text-neutral-700">
            {tag}
            <button type="button" onClick={() => setTags(tags.filter((_, i) => i !== index))} className="rounded p-0.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70 transition-colors" aria-label={`Remove ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value.replace(',', ''))} onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : 'Add more…'}
          className="flex-1 min-w-[160px] bg-transparent border-0 outline-none text-neutral-800 placeholder-neutral-400 text-sm px-1" />
      </div>
      <p className="text-xs text-neutral-500 px-1">Type an item, then press Enter to add it. Commas also work.</p>
    </div>
  );
}

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
  timezoneLabel: string;
}

function DayToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 ${on ? 'bg-amber-600' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ScheduleSelector({ schedule, setSchedule, timezoneLabel }: ScheduleSelectorProps) {
  const [customTimeInput, setCustomTimeInput] = useState<Record<string, string>>({});
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleTimeSlot = (day: string, time: string) => {
    setSchedule(prev => {
      const slots = prev[day] || [];
      const next = slots.includes(time) ? slots.filter(t => t !== time) : [...slots, time].sort();
      if (next.length === 0) { const { [day]: _omit, ...rest } = prev; return rest; }
      return { ...prev, [day]: next };
    });
  };
  const addPresetTimes = (day: string, times: string[]) =>
    setSchedule(prev => ({ ...prev, [day]: [...new Set([...(prev[day] || []), ...times])].sort() }));
  const clearDaySlots = (day: string) => {
    setSchedule(prev => { const { [day]: _omit, ...rest } = prev; return rest; });
    setExpandedDays(prev => { const s = new Set(prev); s.delete(day); return s; });
  };
  const openDay = (day: string) => setExpandedDays(prev => { const s = new Set(prev); s.add(day); return s; });

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-neutral-500">Showing times in <span className="font-medium text-neutral-700">{timezoneLabel}</span></p>
        <p className="text-neutral-500">{totalSlots} {totalSlots === 1 ? 'slot' : 'slots'} · {activeDays} {activeDays === 1 ? 'day' : 'days'} active</p>
      </div>

      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 overflow-hidden">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = schedule[day] || [];
          const isActive = daySlots.length > 0;
          const isOpen = isActive || expandedDays.has(day);

          return (
            <div key={day} className={isOpen ? 'bg-white' : 'bg-neutral-50/40'}>
              <div className="flex items-center gap-3 px-4 py-3">
                <DayToggle on={isOpen} label={`Toggle ${day} availability`} onClick={() => (isOpen ? clearDaySlots(day) : openDay(day))} />
                <span className={`flex-1 min-w-0 text-sm font-medium ${isOpen ? 'text-neutral-900' : 'text-neutral-500'}`}>{day}</span>
                {isActive ? (
                  <div className="hidden sm:flex flex-wrap items-center justify-end gap-1 max-w-[280px]">
                    {daySlots.slice(0, 3).map(t => (
                      <span key={t} className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">{formatTime(t)}</span>
                    ))}
                    {daySlots.length > 3 && <span className="text-xs text-neutral-400">+{daySlots.length - 3} more</span>}
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400">{isOpen ? 'Select times below' : 'Unavailable'}</span>
                )}
              </div>

              {isOpen && (
                <div className="px-4 pb-4 sm:pl-[3.5rem] space-y-3">
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                    {COMMON_TIMES.map(time => {
                      const selected = daySlots.includes(time);
                      return (
                        <button key={time} type="button" onClick={() => toggleTimeSlot(day, time)} aria-pressed={selected}
                          className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${selected ? 'bg-amber-600 text-white border border-amber-600' : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'}`}>
                          {formatTime(time)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">Quick add:</span>
                      {TIME_PRESETS.map(preset => (
                        <button key={preset.label} type="button" onClick={() => addPresetTimes(day, preset.times)}
                          className="text-xs font-medium text-neutral-600 underline-offset-2 hover:text-amber-700 hover:underline">{preset.label}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="time" value={customTimeInput[day] || ''} onChange={(e) => setCustomTimeInput(prev => ({ ...prev, [day]: e.target.value }))}
                        className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-700 focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20" />
                      <button type="button" disabled={!customTimeInput[day]}
                        onClick={() => { if (customTimeInput[day]) { toggleTimeSlot(day, customTimeInput[day]); setCustomTimeInput(prev => ({ ...prev, [day]: '' })); } }}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                    <button type="button" onClick={() => clearDaySlots(day)} className="ml-auto text-xs font-medium text-neutral-400 hover:text-red-600">Clear day</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MentorProfileEditPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen bg-neutral-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-amber-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm font-medium">Loading your profile…</p>
        </div>
      </div>
    }>
      <MentorProfileEdit />
    </Suspense>
  );
}

function MentorProfileEdit() {
  const { user, isLoading } = useRequireAuth('mentor');
  const { refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [pendingEmailUpdate, setPendingEmailUpdate] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const storedMyTimesRef = useRef<Array<{ day: string; time: string[] }>>([]);

  const [formData, setFormData] = useState({
    mentor_name: '', mentor_email: '', mentor_photo: '',
    institution_photo: [] as any[],
    specialization: [] as string[], field_of_consultation: [] as string[],
    biography: '', experience: [] as string[], skills: [] as string[], achievement: [] as string[],
    linkedin: '', github: '', cv_link: '',
  });

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [allowCVShare, setAllowCVShare] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState<'input' | 'verify' | 'success'>('input');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [canResend, setCanResend] = useState(true);

  const [profileCropperOpen, setProfileCropperOpen] = useState(false);
  const [institutionCropperOpen, setInstitutionCropperOpen] = useState(false);

  const [newInstitutionUrl, setNewInstitutionUrl] = useState('');
  const [newInstitutionName, setNewInstitutionName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [institutionSuggestions, setInstitutionSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t); }
    else if (countdown === 0 && !canResend) setCanResend(true);
  }, [countdown, canResend]);

  useEffect(() => {
    const emailUpdate = searchParams.get('emailUpdate');
    if (emailUpdate === 'pending') {
      setPendingEmailUpdate(true); setBasicInfoOpen(true); setEmailDialogOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('emailUpdate');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchMentorProfile = async () => {
      if (!user?.id) return;
      try {
        setIsLoadingProfile(true);
        const res = await fetch(`/api/mentor/profile?mentorId=${user.id}&_t=${Date.now()}`, {
          cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
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
        if (mentorData.available_slots && Array.isArray(mentorData.available_slots)) {
          storedMyTimesRef.current = mentorData.available_slots;
          const scheduleData: Record<string, string[]> = {};
          mentorData.available_slots.forEach((slot: { day: string; time: string[] }) => {
            if (slot.day && Array.isArray(slot.time)) {
              scheduleData[slot.day] = slot.time.map((t: string) => myTimeToLocal(t, savedTz)).filter((t): t is string => t !== null).sort();
            }
          });
          setSchedule(scheduleData);
        }
      } catch (err) {
        console.error('Error fetching mentor profile:', err);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load profile data.' });
      } finally { setIsLoadingProfile(false); }
    };
    fetchMentorProfile();
  }, [user, toast]);

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

  useEffect(() => {
    if (storedMyTimesRef.current.length === 0) return;
    const newSchedule: Record<string, string[]> = {};
    storedMyTimesRef.current.forEach(({ day, time }) => {
      if (day && Array.isArray(time)) {
        const converted = time.map(t => myTimeToLocal(t, timezone)).filter((t): t is string => t !== null).sort();
        if (converted.length > 0) newSchedule[day] = converted;
      }
    });
    setSchedule(newSchedule);
  }, [timezone]);

  const broadcastTimezoneChange = (newTz: string) => {
    try { localStorage.setItem('userTimezone', newTz); } catch {}
    window.dispatchEvent(new CustomEvent('timezone-changed', { detail: { timezone: newTz } }));
  };

  const handleTimezoneChange = (newTz: string) => {
    setTimezone(newTz);
    broadcastTimezoneChange(newTz);
    const tzOpt = TIMEZONE_OPTIONS.find(o => o.value === newTz);
    const label = tzOpt ? `${tzOpt.label} (${tzOpt.offset})` : newTz;
    toast({ title: 'Timezone updated', description: `Availability times now show in ${label}.` });
  };

  const handleScheduleChange: React.Dispatch<React.SetStateAction<Record<string, string[]>>> = (action) => {
    setSchedule(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      storedMyTimesRef.current = Object.entries(next).filter(([, times]) => times.length > 0).map(([day, localTimes]) => ({
        day, time: localTimes.map(t => localTimeToMY(t, timezone)).filter((t): t is string => t !== null).sort(),
      }));
      return next;
    });
  };

  const handleSave = async () => {
    if (!formData.mentor_name || !formData.biography || formData.specialization.length === 0) {
      toast({ variant: 'destructive', title: 'Missing required fields', description: 'Please fill in your name, biography, and at least one specialization.' }); return;
    }
    if (!user?.id) { toast({ title: 'Error', description: 'User ID not found. Please log in again.', variant: 'destructive' }); return; }
    setIsSaving(true);
    try {
      const availableSlots = storedMyTimesRef.current.filter(s => s.time.length > 0);
      const payload = { id: user.id, ...formData, available_slots: availableSlots, allowCVShare, timezone };
      const res = await fetch('/api/mentor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update profile'); }
      toast({ title: 'Profile updated', description: 'Your mentor profile has been saved.' });
      broadcastTimezoneChange(timezone);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to update profile.', variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const handleSendVerificationCode = async () => {
    if (!newEmailInput.trim()) { toast({ variant: 'destructive', title: 'Error', description: 'Please enter a new email address.' }); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmailInput)) { toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address.' }); return; }
    if (newEmailInput.toLowerCase() === formData.mentor_email.toLowerCase()) { toast({ variant: 'destructive', title: 'Same email', description: 'New email must be different from your current email.' }); return; }
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/mentor/send-verification-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId: user?.id, currentEmail: formData.mentor_email, newEmail: newEmailInput }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to send verification code');
      toast({ title: 'Code sent', description: `A 6-digit code was sent to ${newEmailInput}.` });
      setEmailChangeStep('verify'); setCountdown(300); setCanResend(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to send code.' });
    } finally { setIsSendingCode(false); }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) { toast({ variant: 'destructive', title: 'Invalid code', description: 'Please enter the 6-digit code.' }); return; }
    setIsVerifyingCode(true);
    try {
      const res = await fetch('/api/mentor/verify-email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId: user?.id, newEmail: newEmailInput, code: verificationCode.trim() }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to verify code');
      setFormData(prev => ({ ...prev, mentor_email: newEmailInput }));

      // Changing the Firebase Auth email invalidates the current session token,
      // so refreshing the local user here can throw (e.g. auth/user-token-expired).
      // That's expected — prompt for a fresh login instead of surfacing the raw error.
      try {
        const { auth } = await import('@/lib/firebase');
        await auth.currentUser?.reload();
        await refreshUser();
        toast({ title: 'Email updated', description: `Your email has been changed to ${newEmailInput}.` });
        setEmailChangeStep('success');
        setTimeout(() => handleCancelEmailChange(), 2000);
      } catch {
        toast({ title: 'Email updated — please log in again', description: `Your email has been changed to ${newEmailInput}. For security, please log in again.` });
        setEmailChangeStep('success');
        setTimeout(async () => {
          const { auth } = await import('@/lib/firebase');
          await auth.signOut();
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Verification failed', description: err instanceof Error ? err.message : 'Failed to verify code.' });
    } finally { setIsVerifyingCode(false); }
  };

  const handleCancelEmailChange = () => {
    setEmailDialogOpen(false); setNewEmailInput(''); setVerificationCode('');
    setEmailChangeStep('input'); setCountdown(0); setCanResend(true);
  };

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleDeleteAccount = async () => {
    if (!user?.id) { toast({ title: 'Error', description: 'User ID not found.', variant: 'destructive' }); return; }
    if (deleteConfirmText.trim() !== 'DELETE') return;
    setIsDeletingAccount(true);
    try {
      const res = await fetch('/api/mentor/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to delete account');
      toast({ title: 'Account deleted', description: 'Your account and data have been removed.' });
      setDeleteDialogOpen(false);
      setTimeout(async () => {
        await logout();
        router.push('/login');
      }, 1500);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Could not delete account', description: err instanceof Error ? err.message : 'Please try again.' });
    } finally { setIsDeletingAccount(false); }
  };

  const handleProfileImageCropped = (url: string) => setFormData(prev => ({ ...prev, mentor_photo: url }));
  const handleInstitutionImageCropped = (url: string) => {
    const name = newInstitutionName.trim();
    if (!name) { toast({ variant: 'destructive', title: 'Missing name', description: 'Enter institution name before cropping.' }); return; }
    setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] }));
    setNewInstitutionName('');
  };

  const validateCvFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_CV_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasAllowedMimeType = ALLOWED_CV_MIME_TYPES.includes(file.type);
    if (!hasAllowedExtension && !hasAllowedMimeType) return 'Only PDF or DOCX files are allowed.';
    if (file.size > MAX_CV_SIZE_BYTES) return 'CV file must be 2MB or smaller.';
    return null;
  };

  const handleCVUpload = async () => {
    if (!cvFile) { toast({ title: 'Error', description: 'Please select a file.', variant: 'destructive' }); return; }
    const cvValidationError = validateCvFile(cvFile);
    if (cvValidationError) { toast({ title: 'Error', description: cvValidationError, variant: 'destructive' }); return; }
    setIsUploadingCV(true);
    try {
      const fd = new FormData();
      fd.append('file', cvFile); fd.append('folder', 'mentor');
      const upRes = await fetch('/api/uploadFirebase', { method: 'POST', body: fd });
      const uploadData = await upRes.json();
      if (!upRes.ok) throw new Error(uploadData.error || 'Failed to upload CV');
      const { path: cvPath } = uploadData;
      setFormData(prev => ({ ...prev, cv_link: cvPath }));
      const saveRes = await fetch('/api/mentor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user?.id, cv_link: cvPath }) });
      if (!saveRes.ok) throw new Error('Failed to save CV to profile');
      setCvFile(null);
      toast({ title: 'CV updated', description: 'Your CV has been uploaded.' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to upload CV.', variant: 'destructive' });
    } finally { setIsUploadingCV(false); }
  };

  const currentTzOption = TIMEZONE_OPTIONS.find(o => o.value === timezone);
  const timezoneLabel = currentTzOption ? `${currentTzOption.label} (${currentTzOption.offset})` : timezone;

  if (isLoading || !user || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-screen bg-neutral-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-amber-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm font-medium">Loading your profile…</p>
        </div>
      </div>
    );
  }

  const SaveButton = (
    <Button onClick={handleSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 shadow-sm">
      {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save changes'}
    </Button>
  );

  // Email change dialog (used from the left "Basic information" card)
  const EmailDialog = (
    <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline">Change</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email address</DialogTitle>
          <DialogDescription>
            {emailChangeStep === 'input' && 'Enter your new email address to receive a verification code.'}
            {emailChangeStep === 'verify' && 'Enter the 6-digit code sent to your new email.'}
            {emailChangeStep === 'success' && 'Email successfully updated.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500 mb-0.5">Current email</p>
            <p className="text-sm font-medium text-neutral-900 break-all">{formData.mentor_email}</p>
          </div>
          {emailChangeStep === 'input' && (
            <>
              <div className="space-y-1.5"><Label className={LABEL}>New email address</Label><Input type="email" placeholder="your.new.email@example.com" value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} className={INPUT} /></div>
              <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className="text-sm">A 6-digit verification code will be sent to this email address.</AlertDescription></Alert>
            </>
          )}
          {emailChangeStep === 'verify' && (
            <>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><p className="text-sm font-medium text-neutral-900 break-all">{newEmailInput}</p></div>
              <div className="space-y-1.5"><Label className={LABEL}>Verification code</Label><Input type="text" placeholder="000000" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl font-mono tracking-widest" /></div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-neutral-400" /><span className={countdown < 60 ? 'text-red-600 font-medium' : 'text-neutral-500 font-medium'}>{formatCountdown(countdown)}</span></div>
                <Button variant="link" size="sm" onClick={() => { setVerificationCode(''); handleSendVerificationCode(); }} disabled={!canResend || isSendingCode} className="text-neutral-700 h-auto p-0">{isSendingCode ? 'Sending…' : 'Resend code'}</Button>
              </div>
            </>
          )}
          {emailChangeStep === 'success' && (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-3"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Email updated</h3>
              <p className="text-sm text-neutral-500 break-all">Changed to {newEmailInput}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          {emailChangeStep === 'input' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isSendingCode}>Cancel</Button><Button onClick={handleSendVerificationCode} disabled={isSendingCode || !newEmailInput.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">{isSendingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send code'}</Button></>)}
          {emailChangeStep === 'verify' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isVerifyingCode}>Cancel</Button><Button onClick={handleVerifyCode} disabled={isVerifyingCode || verificationCode.length !== 6} className="bg-amber-600 hover:bg-amber-700 text-white">{isVerifyingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : 'Verify'}</Button></>)}
          {emailChangeStep === 'success' && <Button onClick={handleCancelEmailChange} className="w-full bg-amber-600 hover:bg-amber-700 text-white">Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Edit basic info — holds the actual inputs (opened from the left card)
  const BasicInfoDialog = (
    <Dialog open={basicInfoOpen} onOpenChange={setBasicInfoOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit basic info</DialogTitle>
          <DialogDescription>Update your personal and contact details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mentor_name" className={LABEL}>Full name <span className="text-red-500">*</span></Label>
            <Input id="mentor_name" value={formData.mentor_name} onChange={(e) => setFormData(prev => ({ ...prev, mentor_name: e.target.value }))} placeholder="Enter your full name" className={INPUT} required />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between"><Label className={LABEL}>Email address</Label>{EmailDialog}</div>
            <Input value={formData.mentor_email} disabled className="bg-neutral-50 border-neutral-200 text-neutral-500" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedin" className={LABEL}>LinkedIn profile</Label>
            <Input id="linkedin" value={formData.linkedin} onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/yourprofile" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="github" className={LABEL}>GitHub profile</Label>
            <Input id="github" value={formData.github} onChange={(e) => setFormData(prev => ({ ...prev, github: e.target.value }))} placeholder="https://github.com/yourusername" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mentor_photo" className={LABEL}>Profile photo</Label>
            <Input id="mentor_photo" value={formData.mentor_photo?.startsWith('data:') ? '(Cropped image)' : formData.mentor_photo} onChange={(e) => setFormData(prev => ({ ...prev, mentor_photo: e.target.value }))} placeholder="https://example.com/your-photo.jpg" className={INPUT} disabled={formData.mentor_photo?.startsWith('data:')} />
            <Button type="button" variant="outline" onClick={() => setProfileCropperOpen(true)} className="w-full border-neutral-200 text-neutral-700 hover:bg-neutral-50"><CropIcon className="h-4 w-4 mr-1.5" />Crop image</Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setBasicInfoOpen(false)} className="bg-amber-600 hover:bg-amber-700 text-white">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="min-h-screen bg-neutral-100">

      <motion.div
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3 }}
          className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6 grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start"
      >
        {/* ════════ LEFT: identity + personal ════════ */}
        <aside className="lg:sticky lg:top-8 space-y-6">

          {/* Identity + display-only basic info (editing via "Edit basic info") */}
          <div className={`${CARD} p-6`}>
            <div className="text-center">
              <div className="relative inline-block">
                <Avatar className="h-28 w-28 ring-1 ring-neutral-200">
                  <AvatarImage src={formData.mentor_photo?.startsWith('data:') ? formData.mentor_photo : getGoogleDriveImageUrl(formData.mentor_photo)} alt={formData.mentor_name || 'Mentor'} />
                  <AvatarFallback className="bg-amber-100 text-amber-700 text-3xl font-semibold">{formData.mentor_name?.slice(0, 2).toUpperCase() || 'MN'}</AvatarFallback>
                </Avatar>
                <button type="button" onClick={() => setProfileCropperOpen(true)} aria-label="Change profile photo"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-md flex items-center justify-center transition-colors">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <h2 className="mt-4 text-lg font-bold text-neutral-900 truncate">{formData.mentor_name || 'Mentor name'}</h2>
              <button type="button" onClick={() => setBasicInfoOpen(true)} className="mt-1 text-sm font-medium text-amber-600 hover:text-amber-700">Edit basic info</button>
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Mentor</span>
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-2">
              <FieldRow label="Full name" value={formData.mentor_name} onAdd={() => setBasicInfoOpen(true)} />
              <FieldRow label="Email address" value={formData.mentor_email} onAdd={() => setBasicInfoOpen(true)} />
              <FieldRow label="LinkedIn" value={formData.linkedin} onAdd={() => setBasicInfoOpen(true)} />
              <FieldRow label="GitHub" value={formData.github} onAdd={() => setBasicInfoOpen(true)} />
            </div>
          </div>

          {/* Timezone — personal preference */}
          <SectionCard title="Timezone" description="All times on the site display in your chosen timezone.">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 py-2.5 text-xs text-neutral-600">
              Showing times in <strong className="text-neutral-900">{timezoneLabel}</strong>. Changing this updates your schedule instantly.
            </div>
            <TimezoneSelector value={timezone} onChange={handleTimezoneChange} />
          </SectionCard>
        </aside>

        {/* ════════ RIGHT: professional content ════════ */}
        <div className="space-y-6 min-w-0">

          {/* About */}
          <SectionCard title="About you">
            <div className="space-y-1.5">
              <Label htmlFor="biography" className={LABEL}>Biography <span className="text-red-500">*</span></Label>
              <Textarea id="biography" value={formData.biography} onChange={(e) => setFormData(prev => ({ ...prev, biography: e.target.value }))} placeholder="Tell mentees about yourself…" rows={6} className={`${INPUT} resize-none`} required />
              <p className="text-xs text-neutral-400">{formData.biography.length} characters</p>
            </div>
          </SectionCard>

          {/* Expertise */}
          <SectionCard title="Expertise" description="The areas you mentor and consult in.">
            <div className="space-y-2"><Label className={LABEL}>Specializations <span className="text-red-500">*</span></Label><TagInput tags={formData.specialization} setTags={(t) => setFormData(prev => ({ ...prev, specialization: t }))} placeholder="e.g., Web Development, Data Science" /></div>
            <div className="space-y-2"><Label className={LABEL}>Fields of consultation</Label><TagInput tags={formData.field_of_consultation} setTags={(t) => setFormData(prev => ({ ...prev, field_of_consultation: t }))} placeholder="e.g., Career Planning, Technical Skills" /></div>
            <div className="space-y-2"><Label className={LABEL}>Skills</Label><TagInput tags={formData.skills} setTags={(t) => setFormData(prev => ({ ...prev, skills: t }))} placeholder="e.g., JavaScript, Leadership" /></div>
          </SectionCard>

          {/* Professional background */}
          <SectionCard title="Professional background" description="Your experience and notable achievements.">
            <div className="space-y-2"><Label className={LABEL}>Experience</Label><TagInput tags={formData.experience} setTags={(t) => setFormData(prev => ({ ...prev, experience: t }))} placeholder="e.g., 5 years as Senior Developer at Tech Co" /></div>
            <div className="space-y-2"><Label className={LABEL}>Achievements</Label><TagInput tags={formData.achievement} setTags={(t) => setFormData(prev => ({ ...prev, achievement: t }))} placeholder="e.g., Published author, Award winner" /></div>
          </SectionCard>

          {/* CV & resume */}
          <SectionCard title="CV & resume" description="Upload your CV and control who can see it.">
            {formData.cv_link && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <div><p className="text-sm font-medium text-neutral-900">CV / resume uploaded</p><p className="text-xs text-neutral-500">Your current CV is on file.</p></div>
                </div>
                <Button type="button" size="sm" variant="outline" className="border-neutral-200 hover:bg-white" onClick={() => { const u = formData.cv_link!.startsWith('http') ? formData.cv_link : `/api/attachment-proxy?url=${encodeURIComponent(formData.cv_link!)}`; window.open(u, '_blank'); }}><Eye className="h-4 w-4 mr-1.5" />View</Button>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className={LABEL}>Update CV / resume</Label>
              <div className="flex gap-2">
                <Input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    if (!selectedFile) { setCvFile(null); return; }
                    const cvValidationError = validateCvFile(selectedFile);
                    if (cvValidationError) { toast({ title: 'Error', description: cvValidationError, variant: 'destructive' }); setCvFile(null); e.target.value = ''; return; }
                    setCvFile(selectedFile);
                  }}
                  className="border-neutral-200" disabled={isUploadingCV} />
                <Button type="button" onClick={handleCVUpload} disabled={!cvFile || isUploadingCV} className="bg-neutral-900 hover:bg-neutral-800 text-white whitespace-nowrap">
                  {isUploadingCV ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
                </Button>
              </div>
              <p className="text-xs text-neutral-400">Accepted: PDF, DOCX. Max 2&nbsp;MB.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5">
              <div className="flex items-start gap-3">
                <Checkbox id="allow-cv-share-mentor" checked={allowCVShare} onCheckedChange={(c) => setAllowCVShare(c as boolean)} className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 data-[state=checked]:text-white" />
                <div className="flex-1">
                  <label htmlFor="allow-cv-share-mentor" className="text-sm font-medium text-neutral-800 cursor-pointer">Allow mentees to view my CV</label>
                  <p className="text-xs text-neutral-500 mt-0.5">Sharing your CV increases the likelihood of receiving and accepting meeting requests.</p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Institutions */}
          <SectionCard title="Institutions" description="Drag to reorder · first 3 shown">
            {formData.institution_photo.length > 0 && (
              <div className="space-y-2">
                {formData.institution_photo.map((photo, index) => {
                  const photoObj = typeof photo === 'string' ? { url: photo, name: 'Institution' } : photo;
                  const shown = index < 3;
                  return (
                    <div key={index} draggable
                      onDragStart={() => setDraggedIndex(index)} onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (draggedIndex === null || draggedIndex === index) return; const photos = [...formData.institution_photo]; const [item] = photos.splice(draggedIndex, 1); photos.splice(index, 0, item); setFormData(prev => ({ ...prev, institution_photo: photos })); setDraggedIndex(null); }}
                      onDragEnd={() => setDraggedIndex(null)}
                      className={`flex items-center gap-3 p-3 rounded-xl border bg-white transition-colors cursor-move ${draggedIndex === index ? 'opacity-50 border-amber-600' : 'border-neutral-200 hover:border-neutral-300'}`}>
                      <GripVertical className="h-4 w-4 text-neutral-300 flex-shrink-0" />
                      <div className="w-12 h-12 rounded-lg border border-neutral-200 bg-white flex items-center justify-center p-1.5 flex-shrink-0">
                        <img src={photoObj.url.startsWith('data:') ? photoObj.url : getGoogleDriveImageUrl(photoObj.url)} alt={photoObj.name} className="max-h-full max-w-full object-contain" onError={(e) => { e.currentTarget.src = 'https://placehold.co/64x64?text=Logo'; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-neutral-900 truncate">{photoObj.name}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">{shown ? `Shown · position ${index + 1}` : `Hidden · position ${index + 1}`}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setFormData(prev => ({ ...prev, institution_photo: prev.institution_photo.filter((_, i) => i !== index) }))} className="flex-shrink-0 h-8 w-8 text-neutral-400 hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 space-y-2.5">
              <p className="text-sm font-medium text-neutral-700">Add an institution</p>
              <div className="relative">
                <Input type="text" placeholder="Institution name (e.g., MIT, Stanford, Google)" value={newInstitutionName}
                  onChange={(e) => { setNewInstitutionName(e.target.value); setShowSuggestions(e.target.value.length > 0); }}
                  onFocus={() => setShowSuggestions(newInstitutionName.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className={INPUT} />
                {showSuggestions && institutionSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {institutionSuggestions.filter(s => s.toLowerCase().includes(newInstitutionName.toLowerCase())).slice(0, 10).map((s, i) => (
                      <div key={i} onClick={() => { setNewInstitutionName(s); setShowSuggestions(false); }} className="px-3 py-2 hover:bg-neutral-50 cursor-pointer text-sm border-b border-neutral-100 last:border-0">{s}</div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input type="text" placeholder="Logo URL or Google Drive link" value={newInstitutionUrl} onChange={(e) => setNewInstitutionUrl(e.target.value)} className={`${INPUT} flex-1`}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const url = newInstitutionUrl.trim(); const name = newInstitutionName.trim(); if (url && name) { setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] })); setNewInstitutionUrl(''); setNewInstitutionName(''); } } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => { const url = newInstitutionUrl.trim(); const name = newInstitutionName.trim(); if (url && name) { setFormData(prev => ({ ...prev, institution_photo: [...prev.institution_photo, { url, name }] })); setNewInstitutionUrl(''); setNewInstitutionName(''); } else toast({ variant: 'destructive', title: 'Missing information', description: 'Please provide both institution name and URL.' }); }} className="whitespace-nowrap border-neutral-200 text-neutral-700 hover:bg-neutral-50">Add</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { if (!newInstitutionName.trim()) { toast({ variant: 'destructive', title: 'Missing name', description: 'Enter institution name first.' }); return; } setInstitutionCropperOpen(true); }} className="whitespace-nowrap border-neutral-200 text-neutral-700 hover:bg-neutral-50"><CropIcon className="h-4 w-4 mr-1.5" />Crop</Button>
              </div>
            </div>
          </SectionCard>

          {/* Availability */}
          <SectionCard title="Availability schedule" description="Toggle the days you're available, then pick your time slots.">
            <ScheduleSelector schedule={schedule} setSchedule={handleScheduleChange} timezoneLabel={timezoneLabel} />
          </SectionCard>

          {/* Danger zone */}
          <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 sm:p-8">
            <div className="border-b border-red-100 pb-4 mb-6">
              <h2 className="text-lg font-bold text-red-700">Danger zone</h2>
              <p className="text-sm text-neutral-500 mt-1">Permanently delete your account and data.</p>
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-neutral-600 max-w-md">Deleting your account removes your profile and login permanently. This cannot be undone.</p>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(true)} className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4 mr-1.5" />Delete account
              </Button>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pb-2">

            {SaveButton}
          </div>
        </div>
      </motion.div>

      {BasicInfoDialog}
      <ImageCropper open={profileCropperOpen} onOpenChange={setProfileCropperOpen} onCropComplete={handleProfileImageCropped} aspectRatio={1} circularCrop={true} title="Crop profile photo" description="Adjust your profile photo to fit perfectly in a circle." />
      <ImageCropper open={institutionCropperOpen} onOpenChange={setInstitutionCropperOpen} onCropComplete={handleInstitutionImageCropped} aspectRatio={16 / 9} circularCrop={false} title="Crop institution logo" description="Adjust the institution logo for best display." />

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteConfirmText(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete your account?</DialogTitle>
            <DialogDescription>This permanently deletes your profile, CV, and login from our systems. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm space-y-1.5">
                <p>Upcoming meetings will be cancelled and the other person notified by email (their token is refunded if they're the requester). Pending requests you received are rejected and the requester notified; pending requests you sent are simply withdrawn, no email.</p>
                <p>If you have a past meeting with an unsubmitted feedback form, you must submit it before you can delete your account.</p>
                <p>Your profile data will be removed from our database and your login will be deleted — you won't be able to log in again with this email.</p>
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label className={LABEL}>Type <span className="font-mono font-semibold">DELETE</span> to confirm</Label>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className={INPUT} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeletingAccount}>Cancel</Button>
            <Button onClick={handleDeleteAccount} disabled={isDeletingAccount || deleteConfirmText.trim() !== 'DELETE'} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeletingAccount ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : 'Delete my account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}