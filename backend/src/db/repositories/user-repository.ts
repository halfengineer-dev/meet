import { v4 as uuidv4 } from 'uuid';
import { UserRecord, UserRole } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class UserRepository {
  private inMemoryUsers: Map<string, UserRecord> = new Map();

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeRow(row: any): UserRecord {
    return {
      ...row,
      role: row.role === 'admin' ? 'admin' : 'user',
    };
  }

  public async createUser(data: {
    id?: string;
    name?: string | null;
    email: string;
    password_hash: string;
    avatar_url?: string | null;
    email_verified?: boolean;
    role?: UserRole;
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
      role: data.role === 'admin' ? 'admin' : 'user',
      status: data.status || 'active',
      created_at: now,
      updated_at: now,
      last_login_at: null,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, avatar_url, email_verified, role, status, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.id,
          record.name,
          record.email,
          record.password_hash,
          record.avatar_url,
          record.email_verified,
          record.role,
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
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
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
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const user = this.inMemoryUsers.get(id);
    return user ? { ...user } : null;
  }

  public async listUsers(search?: string): Promise<UserRecord[]> {
    const q = (search || '').trim().toLowerCase();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      if (q) {
        const pattern = `%${q}%`;
        const res = await pool.query(
          `SELECT * FROM users
           WHERE LOWER(email) LIKE $1 OR LOWER(COALESCE(name, '')) LIKE $1
           ORDER BY created_at DESC`,
          [pattern]
        );
        return res.rows.map(row => this.normalizeRow(row));
      }
      const res = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return res.rows.map(row => this.normalizeRow(row));
    }

    const all = Array.from(this.inMemoryUsers.values())
      .filter(user => {
        if (!q) return true;
        return user.email.toLowerCase().includes(q)
          || (user.name ? user.name.toLowerCase().includes(q) : false);
      })
      .map(user => ({ ...user }));

    return all.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async updateUser(
    id: string,
    updates: {
      name?: string | null;
      role?: UserRole;
      status?: 'active' | 'suspended' | 'deactivated';
      password_hash?: string;
    }
  ): Promise<UserRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date();
    const nextName = updates.name !== undefined ? (updates.name ? updates.name.trim() : null) : existing.name;
    const nextRole: UserRole = updates.role !== undefined ? (updates.role === 'admin' ? 'admin' : 'user') : existing.role;
    const nextStatus = updates.status !== undefined ? updates.status : existing.status;
    const nextPasswordHash = updates.password_hash !== undefined ? updates.password_hash : existing.password_hash;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE users
         SET name = $1, role = $2, status = $3, password_hash = $4, updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [nextName, nextRole, nextStatus, nextPasswordHash, now, id]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const updated: UserRecord = {
      ...existing,
      name: nextName,
      role: nextRole,
      status: nextStatus,
      password_hash: nextPasswordHash,
      updated_at: now,
    };
    this.inMemoryUsers.set(id, updated);
    return { ...updated };
  }

  public async deleteUser(id: string): Promise<boolean> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return (res.rowCount || 0) > 0;
    }

    return this.inMemoryUsers.delete(id);
  }

  public async countByRole(role: UserRole): Promise<number> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1', [role]);
      return res.rows[0]?.count || 0;
    }

    let count = 0;
    for (const user of this.inMemoryUsers.values()) {
      if (user.role === role) count++;
    }
    return count;
  }

  public async findEarliestUser(): Promise<UserRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM users ORDER BY created_at ASC LIMIT 1');
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    let earliest: UserRecord | null = null;
    for (const user of this.inMemoryUsers.values()) {
      if (!earliest || user.created_at.getTime() < earliest.created_at.getTime()) {
        earliest = { ...user };
      }
    }
    return earliest;
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

