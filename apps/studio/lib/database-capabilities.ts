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

export const IS_QUERY_STATISTICS_ENABLED =
  IS_PLATFORM ||
  !process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',').includes('database:query_statistics')

export const IS_DATABASE_WEBHOOKS_ENABLED =
  IS_PLATFORM ||
  !process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',').includes('database:webhooks')

export const IS_SQL_CRYPTO_ENABLED =
  IS_PLATFORM ||
  !process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',').includes('database:sql_crypto')

export const IS_EVENT_TRIGGERS_ENABLED =
  IS_PLATFORM ||
  !process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',').includes('database:event_triggers')

export function assertEventTriggersEnabled() {
  if (!IS_EVENT_TRIGGERS_ENABLED) {
    throw new Error('Event triggers are disabled for this deployment.')
  }
}

export function isDatabaseExtensionSupported(name: string) {
  if (name === 'pgcrypto') return IS_SQL_CRYPTO_ENABLED
  if (name === 'pg_stat_statements') return IS_QUERY_STATISTICS_ENABLED
  if (name === 'pg_net') return IS_DATABASE_WEBHOOKS_ENABLED
  return true
}

export function assertDatabaseExtensionSupported(name: string) {
  if (!isDatabaseExtensionSupported(name)) {
    throw new Error(`The ${name} extension is disabled for this deployment.`)
  }
}

export function assertDatabaseWebhooksEnabled() {
  if (!IS_DATABASE_WEBHOOKS_ENABLED) {
    throw new Error('Database webhooks are disabled for this deployment.')
  }
}

export function isQueryStatisticsSql(sql: string) {
  return /\bpg_stat_statements(?:_reset)?\b/i.test(sql)
}
