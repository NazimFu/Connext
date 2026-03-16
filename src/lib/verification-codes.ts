import { database } from './cosmos';

interface VerificationCode {
  email: string;
  code: string;
  expiresAt: number;
  createdAt: number;
}

// Helper function to find user in either mentee or mentor container
async function findUserContainer(email: string): Promise<{ container: any; user: any; role: 'mentee' | 'mentor' } | null> {
  try {
    // Check mentee container first
    const menteeContainer = database.container('mentee');
    const menteeQuery = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }]
    };
    const { resources: mentees } = await menteeContainer.items.query(menteeQuery).fetchAll();
    
    if (mentees.length > 0) {
      return { container: menteeContainer, user: mentees[0], role: 'mentee' };
    }

    // Check mentor container
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
    const mentorQuery = {
      query: 'SELECT * FROM c WHERE c.mentor_email = @email',
      parameters: [{ name: '@email', value: email }]
    };
    const { resources: mentors } = await mentorContainer.items.query(mentorQuery).fetchAll();
    
    if (mentors.length > 0) {
      return { container: mentorContainer, user: mentors[0], role: 'mentor' };
    }

    return null;
  } catch (error) {
    console.error('Error finding user container:', error);
    return null;
  }
}

export async function saveVerificationCode(email: string, code: string, expiresInMinutes: number = 10): Promise<void> {
  try {
    const userInfo = await findUserContainer(email.toLowerCase());
    
    if (!userInfo) {
      throw new Error('User not found');
    }

    const { container, user } = userInfo;
    
    // Update user document with reset code
    const updatedUser = {
      ...user,
      resetCode: code,
      resetCodeExpiry: Date.now() + expiresInMinutes * 60 * 1000,
      resetCodeCreatedAt: Date.now(),
    };

    await container.items.upsert(updatedUser);
  } catch (error) {
    console.error('Error saving verification code:', error);
    throw new Error('Failed to save verification code');
  }
}

export async function getVerificationCode(email: string): Promise<VerificationCode | null> {
  try {
    const userInfo = await findUserContainer(email.toLowerCase());
    
    if (!userInfo) {
      return null;
    }

    const { user } = userInfo;
    
    // Check if reset code exists and is not expired
    if (!user.resetCode || !user.resetCodeExpiry) {
      return null;
    }

    // Check if expired
    if (Date.now() > user.resetCodeExpiry) {
      await deleteVerificationCode(email);
      return null;
    }

    return {
      email: user.email,
      code: user.resetCode,
      expiresAt: user.resetCodeExpiry,
      createdAt: user.resetCodeCreatedAt || Date.now(),
    };
  } catch (error: any) {
    console.error('Error getting verification code:', error);
    return null;
  }
}

export async function deleteVerificationCode(email: string): Promise<void> {
  try {
    const userInfo = await findUserContainer(email.toLowerCase());
    
    if (!userInfo) {
      return;
    }

    const { container, user } = userInfo;
    
    // Remove reset code fields from user document
    const updatedUser = { ...user };
    delete updatedUser.resetCode;
    delete updatedUser.resetCodeExpiry;
    delete updatedUser.resetCodeCreatedAt;

    await container.items.upsert(updatedUser);
  } catch (error: any) {
    console.error('Error deleting verification code:', error);
  }
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const storedCode = await getVerificationCode(email);
  
  if (!storedCode) {
    return false;
  }

  return storedCode.code === code.trim();
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
