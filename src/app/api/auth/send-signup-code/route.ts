// src/app/api/auth/send-signup-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = client.database(process.env.COSMOS_DB_DATABASE!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      email, 
      password, 
      role = 'mentee',
      // Mentee fields
      mentee_age,
      mentee_occupation,
      mentee_institution,
      linkedin,
      github,
      cv_link,           // ← primary field name
      attachmentPath,    // ← legacy fallback (keep accepting both)
      allowCVShare,
      linkedin_url,
      personal_statement,
      // Mentor fields
      mentor_name,
      phone_number,
      current_institution,
      institution_website,
      institution_photos,
      biography,
      specializations,
      consultation_fields,
      experience,
      skills,
      achievements,
      available_slots
    } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Validate email format before touching the DB or sending anything
    // RFC 5322-ish regex — rejects obvious invalids like "abc", "abc@", "@abc.com"
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(String(email).trim())) {
      return NextResponse.json(
        { error: 'Email address is invalid. Please check and try again.' },
        { status: 400 }
      );
    }

    // Resolve cv_link — accept either field name from the frontend
    const resolvedCvLink = cv_link || attachmentPath || '';

    // Select container based on role
    const containerName = role === 'mentor' 
      ? process.env.COSMOS_DB_CONTAINER_ID! 
      : process.env.COSMOS_DB_CONTAINER_MENTEE!;
    const container = database.container(containerName);

    const signupId = crypto.randomUUID();
    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

    const now = Date.now();
    const baseDocument = {
      id: signupId,
      type: 'temp_signup',
      email: String(email).toLowerCase().trim(),
      password: String(password),
      name: String(name).trim(),
      role: String(role),
      code: verificationCode,
      expiresAt: now + 10 * 60 * 1000,
      createdAt: now,
    };

    // Add role-specific fields
    const document = role === 'mentor' ? {
      ...baseDocument,
      mentorUID: signupId,
      mentor_name: mentor_name || '',
      phone_number: phone_number || '',
      current_institution: current_institution || '',
      institution_website: institution_website || '',
      institution_photos: institution_photos || [],
      biography: biography || '',
      specializations: specializations || [],
      consultation_fields: consultation_fields || [],
      experience: experience || [],
      skills: skills || [],
      achievements: achievements || [],
      available_slots: available_slots || [],
      linkedin: linkedin || '',
      github: github || ''
    } : {
      ...baseDocument,
      menteeUID: signupId,
      mentee_age: mentee_age || '',
      mentee_occupation: mentee_occupation || '',
      mentee_institution: mentee_institution || '',
      linkedin: linkedin || '',
      github: github || '',
      cv_link: resolvedCvLink,        // ← stored as cv_link
      attachmentPath: resolvedCvLink, // ← also stored as attachmentPath for legacy compat
      allowCVShare: allowCVShare || false,
      linkedin_url: linkedin_url || '',
      personal_statement: personal_statement || ''
    };

    // ── Send email FIRST before writing anything to the DB ──────────────────
    // This way, if the email address is invalid or delivery fails, no orphan
    // temp_signup document is left in Cosmos.
    console.log(`[SEND-CODE] Attempting email delivery to: ${email}`);
    try {
      await sendEmail({
        to: email,
        subject: 'Your CONNEXT Verification Code',
        template: 'signup-verification-code',
        data: {
          userName: name || 'User',
          verificationCode: verificationCode,
          expiresIn: '10 minutes',
        },
      });
    } catch (emailErr: any) {
      console.error('[SEND-CODE] Email delivery failed — not writing to DB:', emailErr.message);

      // Nodemailer surfaces invalid-address errors in responseCode / response
      const msg: string = emailErr.message || '';
      const isInvalidAddress =
        emailErr.responseCode === 550 ||
        emailErr.responseCode === 553 ||
        msg.includes('invalid') ||
        msg.includes('Invalid') ||
        msg.includes('does not exist') ||
        msg.includes('unknown user') ||
        msg.includes('bad destination') ||
        msg.includes('550') ||
        msg.includes('553');

      return NextResponse.json(
        {
          error: isInvalidAddress
            ? 'Email address is invalid. Please check and try again.'
            : 'Failed to send verification email. Please try again.',
          details: emailErr.message,
        },
        { status: 400 }
      );
    }

    // ── Email delivered — now safe to write the temp document ─────────────
    console.log(`[SEND-CODE] Email sent. Creating temp_signup for ${role}:`, {
      signupId,
      email: document.email,
      role: document.role,
      containerName,
      cv_link: role === 'mentee' ? resolvedCvLink || 'NOT PROVIDED' : 'N/A'
    });

    const { resource: created } = await container.items.create(document);
    console.log(`[SEND-CODE] Document created successfully:`, created?.id);

    return NextResponse.json({
      success: true,
      signupId,
      message: 'Code sent',
      debug: { containerName, role }
    });

  } catch (err: any) {
    console.error('send-signup-code error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });

    return NextResponse.json(
      {
        error: 'Failed to create temporary signup',
        details: err.message,
      },
      { status: 500 }
    );
  }
}