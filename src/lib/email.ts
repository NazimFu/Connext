import nodemailer from 'nodemailer';
import { convertMeetingTime, DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/lib/timezone';

interface EmailParams {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatIsoForEmail = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return escapeHtml(value);
  }

  return escapeHtml(
    parsed.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  );
};

const renderFeedbackResponses = (responses: unknown): string => {
  if (!Array.isArray(responses) || responses.length === 0) {
    return `
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        Feedback was submitted, but no response details were included in the webhook payload.
      </p>
    `;
  }

  const renderedResponses = responses
    .map((response) => {
      const item = response as { question?: unknown; answer?: unknown };
      const question = escapeHtml(item.question);
      const answer = escapeHtml(item.answer);

      return `
        <div style="padding: 16px 0; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${question}</p>
          <p style="margin: 0; color: #374151; font-size: 14px; white-space: pre-wrap;">${answer || '<em>No answer provided</em>'}</p>
        </div>
      `;
    })
    .join('');

  return `
    <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 0 20px;">
      ${renderedResponses}
    </div>
  `;
};

const getTimezoneDisplayLabel = (timezone?: string): string => {
  if (!timezone || timezone === DEFAULT_TIMEZONE) {
    return 'MYT';
  }

  const option = TIMEZONE_OPTIONS.find((item) => item.value === timezone);
  if (option) {
    return `${option.label} (${option.offset})`;
  }

  return timezone;
};

const renderMeetingTimeDetails = (
  date: unknown,
  time: unknown,
  timezone?: unknown
): string => {
  if (typeof date !== 'string' || typeof time !== 'string' || !date || !time) {
    return '';
  }

  const recipientTimezone = typeof timezone === 'string' && timezone.trim()
    ? timezone.trim()
    : DEFAULT_TIMEZONE;

  try {
    const mytDisplay = convertMeetingTime(date, time, DEFAULT_TIMEZONE);

    if (recipientTimezone === DEFAULT_TIMEZONE) {
      return `<p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${escapeHtml(`${mytDisplay.displayDateFull} at ${mytDisplay.displayTime}`)} (MYT)</p>`;
    }

    const localDisplay = convertMeetingTime(date, time, recipientTimezone);
    const timezoneLabel = escapeHtml(getTimezoneDisplayLabel(recipientTimezone));

    return `
      <p style="margin: 8px 0; color: #374151;"><strong>MYT:</strong> ${escapeHtml(`${mytDisplay.displayDateFull} at ${mytDisplay.displayTime}`)}</p>
      <p style="margin: 8px 0; color: #374151;"><strong>Your time (${timezoneLabel}):</strong> ${escapeHtml(`${localDisplay.displayDateFull} at ${localDisplay.displayTime}`)}</p>
    `;
  } catch {
    return `<p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${escapeHtml(`${date} ${time}`)} (MYT)</p>`;
  }
};

const renderGoogleMeetAccountNotice = (): string => `
  <div style="background: linear-gradient(135deg, #fef9c3 0%, #fde68a 100%); padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 700;">Important Google Meet note</p>
    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
      Please make sure your Google Meet account uses the same email address linked to your Connext account.
      If you use an Outlook or other email address, you can still join - just create or sign in to a Google account with that same email first.
    </p>
  </div>
`;

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://connext-platform.vercel.app';
const LOGIN_URL = `${SITE_URL}/login`;
const SUPPORT_EMAIL = 'luminiktyo@gmail.com';

/** Standard footer: copyright + a link back to the site, with room for extra links. */
const renderFooter = (extra: string = ''): string => `
  <p style="margin: 0 0 10px 0;">© 2026 CONNEXT. All rights reserved.${extra}</p>
  <p style="margin: 0;"><a href="${LOGIN_URL}" style="color: #d97706; text-decoration: none; font-weight: 600;">Visit Connext →</a></p>
`;

