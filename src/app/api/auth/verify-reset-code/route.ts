import { NextRequest, NextResponse } from 'next/server';
import { verifyCode } from '@/lib/verification-codes';

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Verify code using shared verification service
    const isValid = await verifyCode(email, code);

    if (!isValid) {
      return NextResponse.json(
        { message: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Code verified successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error verifying reset code:', error);
    return NextResponse.json(
      { message: 'Failed to verify code. Please try again.' },
      { status: 500 }
    );
  }
}
