import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const folderId = process.env.GOOGLE_DRIVE_LOGOS_FOLDER_ID;

  if (!folderId) {
    return NextResponse.json({ logos: [] });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 100,
    });

    const logos = (res.data.files || []).map((f) => ({
      name: f.name ?? 'Institution',
      url: `https://drive.google.com/file/d/${f.id}/view`,
    }));

    return NextResponse.json({ logos });
  } catch (error) {
    console.error('[institution-logos] Drive API error:', error);
    return NextResponse.json({ logos: [] });
  }
}
