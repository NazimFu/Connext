import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, linkedin, github, cv_link, allowCVShare, timezone } = body;

    console.log('PATCH /api/mentee/profile - Received:', { id, name, email, linkedin, github, cv_link, allowCVShare, timezone });

    if (!id) {
      return NextResponse.json({ message: 'Mentee ID is required' }, { status: 400 });
    }

    const menteeContainer = database.container('mentee');

    let existingMentee;
    try {
      const { resource } = await menteeContainer.item(id, id).read();
      existingMentee = resource;
      if (!existingMentee) {
        return NextResponse.json({ message: 'Mentee not found' }, { status: 404 });
      }
    } catch (readError) {
      console.error('Error reading mentee:', readError);
      return NextResponse.json({
        message: 'Mentee not found or cannot be accessed',
        error: (readError as Error).message
      }, { status: 404 });
    }

    const operations: PatchOperation[] = [];

    if (name && typeof name === 'string') {
      operations.push({ op: 'set', path: '/name', value: name });
      operations.push({ op: 'set', path: '/mentee_name', value: name });
    }

    if (email && typeof email === 'string') {
      operations.push({ op: 'set', path: '/email', value: email });
      operations.push({ op: 'set', path: '/mentee_email', value: email });
    }

    if (linkedin !== undefined) {
      const op = existingMentee.linkedin !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/linkedin', value: linkedin || '' });
    }

    if (github !== undefined) {
      const op = existingMentee.github !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/github', value: github || '' });
    }

    if (cv_link !== undefined) {
      const op = existingMentee.cv_link !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/cv_link', value: cv_link || '' });
    }

    if (allowCVShare !== undefined) {
      const op = existingMentee.allowCVShare !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/allowCVShare', value: allowCVShare === true });
    }

    // Persist timezone preference
    if (timezone !== undefined) {
      const op = existingMentee.timezone !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/timezone', value: timezone || 'Asia/Kuala_Lumpur' });
    }

    if (operations.length === 0) {
      return NextResponse.json({ message: 'No update fields provided' }, { status: 400 });
    }

    const { resource: updatedMentee } = await menteeContainer.item(id, id).patch(operations);
    console.log('Successfully updated mentee:', updatedMentee?.id);

    return NextResponse.json({
      message: 'Profile updated successfully',
      mentee: updatedMentee
    });

  } catch (error) {
    console.error('Failed to update mentee profile:', error);
    return NextResponse.json({
      message: 'Failed to update profile',
      error: (error as Error).message,
    }, { status: 500 });
  }
}