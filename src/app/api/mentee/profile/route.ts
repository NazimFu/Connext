import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { PatchOperation } from '@azure/cosmos';

// Update mentee profile
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, linkedin, github, cv_link, allowCVShare } = body;

    console.log('PATCH /api/mentee/profile - Received:', { id, name, email, linkedin, github, cv_link, allowCVShare });

    if (!id) {
      return NextResponse.json({ message: 'Mentee ID is required' }, { status: 400 });
    }

    const menteeContainer = database.container('mentee');

    // Check if the mentee exists first
    let existingMentee;
    try {
      const { resource } = await menteeContainer.item(id, id).read();
      existingMentee = resource;
      console.log('Found existing mentee:', existingMentee?.id);
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

    // Update name if provided and different
    if (name && typeof name === 'string') {
      operations.push({ op: 'set', path: '/name', value: name });
      operations.push({ op: 'set', path: '/mentee_name', value: name });
    }

    // Update email if provided and different
    if (email && typeof email === 'string') {
      operations.push({ op: 'set', path: '/email', value: email });
      operations.push({ op: 'set', path: '/mentee_email', value: email });
    }

    // Only update linkedin/github if they already exist in the document or we're adding them
    if (linkedin !== undefined) {
      // Use 'add' if field doesn't exist, 'set' if it does
      const op = existingMentee.linkedin !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/linkedin', value: linkedin || '' });
    }

    if (github !== undefined) {
      const op = existingMentee.github !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/github', value: github || '' });
    }

    // Update CV link if provided
    if (cv_link !== undefined) {
      const op = existingMentee.cv_link !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/cv_link', value: cv_link || '' });
    }

    // Update CV sharing consent if provided
    if (allowCVShare !== undefined) {
      const op = existingMentee.allowCVShare !== undefined ? 'set' : 'add';
      operations.push({ op: op as any, path: '/allowCVShare', value: allowCVShare === true });
    }

    console.log('Operations to perform:', operations);

    if (operations.length === 0) {
      return NextResponse.json({ message: 'No update fields provided' }, { status: 400 });
    }

    // Apply the patch operations
    const { resource: updatedMentee } = await menteeContainer.item(id, id).patch(operations);
    console.log('Successfully updated mentee:', updatedMentee?.id);

    return NextResponse.json({ 
      message: 'Profile updated successfully', 
      mentee: updatedMentee 
    });

  } catch (error) {
    console.error('Failed to update mentee profile:', error);
    console.error('Error details:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    return NextResponse.json({ 
      message: 'Failed to update profile', 
      error: (error as Error).message,
      details: (error as any).body || (error as any).code || 'Unknown error'
    }, { status: 500 });
  }
}
