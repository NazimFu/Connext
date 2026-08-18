import 'server-only';

import type { Container } from '@azure/cosmos';

const partitionKeyFieldCache = new Map<string, string>();

/**
 * Resolves a container's actual partition key field (e.g. "id", "menteeUID")
 * by reading its metadata once and caching the result, instead of guessing.
 */
export async function getPartitionKeyField(container: Container): Promise<string> {
  const cached = partitionKeyFieldCache.get(container.id);
  if (cached) return cached;

  const { resource } = await container.read();
  const path = resource?.partitionKey?.paths?.[0] ?? '/id';
  const field = path.replace(/^\//, '');

  partitionKeyFieldCache.set(container.id, field);
  return field;
}
