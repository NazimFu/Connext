import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function GET(request: NextRequest) {
  try {
    const container = database.container('mentor');

    // Fetch ALL mentors that are either approved or verified, using broad criteria
    const querySpec = {
      query: `SELECT * FROM c WHERE 
        c.verificationStatus = 'approved' 
        OR c.verified = true
        OR c.verificationStatus = 'just-approved'`,
      parameters: []
    };

    const { resources: mentors } = await container.items
      .query(querySpec)
      .fetchAll();

    if (!mentors || mentors.length === 0) {
      return NextResponse.json({
        success: false,
        mentors: [],
        message: 'No approved mentors found'
      });
    }

    const featuredMentors = mentors.map((mentor: any) => {
      // Normalize institution_photo: handle both string[] and {url, name}[] formats
      let normalizedPhotos: { url: string; name: string }[] = [];

      if (Array.isArray(mentor.institution_photo)) {
        normalizedPhotos = mentor.institution_photo
          .filter(Boolean)
          .map((photo: any) => {
            if (typeof photo === 'string' && photo.trim()) {
              return { url: photo.trim(), name: 'Institution' };
            }
            if (typeof photo === 'object' && photo?.url) {
              return { url: photo.url, name: photo.name || 'Institution' };
            }
            return null;
          })
          .filter(Boolean) as { url: string; name: string }[];
      }

      return {
        id: mentor.id || mentor.mentorUID,
        mentorUID: mentor.mentorUID,
        name: mentor.mentor_name || 'Unknown Mentor',
        expertise: Array.isArray(mentor.field_of_consultation)
          ? mentor.field_of_consultation.join(', ')
          : mentor.field_of_consultation || 'General Consultation',
        image: mentor.mentor_photo || '',
        hint: `mentor ${(mentor.mentor_name || 'professional').toLowerCase()}`,
        institution_photo: normalizedPhotos,
      };
    });

    return NextResponse.json({
      success: true,
      mentors: featuredMentors
    });

  } catch (error) {
    console.error('Error fetching featured mentors:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch mentors',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}