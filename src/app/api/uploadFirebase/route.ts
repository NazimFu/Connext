import { NextResponse } from 'next/server';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Initialize Firebase app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

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
    } 
    // Handle JSON
    else {
      try {
        const body = await request.json();
        fileName = body.fileName;
        fileContent = body.fileContent;
        folder = body.folder || 'verification';
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        return NextResponse.json({ 
          error: 'Invalid request format. Expected JSON or FormData',
          details: (parseError as Error).message 
        }, { status: 400 });
      }
    }
    
    console.log('Attempting to upload file to Firebase Storage:', fileName);
    
    if (!fileContent || !fileName) {
      console.error('File content or fileName is missing');
      return NextResponse.json({ 
        error: 'File content and fileName are required' 
      }, { status: 400 });
    }

    // Convert base64 to Uint8Array
    const buffer = Buffer.from(fileContent, 'base64');
    
    // Create a reference to the file location
    const timestamp = Date.now();
    const fileRef = ref(storage, `${folder}/${timestamp}_${fileName}`);
    
    // Upload file with metadata
    const metadata = {
      contentType: 'application/pdf',
    };
    
    await uploadBytes(fileRef, buffer, metadata);
    
    // Get download URL
    const downloadURL = await getDownloadURL(fileRef);
    
    console.log('File uploaded to Firebase Storage:', downloadURL);
    
    return NextResponse.json({
      success: true,
      fileName,
      url: downloadURL,
      path: `${folder}/${timestamp}_${fileName}`
    });
    
  } catch (error) {
    console.error('Firebase Storage upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: (error as Error).message },
      { status: 500 }
    );
  }
}
