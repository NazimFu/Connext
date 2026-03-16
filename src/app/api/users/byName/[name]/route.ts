
import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';
import { User } from '@/lib/types';


async function queryContainer(containerName: string, name: string) {
    const container = database.container(containerName);
    const querySpec = {
      query: `SELECT * FROM c WHERE c.${containerName}_name = @name`,
      parameters: [{ name: "@name", value: name }]
    };
    
    console.log(`Querying ${containerName} container with:`, querySpec.query);
    console.log('Parameters:', querySpec.parameters);
    
    const { resources } = await container.items.query(querySpec).fetchAll();
    console.log(`Found ${resources.length} results in ${containerName} container`);
    
    if (resources.length > 0) {
        console.log('First result:', resources[0]);
    }
    
    return resources;
}

// Get a single user by name from any container
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name: rawName } = await params;
    // Decode the URL-encoded name (e.g., "Tiffany%20Brown" -> "Tiffany Brown")
    const name = decodeURIComponent(rawName);
    
    console.log('Raw name from URL:', rawName);
    console.log('Decoded name:', name);
    
    let userDoc: any = null;
    let role: User['role'] | null = null;

    console.log('Starting search for user:', name);

    // First, let's see what's actually in the mentor container
    try {
        const mentorContainer = database.container('mentor');
        const allMentors = await mentorContainer.items.query('SELECT * FROM c').fetchAll();
        console.log('All mentors in database:', allMentors.resources.length);
        allMentors.resources.forEach((mentor, index) => {
            console.log(`Mentor ${index + 1}:`, {
                id: mentor.id,
                mentor_name: mentor.mentor_name,
                mentorUID: mentor.mentorUID
            });
        });
    } catch (err) {
        console.error('Error querying all mentors:', err);
    }

    const menteeResults = await queryContainer('mentee', name);
    if (menteeResults.length > 0) {
        console.log('Found user in mentee container');
        userDoc = menteeResults[0];
        role = 'mentee';
    } else {
        const mentorResults = await queryContainer('mentor', name);
        if (mentorResults.length > 0) {
            console.log('Found user in mentor container');
            userDoc = mentorResults[0];
            role = 'mentor';
        } else {
            console.log('User not found in either container, checking hardcoded staff');
             // For demo purposes, allow login as staff
            if (name.toLowerCase() === 'j. jonah jameson') {
                 userDoc = {
                    id: 'staff-1',
                    name: 'J. Jonah Jameson',
                    email: 'jjj@dailybugle.com',
                    role: 'staff',
                    verified: true,
                    verificationStatus: 'approved',
                    tokens: 0,
                };
                role = 'staff';
            }
        }
    }

    if (!userDoc || !role) {
      console.log('No user found, returning 404');
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    
    console.log('Mapping user document to User type');
    console.log('User document:', userDoc);
    
    // Map the document to the unified User type
    const user: User = {
        id: userDoc.id,
        name: userDoc.mentee_name || userDoc.mentor_name || userDoc.name,
        email: userDoc.mentee_email || userDoc.mentor_email || userDoc.email,
        role: role,
        // Assuming mentors and staff are always verified
        verified: userDoc.verified ?? (role !== 'mentee'),
        verificationStatus: userDoc.verificationStatus || 'approved',
        tokens: userDoc.token || 0,
    };

    return NextResponse.json(user);
  } catch (error) {
    console.error('Failed to fetch user by name', error);
    return NextResponse.json({ message: 'Failed to fetch user', error: (error as Error).message }, { status: 500 });
  }
}
