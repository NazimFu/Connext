import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE_ID!);
const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mentorId = searchParams.get('mentorId');

    if (!mentorId) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
      parameters: [{ name: '@id', value: mentorId }]
    };

    const { resources } = await mentorContainer.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    return NextResponse.json(resources[0], {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error('Error fetching mentor profile:', error);
    return NextResponse.json(
      { message: 'Failed to fetch mentor profile', error: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('PATCH /api/mentor/profile - Body:', body);

    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
      parameters: [{ name: '@id', value: id }]
    };

    const { resources } = await mentorContainer.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    const mentor = resources[0];
    const partitionKeyValue = mentor.mentorUID || mentor.id;

    // Fields allowed to be updated (including timezone)
    const fieldsToUpdate = [
      'mentor_name',
      'mentor_email',
      'mentor_photo',
      'phone_number',
      'current_institution',
      'institution_website',
      'institution_photo',
      'biography',
      'specialization',
      'field_of_consultation',
      'experience',
      'skills',
      'achievement',
      'available_slots',
      'linkedin',
      'github',
      'cv_link',
      'allowCVShare',
      'timezone',           // ← new field
    ];

    let hasChanges = false;
    fieldsToUpdate.forEach(field => {
      if (updateData[field] !== undefined) {
        mentor[field] = updateData[field];
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      return NextResponse.json({ message: 'No fields to update' }, { status: 400 });
    }

    mentor.updatedAt = new Date().toISOString();

    const { resource: updatedMentor } = await mentorContainer
      .item(mentor.id, partitionKeyValue)
      .replace(mentor);

    return NextResponse.json({
      message: 'Profile updated successfully',
      mentor: updatedMentor
    });

  } catch (error: any) {
    console.error('Error updating mentor profile:', error);
    return NextResponse.json(
      { message: 'Failed to update mentor profile', error: error.message },
      { status: 500 }
    );
  }
}