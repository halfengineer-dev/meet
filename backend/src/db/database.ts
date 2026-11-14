import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isPostgresReady = false;

export function getDatabasePool(): Pool | null {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  try {
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });

    return pool;
  } catch (err) {
    console.warn('[DB] Failed to initialize PostgreSQL pool:', err);
    return null;
  }
}

export async function initDatabase(): Promise<boolean> {
  const p = getDatabasePool();
  if (!p) {
    console.log('[DB] No DATABASE_URL configured or pool unavailable. Operating in in-memory repository mode.');
    isPostgresReady = false;
    return false;
  }

  try {
    const client = await p.connect();
    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      await client.query(schemaSql);
      isPostgresReady = true;
      console.log('✅ [DB] PostgreSQL connected and schema migrated successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[DB] Could not connect to PostgreSQL. Operating in in-memory repository mode:', (err as Error).message);
    isPostgresReady = false;
    return false;
  }
}

export function isUsingPostgres(): boolean {
  return isPostgresReady;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isPostgresReady = false;
  }
}

