import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { User } from '@/lib/types';
import { clampToken, evaluateTokenCycleForUser, getTokenCycleEvaluateAtIso } from '@/lib/token-cycle';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const mentorContainer = database.container('mentor');
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentor_email = @email",
      parameters: [
        {
          name: "@email",
          value: email
        }
      ]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentors.length === 0) {
      return NextResponse.json({ message: "Mentor not found" }, { status: 404 });
    }

    const mentor = mentors[0];
    const evalResult = evaluateTokenCycleForUser(mentor);
    if (evalResult.changed) {
      await mentorContainer.item(mentor.id, mentor.id).replace(mentor);
    }
    
    // Convert mentor document to User format
    const user: User = {
      id: mentor.mentorUID,
      name: mentor.mentor_name,
      email: mentor.mentor_email,
      image: mentor.mentor_photo,
      role: 'mentor',
      verified: mentor.verified ?? false,
      verificationStatus: mentor.verificationStatus ?? 'not-submitted',
      tokens: clampToken(mentor.tokens),
      token_cycle: mentor.token_cycle,
      tokenReplenishAt: getTokenCycleEvaluateAtIso(mentor.token_cycle?.tokenUsedAt),
    };

    return NextResponse.json(user);
  } catch (error) {
    console.error('Failed to authenticate mentor', error);
    return NextResponse.json({ message: "Authentication failed", error: (error as Error).message }, { status: 500 });
  }
}
