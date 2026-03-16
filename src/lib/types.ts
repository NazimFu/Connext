
export type BookedSlot = {
  id: string;
  date: string; // "2025-09-16"
  time: string; // "00:00"
  meetingId: string;
  status: "pending" | "accepted";
  expiresAt: Date; // 2 hours after scheduled time in Malaysia timezone
  bookedAt: Date; // when the slot was booked
};

export type Scheduling = {
  meetingId: string;
  date: string;
  time: string;
  decision: 'pending' | 'accepted' | 'declined';
  scheduled_status: 'upcoming' | 'past' | 'cancelled';
  message: string;
  meetingLink?: string; // Assuming meetingLink might still be needed

  // Fields present in either Mentee's or Mentor's schedule
  mentorUID?: string;
  menteeUID?: string;
  mentor_name?: string;
  mentee_name?: string;
  mentor_email?: string;
  mentee_email?: string;

  // Optional fields with default null/none values in the database
  feedback_form?: any | null;
  report_status?: 'none' | 'pending' | 'resolved' | null;
  report_reason?: string | null;
  cancel_info?: any | null;
  
  // Report filed by role tracking (legacy fields)
  report_filed_by_role?: 'mentor' | 'mentee' | null;
  report_filed_by_uid?: string | null;
  report_filed_at?: string | null;
  report_target_role?: 'mentor' | 'mentee' | null;
  report_target_uid?: string | null;
  report_review_notes?: string | null;
  report_reviewed_at?: string | null;
  report_reviewed_by?: string | null;
  
  // New structured report objects
  mentor_report?: {
    status: 'pending' | 'resolved';
    reason: string | null;
    filed_by_uid: string | null;
    filed_at: string | null;
    target_role: 'mentee';
    target_uid: string | null;
    review_notes: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
  } | null;
  
  mentee_report?: {
    status: 'pending' | 'resolved';
    reason: string | null;
    filed_by_uid: string | null;
    filed_at: string | null;
    target_role: 'mentor';
    target_uid: string | null;
    review_notes: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
  } | null;
};


export type User = {
  id: string;
  menteeUID?: string; // Optional, only for mentees
  name: string;
  email: string;
  image?: string;
  role: 'mentee' | 'mentor' | 'staff';
  verified: boolean;
  verificationStatus: 'not-submitted' | 'pending' | 'just-approved' | 'approved' | 'rejected';
  tokens: number;
  scheduling?: Scheduling[];
  linkedin?: string;
  github?: string;
  cv_link?: string;
  attachmentPath?: string;
  allowCVShare?: boolean;
};

export type Mentee = {
  id: string;
  name: string;
  email: string;
  menteeUID: string;
  mentee_name: string;
  mentee_email: string;
  mentee_age: string;
  mentee_occupation: string;
  mentee_institution: string;
  role: string;
  verified: boolean;
  verificationStatus: 'not-submitted' | 'pending' | 'just-approved' | 'approved' | 'rejected';
  tokens: number;
  attachmentPath?: string;
  allowCVShare?: boolean;
  linkedin_url?: string;
  personal_statement?: string;
  scheduling?: Scheduling[];
  favorite_mentors?: string[]; // Array of mentor UIDs
  requested_mentors?: string[]; // Array of mentor UIDs previously requested
};

export type InstitutionPhoto = {
  url: string;
  name: string;
};

export type Mentor = {
  id: string;
  mentorUID: string;
  mentor_name: string;
  mentor_email: string;
  mentor_photo: string;
  institution_photo: (string | InstitutionPhoto)[];
  role: string;
  specialization: string[] | string;
  field_of_consultation: string[] | string;
  biography: string;
  experience: string[] | string;
  skills: string[] | string;
  achievement: string[] | string;
  verified: boolean;
  verificationStatus: 'not-submitted' | 'pending' | 'just-approved' | 'approved' | 'rejected';
  tokens: number;
  linkedin: string;
  github: string;
  available_slots: {
    day: string;
    time: string[];
  }[];
  scheduling: Scheduling[];
};

export type MeetingRequest = {
  id: string;
  mentee_name: string;
  mentorUID: string;
  dateTime: Date;
  message: string;
  status: 'pending' | 'approved' | 'declined';
  meetingLink?: string;
};

export type Verification = {
    id: string;
    userId: string;
    userName:string;
    documentType: 'CV' | 'Essay' | 'MOU';
    submittedAt: Date;
};

export type MeetingHistory = {
  id: string;
  mentee_name: string;
  mentorUID: string;
  dateTime: Date;
  duration: number; // in minutes
  topic: string;
  rating?: number; // 1-5 stars
  notes?: string;
};

export type MentorAnalytics = {
  mentorUID: string;
  totalMeetings: number;
  totalHours: number;
  averageRating: number;
  monthlyMeetings: { month: string; count: number }[];
  topicsDiscussed: { topic: string; count: number }[];
};

export type UserRoleResponse = {
  role: string | null;
  error: string;
};
