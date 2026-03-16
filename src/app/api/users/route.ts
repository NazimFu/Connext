import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { User, Mentor } from '@/lib/types';

// Helper function to transform available_slots to availability format
function transformAvailabilitySlots(slots: Array<{ day: string; time: string[] }>) {
  return slots.reduce((acc, slot) => {
    acc[slot.day] = slot.time;
    return acc;
  }, {} as Record<string, string[]>);
}

// Create a new user (mentee or mentor)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uid, email, role } = body;

    if (!uid || !email) {
      return NextResponse.json({ message: 'UID and email are required' }, { status: 400 });
    }

    if (role === 'mentor') {
      const {
        mentor_name,
        mentor_photo,
        institution_photo,
        specialization,
        field_of_consultation,
        biography,
        experience,
        skills,
        achievement,
        available_slots,
        linkedin,
        github
      } = body;

      // Generate unique mentee ID for the mentor
      const menteeId = `mentee_${uid}`;

      // Create mentor profile in mentor container with mentee_id reference
      const mentorContainer = database.container('mentor');
      
      const newMentor = {
        id: uid,
        mentorUID: uid,
        mentor_name: mentor_name || '',
        mentor_email: email,
        mentor_photo: mentor_photo || '',
        institution_photo: institution_photo || [],
        role: 'mentor',
        specialization: specialization || [],
        field_of_consultation: field_of_consultation || [],
        biography: biography || '',
        experience: experience || [],
        skills: skills || [],
        achievement: achievement || [],
        available_slots: available_slots || [],
        linkedin: linkedin || '',
        github: github || '',
        scheduling: [],
        tokens: 3, // Initialize with 3 tokens
        mentee_id: menteeId, // Store the mentee ID reference for booking capabilities
        createdAt: new Date().toISOString()
      };

      const { resource: createdMentor } = await mentorContainer.items.create(newMentor);
      
      if (!createdMentor) {
        throw new Error('Failed to create mentor record');
      }

      // Return mentor info with mentee_id
      const userResponse = {
        id: createdMentor.id,
        name: createdMentor.mentor_name,
        email: createdMentor.mentor_email,
        image: createdMentor.mentor_photo,
        role: 'mentor',
        verified: true,
        verificationStatus: 'approved',
        tokens: 3,
        mentee_id: menteeId // Include mentee ID in response
      };

      return NextResponse.json({
        success: true,
        user: userResponse,
        message: 'Mentor profile created successfully'
      }, { status: 201 });

    } else {
      // Handle regular mentee creation
      const { 
        name, 
        mentee_age, 
        mentee_occupation, 
        mentee_institution, 
        linkedin, 
        github, 
        menteeUID,
        attachmentPath,
        allowCVShare,
        linkedin_url,
        personal_statement
      } = body;

      const menteeContainer = database.container('mentee');

      const newMentee = {
        id: uid,
        menteeUID: menteeUID || uid,
        mentee_uid: menteeUID || uid,
        name,
        email,
        mentee_name: name,
        mentee_email: email,
        mentee_age: mentee_age || '',
        mentee_occupation: mentee_occupation || '',
        mentee_institution: mentee_institution || '',
        linkedin: linkedin || '',
        github: github || '',
        attachmentPath: attachmentPath || '',
        allowCVShare: allowCVShare || false,
        linkedin_url: linkedin_url || '',
        personal_statement: personal_statement || '',
        role: 'mentee',
        verified: false,
        verificationStatus: 'not-submitted',
        tokens: 3,
        createdAt: new Date().toISOString()
      };

      console.log('[API-USERS] Creating mentee with attachmentPath:', attachmentPath || 'NONE');

      const { resource: createdMentee } = await menteeContainer.items.create(newMentee);

      if (!createdMentee) {
        throw new Error('Failed to create mentee record');
      }

      const userResponse: User = {
        id: createdMentee.id,
        name: createdMentee.name,
        email: createdMentee.email,
        role: createdMentee.role,
        verified: createdMentee.verified,
        verificationStatus: createdMentee.verificationStatus,
        tokens: createdMentee.tokens,
      };

      return NextResponse.json({
        success: true,
        user: userResponse
      }, { status: 201 });
    }

  } catch (error) {
    console.error('Failed to create user', error);
    return NextResponse.json({ 
      success: false,
      message: 'Failed to create user', 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
