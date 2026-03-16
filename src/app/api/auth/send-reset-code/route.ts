import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { sendEmail } from '@/lib/email';
import { generateVerificationCode, saveVerificationCode } from '@/lib/verification-codes';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    // Verify user exists in either mentee or mentor table
    let userExists = false;
    let userName = '';

    try {
      // Check mentee table
      const menteeContainer = database.container('mentee');
      const menteeQuery = {
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }]
      };
      const { resources: mentees } = await menteeContainer.items.query(menteeQuery).fetchAll();
      
      if (mentees.length > 0) {
        userExists = true;
        userName = mentees[0].mentee_name || 'User';
      }
    } catch (error) {
      console.log('Error checking mentee table:', error);
    }

    if (!userExists) {
      try {
        // Check mentor table - use environment variable for container name
        const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
        const mentorQuery = {
          query: 'SELECT * FROM c WHERE c.mentor_email = @email',
          parameters: [{ name: '@email', value: email }]
        };
        const { resources: mentors } = await mentorContainer.items.query(mentorQuery).fetchAll();
        
        if (mentors.length > 0) {
          userExists = true;
          userName = mentors[0].mentor_name || 'User';
        }
      } catch (error) {
        console.log('Error checking mentor table:', error);
      }
    }

    if (!userExists) {
      return NextResponse.json(
        { message: 'No account found with this email address' },
        { status: 404 }
      );
    }

    // Generate verification code
    const code = generateVerificationCode();

    // Store code in database
    await saveVerificationCode(email.toLowerCase(), code, 10);

    // Send email
    await sendEmail({
      to: email,
      subject: 'Password Reset Verification Code - CONNEXT',
      template: 'password-reset-code',
      data: {
        userName,
        verificationCode: code,
        expiresIn: '10 minutes',
      },
    });

    return NextResponse.json(
      { message: 'Verification code sent to your email' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending reset code:', error);
    return NextResponse.json(
      { message: 'Failed to send verification code. Please try again.' },
      { status: 500 }
    );
  }
}
