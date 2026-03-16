import { NextRequest, NextResponse } from 'next/server';
import { verifyCode, deleteVerificationCode } from '@/lib/verification-codes';

// Note: This endpoint verifies the code and returns success.
// The actual password reset must be done client-side using Firebase's updatePassword
// Or you can install firebase-admin for server-side password updates

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Validate password only if provided
    if (newPassword && newPassword.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Verify code
    const isValid = await verifyCode(email, code);
    
    if (!isValid) {
      return NextResponse.json(
        { message: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Delete verification code after successful verification
    await deleteVerificationCode(email);

    return NextResponse.json(
      { 
        message: 'Verification successful',
        email,
        verified: true
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in reset password:', error);
    return NextResponse.json(
      { message: 'Failed to process request. Please try again.' },
      { status: 500 }
    );
  }
}

declare global {
  var firebaseAdmin: any;
}
