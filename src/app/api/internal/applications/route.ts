import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function GET() {
  try {
    // Fetch all mentee applications
    const menteeContainer = database.container('mentee');
    const menteeQuery = {
      query: "SELECT * FROM c ORDER BY c._ts DESC"
    };
    const { resources: mentees } = await menteeContainer.items.query(menteeQuery).fetchAll();

    // Fetch all mentor applications  
    const mentorContainer = database.container('mentor');
    const mentorQuery = {
      query: "SELECT * FROM c ORDER BY c._ts DESC"
    };
    const { resources: mentors } = await mentorContainer.items.query(mentorQuery).fetchAll();

    // Transform mentee data to match interface
    const formattedMentees = mentees.map(mentee => ({
      id: mentee.id,
      menteeUID: mentee.menteeUID,
      name: mentee.name || '',
      mentee_name: mentee.mentee_name || mentee.name || '',
      mentee_email: mentee.mentee_email || mentee.email || '',
      mentee_age: mentee.mentee_age || mentee.age || '',
      mentee_occupation: mentee.mentee_occupation || mentee.occupation || '',
      mentee_institution: mentee.mentee_institution || mentee.institution || '',
      personal_statement: mentee.personal_statement || '',
      _attachments: mentee.attachmentPath || mentee._attachments || '',
      verification_status: mentee.verificationStatus || 'not-submitted',
      createdAt: new Date(mentee._ts * 1000).toISOString(),
      reviewedBy: mentee.reviewedBy,
      reviewedAt: mentee.reviewedAt,
      reviewNotes: mentee.reviewNotes
    }));

    // Transform mentor data to match interface
    const formattedMentors = mentors.map(mentor => ({
      id: mentor.id,
      mentorUID: mentor.mentorUID,
      mentor_name: mentor.mentor_name || '',
      mentor_email: mentor.mentor_email || '',
      mentor_ic: mentor.mentor_ic || '',
      mentor_phone: mentor.mentor_phone || '',
      mentor_gender: mentor.mentor_gender || '',
      mentor_address: mentor.mentor_address || '',
      mentor_dob: mentor.mentor_dob || '',
      mentor_company: mentor.mentor_company || '',
      mentor_position: mentor.mentor_position || '',
      mentor_experience: mentor.mentor_experience || '',
      mentor_expertise: mentor.mentor_expertise || [],
      mentor_bio: mentor.mentor_bio || '',
      mentor_linkedin: mentor.mentor_linkedin || '',
      mentor_github: mentor.mentor_github || '',
      mentor_portfolio: mentor.mentor_portfolio || '',
      mentor_hourly_rate: mentor.mentor_hourly_rate || 0,
      mentor_availability: mentor.mentor_availability || [],
      verification_status: mentor.verificationStatus || 'not-submitted',
      createdAt: new Date(mentor._ts * 1000).toISOString(),
      reviewedBy: mentor.reviewedBy,
      reviewedAt: mentor.reviewedAt,
      reviewNotes: mentor.reviewNotes
    }));

    return NextResponse.json({
      mentees: formattedMentees,
      mentors: formattedMentors,
      summary: {
        totalMentees: formattedMentees.length,
        totalMentors: formattedMentors.length,
        pendingMentees: formattedMentees.filter(m => m.verification_status === 'pending' || m.verification_status === 'not-submitted').length,
        pendingMentors: formattedMentors.filter(m => m.verification_status === 'pending' || m.verification_status === 'not-submitted').length,
        approvedMentees: formattedMentees.filter(m => m.verification_status === 'approved').length,
        approvedMentors: formattedMentors.filter(m => m.verification_status === 'approved').length,
        rejectedMentees: formattedMentees.filter(m => m.verification_status === 'rejected').length,
        rejectedMentors: formattedMentors.filter(m => m.verification_status === 'rejected').length
      }
    });

  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}