import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const { menteeId, currentEmail, newEmail } = await request.json();

    // Validate input
    if (!menteeId || !currentEmail || !newEmail) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Get mentee document
    const menteeContainer = database.container('mentee');
    const { resource: mentee } = await menteeContainer.item(menteeId, menteeId).read();

    if (!mentee) {
      return NextResponse.json(
        { message: 'Mentee not found' },
        { status: 404 }
      );
    }

    // Verify current email matches
    const existingEmail = String(mentee.email || mentee.mentee_email || '').toLowerCase();
    if (existingEmail !== currentEmail.toLowerCase()) {
      return NextResponse.json(
        { message: 'Current email does not match' },
        { status: 400 }
      );
    }

    // Generate 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Update mentee document with verification data
    mentee.emailVerification = {
      newEmail: newEmail.toLowerCase(),
      code: verificationCode,
      expiresAt,
      createdAt: Date.now()
    };

    await menteeContainer.item(menteeId, menteeId).replace(mentee);

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: newEmail,
      subject: 'Email Verification Code - Connext',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Email Verification</h2>
          <p>Hello,</p>
          <p>You requested to change your email address. Please use the verification code below:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #EAB308; font-size: 36px; letter-spacing: 8px; margin: 0;">${verificationCode}</h1>
          </div>
          <p style="color: #666;">This code will expire in <strong>5 minutes</strong>.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">If you didn't request this change, please ignore this email.</p>
        </div>
      `,
    });

    console.log('Verification code sent to:', newEmail);

    return NextResponse.json(
      { message: 'Verification code sent successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error sending verification code:', error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Failed to send verification code',
        error: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
