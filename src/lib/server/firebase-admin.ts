import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

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

export async function updateFirebaseAuthEmail(uid: string, email: string) {
  const app = getFirebaseAdminApp();
  return getAuth(app).updateUser(uid, { email });
}

export async function deleteFirebaseAuthUser(uid: string) {
  const app = getFirebaseAdminApp();
  try {
    return await getAuth(app).deleteUser(uid);
  } catch (error: any) {
    // Already gone from Firebase Auth — treat as success so account deletion
    // isn't blocked by a previously-orphaned Cosmos record.
    if (error?.code === 'auth/user-not-found') {
      return;
    }
    throw error;
  }
}