// src/app/api/auth/cleanup-temp-signups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = client.database(process.env.COSMOS_DB_DATABASE!);

/**
 * Manual cleanup endpoint to remove expired or orphaned temp_signup documents
 * Can be called manually or set up as a scheduled job
 */
export async function POST(request: NextRequest) {
  try {
    const menteeContainer = database.container(process.env.COSMOS_DB_CONTAINER_MENTEE!);
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
    
    const now = Date.now();
    let deletedCount = 0;
    let errors: any[] = [];
    
    // Query for expired temp_signup documents in both containers
    const querySpec = {
      query: `
        SELECT c.id, c.email, c.expiresAt, c.role 
        FROM c 
        WHERE c.type = 'temp_signup' 
        AND c.expiresAt < @now
      `,
      parameters: [{ name: '@now', value: now }],
    };
    
    console.log(`[CLEANUP] Starting cleanup of expired temp_signup documents...`);
    
    // Clean up mentee container
    try {
      const { resources: expiredMentees } = await menteeContainer.items
        .query(querySpec)
        .fetchAll();
      
      console.log(`[CLEANUP] Found ${expiredMentees.length} expired temp_signup in mentee container`);
      
      for (const doc of expiredMentees) {
        try {
          let deleted = false;
          const partitionKeyAttempts = [
            { value: doc.menteeUID, name: 'menteeUID' },
            { value: doc.id, name: 'id' },
            { value: doc.email, name: 'email' },
            { value: doc.role, name: 'role' }
          ];
          
          for (const attempt of partitionKeyAttempts) {
            if (!attempt.value) continue;
            try {
              await menteeContainer.item(doc.id, attempt.value).delete();
              console.log(`[CLEANUP] ✓ Deleted mentee signup: ${doc.id} (${doc.email}) using '${attempt.name}'`);
              deleted = true;
              break;
            } catch (err: any) {
              if (err.statusCode === 404) {
                continue;
              } else {
                throw err;
              }
            }
          }
          
          if (deleted) deletedCount++;
          else console.warn(`[CLEANUP] Could not delete ${doc.id} - unknown partition key`);
        } catch (err: any) {
          console.error(`[CLEANUP] Failed to delete ${doc.id}:`, err.message?.split('\n')[0]);
          errors.push({ id: doc.id, email: doc.email, error: err.message?.split('\n')[0] });
        }
      }
    } catch (err: any) {
      console.error(`[CLEANUP] Error querying mentee container:`, err.message);
      errors.push({ container: 'mentee', error: err.message });
    }
    
    // Clean up mentor container
    try {
      const { resources: expiredMentors } = await mentorContainer.items
        .query(querySpec)
        .fetchAll();
      
      console.log(`[CLEANUP] Found ${expiredMentors.length} expired temp_signup in mentor container`);
      
      for (const doc of expiredMentors) {
        try {
          let deleted = false;
          const partitionKeyAttempts = [
            { value: doc.id, name: 'id' },
            { value: doc.email, name: 'email' },
            { value: doc.role, name: 'role' }
          ];
          
          for (const attempt of partitionKeyAttempts) {
            try {
              await mentorContainer.item(doc.id, attempt.value).delete();
              console.log(`[CLEANUP] Deleted mentor signup: ${doc.id} (${doc.email}) using partition key '${attempt.name}'`);
              deleted = true;
              break;
            } catch (err: any) {
              if (err.statusCode === 404) {
                continue;
              } else {
                throw err;
              }
            }
          }
          
          if (deleted) deletedCount++;
          else console.warn(`[CLEANUP] Could not delete ${doc.id} - unknown partition key`);
        } catch (err: any) {
          console.error(`[CLEANUP] Failed to delete ${doc.id}:`, err.message);
          errors.push({ id: doc.id, email: doc.email, error: err.message });
        }
      }
    } catch (err: any) {
      console.error(`[CLEANUP] Error querying mentor container:`, err.message);
      errors.push({ container: 'mentor', error: err.message });
    }
    
    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Cleanup complete. Deleted ${deletedCount} expired temp_signup documents.`,
    });

  } catch (error: any) {
    console.error('[CLEANUP] Cleanup failed:', error);
    return NextResponse.json(
      {
        error: 'Cleanup failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to view all temp_signup documents (for debugging)
 */
export async function GET(request: NextRequest) {
  try {
    const menteeContainer = database.container(process.env.COSMOS_DB_CONTAINER_MENTEE!);
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
    
    const now = Date.now();
    
    const querySpec = {
      query: `
        SELECT c.id, c.email, c.role, c.createdAt, c.expiresAt,
        (c.expiresAt < @now) as isExpired
        FROM c 
        WHERE c.type = 'temp_signup'
        ORDER BY c.createdAt DESC
      `,
      parameters: [{ name: '@now', value: now }],
    };
    
    const mentees = await menteeContainer.items.query(querySpec).fetchAll();
    const mentors = await mentorContainer.items.query(querySpec).fetchAll();
    
    const allTempSignups = [
      ...mentees.resources.map(r => ({ ...r, container: 'mentee' })),
      ...mentors.resources.map(r => ({ ...r, container: 'mentor' }))
    ];
    
    return NextResponse.json({
      total: allTempSignups.length,
      expired: allTempSignups.filter(s => s.isExpired).length,
      active: allTempSignups.filter(s => !s.isExpired).length,
      signups: allTempSignups,
    });

  } catch (error: any) {
    console.error('[CLEANUP] Failed to list temp signups:', error);
    return NextResponse.json(
      {
        error: 'Failed to list temp signups',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
