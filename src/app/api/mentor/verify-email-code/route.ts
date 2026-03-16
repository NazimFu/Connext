import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE_ID!);
const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);

export async function POST(request: NextRequest) {
  try {
    const { mentorId, newEmail, code } = await request.json();

    // Validate input
    if (!mentorId || !newEmail || !code) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Verifying code for mentor:', mentorId);

    // Get mentor document
    const { resource: mentor } = await mentorContainer.item(mentorId, mentorId).read();
    
    if (!mentor) {
      return NextResponse.json(
        { message: 'Mentor not found' },
        { status: 404 }
      );
    }

    // Check if verification data exists
    if (!mentor.emailVerification) {
      return NextResponse.json(
        { message: 'Verification code not found. Please request a new code.' },
        { status: 404 }
      );
    }

    const verification = mentor.emailVerification;

    // Check if code is expired
    const now = Date.now();
    if (now > verification.expiresAt) {
      // Clear expired verification data
      delete mentor.emailVerification;
      await mentorContainer.item(mentorId, mentorId).replace(mentor);
      
      return NextResponse.json(
        { message: 'Verification code has expired. Please request a new code.' },
        { status: 400 }
      );
    }

    // Verify email matches
    if (verification.newEmail.toLowerCase() !== newEmail.toLowerCase()) {
      return NextResponse.json(
        { message: 'Email does not match the verification request.' },
        { status: 400 }
      );
    }

    // Verify code
    if (verification.code.trim() !== code.trim()) {
      console.log('Code mismatch:', { expected: verification.code, received: code });
      return NextResponse.json(
        { message: 'Invalid verification code. Please check and try again.' },
        { status: 400 }
      );
    }

    // Update email and clear verification data
    mentor.mentor_email = newEmail;
    delete mentor.emailVerification;
    
    await mentorContainer.item(mentorId, mentorId).replace(mentor);

    console.log('Email successfully updated for mentor:', mentorId);

    return NextResponse.json(
      { 
        message: 'Email updated successfully',
        newEmail: newEmail 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error verifying email code:', error);
    return NextResponse.json(
      { 
        message: error instanceof Error ? error.message : 'Failed to verify code',
        error: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}