import * as sql from 'mssql'

/**
 * Connection settings are derived from the environment, never from code.
 *
 * `SQL_AUTH_MODE=sql` (user + password) exists for the local Docker container only —
 * every Azure SQL server in this project has `azureADOnlyAuthentication` enabled, so
 * a password would not even be accepted. Anywhere else the API authenticates with the
 * user-assigned managed identity, and no credential is stored.
 */
export type SqlConfigError =
  | { kind: 'missing-server-or-database' }
  | { kind: 'missing-sql-credentials' }

export type SqlConfigResult =
  | { ok: true; config: sql.config }
  | { ok: false; error: SqlConfigError }

const CONFIG_ERROR_MESSAGES: Record<SqlConfigError['kind'], string> = {
  'missing-server-or-database': 'SQL_SERVER and SQL_DATABASE must both be set.',
  'missing-sql-credentials': 'SQL_AUTH_MODE=sql requires SQL_USER and SQL_PASSWORD.',
}

export function describeSqlConfigError(error: SqlConfigError): string {
  return CONFIG_ERROR_MESSAGES[error.kind]
}

/**
 * Exported so it can be unit-tested without a database: it is pure, it only reads
 * `env`.
 */
export function buildSqlConfig(env: NodeJS.ProcessEnv = process.env): SqlConfigResult {
  const server = env['SQL_SERVER']
  const database = env['SQL_DATABASE']
  const authMode = env['SQL_AUTH_MODE'] ?? 'mi'

  if (!server || !database) {
    return { ok: false, error: { kind: 'missing-server-or-database' } }
  }

  const base: sql.config = {
    server,
    database,
    options: {
      encrypt: true,
      // The local container serves a self-signed certificate; every other target is
      // a real Azure SQL endpoint whose chain must be validated.
      trustServerCertificate: server === 'localhost',
    },
    connectionTimeout: 30_000,
  }

  if (authMode === 'sql') {
    const user = env['SQL_USER']
    const password = env['SQL_PASSWORD']
    if (!user || !password) {
      return { ok: false, error: { kind: 'missing-sql-credentials' } }
    }
    return { ok: true, config: { ...base, user, password } }
  }

  const clientId = env['SQL_MI_CLIENT_ID']
  return {
    ok: true,
    config: {
      ...base,
      authentication: {
        type: 'azure-active-directory-msi-app-service',
        options: clientId ? { clientId } : {},
      },
    },
  }
}

/** True when the environment holds a usable configuration — does not connect. */
export function isSqlConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return buildSqlConfig(env).ok
}

// One pool per worker process, reused across invocations.
let pool: sql.ConnectionPool | null = null

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool

  const result = buildSqlConfig()
  if (!result.ok) throw new Error(describeSqlConfigError(result.error))

  pool = await sql.connect(result.config)
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
  }
}
