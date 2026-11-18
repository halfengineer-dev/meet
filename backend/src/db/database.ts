import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isPostgresReady = false;
let lastDbError: string | null = null;
const dbQueryLatenciesMs: number[] = [];
const MAX_LATENCY_SAMPLES = 200;

export function recordDbQueryLatency(ms: number): void {
  dbQueryLatenciesMs.push(ms);
  if (dbQueryLatenciesMs.length > MAX_LATENCY_SAMPLES) {
    dbQueryLatenciesMs.shift();
  }
}

export function getDbMetrics(): {
  mode: 'postgresql' | 'in_memory';
  connected: boolean;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  avgQueryLatencyMs: number;
  p95QueryLatencyMs: number;
  lastError: string | null;
} {
  const sorted = [...dbQueryLatenciesMs].sort((a, b) => a - b);
  const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
  const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;

  return {
    mode: isPostgresReady ? 'postgresql' : 'in_memory',
    connected: isPostgresReady,
    totalCount: pool ? pool.totalCount : 0,
    idleCount: pool ? pool.idleCount : 0,
    waitingCount: pool ? pool.waitingCount : 0,
    avgQueryLatencyMs: Number(avg.toFixed(2)),
    p95QueryLatencyMs: Number(p95.toFixed(2)),
    lastError: lastDbError,
  };
}

export function getDatabasePool(): Pool | null {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  try {
    pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    pool.on('error', (err) => {
      lastDbError = err.message;
      console.error('[DB] Unexpected error on idle client', err);
    });

    return pool;
  } catch (err) {
    lastDbError = (err as Error).message;
    console.warn('[DB] Failed to initialize PostgreSQL pool:', err);
    return null;
  }
}

export async function runMigrations(client: { query: (sql: string, params?: any[]) => Promise<any> }): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedRes = await client.query('SELECT filename FROM schema_migrations');
  const applied = new Set<string>(appliedRes.rows.map((r: any) => r.filename));

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }
  }

  return newlyApplied;
}

export async function initDatabase(): Promise<boolean> {
  const p = getDatabasePool();
  if (!p) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_IN_MEMORY_IN_PROD !== 'true') {
      console.warn('⚠️ [DB] Production mode without DATABASE_URL. Configure DATABASE_URL for PostgreSQL persistence.');
    } else {
      console.log('[DB] No DATABASE_URL configured or pool unavailable. Operating in in-memory repository mode.');
    }
    isPostgresReady = false;
    return false;
  }

  try {
    const start = Date.now();
    const client = await p.connect();
    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      await client.query(schemaSql);
      const newlyApplied = await runMigrations(client);
      recordDbQueryLatency(Date.now() - start);
      isPostgresReady = true;
      lastDbError = null;
      console.log(
        `✅ [DB] PostgreSQL connected and schema migrated successfully.${newlyApplied.length ? ` Applied migrations: ${newlyApplied.join(', ')}` : ''}`
      );
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    lastDbError = (err as Error).message;
    isPostgresReady = false;
    if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL && process.env.ALLOW_IN_MEMORY_IN_PROD !== 'true') {
      throw new Error(`[DB] Fatal: PostgreSQL connection/migration failed in production: ${lastDbError}`);
    }
    console.warn('[DB] Could not connect to PostgreSQL. Operating in in-memory repository mode:', lastDbError);
    return false;
  }
}

export function isUsingPostgres(): boolean {
  return isPostgresReady;
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!isPostgresReady || !pool) {
    return { ok: false, latencyMs: 0, error: lastDbError || 'PostgreSQL not configured' };
  }
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    recordDbQueryLatency(latencyMs);
    return { ok: true, latencyMs };
  } catch (err: any) {
    lastDbError = err.message;
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isPostgresReady = false;
  }
}
