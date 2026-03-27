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

    const menteeContainer = database.container('mentee');
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentee_email = @email",
      parameters: [
        {
          name: "@email",
          value: email
        }
      ]
    };

    const { resources: mentees } = await menteeContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentees.length === 0) {
      return NextResponse.json({ message: "Mentee not found" }, { status: 404 });
    }

    const mentee = mentees[0];
    const evalResult = evaluateTokenCycleForUser(mentee);
    if (evalResult.changed) {
      await menteeContainer.item(mentee.id, mentee.id).replace(mentee);
    }
    console.log('Auth mentee - Found mentee document:', {
      id: mentee.id,
      menteeUID: mentee.menteeUID,
      mentee_email: mentee.mentee_email,
      mentee_name: mentee.mentee_name
    });

    // Map DB fields to User shape
    const user: User = {
      id: mentee.id, // Use the actual document ID, not menteeUID
      name: mentee.mentee_name,
      email: mentee.mentee_email,
      image: mentee.mentee_photo, // or undefined if not present
      role: 'mentee',
      verified: mentee.verified ?? false,
      verificationStatus: mentee.verificationStatus ?? 'not-submitted',
      tokens: clampToken(mentee.tokens),
      token_cycle: mentee.token_cycle,
      tokenReplenishAt: getTokenCycleEvaluateAtIso(mentee.token_cycle?.tokenUsedAt),
      linkedin: mentee.linkedin,
      github: mentee.github,
      cv_link: mentee.cv_link,
      attachmentPath: mentee.attachmentPath,
      allowCVShare: mentee.allowCVShare ?? false
    };

    return NextResponse.json(user);
  } catch (error) {
    console.error('Failed to authenticate mentee', error);
    return NextResponse.json({ message: "Authentication failed", error: (error as Error).message }, { status: 500 });
  }
}