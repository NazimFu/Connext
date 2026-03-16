//app/mentor/forms/page.tsx

'use client';

import { useState, KeyboardEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from "../../../lib/firebase";
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Tag Input Component - allows adding items by pressing Enter or comma
interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder: string;
  accentColor: string;
}

function TagInput({ tags, setTags, placeholder, accentColor }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const colorClasses: Record<string, { bg: string; text: string; border: string; hover: string }> = {
    yellow: { bg: 'bg-yellow-100', text: 'text-black', border: 'border-yellow-300', hover: 'hover:bg-yellow-200' },
    amber: { bg: 'bg-yellow-100', text: 'text-black', border: 'border-yellow-300', hover: 'hover:bg-yellow-200' },
  };

  const colors = colorClasses[accentColor] || colorClasses.yellow;

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
    <div className="tag-input-container">
      <div className={`flex flex-wrap gap-2 p-3 bg-white border border-gray-300 rounded-lg focus-within:border-black focus-within:bg-white transition-all min-h-[52px]`}>
        {tags.map((tag, index) => (
          <span
            key={index}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${colors.bg} ${colors.text} rounded text-sm font-medium animate-tag-in`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className={`w-4 h-4 rounded-full flex items-center justify-center ${colors.hover} transition-colors`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.replace(',', ''))}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : 'Add more...'}
          className="flex-1 min-w-[150px] bg-transparent border-0 outline-none text-gray-900 placeholder-gray-400"
        />
      </div>
      <p className="mt-2 text-xs text-gray-600 flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-[10px] font-mono">Enter</kbd>
        <span>or</span>
        <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-[10px] font-mono">,</kbd>
        <span>to add</span>
      </p>
    </div>
  );
}

// Days of the week for the schedule
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Time slots preset options
const TIME_PRESETS = [
  { label: 'Morning', times: ['09:00', '10:00', '11:00'] },
  { label: 'Afternoon', times: ['13:00', '14:00', '15:00', '16:00'] },
  { label: 'Evening', times: ['18:00', '19:00', '20:00'] },
];

export default function MentorFormPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  
  // Verification code flow
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [signupId, setSignupId] = useState('');
  const [countdown, setCountdown] = useState(120);
  const [canResend, setCanResend] = useState(false);

  // Schedule state - using a map for easier manipulation
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});

  // Form data state matching the comprehensive form structure
  const [formData, setFormData] = useState({
    mentor_name: '',
    phone_number: '',
    current_institution: '',
    institution_website: '',
    institution_photos: [] as string[],
    biography: '',
    specializations: [] as string[],
    consultation_fields: [] as string[],
    experience: [] as string[],
    skills: [] as string[],
    achievements: [] as string[],
    linkedin: '',
    github: '',
  });

  // Photo URL input state
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  
  // Load credentials from sessionStorage
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('mentor_signup_email');
    const storedPassword = sessionStorage.getItem('mentor_signup_password');
    
    if (!storedEmail || !storedPassword) {
      router.push('/signup/mentor_secret');
      return;
    }
    
    setEmail(storedEmail);
    setPassword(storedPassword);
  }, [router]);
  
  // Countdown timer
  useEffect(() => {
    if (showVerification && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
  }, [showVerification, countdown, canResend]);
  
  const formatCountdownTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addPhoto = () => {
    if (photoUrlInput.trim() && !formData.institution_photos.includes(photoUrlInput.trim())) {
      setFormData(prev => ({
        ...prev,
        institution_photos: [...prev.institution_photos, photoUrlInput.trim()]
      }));
      setPhotoUrlInput('');
    }
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      institution_photos: prev.institution_photos.filter((_, i) => i !== index)
    }));
  };

  // Schedule functions
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

  const [customTimeInput, setCustomTimeInput] = useState<Record<string, string>>({});

  const addCustomTime = (day: string) => {
    const time = customTimeInput[day];
    if (time) {
      toggleTimeSlot(day, time);
      setCustomTimeInput(prev => ({ ...prev, [day]: '' }));
    }
  };

  // Convert schedule to API format
  const getAvailableSlotsForAPI = () => {
    return Object.entries(schedule)
      .filter(([_, times]) => times.length > 0)
      .map(([day, time]) => ({ day, time }));
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow navigation between sections
    if (activeSection !== sections.length - 1) {
      setActiveSection(activeSection + 1);
    }
  };

  const handleCompleteProfile = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      // Send verification code with all mentor data
      const response = await fetch('/api/auth/send-signup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.mentor_name,
          email,
          password,
          role: 'mentor',
          mentor_name: formData.mentor_name,
          phone_number: formData.phone_number,
          current_institution: formData.current_institution,
          institution_website: formData.institution_website,
          institution_photos: formData.institution_photos,
          biography: formData.biography,
          specializations: formData.specializations,
          consultation_fields: formData.consultation_fields,
          experience: formData.experience,
          skills: formData.skills,
          achievements: formData.achievements,
          available_slots: getAvailableSlotsForAPI(),
          linkedin: formData.linkedin,
          github: formData.github,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send verification code');
      }
      
      console.log('[MENTOR-FORMS] Signup code sent:', result);
      
      setSignupId(result.signupId);
      setShowVerification(true);
      setCountdown(120);
      setCanResend(false);
      
      // Success message can be shown via toast if available
      console.log('Verification code sent successfully');

    } catch (error) {
      console.error('Submit error:', error);
      setError(error instanceof Error ? error.message : 'Failed to send verification code');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 4) {
      setError('Please enter the 4-digit verification code.');
      return;
    }
    
    setIsVerifying(true);
    setError('');
    
    try {
      console.log('[MENTOR-FORMS] Verifying code:', { signupId, code: verificationCode });
      
      // Step 1: Verify the code
      const response = await fetch('/api/auth/verify-signup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signupId,
          code: verificationCode.trim()
        }),
      });
      
      const result = await response.json();
      console.log('[MENTOR-FORMS] Verification response:', result);
      
      if (!response.ok) {
        console.error('[MENTOR-FORMS] Verification failed:', result);
        throw new Error(result.error || 'Failed to verify code');
      }
      
      // Step 2: Create Firebase authentication account
      console.log('[MENTOR-FORMS] Creating Firebase account...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (!userCredential.user?.uid) {
        throw new Error('Failed to create user account');
      }

      const user = userCredential.user;
      console.log('[MENTOR-FORMS] Firebase account created:', user.uid);

      // Step 3: Create mentor profile in Azure Cosmos DB using /api/users
      console.log('[MENTOR-FORMS] Creating mentor profile in database...');
      const profileResponse = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          role: 'mentor',
          mentor_name: formData.mentor_name,
          phone_number: formData.phone_number,
          mentor_photo: '',
          institution_photo: formData.institution_photos,
          specialization: formData.specializations,
          field_of_consultation: formData.consultation_fields,
          biography: formData.biography,
          experience: formData.experience,
          skills: formData.skills,
          achievement: formData.achievements,
          available_slots: getAvailableSlotsForAPI(),
          linkedin: formData.linkedin,
          github: formData.github,
        }),
      });

      if (!profileResponse.ok) {
        const errorData = await profileResponse.json();
        throw new Error(errorData.message || 'Failed to create mentor profile in database');
      }

      const profileResult = await profileResponse.json();
      console.log('[MENTOR-FORMS] Mentor profile created:', profileResult);
      
      // Step 4: Clear sessionStorage
      sessionStorage.removeItem('mentor_signup_email');
      sessionStorage.removeItem('mentor_signup_password');
      
      setSuccessMessage('Profile completed successfully!');
      setShowSuccessDialog(true);
      
      // Redirect to verification pending page after a longer delay to show success message
      setTimeout(() => {
        router.push('/mentor/verification-pending');
      }, 3500);
    } catch (error) {
      console.error('Failed to verify code:', error);
      setError(error instanceof Error ? error.message : 'Failed to verify code.');
    } finally {
      setIsVerifying(false);
    }
  };
  
  const handleResendCode = async () => {
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/send-signup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.mentor_name,
          email,
          password,
          role: 'mentor',
          mentor_name: formData.mentor_name,
          phone_number: formData.phone_number,
          current_institution: formData.current_institution,
          institution_website: formData.institution_website,
          institution_photos: formData.institution_photos,
          biography: formData.biography,
          specializations: formData.specializations,
          consultation_fields: formData.consultation_fields,
          experience: formData.experience,
          skills: formData.skills,
          achievements: formData.achievements,
          available_slots: getAvailableSlotsForAPI(),
          linkedin: formData.linkedin,
          github: formData.github,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to resend code');
      }
      
      setSignupId(result.signupId);
      setCountdown(120);
      setCanResend(false);
      
      console.log('Code resent successfully');
    } catch (error) {
      console.error('Failed to resend code:', error);
      setError(error instanceof Error ? error.message : 'Failed to resend code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', icon: '👤' },
    { id: 'photos', label: 'Photos', icon: '📸' },
    { id: 'bio', label: 'Biography', icon: '📝' },
    { id: 'expertise', label: 'Expertise', icon: '🎯' },
    { id: 'background', label: 'Background', icon: '💼' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        .mentor-form-container {
          font-family: 'Inter', sans-serif;
        }
        
        .mentor-form-container h1,
        .mentor-form-container h2 {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
        }
        
        .form-input {
          transition: border-color 0.2s ease, background-color 0.2s ease;
        }
        
        .form-input:focus {
          border-color: #000;
          background-color: #fff;
        }
        
        .section-card {
          animation: fadeIn 0.3s ease-out forwards;
          opacity: 0;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes tag-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        .animate-tag-in {
          animation: tag-in 0.2s ease-out forwards;
        }
        
        .nav-item {
          transition: background-color 0.2s ease, color 0.2s ease;
        }
        
        .nav-item:hover {
          background-color: #fef3c7;
        }
        
        .nav-item.active {
          background-color: #fbbf24;
          color: #000;
          font-weight: 600;
        }
        
        .progress-bar {
          transition: width 0.5s ease;
        }
        
        .floating-label {
          transition: color 0.2s ease;
        }
        
        .input-group:focus-within .floating-label {
          color: #000;
          font-weight: 600;
        }
        
        .time-slot-btn {
          transition: all 0.15s ease;
        }
        
        .time-slot-btn:hover {
          background-color: #fef3c7;
        }
        
        .time-slot-btn.selected {
          background-color: #fbbf24;
          color: #000;
        }
        
        .day-row {
          transition: all 0.2s ease;
        }
        
        .preset-btn {
          transition: background-color 0.2s ease;
        }
        
        .preset-btn:hover {
          background-color: #fef3c7;
        }
        
        .photo-card {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
      
      <div className="mentor-form-container min-h-screen bg-white">
        <div className="relative max-w-6xl mx-auto px-4 py-8 lg:py-12">
          {/* Header */}
          <div className="text-center mb-10 lg:mb-14">
            <h1 className="text-3xl lg:text-4xl font-bold text-black mb-2 tracking-tight">
              Build Your Mentor Profile
            </h1>
            <p className="text-gray-600 text-base max-w-xl mx-auto leading-relaxed">
              Share your expertise and connect with mentees seeking guidance in their journey.
            </p>
          </div>

          {/* Progress indicator */}
          <div className="mb-8 max-w-2xl mx-auto">
            <div className="flex justify-between text-sm text-gray-600 mb-3">
              <span>Profile Completion</span>
              <span className="font-semibold text-black">
                {Math.round(((activeSection + 1) / sections.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="progress-bar h-full bg-yellow-400 rounded-full"
                style={{ width: `${((activeSection + 1) / sections.length) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="mb-8 max-w-2xl mx-auto p-4 bg-white border-l-4 border-black rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-black text-xl font-bold">!</span>
                <p className="text-black font-medium">{error}</p>
              </div>
            </div>
          )}

          {showVerification ? (
            // Verification Code Section
            <div className="max-w-md mx-auto">
              <div className="bg-white rounded-lg p-8 border border-gray-200">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
                    📧
                  </div>
                  <h2 className="text-2xl font-bold text-black mb-2">Verify Your Email</h2>
                  <p className="text-gray-600">
                    We've sent a 4-digit verification code to <strong>{email}</strong>
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="verification" className="block text-sm font-medium text-black mb-2">
                      Verification Code
                    </label>
                    <input
                      id="verification"
                      type="text"
                      maxLength={4}
                      placeholder="Enter 4-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black tracking-widest text-center text-lg"
                      disabled={isVerifying}
                    />
                    <div className="mt-2 text-center">
                      {countdown > 0 ? (
                        <p className="text-sm text-gray-500">
                          Code expires in {formatCountdownTime(countdown)}
                        </p>
                      ) : (
                        <p className="text-sm text-red-600">Code has expired</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={isVerifying || verificationCode.length !== 4}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify Code'}
                  </button>

                  {canResend && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={isSubmitting}
                      className="w-full text-sm text-gray-600 hover:text-black transition-colors"
                    >
                      {isSubmitting ? 'Sending...' : 'Resend verification code'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col lg:flex-row gap-8">{/* Side navigation */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="lg:sticky lg:top-8 bg-white rounded-lg p-4 border border-gray-200">
                <nav className="space-y-1">
                  {sections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(index)}
                      className={`nav-item w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${
                        activeSection === index 
                          ? 'active text-black' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-lg">{section.icon}</span>
                      <span className="font-medium text-sm">{section.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Main form area */}
            <div className="flex-1 min-w-0">
              <form onSubmit={handleSubmit}>
                {/* Basic Information Section */}
                {activeSection === 0 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        👤
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Basic Information</h2>
                        <p className="text-gray-600 text-sm">Let's start with the essentials</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          Full Name <span className="text-yellow-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.mentor_name}
                          onChange={(e) => setFormData({...formData, mentor_name: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="John Doe"
                          required
                        />
                      </div>

                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          Phone Number <span className="text-yellow-600">*</span>
                        </label>
                        <input
                          type="tel"
                          value={formData.phone_number}
                          onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="+1 (555) 000-0000"
                          required
                        />
                      </div>

                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          Current Institution <span className="text-yellow-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.current_institution}
                          onChange={(e) => setFormData({...formData, current_institution: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="MIT, Stanford, Google..."
                          required
                        />
                      </div>

                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          Institution Website
                        </label>
                        <input
                          type="url"
                          value={formData.institution_website}
                          onChange={(e) => setFormData({...formData, institution_website: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="https://institution.edu"
                        />
                      </div>

                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          LinkedIn Profile
                        </label>
                        <input
                          type="url"
                          value={formData.linkedin}
                          onChange={(e) => setFormData({...formData, linkedin: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="https://linkedin.com/in/yourprofile"
                        />
                      </div>

                      <div className="input-group">
                        <label className="floating-label block text-sm font-medium text-black mb-2">
                          GitHub Profile
                        </label>
                        <input
                          type="url"
                          value={formData.github}
                          onChange={(e) => setFormData({...formData, github: e.target.value})}
                          className="form-input w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          placeholder="https://github.com/yourusername"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Institution Photos Section */}
                {activeSection === 1 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        📸
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Institution Photos</h2>
                        <p className="text-gray-600 text-sm">Showcase your workplace</p>
                      </div>
                    </div>
                    
                    {/* Add photo URL input */}
                    <div className="mb-6">
                      <div className="flex gap-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔗</span>
                          <input
                            type="url"
                            value={photoUrlInput}
                            onChange={(e) => setPhotoUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPhoto();
                              }
                            }}
                            placeholder="Paste image URL and press Enter..."
                            className="form-input w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addPhoto}
                          className="px-6 py-3 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-[10px] font-mono">Enter</kbd>
                        <span>to add photo URL</span>
                      </p>
                    </div>

                    {/* Photo grid */}
                    {formData.institution_photos.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {formData.institution_photos.map((photo, index) => (
                          <div key={index} className="photo-card group relative bg-gray-100 border border-gray-200 rounded-lg overflow-hidden aspect-video">
                            <img 
                              src={photo} 
                              alt={`Institution photo ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12">Invalid URL</text></svg>';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <button
                              type="button"
                              onClick={() => removePhoto(index)}
                              className="absolute top-2 right-2 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-gray-800"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 border border-gray-300 rounded-lg bg-gray-50">
                        <div className="text-4xl mb-3">🖼️</div>
                        <p className="text-gray-900 font-medium">No photos added yet</p>
                        <p className="text-gray-600 text-sm">Add URLs to showcase your institution</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Biography Section */}
                {activeSection === 2 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        📝
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Your Story</h2>
                        <p className="text-gray-600 text-sm">Tell mentees about yourself</p>
                      </div>
                    </div>
                    
                    <div className="input-group">
                      <label className="floating-label block text-sm font-medium text-black mb-2">
                        Biography <span className="text-yellow-600">*</span>
                      </label>
                      <textarea
                        value={formData.biography}
                        onChange={(e) => setFormData({...formData, biography: e.target.value})}
                        rows={8}
                        className="form-input w-full px-4 py-4 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black resize-none"
                        placeholder="Share your journey, what drives you, and why you're passionate about mentoring. What unique perspective can you offer to mentees?"
                        required
                      />
                      <p className="mt-3 text-sm text-gray-600 flex items-center gap-2">
                        <span className="text-lg">💡</span>
                        Tip: Include your background, key experiences, and what makes you excited to mentor others.
                      </p>
                    </div>
                  </div>
                )}

                {/* Expertise Section */}
                {activeSection === 3 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        🎯
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Your Expertise</h2>
                        <p className="text-gray-600 text-sm">What you can help with</p>
                      </div>
                    </div>
                    
                    {/* Specializations */}
                    <div className="mb-10">
                      <h3 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-yellow-100 border border-gray-300 rounded flex items-center justify-center text-sm">✨</span>
                        Specializations
                      </h3>
                      <TagInput
                        tags={formData.specializations}
                        setTags={(tags) => setFormData(prev => ({ ...prev, specializations: tags }))}
                        placeholder="Type a specialization (e.g., Machine Learning, Data Science)"
                        accentColor="yellow"
                      />
                    </div>

                    {/* Consultation Fields */}
                    <div>
                      <h3 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-yellow-100 border border-gray-300 rounded flex items-center justify-center text-sm">💬</span>
                        Consultation Areas
                      </h3>
                      <TagInput
                        tags={formData.consultation_fields}
                        setTags={(tags) => setFormData(prev => ({ ...prev, consultation_fields: tags }))}
                        placeholder="Type a consultation area (e.g., Career Guidance, Technical Mentoring)"
                        accentColor="amber"
                      />
                    </div>
                  </div>
                )}

                {/* Background Section */}
                {activeSection === 4 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        💼
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Background</h2>
                        <p className="text-gray-600 text-sm">Experience, skills & achievements</p>
                      </div>
                    </div>
                    
                    {/* Experience */}
                    <div className="mb-10">
                      <h3 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-yellow-100 border border-gray-300 rounded flex items-center justify-center text-sm">📊</span>
                        Experience
                      </h3>
                      <TagInput
                        tags={formData.experience}
                        setTags={(tags) => setFormData(prev => ({ ...prev, experience: tags }))}
                        placeholder="Type an experience (e.g., 5 years at Google, PhD in CS)"
                        accentColor="yellow"
                      />
                    </div>

                    {/* Skills */}
                    <div className="mb-10">
                      <h3 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-yellow-100 border border-gray-300 rounded flex items-center justify-center text-sm">⚡</span>
                        Skills
                      </h3>
                      <TagInput
                        tags={formData.skills}
                        setTags={(tags) => setFormData(prev => ({ ...prev, skills: tags }))}
                        placeholder="Type a skill (e.g., Python, Leadership, System Design)"
                        accentColor="amber"
                      />
                    </div>

                    {/* Achievements */}
                    <div>
                      <h3 className="text-base font-semibold text-black mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-yellow-100 border border-gray-300 rounded flex items-center justify-center text-sm">🏆</span>
                        Achievements
                      </h3>
                      <TagInput
                        tags={formData.achievements}
                        setTags={(tags) => setFormData(prev => ({ ...prev, achievements: tags }))}
                        placeholder="Type an achievement (e.g., Published research, Won hackathon)"
                        accentColor="yellow"
                      />
                    </div>
                  </div>
                )}

                {/* Schedule Section - Completely Redesigned */}
                {activeSection === 5 && (
                  <div className="section-card bg-white rounded-lg p-6 lg:p-8 border border-gray-200">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center text-xl">
                        📅
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-black">Availability</h2>
                        <p className="text-gray-600 text-sm">Click time slots to toggle your availability</p>
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="mb-6 flex gap-4 flex-wrap">
                      <div className="px-4 py-2 bg-yellow-100 border border-gray-300 rounded-lg">
                        <span className="text-black font-semibold">
                          {Object.values(schedule).flat().length} slots selected
                        </span>
                      </div>
                      <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg">
                        <span className="text-black font-medium">
                          {Object.keys(schedule).length} days active
                        </span>
                      </div>
                    </div>
                    
                    {/* Schedule grid */}
                    <div className="space-y-4">
                      {DAYS_OF_WEEK.map((day) => {
                        const daySlots = schedule[day] || [];
                        const isActive = daySlots.length > 0;
                        
                        return (
                          <div 
                            key={day} 
                            className={`day-row rounded-lg border transition-all ${
                              isActive 
                                ? 'border-yellow-300 bg-yellow-50' 
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            {/* Day header */}
                            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-sm ${
                                  isActive 
                                    ? 'bg-yellow-400 text-black' 
                                    : 'bg-gray-300 text-white'
                                }`}>
                                  {day.slice(0, 2)}
                                </div>
                                <div>
                                  <h4 className="font-semibold text-black">{day}</h4>
                                  <p className="text-xs text-gray-600">
                                    {daySlots.length > 0 
                                      ? `${daySlots.length} time${daySlots.length > 1 ? 's' : ''} selected` 
                                      : 'No times selected'}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Quick actions */}
                              <div className="flex items-center gap-2">
                                {TIME_PRESETS.map(preset => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => addPresetTimes(day, preset.times)}
                                    className="preset-btn px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded text-black hover:bg-gray-100"
                                  >
                                    + {preset.label}
                                  </button>
                                ))}
                                {isActive && (
                                  <button
                                    type="button"
                                    onClick={() => clearDaySlots(day)}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {/* Time slots grid */}
                            <div className="p-4">
                              <div className="flex flex-wrap gap-2 mb-4">
                                {/* Common time slots */}
                                {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'].map(time => {
                                  const isSelected = daySlots.includes(time);
                                  const hour = parseInt(time.split(':')[0]);
                                  const period = hour < 12 ? 'AM' : 'PM';
                                  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                  
                                  return (
                                    <button
                                      key={time}
                                      type="button"
                                      onClick={() => toggleTimeSlot(day, time)}
                                      className={`time-slot-btn px-3 py-2 rounded text-sm font-medium transition-all ${
                                        isSelected
                                          ? 'selected bg-yellow-400 text-black'
                                          : 'bg-white border border-gray-300 text-gray-700 hover:border-black hover:bg-gray-50'
                                      }`}
                                    >
                                      {displayHour}:00 {period}
                                    </button>
                                  );
                                })}
                              </div>
                              
                              {/* Custom time input */}
                              <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                <span className="text-sm text-gray-600">Custom time:</span>
                                <input
                                  type="time"
                                  value={customTimeInput[day] || ''}
                                  onChange={(e) => setCustomTimeInput(prev => ({ ...prev, [day]: e.target.value }))}
                                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-black bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => addCustomTime(day)}
                                  disabled={!customTimeInput[day]}
                                  className="px-3 py-1.5 bg-yellow-400 text-black rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-500 transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                              
                              {/* Selected times summary */}
                              {daySlots.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-600 mb-2">Selected times:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {daySlots.sort().map(time => {
                                      const hour = parseInt(time.split(':')[0]);
                                      const minute = time.split(':')[1];
                                      const period = hour < 12 ? 'AM' : 'PM';
                                      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                      
                                      return (
                                        <span
                                          key={time}
                                          className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-200 text-black rounded text-xs font-medium"
                                        >
                                          {displayHour}:{minute} {period}
                                          <button
                                            type="button"
                                            onClick={() => toggleTimeSlot(day, time)}
                                            className="hover:text-black/70"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Navigation & Submit */}
                <div className="mt-8 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
                    className={`px-6 py-3 rounded-lg font-medium transition-all ${
                      activeSection === 0 
                        ? 'opacity-0 pointer-events-none' 
                        : 'bg-gray-200 text-black hover:bg-gray-300 border border-gray-400'
                    }`}
                  >
                    ← Previous
                  </button>

                  <div className="flex gap-3">
                    {activeSection < sections.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setActiveSection(activeSection + 1)}
                        className="px-8 py-3 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-all"
                      >
                        Continue →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCompleteProfile}
                        disabled={isSubmitting}
                        className="w-full px-6 py-4 bg-black text-white font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isSubmitting ? 'Completing...' : 'Complete Profile'}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
}