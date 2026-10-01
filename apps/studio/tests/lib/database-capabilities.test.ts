import { safeSql } from '@supabase/pg-meta'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ enabled: false }))
vi.mock('@/lib/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/constants')>()),
  get IS_PLATFORM() {
    return platform.enabled
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  platform.enabled = false
})

describe('optional database extensions', () => {
  const disabled = 'database:query_statistics,database:webhooks,database:sql_crypto'

  it.each([false, true])('keeps extensions enabled by default (hosted=%s)', async (hosted) => {
    platform.enabled = hosted
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', hosted ? disabled : '')
    const capabilities = await import('@/lib/database-capabilities')
    expect(capabilities.IS_QUERY_STATISTICS_ENABLED).toBe(true)
    expect(capabilities.IS_DATABASE_WEBHOOKS_ENABLED).toBe(true)
    expect(capabilities.IS_SQL_CRYPTO_ENABLED).toBe(true)
    for (const name of ['pgcrypto', 'pg_stat_statements', 'pg_net', 'uuid-ossp']) {
      expect(capabilities.isDatabaseExtensionSupported(name)).toBe(true)
    }
  })

  it('rejects extension and webhook installation before making a request', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', disabled)
    const { enableDatabaseExtension } =
      await import('@/data/database-extensions/database-extension-enable-mutation')
    const { enableDatabaseWebhooks } = await import('@/data/database/hooks-enable-mutation')
    for (const name of ['pgcrypto', 'pg_stat_statements', 'pg_net']) {
      await expect(
        enableDatabaseExtension({
          projectRef: 'default',
          name,
          schema: 'public',
          version: '1.0',
        })
      ).rejects.toThrow(`The ${name} extension is disabled`)
    }
    await expect(enableDatabaseWebhooks({ ref: 'default' })).rejects.toThrow(
      'Database webhooks are disabled'
    )
    const { createDatabaseTrigger } =
      await import('@/data/database-triggers/database-trigger-create-mutation')
    await expect(
      createDatabaseTrigger({
        projectRef: 'default',
        payload: {
          name: 'notify',
          schema: 'public',
          table: 'items',
          function_schema: 'supabase_functions',
          function_name: 'http_request',
          activation: 'AFTER',
          events: ['INSERT'],
        },
      })
    ).rejects.toThrow('Database webhooks are disabled')
  }, 30_000)

  it('does not fetch workload index suggestions or offer unavailable SQL templates', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', disabled)
    const { getTableIndexAdvisorSuggestions } =
      await import('@/data/database/table-index-advisor-query')
    expect(
      await getTableIndexAdvisorSuggestions({
        projectRef: 'default',
        schema: 'public',
        table: 'items',
      })
    ).toEqual({ suggestions: [], columnsWithSuggestions: [] })
    const { SQL_TEMPLATES } = await import('@/components/interfaces/SQLEditor/SQLEditor.queries')
    expect(
      SQL_TEMPLATES.some((template) =>
        /pg_stat_statements|pgcrypto|pg_net|net\.http_/i.test(template.sql)
      )
    ).toBe(false)
    expect(SQL_TEMPLATES.some((template) => template.title === 'Create table')).toBe(true)
    const { NOTEBOOK_TEMPLATES } = await import('@/components/interfaces/Explorer/templates')
    for (const template of NOTEBOOK_TEMPLATES) {
      expect(
        template
          .buildCells()
          .some(
            (cell) =>
              cell._tag === 'database_cell' && /pg_stat_statements/i.test(cell.unchecked_sql)
          )
      ).toBe(false)
    }
  }, 30_000)

  it('keeps the optional capabilities independent', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', 'database:webhooks')
    const capabilities = await import('@/lib/database-capabilities')
    expect(capabilities.isDatabaseExtensionSupported('pg_net')).toBe(false)
    expect(capabilities.isDatabaseExtensionSupported('pgcrypto')).toBe(true)
    expect(capabilities.isDatabaseExtensionSupported('pg_stat_statements')).toBe(true)
    expect(capabilities.isDatabaseExtensionSupported('uuid-ossp')).toBe(true)
    expect(capabilities.IS_REPLICATION_ENABLED).toBe(true)
  })
})

