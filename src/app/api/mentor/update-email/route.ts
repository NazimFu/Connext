import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { database } from '@/lib/cosmos';

export async function POST(request: Request) {
  try {
    const { mentorId, newEmail, googleVerifiedEmail } = await request.json();

    if (!mentorId || !newEmail) {
      return NextResponse.json(
        { message: 'Mentor ID and new email are required' },
        { status: 400 }
      );
    }

    // Verify that the new email matches the Google-verified email
    if (newEmail !== googleVerifiedEmail) {
      return NextResponse.json(
        { message: 'Email mismatch. Please authenticate with the email you want to use.' },
        { status: 400 }
      );
    }

    const mentorContainer = database.container('mentor');

    // First, check if the new email is already in use by another mentor
    const checkQuery = {
      query: 'SELECT * FROM c WHERE c.mentor_email = @email AND c.mentorUID != @mentorId',
      parameters: [
        { name: '@email', value: newEmail },
        { name: '@mentorId', value: mentorId },
      ],
    };

    const { resources: existingMentors } = await mentorContainer.items
      .query(checkQuery)
      .fetchAll();

    if (existingMentors.length > 0) {
      return NextResponse.json(
        { message: 'This email is already associated with another mentor account' },
        { status: 409 }
      );
    }

    // Find the mentor document
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.mentorUID = @mentorId',
      parameters: [{ name: '@mentorId', value: mentorId }],
    };

    const { resources: mentors } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentors.length === 0) {
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    const mentor = mentors[0];
    const oldEmail = mentor.mentor_email;

    // Update the email
    mentor.mentor_email = newEmail;
    mentor.email_updated_at = new Date().toISOString();
    mentor.email_verified_via = 'google_oauth';

    // Replace the document
    await mentorContainer.item(mentor.id, mentor.mentorUID).replace(mentor);

    return NextResponse.json({
      message: 'Email updated successfully',
      oldEmail,
      newEmail,
    });
  } catch (error) {
    console.error('Failed to update mentor email:', error);
    return NextResponse.json(
      { message: 'Failed to update email', error: (error as Error).message },
      { status: 500 }
    );
  }
}