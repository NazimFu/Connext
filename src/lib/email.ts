import nodemailer from 'nodemailer';

interface EmailParams {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

export async function sendEmail({
  to,
  subject,
  template,
  data,
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
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">You have a new meeting request from <strong>${data.menteeName}</strong>.</p>
        
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName} (${data.menteeEmail})</p>
          ${data.message ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Message:</strong><br/>${data.message}</p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Please log in to your dashboard to accept or decline this request.</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-meeting-accepted': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">✅ Meeting Accepted!</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Great news! Your meeting request has been accepted by <strong>${data.mentorName}</strong>.</p>
        
        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #10b981; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Save the date and join on time. See you soon!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-meeting-declined': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">❌ Meeting Request Declined</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Unfortunately, <strong>${data.mentorName}</strong> has declined your meeting request.</p>
        
        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📅 Request Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">💰 Your token has been refunded. Try requesting with another mentor or choose a different time slot!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-meeting-no-response': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⏳ No Mentor Response</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Sadly, we did not receive a response from <strong>${data.mentorName}</strong> in time.</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Request Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">💰 Your token has been returned to you. No fret, you can still request a mentor again.</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-reported-cycle-result': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⚠️ Report Outcome Update</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Your meeting cycle has been evaluated and a report was recorded for this session.</p>

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📅 Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date || 'N/A'}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time || 'N/A'}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName || 'N/A'}</p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">A report outcome has been applied for this cycle. If you believe this was in error, please contact support.</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-report-approved-penalty': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⚠️ Report Approved</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">A report for your meeting has been reviewed and approved by admin.</p>

        <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; color: #991b1b; font-size: 16px;">📋 Action Taken:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Reason:</strong> ${data.reason || 'Policy violation'}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date || 'N/A'}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time || 'N/A'}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName || 'N/A'}</p>
          ${data.adminNotes ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Admin Notes:</strong> ${data.adminNotes}</p>` : ''}
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">As a penalty, your token will not be returned for this cycle.</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'meeting-cancelled-by-mentor': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">⚠️ Meeting Cancelled</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.recipientName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The mentor <strong>${data.mentorName}</strong> has cancelled the scheduled meeting.</p>
        
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0; color: #92400e; font-size: 16px;">📅 Cancelled Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          ${data.reason ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">💰 ${data.tokenAutoRefunded ? 'Your token has been refunded automatically.' : (data.isForMentee ? 'Your token has been refunded automatically.' : 'The mentee has been notified and their token refunded.')}</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'meeting-cancelled-by-mentee': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">📅 Meeting Cancellation Request</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.recipientName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">The mentee <strong>${data.menteeName}</strong> has requested to cancel the scheduled meeting.</p>
        
        <div style="background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #6366f1;">
          <h3 style="margin: 0 0 16px 0; color: #3730a3; font-size: 16px;">📋 Cancellation Request Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.reason ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">${data.isForMentor ? 'You have been notified of this cancellation.' : (data.tokenPendingApproval ? 'Your cancellation request has been submitted. Token refund pending admin approval.' : 'Your cancellation request has been submitted for review. Token refund pending admin approval.')}</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentor-meeting-approved': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">✅ Meeting Confirmed</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.mentorName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">This is a confirmation for your upcoming mentoring session.</p>
        
        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentee:</strong> ${data.menteeName}</p>
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #10b981; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Be ready and join a few minutes early. Looking forward to your session!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-meeting-approved': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">✅ Meeting Confirmed</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Your meeting request has been approved!</p>
        
        <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px;">📅 Meeting Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
          ${data.googleMeetUrl ? `<p style="margin: 12px 0 0 0; color: #374151;"><strong>Meeting Link:</strong> <a href="${data.googleMeetUrl}" style="color: #10b981; text-decoration: none; font-weight: 600;">Join Meeting</a></p>` : ''}
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Save the date and prepare your questions. We're excited to connect you with your mentor!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'mentee-feedback-form': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">📝 Share Your Feedback</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.menteeName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Thank you for completing your mentorship session with <strong>${data.mentorName}</strong>! We'd love to hear about your experience.</p>
        
        <div style="background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #8b5cf6;">
          <h3 style="margin: 0 0 16px 0; color: #5b21b6; font-size: 16px;">📅 Session Details:</h3>
          <p style="margin: 8px 0; color: #374151;"><strong>Date:</strong> ${data.date}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Time:</strong> ${data.time}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Mentor:</strong> ${data.mentorName}</p>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin: 24px 0;">Your feedback is valuable and helps us improve the mentorship experience. It should take about 3-5 minutes to complete.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.formUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3); transition: transform 0.2s;">Fill Out Feedback Form</a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">Thank you for being part of the CONNEXT community!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.</p>`
    ),

    'password-reset-code': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">🔐 Password Reset Request</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.userName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">We received a request to reset your password. Use the verification code below to proceed:</p>
        
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
            <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, your account may be at risk. Please secure your account immediately or contact our support team.
          </p>
        </div>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.<br/>Need help? <a href="mailto:support@connext.com" style="color: #f59e0b; text-decoration: none;">Contact Support</a></p>`
    ),

    'signup-verification-code': (data) => getEmailWrapper(
      `<h2 style="margin: 0; color: #1f2937; font-size: 24px;">👋 Welcome to CONNEXT</h2>`,
      `
        <p style="font-size: 16px; margin: 0 0 24px 0;">Hi <strong>${data.userName || 'there'}</strong>,</p>
        <p style="font-size: 16px; margin: 0 0 24px 0;">Thank you for signing up! Use this 4-digit code to complete your registration:</p>
        
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); padding: 32px; border-radius: 8px; margin: 30px 0; text-align: center; border-left: 4px solid #f59e0b;">
          <p style="margin: 0 0 12px 0; color: #92400e; font-size: 13px; font-weight: 600; letter-spacing: 1px;">VERIFICATION CODE</p>
          <p style="margin: 0; color: #1f2937; font-size: 36px; font-weight: 700; letter-spacing: 6px; font-family: 'Courier New', 'Monaco', monospace;">
            ${data.verificationCode}
          </p>
        </div>
        
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">⏱️ This code will expire in <strong>${data.expiresIn || '10 minutes'}</strong>. Do not share this code with anyone.</p>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin: 24px 0;">Once verified, you'll be able to access all features of the CONNEXT platform and start connecting with mentors or mentees!</p>
      `,
      `<p style="margin: 0;">© 2026 CONNEXT. All rights reserved.<br/>Questions? <a href="mailto:support@connext.com" style="color: #f59e0b; text-decoration: none;">Contact Support</a></p>`
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
