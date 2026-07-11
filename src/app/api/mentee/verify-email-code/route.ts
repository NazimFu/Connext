import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { updateFirebaseAuthEmail } from '@/lib/server/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { menteeId, newEmail, code } = await request.json();

    // Validate input
    if (!menteeId || !newEmail || !code) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Verifying code for mentee:', menteeId);

    // Get mentee document
    const menteeContainer = database.container('mentee');
    const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();

    if (!mentee) {
      return NextResponse.json(
        { message: 'Mentee not found' },
        { status: 404 }
      );
    }

    // Check if verification data exists
    if (!mentee.emailVerification) {
      return NextResponse.json(
        { message: 'Verification code not found. Please request a new code.' },
        { status: 404 }
      );
    }

    const verification = mentee.emailVerification;

    // Check if code is expired
    const now = Date.now();
    if (now > verification.expiresAt) {
      // Clear expired verification data
      delete mentee.emailVerification;
      await menteeContainer.item(menteeId, menteeId).replace(mentee);

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

    try {
      await updateFirebaseAuthEmail(menteeId, newEmail);
    } catch (firebaseError: any) {
      console.error('Failed to update Firebase Auth email for mentee:', firebaseError);
      return NextResponse.json(
        {
          message: firebaseError?.message || 'Failed to update Firebase Auth email',
          error: process.env.NODE_ENV === 'development' ? String(firebaseError) : undefined,
        },
        { status: 400 }
      );
    }

    // Update email and clear verification data
    mentee.email = newEmail;
    mentee.mentee_email = newEmail;
    delete mentee.emailVerification;

    await menteeContainer.item(menteeId, menteeId).replace(mentee);

    console.log('Email successfully updated for mentee:', menteeId);

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
