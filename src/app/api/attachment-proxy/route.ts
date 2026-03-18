// src/app/api/attachment-proxy/route.ts
// Proxies PDF/file downloads. Now that uploads use Admin SDK + makePublic(),
// Firebase Storage paths resolve to public GCS URLs directly.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);
    let fetchUrl = decodedUrl;

    // If it's a relative Firebase Storage path (e.g. "verification/123_file.pdf"),
    // convert it to a public GCS URL.
    if (!decodedUrl.startsWith('http')) {
      const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (!bucket) {
        return NextResponse.json(
          { error: 'Storage bucket not configured' },
          { status: 500 }
        );
      }
      const storagePath = decodedUrl.startsWith('/') ? decodedUrl.slice(1) : decodedUrl;
      fetchUrl = `https://storage.googleapis.com/${bucket}/${encodeURIComponent(storagePath)}`;
    }

    // Handle Google Drive sharing links
    const driveMatch = decodedUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch?.[1]) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }

    const openMatch = decodedUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (openMatch?.[1]) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
    }

    console.log('[attachment-proxy] Fetching:', fetchUrl);

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