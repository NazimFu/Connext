import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

// Initialize Firebase app if not already initialized
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const storage = getStorage(app);

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Decode the URL
    const decodedUrl = decodeURIComponent(url);
    
    console.log('Proxying attachment from:', decodedUrl);

    // Check if it's a relative path (Firebase Storage path)
    if (!decodedUrl.startsWith('http')) {
      // Treat as Firebase Storage path
      try {
        const storagePath = decodedUrl.startsWith('/') ? decodedUrl.slice(1) : decodedUrl;
        const storageRef = ref(storage, storagePath);
        const downloadURL = await getDownloadURL(storageRef);
        
        console.log('Fetching from Firebase Storage:', downloadURL);
        
        // Fetch the file from Firebase Storage URL
        const response = await fetch(downloadURL);
        if (!response.ok) {
          throw new Error(`Failed to fetch from Firebase Storage: ${response.status}`);
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
        console.error('Firebase Storage error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch from Firebase Storage', details: (error as Error).message },
          { status: 404 }
        );
      }
    }

    // If it's already a full URL (Google Drive, etc.), process it
    let fetchUrl = decodedUrl;
    
    // Handle Google Drive sharing links
    const driveMatch = decodedUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      const fileId = driveMatch[1];
      fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    
    // Handle Google Drive open links
    const openMatch = decodedUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (openMatch && openMatch[1]) {
      const fileId = openMatch[1];
      fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    // Fetch the attachment
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('Failed to fetch attachment:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch attachment', status: response.status },
        { status: response.status }
      );
    }

    // Get the content type or default to PDF
    const contentType = response.headers.get('content-type') || 'application/pdf';
    
    // Get the file data
    const fileBuffer = await response.arrayBuffer();

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.error('Attachment proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy attachment', details: (error as Error).message },
      { status: 500 }
    );
  }
}
