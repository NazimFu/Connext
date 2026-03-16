import { google } from "googleapis";
import { Readable } from "stream";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileName, fileContent } = body;
    
    console.log('Attempting to upload file:', fileName);
    console.log('Credentials check:', {
      hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasFolderId: !!process.env.GOOGLE_DRIVE_FOLDER_ID
    });

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    console.log('Auth created successfully');
    const drive = google.drive({ version: "v3", auth });
    console.log('Drive client created');

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
      mimeType: "application/pdf"  // Add explicit MIME type here
    };

    // Verify file content
    if (!fileContent) {
      console.error('File content is missing');
      return Response.json({ error: 'File content is required' }, { status: 400 });
    }

    const media = {
      mimeType: "application/pdf",
      body: Readable.from(Buffer.from(fileContent, "base64")),
    };

    console.log('Attempting file upload to Drive...');
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, webViewLink",
    });
    console.log('File uploaded successfully:', file.data);

    return Response.json({
      fileId: file.data.id,
      link: file.data.webViewLink,
    });
  } catch (err: any) {
    console.error("Google Drive upload error:", err);
    // Log more detailed error information
    if (err.response) {
      console.error("Error response:", err.response.data);
    }
    return Response.json({ 
      error: err.message,
      details: err.response?.data || 'No additional error details'
    }, { status: 500 });
  }
}