export async function sendEmail({
  to,
  subject,
  template,
  data,
  replyTo,
  attachments = [],
}: EmailParams): Promise<void> {
  console.log('📧 sendEmail called with:', { to, subject, template });
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.error('❌ EMAIL_USER or EMAIL_PASSWORD not configured!');
    throw new Error('Email credentials not configured');
  }

  console.log(`✅ Email credentials found: ${process.env.EMAIL_USER}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const emailTemplates: Record<string, (data: any) => string> = {
    'mentor-meeting-request': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔔 New Meeting Request</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">You've got a new meeting request from <strong>${data.menteeName}</strong>. They're hoping to meet with you on the details below.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Meeting Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName} (${data.menteeEmail})</p>
          ${data.message ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Message:</strong><br/>${data.message}</p>` : ''}
        </div>

        <p style="font-size: 15px; margin: 0 0 8px 0; color: #374151;">If you're available, you can accept the request below. If the timing doesn't work, you can decline it instead.</p>

        ${data.acceptUrl && data.declineUrl ? `
        <div style="text-align: center; margin: 28px 0;">
          <a href="${escapeHtml(data.acceptUrl)}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px; margin: 0 8px 8px 0;">✅ Accept Request</a>
          <a href="${escapeHtml(data.declineUrl)}" style="display: inline-block; background: #ffffff; color: #dc2626; text-decoration: none; font-weight: 600; padding: 10px 26px; border-radius: 8px; border: 2px solid #dc2626; margin: 0 8px 8px 0;">❌ Decline Request</a>
        </div>
        <p style="font-size: 13px; color: #9ca3af; text-align: center; margin: 0 0 24px 0;">Clicking a button takes you to a confirmation page — nothing is decided until you confirm there.</p>
        ` : ''}

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Just a heads-up: this request will expire if no decision is made within the acceptance window. Prefer to look it over first? You can also <a href="${LOGIN_URL}" style="color: #d97706; text-decoration: none; font-weight: 600;">log in to your dashboard</a> and respond from there.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Thanks for being part of Connext 💛<br/>Connext Team</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-meeting-accepted': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🎉 Your Meeting Is Confirmed</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Good news — <strong>${data.mentorName}</strong> accepted your meeting request.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Meeting Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #10b981; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>

        <p style="font-size: 16px; margin: 0 0 16px 0; color: #374151;">You're all set! You can view the meeting details and anything else you need from your schedule:</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/dashboard" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">View Meeting Details</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Looking forward to seeing you there!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'mentee-meeting-declined': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">Your Meeting Request Wasn't Accepted</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Just a quick update — <strong>${data.mentorName}</strong> wasn't able to accept your meeting request.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📅 Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>

        <p style="font-size: 15px; margin: 0 0 16px 0; color: #374151;">No worries. Schedules can be tricky, and this doesn't mean you can't connect with someone else. 💰 Your token has already been refunded, so you can send a new request whenever you're ready.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/mentor-listing" style="display: inline-block; background: #ef4444; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Find Another Mentor</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Good luck, and we hope you find a great match!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'mentee-meeting-no-response': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⏳ No Mentor Response</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Sadly, we did not receive a response from <strong>${data.mentorName}</strong> in time.</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">💰 Your token has been returned to you. No fret, you can still request a mentor again.</p>
      `,
      renderFooter()
    ),

    'mentee-ban-lifted': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔓 Your Account Has Been Unfrozen</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The restriction on your Connext account has been lifted, and you now have full access to the platform again.</p>

        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">Your account was previously restricted following a report. That review has now concluded and the restriction has been removed.</p>
        </div>

        ${data.notes ? `<p style="font-size: 14px; color: #6b7280; margin: 0 0 16px 0;">${escapeHtml(data.notes)}</p>` : ''}

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0;">You're welcome to log in and pick up right where you left off.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${LOGIN_URL}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Log In to Connext</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'token-replenished': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">💰 Your Token Has Been Replenished!</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.userName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Good news — your token has been replenished, and you're ready to request another mentoring session whenever you like.</p>

        ${data.date && data.time ? `
        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Completed Session:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
        </div>
        ` : ''}

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0;">Whenever you're ready, head over and find a mentor to connect with.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/mentor-listing" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Find a Mentor</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'mentee-report-approved-penalty': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⚠️ Important: Your Account Has Been Frozen</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">We're writing to let you know that a report concerning your Connext account has been reviewed by our team and approved.</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">As a result, your account has been frozen and you will no longer be able to use the platform while this restriction is in place.</p>

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📋 Action Taken:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Reason:</strong> ${data.reason || 'Policy violation'}</p>
          ${data.adminNotes ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Admin Notes:</strong> ${data.adminNotes}</p>` : ''}
        </div>

        <p style="font-size: 16px; margin: 0 0 16px 0; color: #374151;"><strong>What this means:</strong> you won't be able to access any part of Connext — including requesting or attending meetings — while your account is frozen, and your token will not be returned for this cycle.</p>

        <p style="font-size: 16px; margin: 0 0 24px 0; color: #374151;">If you believe this decision was made in error or you'd like to ask about it, please contact our team at <a href="mailto:${SUPPORT_EMAIL}" style="color: #d97706; text-decoration: none; font-weight: 600;">${SUPPORT_EMAIL}</a>.</p>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">We understand that receiving an email like this can be frustrating, but we want to make sure Connext remains a safe and respectful space for everyone.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'mentor-report-accepted': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">✅ Your Report Has Been Reviewed</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The report you filed about <strong>${data.menteeName || 'a mentee'}</strong> has been reviewed by our team and approved. Action has been taken on their account.</p>

        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📋 Report Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName || 'N/A'}</p>
          ${data.reportReason ? `<p style="margin: 8px 0; color: #374151;"><strong>Your reported reason:</strong> ${escapeHtml(data.reportReason)}</p>` : ''}
          ${data.reviewNotes ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Review Notes:</strong> ${escapeHtml(data.reviewNotes)}</p>` : ''}
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Thanks for helping us keep Connext a safe and respectful space for everyone.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'mentor-report-rejected': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">Your Report Has Been Reviewed</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The report you filed about <strong>${data.menteeName || 'a mentee'}</strong> has been reviewed by our team. After looking into it, we've decided not to take action on their account.</p>

        <div style="background: #f3f4f6; padding: 24px; border-radius: 8px; margin: 24px 0;">
          <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px;">📋 Report Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName || 'N/A'}</p>
          ${data.reportReason ? `<p style="margin: 8px 0; color: #374151;"><strong>Your reported reason:</strong> ${escapeHtml(data.reportReason)}</p>` : ''}
          ${data.reviewNotes ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Review Notes:</strong> ${escapeHtml(data.reviewNotes)}</p>` : ''}
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">If you have more information or believe this decision was made in error, please reach out to our team at <a href="mailto:${SUPPORT_EMAIL}" style="color: #d97706; text-decoration: none; font-weight: 600;">${SUPPORT_EMAIL}</a>.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'meeting-cancelled-by-mentor': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">Your Mentoring Session Has Been Cancelled</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.recipientName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Just a heads-up — <strong>${data.mentorName}</strong> has cancelled ${data.isForMentee ? 'your' : 'the'} mentoring session.</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Cancelled Meeting Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          ${data.reason ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
        </div>

        <p style="font-size: 15px; margin: 0 0 16px 0; color: #374151;">We know plans change, so don't worry. 💰 ${data.tokenAutoRefunded || data.isForMentee ? 'Your token has been refunded automatically.' : "The mentee has been notified and their token refunded."} ${data.isForMentee ? 'You can always look for another available mentor or request another session.' : ''}</p>

        ${data.isForMentee ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/mentor-listing" style="display: inline-block; background: #f59e0b; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Find Another Mentor</a>
        </div>
        ` : ''}

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">We hope you get the chance to connect soon 💛<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'meeting-cancelled-by-mentee': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">📅 ${data.isForMentor ? `${escapeHtml(data.menteeName || 'A mentee')} Cancelled Your Upcoming Session` : 'Meeting Cancellation Request'}</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.recipientName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">${data.isForMentor
          ? `Just letting you know that <strong>${data.menteeName}</strong> has requested to cancel your upcoming mentoring session.`
          : `<strong>${data.menteeName}</strong> has requested to cancel the scheduled meeting.`}</p>

        <div style="background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #6366f1;">
          <h3 style="margin: 0 0 16px 0; color: #3730a3; font-size: 16px;">📋 Cancellation Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.reason ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
        </div>

        <p style="font-size: 15px; color: #374151; margin-top: 24px;">${data.isForMentor
          ? "The session has been cancelled, so you don't need to prepare for it anymore. Thanks for your understanding!"
          : (data.tokenPendingApproval
              ? 'Your cancellation request has been submitted. Token refund pending admin approval.'
              : 'Your cancellation request has been submitted for review. Token refund pending admin approval.')}</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),

    'mentee-feedback-form': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">💭 How Did Your Session Go?</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">You recently had a mentoring session with <strong>${data.mentorName}</strong>, and we'd love to hear how it went.</p>

        <div style="background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #8b5cf6;">
          <h3 style="margin: 0 0 16px 0; color: #5b21b6; font-size: 16px;">📅 Session Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0;">Was the conversation helpful? Did you get the advice you were looking for? Or is there something we could do better?</p>

        <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px 0;">It only takes a couple of minutes, and your feedback helps us make Connext better for everyone.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.formUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3); transition: transform 0.2s;">Share Your Feedback</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Thanks for taking the time — we really appreciate it!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'mentor-feedback-submitted': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">💛 New Session Feedback</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${escapeHtml(data.mentorName || 'there')}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">
          ${escapeHtml(data.menteeName || 'A mentee')} has submitted feedback about your recent mentoring session.
        </p>

        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #2563eb;">
          <h3 style="margin: 0 0 16px 0; color: #1d4ed8; font-size: 16px;">Session Details</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Submitted:</strong> ${formatIsoForEmail(data.submittedAt)}</p>
        </div>

        <div style="margin: 24px 0;">
          <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px;">Submitted Responses</h3>
          ${renderFeedbackResponses(data.responses)}
        </div>

        <p style="font-size: 15px; color: #374151; margin: 24px 0;">Thanks for taking the time to mentor and share your experience. Feedback like this helps you understand what your mentees found useful, and helps us improve Connext too.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentor/meeting-requests" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">View in Dashboard</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Keep being awesome 💛<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'contact-message': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">📩 New Contact Message</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">A user sent a message through the app.</p>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 0 0 20px 0;">
          <p style="margin: 0 0 8px 0; color: #374151;"><strong>From:</strong> ${escapeHtml(data.name || 'Unknown')} (${escapeHtml(data.email || 'no email')})</p>
          <p style="margin: 0; color: #374151;"><strong>Role:</strong> ${escapeHtml(data.role || 'unknown')}</p>
          ${data.subject ? `<p style="margin: 8px 0 0 0; color: #374151;"><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>` : ''}
        </div>

        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
          <p style="margin: 0; color: #111827; font-size: 15px; white-space: pre-wrap;">${escapeHtml(data.message || '')}</p>
        </div>

        <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">Reply directly to this email to respond to ${escapeHtml(data.name || 'the sender')}.</p>
      `,
      renderFooter()
    ),

    'password-reset-code': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔐 Your Password Reset Code</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.userName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Forgot your password? No worries — it happens. Use the code below to reset your Connext password:</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 32px; border-radius: 8px; margin: 30px 0; text-align: center; border-left: 4px solid #f59e0b;">
          <p style="margin: 0 0 12px 0; color: #92400e; font-size: 13px; font-weight: 600; letter-spacing: 1px;">VERIFICATION CODE</p>
          <p style="margin: 0; color: #1f2937; font-size: 36px; font-weight: 700; letter-spacing: 6px; font-family: 'Courier New', 'Monaco', monospace;">
            ${data.verificationCode}
          </p>
        </div>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">⏱️ This code will expire in <strong>${data.expiresIn || '10 minutes'}</strong>. Do not share this code with anyone.</p>
        </div>

        <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 0; font-size: 13px; color: #991b1b;">
            <strong>⚠️ Didn't request this?</strong> If you didn't ask for a password reset, you don't need to do anything — your account is still safe. If you're worried, please secure your account or contact our support team.
          </p>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter(`<br/>Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color: #f59e0b; text-decoration: none;">Contact Support</a>`)
    ),

    'signup-verification-code': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔐 Your Verification Code</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.userName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">You're almost there. Enter the verification code below to finish setting up your Connext account:</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 32px; border-radius: 8px; margin: 30px 0; text-align: center; border-left: 4px solid #f59e0b;">
          <p style="margin: 0 0 12px 0; color: #92400e; font-size: 13px; font-weight: 600; letter-spacing: 1px;">VERIFICATION CODE</p>
          <p style="margin: 0; color: #1f2937; font-size: 36px; font-weight: 700; letter-spacing: 6px; font-family: 'Courier New', 'Monaco', monospace;">
            ${data.verificationCode}
          </p>
        </div>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">⏱️ This code will expire in <strong>${data.expiresIn || '2 minutes'}</strong>. Do not share this code with anyone.</p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin: 24px 0;">If you didn't request this code, you can safely ignore this email.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">See you on Connext!<br/>Connext Team</p>
      `,
      renderFooter(`<br/>Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color: #f59e0b; text-decoration: none;">Contact Support</a>`)
    ),

    'meeting-reminder-mentee': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🌱 Your Mentoring Session Is Tomorrow</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Just a little reminder that you have a mentoring session with <strong>${data.mentorName}</strong> tomorrow.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 16px 0; color: #1d4ed8; font-size: 16px;">📅 Session Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.message ? `<div style="margin: 12px 0 0 0; padding: 14px; background: rgba(255,255,255,0.7); border-radius: 6px; color: #374151;"><strong>Message:</strong><br/>${escapeHtml(data.message)}</div>` : ''}
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0;">Take a moment to get anything you’d like to discuss ready beforehand. We hope you have a great conversation!</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/dashboard" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">View Meeting Details</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">See you tomorrow!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'meeting-reminder-mentor': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⏰ You've Got a Mentoring Session Tomorrow</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Just a quick reminder that you have a mentoring session with <strong>${data.menteeName}</strong> tomorrow.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Session Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          ${data.message ? `<div style="margin: 12px 0 0 0; padding: 14px; background: rgba(255,255,255,0.7); border-radius: 6px; color: #374151;"><strong>Message:</strong><br/>${escapeHtml(data.message)}</div>` : ''}
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #10b981; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0;">Thanks for making the time to be there. Even a single conversation can make a bigger difference than you might expect.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentor/meeting-requests" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">View Meeting Details</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">See you tomorrow!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'mentor-acceptance-reminder': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔔 A Meeting Request Is Waiting For You</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>!</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Just a little reminder — <strong>${data.menteeName}</strong> is waiting for your response to a meeting request.</p>
        ${renderGoogleMeetAccountNotice()}

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Pending Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          ${data.message ? `<div style="margin: 12px 0 0 0; padding: 14px; background: rgba(255,255,255,0.7); border-radius: 6px; color: #374151;"><strong>Message:</strong><br/>${escapeHtml(data.message)}</div>` : ''}
        </div>

        <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 0; font-size: 14px; color: #991b1b;">
            <strong>⚠️ Deadline Reminder:</strong> You must accept or decline this request at least <strong>3 days before</strong> the scheduled meeting date. If no response is received by then, the request will be automatically cancelled and the mentee's token will be refunded.
          </p>
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0;">If you're available, you can accept it from your dashboard. If not, declining it lets ${data.menteeName || 'them'} know they can look for another time or mentor.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentor/meeting-requests" style="display: inline-block; background: #f59e0b; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Review Request</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Thanks for taking the time to help 💛<br/>Connext Team</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'meeting-cancelled-no-acceptance': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">Your Meeting Request Has Expired</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Looks like your meeting request to <strong>${data.mentorName}</strong> expired because we didn't receive a response before the deadline.</p>

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📅 Cancelled Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          <p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> Mentor did not accept the request within the 3-day deadline.</p>
        </div>

        <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0;">The request has now been cancelled, so there's nothing else you need to do. 💰 Your token has already been refunded — if you'd still like to connect with a mentor, you can send a new meeting request anytime.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/mentee/mentor-listing" style="display: inline-block; background: #ef4444; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px;">Find a Mentor</a>
        </div>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Hope you find a good match!<br/>Connext Team</p>
      `,
      renderFooter()
    ),

    'meeting-cancelled-no-acceptance-mentor': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">Meeting Request Expired</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The meeting request from <strong>${data.menteeName}</strong> has expired because it wasn't accepted before the deadline.</p>

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📅 Cancelled Request Details:</h3>
          ${renderMeetingTimeDetails(data.date, data.time, data.timezone)}
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          <p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> The request was not accepted within the 3-day deadline, so it was automatically cancelled and the mentee's token was refunded.</p>
        </div>

        <p style="font-size: 15px; color: #374151; margin-top: 24px;">The request has now been automatically cancelled. If you still want to connect with ${data.menteeName || 'this mentee'}, you can reach out through Connext.</p>

        <p style="font-size: 16px; color: #374151; margin-top: 24px;">Connext Team</p>
      `,
      renderFooter()
    ),
  };

  if (!emailTemplates[template]) {
    console.error(`❌ Email template '${template}' not found!`);
    throw new Error(`Email template '${template}' not found`);
  }

  const html = emailTemplates[template](data);
  console.log('✅ Email template generated successfully');

  try {
    const info = await transporter.sendMail({
      from: `"CONNEXT" <${process.env.EMAIL_USER}>`,
      to,
      replyTo,
      subject,
      html,
      attachments,
    });
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('Email response:', info.response);
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

// Email template base styles
const baseStyles = {
  wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;',
  container: 'background-color: #ffffff; margin: 20px; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);',
  header: 'padding: 40px 30px; text-align: center;',
  content: 'padding: 40px 30px; color: #374151; line-height: 1.6;',
  footer: 'padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;',
  logo: 'font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 10px;'
};

function getEmailWrapper(headerContent: string, bodyContent: string, footerContent: string = ''): string {
  return `
    <div style="${baseStyles.wrapper}">
      <div style="${baseStyles.container}">
        <div style="${baseStyles.header}">
          <div style="${baseStyles.logo}">CONNEXT</div>
          ${headerContent}
        </div>
        <div style="${baseStyles.content}">
          ${bodyContent}
        </div>
        ${footerContent ? `<div style="${baseStyles.footer}">${footerContent}</div>` : ''}
      </div>
    </div>
  `;
}
