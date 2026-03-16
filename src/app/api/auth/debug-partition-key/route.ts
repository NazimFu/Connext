// src/app/api/auth/debug-partition-key/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT!,
  key: process.env.COSMOS_DB_KEY!,
});

const database = client.database(process.env.COSMOS_DB_DATABASE!);

/**
 * Debug endpoint to discover the actual partition key configuration
 * GET /api/auth/debug-partition-key?container=mentee
 */
export async function GET(request: NextRequest) {
  try {
    const containerName = request.nextUrl.searchParams.get('container') || 'mentee';
    const container = database.container(containerName);

    // Get a sample temp_signup document
    const { resources } = await container.items
      .query({
        query: `SELECT * FROM c WHERE c.type = 'temp_signup' LIMIT 1`,
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({
        message: 'No temp_signup documents found in container',
        container: containerName,
      });
    }

    const sampleDoc = resources[0];

    // Try to get container properties to see partition key info
    const containerResponse = await database.containers
      .readAll()
      .fetchAll();

    const containerInfo = containerResponse.resources.find(
      (c) => c.id === containerName
    );

    return NextResponse.json({
      success: true,
      container: containerName,
      sampleDocument: {
        id: sampleDoc.id,
        type: sampleDoc.type,
        email: sampleDoc.email,
        role: sampleDoc.role,
        allFields: Object.keys(sampleDoc),
      },
      containerPartitionKeyPath:
        containerInfo?.partitionKey?.paths || 'Unknown',
      containerId: containerInfo?.id,
      debug: {
        suggestion:
          'The partition key path should be listed above. Use that path value from the sample document as the partition key when deleting.',
      },
    });
  } catch (error: any) {
    console.error('[DEBUG-PARTITION] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get partition key info',
        message: error.message?.split('\n')[0],
      },
      { status: 500 }
    );
  }
}
