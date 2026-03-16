import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const { applicationId, applicationType, decision, notes, reviewerName } = await request.json();

    if (!applicationId || !applicationType || !decision || !reviewerName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const containerName = applicationType === 'mentee' ? 'mentee' : 'mentor';
    const container = database.container(containerName);

    // Get the application
    const { resource: application } = await container.item(applicationId, applicationId).read();
    
    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Update the application with review information
    const updatedApplication = {
      ...application,
      verificationStatus: decision,
      verified: decision === 'approved',
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
      reviewNotes: notes || ''
    };

    // Save the updated application
    await container.item(applicationId, applicationId).replace(updatedApplication);

    // Send email notification
    await sendReviewNotification(application, decision, notes, applicationType);

    return NextResponse.json({
      message: 'Application review processed successfully',
      status: decision
    });

  } catch (error) {
    console.error('Error processing application review:', error);
    return NextResponse.json(
      { error: 'Failed to process application review' },
      { status: 500 }
    );
  }
}

async function sendReviewNotification(
  application: any, 
  decision: string, 
  notes: string, 
  applicationType: string
) {
  try {
    // Create transporter for email sending
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const isApproved = decision === 'approved';
    const userName = applicationType === 'mentee' ? application.mentee_name : application.mentor_name;
    const userEmail = applicationType === 'mentee' ? application.mentee_email : application.mentor_email;
    const userType = applicationType === 'mentee' ? 'Mentee' : 'Mentor';

    if (!userEmail) {
      console.warn(`No email found for ${userType} application:`, application.id);
      return;
    }

    const subject = isApproved 
      ? `🎉 Welcome to Connext - Your ${userType} Application Approved!`
      : `Connext ${userType} Application Update`;

    const emailHtml = isApproved ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4CAF50; margin-bottom: 10px;">🎉 Congratulations!</h1>
          <h2 style="color: #333; margin-top: 0;">Welcome to Connext</h2>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #4CAF50; margin-bottom: 25px;">
          <p>Hi ${userName || 'there'},</p>
          <p>Great news! Your ${userType.toLowerCase()} application has been <strong style="color: #4CAF50;">approved</strong> and you're now part of the Connext community!</p>
        </div>

        <div style="background-color: #fff3e0; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
          <h3 style="color: #f57c00; margin-top: 0;">🚀 What's Next?</h3>
          ${applicationType === 'mentee' ? `
          <ul style="color: #333; padding-left: 20px;">
            <li>Complete your profile setup</li>
            <li>Browse available mentors in your field</li>
            <li>Schedule your first mentoring session</li>
            <li>Set your learning goals and expectations</li>
          </ul>
          <p><strong>Ready to start your mentoring journey?</strong></p>
          ` : `
          <ul style="color: #333; padding-left: 20px;">
            <li>Complete your mentor profile setup</li>
            <li>Set your availability schedule</li>
            <li>Review mentee requests and start connecting</li>
            <li>Share your expertise and help others grow</li>
          </ul>
          <p><strong>Ready to start mentoring?</strong></p>
          `}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${applicationType}/dashboard" 
             style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Access Your Dashboard
          </a>
        </div>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 30px;">
          <h4 style="color: #333; margin-top: 0;">Need Help?</h4>
          <p style="color: #666; margin-bottom: 0;">
            If you have any questions or need assistance getting started, don't hesitate to reach out to our support team. 
            We're here to help make your ${applicationType === 'mentee' ? 'learning' : 'mentoring'} experience amazing!
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px;">
            Welcome to the Connext family!<br>
            <strong>The Connext Team</strong>
          </p>
        </div>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #f44336;">Connext Application Update</h1>
        </div>
        
        <div style="background-color: #ffebee; padding: 20px; border-radius: 10px; border-left: 4px solid #f44336; margin-bottom: 25px;">
          <p>Hi ${userName || 'there'},</p>
          <p>Thank you for your interest in joining Connext as a ${userType.toLowerCase()}. 
             After careful review, we regret to inform you that your application has not been approved at this time.</p>
        </div>

        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
          <h3 style="color: #1976d2; margin-top: 0;">🔄 What's Next?</h3>
          <p style="color: #333;">
            This decision doesn't mean the end of your journey with us. You're welcome to reapply in the future once you've had a chance to address any areas for improvement.
          </p>
          <ul style="color: #333; padding-left: 20px;">
            <li>Consider gaining additional experience or qualifications</li>
            <li>Strengthen your application materials</li>
            <li>Feel free to reapply when you're ready</li>
          </ul>
        </div>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 30px;">
          <h4 style="color: #333; margin-top: 0;">Questions?</h4>
          <p style="color: #666; margin-bottom: 0;">
            If you have any questions about this decision or would like guidance on strengthening future applications, 
            please don't hesitate to reach out to our team.
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px;">
            Thank you for your interest in Connext.<br>
            <strong>The Connext Team</strong>
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: subject,
      html: emailHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`${userType} ${decision} notification sent:`, info.response);

  } catch (error) {
    console.error('Failed to send review notification email:', error);
    // Don't throw error here - we don't want email failures to block the review process
  }
}