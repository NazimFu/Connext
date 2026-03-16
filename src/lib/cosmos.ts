
import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE;
const containerId = process.env.COSMOS_DB_CONTAINER; // This is now a default/fallback

if (!endpoint || !key || !databaseId) {
    throw new Error("Azure Cosmos DB environment variables for endpoint, key, and database are not set.");
}

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);
// We no longer export a generic container.
// All services will get their specific container from the `database` object.

export { client, database };