describe('replication capability', () => {
  it('keeps replication enabled for the default self-hosted stack', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', '')
    const { IS_REPLICATION_ENABLED, assertReplicationEnabled } =
      await import('@/lib/database-capabilities')
    expect(IS_REPLICATION_ENABLED).toBe(true)
    expect(assertReplicationEnabled).not.toThrow()
  })

  it('does not disable hosted projects', async () => {
    platform.enabled = true
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', 'database:replication')
    const { IS_REPLICATION_ENABLED } = await import('@/lib/database-capabilities')
    expect(IS_REPLICATION_ENABLED).toBe(true)
  })

  it('skips publication SQL and rejects mutations when replication is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', 'realtime:all,database:replication')
    const { getDatabasePublications } =
      await import('@/data/database-publications/database-publications-query')
    const { createDatabasePublication } =
      await import('@/data/database-publications/database-publications-create-mutation')
    const { updateDatabasePublication } =
      await import('@/data/database-publications/database-publications-update-mutation')

    // Any SQL request would fail through the test suite's strict MSW handler.
    expect(await getDatabasePublications({ projectRef: 'default' })).toEqual([])
    await expect(
      createDatabasePublication({ projectRef: 'default', name: 'supabase_realtime' })
    ).rejects.toThrow('Publications and replication are disabled')
    await expect(
      updateDatabasePublication({ projectRef: 'default', id: 1, tables: [] })
    ).rejects.toThrow('Publications and replication are disabled')

    const { SQL_TEMPLATES } = await import('@/components/interfaces/SQLEditor/SQLEditor.queries')
    expect(
      SQL_TEMPLATES.some((template) => /publication|pg_replication_slots/i.test(template.sql))
    ).toBe(false)
    expect(SQL_TEMPLATES.some((template) => template.title === 'Create table')).toBe(true)
  })
})

describe('event trigger capability', () => {
  it.each([false, true])('keeps event triggers enabled by default (hosted=%s)', async (hosted) => {
    platform.enabled = hosted
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', hosted ? 'database:event_triggers' : '')
    const { IS_EVENT_TRIGGERS_ENABLED, assertEventTriggersEnabled } =
      await import('@/lib/database-capabilities')
    expect(IS_EVENT_TRIGGERS_ENABLED).toBe(true)
    expect(assertEventTriggersEnabled).not.toThrow()
  })

  it('skips introspection SQL and rejects mutations when disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', 'database:event_triggers')
    const { getDatabaseEventTriggers } =
      await import('@/data/database-event-triggers/database-event-triggers-query')
    const { createDatabaseEventTrigger } =
      await import('@/data/database-event-triggers/database-event-trigger-create-mutation')
    const { deleteDatabaseEventTrigger } =
      await import('@/data/database-event-triggers/database-event-trigger-delete-mutation')
    const { IS_REPLICATION_ENABLED, IS_DATABASE_WEBHOOKS_ENABLED } =
      await import('@/lib/database-capabilities')

    // Strict MSW handlers would reject any SQL request made by these calls.
    expect(await getDatabaseEventTriggers({ projectRef: 'default' })).toEqual([])
    await expect(
      createDatabaseEventTrigger({ projectRef: 'default', sql: safeSql`CREATE EVENT TRIGGER test` })
    ).rejects.toThrow('Event triggers are disabled')
    await expect(
      deleteDatabaseEventTrigger({
        projectRef: 'default',
        trigger: {
          oid: 1,
          name: 'test',
          event: 'ddl_command_end',
          enabled_mode: 'ORIGIN',
          tags: null,
          function_name: null,
          function_schema: null,
          owner: null,
          function_definition: null,
        },
      })
    ).rejects.toThrow('Event triggers are disabled')
    expect(IS_REPLICATION_ENABLED).toBe(true)
    expect(IS_DATABASE_WEBHOOKS_ENABLED).toBe(true)
  })
})
