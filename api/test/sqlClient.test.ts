import { describe, expect, it } from 'vitest'
import { buildSqlConfig, describeSqlConfigError, isSqlConfigured } from '../src/lib/sqlClient'

const LOCAL = {
  SQL_SERVER: 'localhost',
  SQL_DATABASE: 'lehub-local',
  SQL_AUTH_MODE: 'sql',
  SQL_USER: 'sa',
  SQL_PASSWORD: 'secret',
}

const CLOUD = {
  SQL_SERVER: 'sql-lehub-dev.database.windows.net',
  SQL_DATABASE: 'lehub',
  SQL_AUTH_MODE: 'mi',
  SQL_MI_CLIENT_ID: 'a16fbc49-5791-4687-8501-7b5b6164fa4f',
}

describe('buildSqlConfig', () => {
  it('uses SQL authentication locally', () => {
    const result = buildSqlConfig(LOCAL)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.user).toBe('sa')
    expect(result.config.password).toBe('secret')
    expect(result.config.authentication).toBeUndefined()
  })

  it('trusts the server certificate only for localhost', () => {
    const local = buildSqlConfig(LOCAL)
    const cloud = buildSqlConfig(CLOUD)
    expect(local.ok && local.config.options?.trustServerCertificate).toBe(true)
    expect(cloud.ok && cloud.config.options?.trustServerCertificate).toBe(false)
  })

  it('always encrypts', () => {
    for (const env of [LOCAL, CLOUD]) {
      const result = buildSqlConfig(env)
      expect(result.ok && result.config.options?.encrypt).toBe(true)
    }
  })

  it('uses the managed identity when the mode is not sql, and carries no credential', () => {
    const result = buildSqlConfig(CLOUD)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.authentication?.type).toBe('azure-active-directory-msi-app-service')
    expect(result.config.user).toBeUndefined()
    expect(result.config.password).toBeUndefined()
  })

  it('defaults to the managed identity when SQL_AUTH_MODE is absent', () => {
    const { SQL_AUTH_MODE: _omitted, ...withoutMode } = CLOUD
    const result = buildSqlConfig(withoutMode)
    expect(result.ok && result.config.authentication?.type).toBe(
      'azure-active-directory-msi-app-service',
    )
  })

  it('reports a missing server or database', () => {
    const result = buildSqlConfig({ SQL_DATABASE: 'lehub' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(describeSqlConfigError(result.error)).toContain('SQL_SERVER')
  })

  it('reports missing credentials in sql mode rather than falling back silently', () => {
    const { SQL_PASSWORD: _omitted, ...withoutPassword } = LOCAL
    const result = buildSqlConfig(withoutPassword)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('missing-sql-credentials')
  })
})

describe('isSqlConfigured', () => {
  it('is true for a complete configuration and false otherwise', () => {
    expect(isSqlConfigured(LOCAL)).toBe(true)
    expect(isSqlConfigured({})).toBe(false)
  })
})
