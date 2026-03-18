// src/app/api/uploadFirebase/route.ts
// Uses Firebase Admin SDK for server-side uploads — bypasses Storage security rules entirely.

import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: privateKey!,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  });
}

export async function POST(request: Request) {
  try {
    let fileName: string;
    let fileContent: string;
    let folder = 'verification';

    const contentType = request.headers.get('content-type') || '';

    // Handle FormData (multipart/form-data)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      folder = (formData.get('folder') as string) || 'verification';

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      fileContent = Buffer.from(arrayBuffer).toString('base64');
    } else {
      // Handle JSON
      try {
        const body = await request.json();
        fileName = body.fileName;
        fileContent = body.fileContent;
        folder = body.folder || 'verification';
      } catch (parseError) {
        return NextResponse.json(
          { error: 'Invalid request format. Expected JSON or FormData' },
          { status: 400 }
        );
      }
    }

    if (!fileContent || !fileName) {
      return NextResponse.json(
        { error: 'File content and fileName are required' },
        { status: 400 }
      );
    }

    // Initialize Admin SDK
    const app = getAdminApp();
    const bucket = getStorage(app).bucket();

    // Upload buffer
    const buffer = Buffer.from(fileContent, 'base64');
    const timestamp = Date.now();
    const filePath = `${folder}/${timestamp}_${fileName}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
      metadata: { contentType: 'application/pdf' },
    });

    // Make the file publicly readable so the attachment proxy can fetch it
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    console.log('[uploadFirebase] File uploaded:', publicUrl);

    return NextResponse.json({
      success: true,
      fileName,
      url: publicUrl,
      path: filePath,
    });
  } catch (error) {
    console.error('[uploadFirebase] Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: (error as Error).message },
      { status: 500 }
    );
  }
}