
import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { Mentor } from '@/lib/types';

// A helper function to convert time strings from HH:mm to hh:mm AM/PM format
function convertTo12HourFormat(time24: string): string {
  if (!time24 || !time24.includes(':')) {
    return 'Invalid Time';
  }
  const [hours, minutes] = time24.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12; // Convert 0 to 12
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

export async function GET() {
  try {
    const mentorContainer = database.container('mentor');
    
    // Query to get only approved mentors
    const querySpec = {
      query: "SELECT * FROM c WHERE c.verificationStatus = @status OR c.verified = @verified",
      parameters: [
        { name: "@status", value: "approved" },
        { name: "@verified", value: true }
      ]
    };
    
    const { resources: items } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();
    
    // Return the raw mentor data with correct field names
    const mentors = items.map((item: any) => ({
      id: item.id,
      mentorUID: item.mentorUID,
      mentor_name: item.mentor_name,
      mentor_email: item.mentor_email,
      mentor_photo: item.mentor_photo,
      institution_photo: item.institution_photo || [],
      role: item.role,
      specialization: item.specialization || [],
      field_of_consultation: item.field_of_consultation || [],
      biography: item.biography,
      experience: item.experience || [],
      skills: item.skills || [],
      achievement: item.achievement || [],
      available_slots: item.available_slots || [],
      scheduling: item.scheduling || [],
      _rid: item._rid,
      _self: item._self,
      _etag: item._etag,
      _attachments: item._attachments,
      _ts: item._ts
    }));

    return NextResponse.json(mentors);
  } catch (error) {
    console.error('Failed to fetch mentors from Cosmos DB', error);
    return NextResponse.json({ message: "Failed to fetch mentors", error: (error as Error).message }, { status: 500 });
  }
}
