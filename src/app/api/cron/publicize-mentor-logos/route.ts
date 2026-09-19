import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorageBucket } from '@/lib/server/firebase-admin';

// A file uploaded to Firebase Storage via the Console isn't public-readable
// by default — the homepage links directly to storage.googleapis.com URLs,
// which need each object's ACL to grant allUsers read access. This sweeps
// mentor-logos/ on a schedule (see vercel.json) and makes anything there
// public, so uploading a logo through the Console "just works" without a
// manual step. makePublic() is idempotent, so re-applying it to already
// public files is harmless.

const STORAGE_PREFIX = 'mentor-logos/';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const bucket = getAdminStorageBucket();
    const [files] = await bucket.getFiles({ prefix: STORAGE_PREFIX });

    let made = 0;
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
      try {
        await file.makePublic();
        made++;
      } catch (error) {
        errors.push({ file: file.name, error: (error as Error).message });
      }
    }

    return NextResponse.json({
      success: true,
      checked: files.length,
      made,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/publicize-mentor-logos] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to publicize mentor logos', message: (error as Error).message },
      { status: 500 }
    );
  }
}
