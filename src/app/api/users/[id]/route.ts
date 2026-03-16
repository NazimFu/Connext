import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE_ID!);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();
    
    console.log('PATCH /api/users/[id] - ID:', id);
    console.log('PATCH /api/users/[id] - Body:', body);

    // First, try to find the user in the mentee container
    const menteeContainer = database.container('mentee');
    console.log('Querying mentee container for user:', id);
    
    let user: any = null;
    let container: any = null;
    let partitionKeyValue = id;

    try {
      const menteeQuery = {
        query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id OR c.mentee_uid = @id',
        parameters: [{ name: '@id', value: id }]
      };
      
      const { resources: menteeResults } = await menteeContainer.items.query(menteeQuery).fetchAll();
      
      if (menteeResults && menteeResults.length > 0) {
        user = menteeResults[0];
        container = menteeContainer;
        partitionKeyValue = user.menteeUID || user.mentee_uid || user.id;
        console.log('User found in mentee container');
      }
    } catch (error) {
      console.log('User not in mentee container, trying mentor...');
    }

    // If not found in mentee, try mentor container
    if (!user) {
      console.log('Trying mentor container...');
      const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
      
      try {
        const mentorQuery = {
          query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
          parameters: [{ name: '@id', value: id }]
        };
        
        const { resources: mentorResults } = await mentorContainer.items.query(mentorQuery).fetchAll();
        
        if (mentorResults && mentorResults.length > 0) {
          user = mentorResults[0];
          container = mentorContainer;
          partitionKeyValue = user.mentorUID || user.id;
          console.log('User found in mentor container');
        }
      } catch (error) {
        console.error('Error querying mentor container:', error);
      }
    }

    if (!user || !container) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    console.log('Updating user in container:', container.id);

    // Update user fields - include ALL fields from the request body
    const fieldsToUpdate = [
      'mentor_name',
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
      'available_slots',  // Make sure this is included!
      'personal_statement',
      'verificationStatus',
      'mentor_photo',
      'name',
      'mentee_age',
      'mentee_occupation',
      'mentee_institution',
      'linkedin',
      'github',
      'cv_link',
      'mentee_name',
      'role'
    ];

    // Update only fields that are present in the request body
    fieldsToUpdate.forEach(field => {
      if (body[field] !== undefined) {
        console.log(`Updated field: ${field}`, body[field]);
        user[field] = body[field];
      }
    });

    // Update the updatedAt timestamp
    user.updatedAt = new Date().toISOString();

    console.log('Replacing document with partition key:', partitionKeyValue);
    console.log('Updated user object:', user);

    // Replace the document
    const { resource: updatedUser } = await container
      .item(user.id, partitionKeyValue)
      .replace(user);

    console.log('User updated successfully');

    return NextResponse.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { 
        message: 'Failed to update user',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;

    console.log('GET /api/users/[id] - ID:', id);

    // Query both containers in parallel for better performance
    const menteeContainer = database.container('mentee');
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);

    const strippedId = id.startsWith('mentee_') ? id.replace('mentee_', '') : null;

    const menteeQuerySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id OR c.mentee_uid = @id',
      parameters: [{ name: '@id', value: id }]
    };

    const mentorQuerySpec = strippedId ? {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id OR c.id = @strippedId OR c.mentorUID = @strippedId',
      parameters: [
        { name: '@id', value: id },
        { name: '@strippedId', value: strippedId }
      ]
    } : {
      query: 'SELECT * FROM c WHERE c.id = @id OR c.mentorUID = @id',
      parameters: [{ name: '@id', value: id }]
    };

    // Execute both queries in parallel
    const [menteeResult, mentorResult] = await Promise.allSettled([
      menteeContainer.items.query(menteeQuerySpec).fetchAll(),
      mentorContainer.items.query(mentorQuerySpec).fetchAll()
    ]);

    // Check mentee results
    if (menteeResult.status === 'fulfilled' && menteeResult.value.resources && menteeResult.value.resources.length > 0) {
      console.log('User found in mentee container');
      return NextResponse.json(menteeResult.value.resources[0], {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        }
      });
    }

    // Check mentor results
    if (mentorResult.status === 'fulfilled' && mentorResult.value.resources && mentorResult.value.resources.length > 0) {
      console.log('User found in mentor container');
      const mentor = mentorResult.value.resources[0];
      return NextResponse.json({
        ...mentor,
        // Map mentor fields to mentee-like fields for consistent UI display
        mentee_name: mentor.mentor_name,
        mentee_email: mentor.mentor_email || mentor.email,
        mentee_institution: mentor.mentor_institution || mentor.institution,
        mentee_occupation: mentor.field_of_consultation 
          ? (Array.isArray(mentor.field_of_consultation) 
              ? mentor.field_of_consultation.join(', ') 
              : mentor.field_of_consultation)
          : mentor.mentor_occupation,
        mentee_age: mentor.mentor_age || null,
        linkedin: mentor.linkedin || mentor.mentor_linkedin,
        github: mentor.github || mentor.mentor_github,
        cv_link: mentor.cv_link || mentor._attachments,
        isMentorAsMentee: true,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        }
      });
    }

    // Log errors if any
    if (menteeResult.status === 'rejected') {
      console.error('Error querying mentee container:', menteeResult.reason);
    }
    if (mentorResult.status === 'rejected') {
      console.error('Error querying mentor container:', mentorResult.reason);
    }

    return NextResponse.json(
      { message: 'User not found' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { message: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;

    console.log('DELETE /api/users/[id] - ID:', id);

    // Try mentee container
    try {
      const menteeContainer = database.container('mentee');
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.id = @id OR c.menteeUID = @id',
        parameters: [{ name: '@id', value: id }]
      };
      
      const { resources } = await menteeContainer.items.query(querySpec).fetchAll();
      
      if (resources && resources.length > 0) {
        const user = resources[0];
        const partitionKeyValue = user.menteeUID || user.id;
        await menteeContainer.item(user.id, partitionKeyValue).delete();
        console.log('User deleted from mentee container');
        return NextResponse.json({ message: 'User deleted successfully' });
      }
    } catch (error: any) {
      console.error('Error deleting from mentee container:', error);
    }

    // Try mentor container
    try {
      const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
      await mentorContainer.item(id, id).delete();
      console.log('User deleted from mentor container');
      return NextResponse.json({ message: 'User deleted successfully' });
    } catch (error: any) {
      if (error.code !== 404) {
        console.error('Error deleting from mentor container:', error);
      }
    }

    return NextResponse.json(
      { message: 'User not found' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { message: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
