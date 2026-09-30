import { IS_PLATFORM } from '@/lib/constants'

// Build-time capability for self-hosted databases without logical replication.
export const IS_REPLICATION_ENABLED =
  IS_PLATFORM ||
  !process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',').includes('database:replication')

export function assertReplicationEnabled() {
  if (!IS_REPLICATION_ENABLED) {
    throw new Error('Publications and replication are disabled for this deployment.')
  }
}
