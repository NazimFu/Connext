import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

export async function POST(req: NextRequest) {
  try {
    // Check if request has a body
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { message: "Content-Type must be application/json" },
        { status: 400 }
      );
    }

    // Clone the request to safely read the body
    const text = await req.text();
    
    // Check if body is empty
    if (!text || text.trim() === '') {
      return NextResponse.json(
        { message: "Request body is empty" },
        { status: 400 }
      );
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (parseError) {
      return NextResponse.json(
        { message: "Invalid JSON in request body", error: (parseError as Error).message },
        { status: 400 }
      );
    }

    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    // Check mentee container
    const menteeContainer = database.container('mentee');
    const menteeQuery = {
      query: "SELECT * FROM c WHERE c.mentee_email = @email",
      parameters: [{ name: "@email", value: email.toLowerCase() }]
    };

    const { resources: mentees } = await menteeContainer.items
      .query(menteeQuery)
      .fetchAll();

    if (mentees.length > 0) {
      return NextResponse.json({
        exists: true,
        role: 'mentee',
        user: mentees[0]
      });
    }

    // Check mentor container
    const mentorContainer = database.container('mentor');
    const mentorQuery = {
      query: "SELECT * FROM c WHERE c.mentor_email = @email",
      parameters: [{ name: "@email", value: email.toLowerCase() }]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(mentorQuery)
      .fetchAll();

    if (mentors.length > 0) {
      return NextResponse.json({
        exists: true,
        role: 'mentor',
        user: mentors[0]
      });
    }

    // User not found
    return NextResponse.json({
      exists: false,
      message: "User not found"
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { 
        message: "Internal server error", 
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}