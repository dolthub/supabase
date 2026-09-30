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
