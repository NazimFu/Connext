// src/app/api/attachment-proxy/route.ts
//
// Proxies file downloads for CVs stored in Firebase Storage.
// For Firebase Storage paths (relative or storage.googleapis.com URLs),
// uses the Admin SDK to generate a short-lived signed URL — this bypasses
// all bucket permissions and works with any bucket name format.

import { NextRequest, NextResponse } from 'next/server';
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

/**
 * Given a value stored in the DB, determine if it refers to a Firebase
 * Storage file and return the storage path (e.g. "verification/123_file.pdf").
 * Returns null if it's not a Firebase Storage reference.
 */
function extractFirebaseStoragePath(raw: string): string | null {
  // Already a relative path with no scheme — treat as storage path
  if (!raw.startsWith('http')) {
    return raw.startsWith('/') ? raw.slice(1) : raw;
  }

  // storage.googleapis.com/BUCKET/PATH
  const gcsMatch = raw.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
  if (gcsMatch) {
    return decodeURIComponent(gcsMatch[1]);
  }

  // firebasestorage.googleapis.com/v0/b/BUCKET/o/ENCODED_PATH
  const fbMatch = raw.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (fbMatch) {
    return decodeURIComponent(fbMatch[1]);
  }

  // New-format: firebasestorage.app/... — treat as needing signed URL
  if (raw.includes('firebasestorage.app')) {
    // Extract path after the bucket portion
    const appMatch = raw.match(/firebasestorage\.app\/([^?]+)/);
    if (appMatch) {
      return decodeURIComponent(appMatch[1]);
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    // ── Firebase Storage path → signed URL via Admin SDK ──────────────────
    const storagePath = extractFirebaseStoragePath(decodedUrl);

    if (storagePath) {
      console.log('[attachment-proxy] Firebase Storage path detected:', storagePath);
      try {
        const app = getAdminApp();
        const bucket = getStorage(app).bucket();
        const file = bucket.file(storagePath);

        // Generate a signed URL valid for 15 minutes
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000,
        });

        console.log('[attachment-proxy] Signed URL generated, proxying...');

        const response = await fetch(signedUrl, { redirect: 'follow' });

        if (!response.ok) {
          console.error('[attachment-proxy] Signed URL fetch failed:', response.status);
          return NextResponse.json(
            { error: 'Failed to fetch file from storage', status: response.status },
            { status: response.status }
          );
        }

        const fileBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/pdf';

        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, max-age=900', // 15 min — matches signed URL lifetime
          },
        });
      } catch (adminErr) {
        console.error('[attachment-proxy] Admin SDK error:', adminErr);
        return NextResponse.json(
          { error: 'Failed to access file in storage', details: (adminErr as Error).message },
          { status: 500 }
        );
      }
    }

    // ── Google Drive links ─────────────────────────────────────────────────
    let fetchUrl = decodedUrl;

    const driveMatch = decodedUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch?.[1]) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }

    const openMatch = decodedUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (openMatch?.[1]) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
    }

    console.log('[attachment-proxy] Fetching external URL:', fetchUrl);

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('[attachment-proxy] Fetch failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch attachment', status: response.status },
        { status: response.status }
      );
    }

    const fileBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/pdf';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[attachment-proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy attachment', details: (error as Error).message },
      { status: 500 }
    );
  }
}