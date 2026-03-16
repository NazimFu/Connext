// src/app/api/auth/verify-signup-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = client.database(process.env.COSMOS_DB_DATABASE!);

export async function POST(request: NextRequest) {
  try {
    const { signupId, code } = await request.json();

    if (!signupId || !code || String(code).length !== 4) {
      return NextResponse.json(
        { error: 'Invalid or missing code / signupId' },
        { status: 400 }
      );
    }

    // Try to find the temp_signup document in both containers
    let record = null;
    let container = null;
    
    const menteeContainer = database.container(process.env.COSMOS_DB_CONTAINER_MENTEE!);
    const mentorContainer = database.container(process.env.COSMOS_DB_CONTAINER_ID!);
    
    console.log(`[VERIFY] Searching for signupId: ${signupId}`);
    console.log(`[VERIFY] Mentee container: ${process.env.COSMOS_DB_CONTAINER_MENTEE}`);
    console.log(`[VERIFY] Mentor container: ${process.env.COSMOS_DB_CONTAINER_ID}`);
    
    const querySpec = {
      query: `
        SELECT * FROM c 
        WHERE c.id = @id 
        AND c.type = 'temp_signup'
      `,
      parameters: [{ name: '@id', value: signupId }],
    };

    // Search mentee container
    console.log(`[VERIFY] Searching mentee container...`);
    try {
      const { resources: menteeResources } = await menteeContainer.items
        .query(querySpec)
        .fetchAll();
      console.log(`[VERIFY] Mentee container results: ${menteeResources.length}`);
      
      if (menteeResources.length > 0) {
        record = menteeResources[0];
        container = menteeContainer;
        console.log(`[VERIFY] Found in mentee container`);
      }
    } catch (err: any) {
      console.log(`[VERIFY] Mentee container search failed:`, err.message);
    }
    
    // If not found in mentee, try mentor container
    if (!record) {
      console.log(`[VERIFY] Searching mentor container...`);
      try {
        const { resources: mentorResources } = await mentorContainer.items
          .query(querySpec)
          .fetchAll();
        console.log(`[VERIFY] Mentor container results: ${mentorResources.length}`);
        
        if (mentorResources.length > 0) {
          record = mentorResources[0];
          container = mentorContainer;
          console.log(`[VERIFY] Found in mentor container`);
        }
      } catch (err: any) {
        console.log(`[VERIFY] Mentor container search failed:`, err.message);
      }
    }

    if (!record || !container) {
      console.error(`[VERIFY] Document NOT FOUND for signupId: ${signupId}`);
      return NextResponse.json(
        { 
          error: 'Signup session not found or already completed',
          debug: {
            signupId,
            searchedContainers: [
              process.env.COSMOS_DB_CONTAINER_MENTEE,
              process.env.COSMOS_DB_CONTAINER_ID
            ]
          }
        },
        { status: 404 }
      );
    }

    // Check if code has expired
    if (Date.now() > record.expiresAt) {
      // Optional: clean up expired record (safe)
      try {
        console.log(`[VERIFY] Code expired, deleting document: ${record.id}`);
        await container.item(record.id, record.id).delete();
        console.log(`[VERIFY] Expired record deleted successfully`);
      } catch (e: any) {
        // ignore cleanup failure on expired record
        console.log(`[VERIFY] Failed to delete expired record (non-critical):`, e.message);
      }
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 410 }
      );
    }

    // Verify the code
    if (record.code !== code) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Safe cleanup - delete temp signup record after successful verification
    try {
      console.log(`[VERIFY] Attempting deletion:`, {
        documentId: record.id,
        email: record.email,
        containerName: container.id,
      });
      
      // Try multiple partition key approaches
      let deleted = false;
      const partitionKeyAttempts = [
        { value: record.menteeUID, name: 'menteeUID' },
        { value: record.mentorUID, name: 'mentorUID' },
        { value: record.id, name: 'id' },
        { value: record.email?.toLowerCase(), name: 'email (lowercase)' },
        { value: record.role, name: 'role' }
      ];
      
      for (const attempt of partitionKeyAttempts) {
        if (!attempt.value) continue; // Skip if value is undefined
        
        try {
          console.log(`[VERIFY] Trying partition key '${attempt.name}' with value: '${attempt.value}'`);
          const deleteResponse = await container.item(record.id, attempt.value).delete();
          console.log(`[VERIFY] ✓ Deleted using '${attempt.name}' as partition key:`, {
            statusCode: deleteResponse.statusCode,
            activityId: deleteResponse.activityId
          });
          deleted = true;
          break;
        } catch (err: any) {
          if (err.statusCode === 404 || err.code === 404) {
            console.log(`[VERIFY] Partition key '${attempt.name}' returned 404`);
            continue;
          } else {
            console.log(`[VERIFY] Partition key '${attempt.name}' error (code ${err.code || err.statusCode}): ${err.message?.split('\n')[0]}`);
            throw err;
          }
        }
      }
      
      if (!deleted) {
        console.warn(`[VERIFY] ⚠️ Could not delete - document may use custom partition key or no longer exists`);
        console.log(`[VERIFY] Document ID: ${record.id}, Email: ${record.email}`);
      }
      
    } catch (deleteErr: any) {
      // Only log if it's a real error (not 404)
      if (deleteErr.statusCode !== 404 && deleteErr.code !== 404) {
        console.error(`[VERIFY] ⚠️ Deletion error:`, {
          message: deleteErr.message?.split('\n')[0] || deleteErr.message,
          code: deleteErr.code,
          statusCode: deleteErr.statusCode,
        });
      }
      // Don't throw - allow the response to continue since verification succeeded
      // The cleanup is best-effort; temp records will be cleaned by scheduled cleanup job
    }

    // Return the stored signup data for the frontend to complete account creation
    return NextResponse.json({
      success: true,
      email: record.email,
      password: record.password,
      role: record.role,
      data: record,
      message: 'Code verified successfully',
    });

  } catch (error: any) {
    console.error('Error in verify-signup-code:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 6).join('\n'),
    });

    if (error.code === 'auth/email-already-in-use') {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 409 }
      );
    }

    if (error.code === 404) {
      return NextResponse.json(
        { error: 'Resource not found during verification' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Verification failed',
        details: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}