import { v4 as uuidv4 } from 'uuid';
import { UserRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class UserRepository {
  private inMemoryUsers: Map<string, UserRecord> = new Map();

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  public async createUser(data: {
    id?: string;
    name?: string | null;
    email: string;
    password_hash: string;
    avatar_url?: string | null;
    email_verified?: boolean;
    status?: 'active' | 'suspended' | 'deactivated';
  }): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(data.email);
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const id = data.id || uuidv4();
    const now = new Date();
    const record: UserRecord = {
      id,
      name: data.name ? data.name.trim() : null,
      email: normalizedEmail,
      password_hash: data.password_hash,
      avatar_url: data.avatar_url || null,
      email_verified: data.email_verified ?? false,
      status: data.status || 'active',
      created_at: now,
      updated_at: now,
      last_login_at: null,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, avatar_url, email_verified, status, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.name,
          record.email,
          record.password_hash,
          record.avatar_url,
          record.email_verified,
          record.status,
          record.created_at,
          record.updated_at,
          record.last_login_at,
        ]
      );
    } else {
      this.inMemoryUsers.set(record.id, { ...record });
    }

    return record;
  }

  public async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = this.normalizeEmail(email);

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalized]);
      return res.rows[0] || null;
    }

    for (const user of this.inMemoryUsers.values()) {
      if (user.email === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] || null;
    }

    const user = this.inMemoryUsers.get(id);
    return user ? { ...user } : null;
  }

  public async updateLastLogin(id: string): Promise<void> {
    const now = new Date();
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('UPDATE users SET last_login_at = $1, updated_at = $2 WHERE id = $3', [now, now, id]);
    } else {
      const user = this.inMemoryUsers.get(id);
      if (user) {
        user.last_login_at = now;
        user.updated_at = now;
      }
    }
  }

  public async searchUsers(query: string, excludeUserId?: string, limit = 10): Promise<Array<{ id: string; name: string | null; email: string }>> {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const pattern = `%${q}%`;
      const res = excludeUserId
        ? await pool.query(
            `SELECT id, name, email FROM users
             WHERE status = 'active'
               AND id <> $1
               AND (LOWER(email) LIKE $2 OR LOWER(COALESCE(name, '')) LIKE $2)
             ORDER BY name ASC NULLS LAST
             LIMIT $3`,
            [excludeUserId, pattern, limit]
          )
        : await pool.query(
            `SELECT id, name, email FROM users
             WHERE status = 'active'
               AND (LOWER(email) LIKE $1 OR LOWER(COALESCE(name, '')) LIKE $1)
             ORDER BY name ASC NULLS LAST
             LIMIT $2`,
            [pattern, limit]
          );
      return res.rows;
    }

    const matches: Array<{ id: string; name: string | null; email: string }> = [];
    for (const user of this.inMemoryUsers.values()) {
      if (user.status !== 'active') continue;
      if (excludeUserId && user.id === excludeUserId) continue;
      if (
        user.email.toLowerCase().includes(q) ||
        (user.name && user.name.toLowerCase().includes(q))
      ) {
        matches.push({ id: user.id, name: user.name, email: user.email });
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM users');
    }
    this.inMemoryUsers.clear();
  }
}

export const userRepository = new UserRepository();

