import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, subject, message } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ message: 'Message is required' }, { status: 400 });
    }

    const destination = process.env.EMAIL_USER;
    if (!destination) {
      console.error('[contact] EMAIL_USER not configured — cannot deliver contact message');
      return NextResponse.json({ message: 'Contact form is not configured' }, { status: 500 });
    }

    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';

    await sendEmail({
      to: destination,
      subject: trimmedSubject ? `[CONNEXT Contact] ${trimmedSubject}` : `[CONNEXT Contact] Message from ${name || email}`,
      template: 'contact-message',
      data: {
        name: name || 'A user',
        email,
        role: role || 'unknown',
        subject: trimmedSubject,
        message: message.trim(),
      },
      replyTo: email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[contact] Failed to send contact message:', error);
    return NextResponse.json({ message: 'Failed to send message' }, { status: 500 });
  }
}
