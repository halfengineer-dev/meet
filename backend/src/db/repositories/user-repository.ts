import { v4 as uuidv4 } from 'uuid';
import { PlatformAdminRole, UserRecord, UserRole } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class UserRepository {
  private inMemoryUsers: Map<string, UserRecord> = new Map();

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeRow(row: any): UserRecord {
    const role: UserRole = row.role === 'admin' ? 'admin' : 'user';
    const adminRole: PlatformAdminRole | null = row.admin_role
      ? (row.admin_role as PlatformAdminRole)
      : role === 'admin'
        ? 'super_admin'
        : null;

    return {
      ...row,
      role,
      admin_role: adminRole,
      organization_id: row.organization_id || null,
      country: row.country || null,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
      last_login_at: row.last_login_at ? new Date(row.last_login_at) : null,
      last_active_at: row.last_active_at ? new Date(row.last_active_at) : null,
      deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
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
    admin_role?: PlatformAdminRole | null;
    organization_id?: string | null;
    country?: string | null;
    status?: 'active' | 'suspended' | 'deactivated';
  }): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(data.email);
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const id = data.id || uuidv4();
    const now = new Date();
    const normalizedRole: UserRole =
      data.role === 'admin' || Boolean(data.admin_role) ? 'admin' : 'user';
    const resolvedAdminRole: PlatformAdminRole | null =
      data.admin_role !== undefined
        ? data.admin_role
        : normalizedRole === 'admin'
          ? 'super_admin'
          : null;

    const record: UserRecord = {
      id,
      name: data.name ? data.name.trim() : null,
      email: normalizedEmail,
      password_hash: data.password_hash,
      avatar_url: data.avatar_url || null,
      email_verified: data.email_verified ?? false,
      role: normalizedRole,
      admin_role: resolvedAdminRole,
      organization_id: data.organization_id || null,
      country: data.country || null,
      status: data.status || 'active',
      created_at: now,
      updated_at: now,
      last_login_at: null,
      last_active_at: null,
      deleted_at: null,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, avatar_url, email_verified, role, admin_role, organization_id, country, status, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          record.id,
          record.name,
          record.email,
          record.password_hash,
          record.avatar_url,
          record.email_verified,
          record.role,
          record.admin_role,
          record.organization_id,
          record.country,
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

  public async findByEmail(email: string, includeDeleted = false): Promise<UserRecord | null> {
    const normalized = this.normalizeEmail(email);

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const sql = includeDeleted
        ? 'SELECT * FROM users WHERE email = $1 LIMIT 1'
        : 'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1';
      const res = await pool.query(sql, [normalized]);
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    for (const user of this.inMemoryUsers.values()) {
      if (user.email === normalized && (includeDeleted || !user.deleted_at)) {
        return { ...user };
      }
    }
    return null;
  }

  public async findById(id: string, includeDeleted = false): Promise<UserRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const sql = includeDeleted
        ? 'SELECT * FROM users WHERE id = $1 LIMIT 1'
        : 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1';
      const res = await pool.query(sql, [id]);
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const user = this.inMemoryUsers.get(id);
    if (!user) return null;
    if (!includeDeleted && user.deleted_at) return null;
    return { ...user };
  }

  public async listUsers(search?: string, includeDeleted = false): Promise<UserRecord[]> {
    const q = (search || '').trim().toLowerCase();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const deletedClause = includeDeleted ? '1=1' : 'deleted_at IS NULL';
      if (q) {
        const pattern = `%${q}%`;
        const res = await pool.query(
          `SELECT * FROM users
           WHERE ${deletedClause} AND (LOWER(email) LIKE $1 OR LOWER(COALESCE(name, '')) LIKE $1)
           ORDER BY created_at DESC`,
          [pattern]
        );
        return res.rows.map(row => this.normalizeRow(row));
      }
      const res = await pool.query(`SELECT * FROM users WHERE ${deletedClause} ORDER BY created_at DESC`);
      return res.rows.map(row => this.normalizeRow(row));
    }

    const all = Array.from(this.inMemoryUsers.values())
      .filter(user => {
        if (!includeDeleted && user.deleted_at) return false;
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
      admin_role?: PlatformAdminRole | null;
      organization_id?: string | null;
      country?: string | null;
      email_verified?: boolean;
      status?: 'active' | 'suspended' | 'deactivated';
      password_hash?: string;
    }
  ): Promise<UserRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date();
    const nextName = updates.name !== undefined ? (updates.name ? updates.name.trim() : null) : existing.name;
    let nextRole: UserRole = updates.role !== undefined ? (updates.role === 'admin' ? 'admin' : 'user') : existing.role;
    let nextAdminRole: PlatformAdminRole | null =
      updates.admin_role !== undefined ? updates.admin_role : (existing.admin_role ?? null);

    if (updates.admin_role !== undefined) {
      nextRole = updates.admin_role ? 'admin' : 'user';
    } else if (updates.role === 'admin' && !nextAdminRole) {
      nextAdminRole = 'super_admin';
    } else if (updates.role === 'user') {
      nextAdminRole = null;
    }

    const nextOrgId = updates.organization_id !== undefined ? updates.organization_id : (existing.organization_id ?? null);
    const nextCountry = updates.country !== undefined ? updates.country : (existing.country ?? null);
    const nextEmailVerified = updates.email_verified !== undefined ? updates.email_verified : existing.email_verified;
    const nextStatus = updates.status !== undefined ? updates.status : existing.status;
    const nextPasswordHash = updates.password_hash !== undefined ? updates.password_hash : existing.password_hash;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE users
         SET name = $1, role = $2, admin_role = $3, organization_id = $4, country = $5,
             email_verified = $6, status = $7, password_hash = $8, updated_at = $9
         WHERE id = $10 AND deleted_at IS NULL
         RETURNING *`,
        [nextName, nextRole, nextAdminRole, nextOrgId, nextCountry, nextEmailVerified, nextStatus, nextPasswordHash, now, id]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const updated: UserRecord = {
      ...existing,
      name: nextName,
      role: nextRole,
      admin_role: nextAdminRole,
      organization_id: nextOrgId,
      country: nextCountry,
      email_verified: nextEmailVerified,
      status: nextStatus,
      password_hash: nextPasswordHash,
      updated_at: now,
    };
    this.inMemoryUsers.set(id, updated);
    return { ...updated };
  }

  /**
   * Soft-deletes a user account following retention policies so financial records and audit logs are preserved.
   * Subsequent findById(id) calls return null.
   */
  public async deleteUser(id: string): Promise<boolean> {
    const now = new Date();
    const anonymizedEmail = `deleted+${id}@deleted.faceonn.local`;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE users
         SET deleted_at = $1, status = 'deactivated', role = 'user', admin_role = NULL,
             email = $2, name = 'Deleted User', updated_at = $1
         WHERE id = $3 AND deleted_at IS NULL`,
        [now, anonymizedEmail, id]
      );
      return (res.rowCount || 0) > 0;
    }

    const existing = this.inMemoryUsers.get(id);
    if (!existing || existing.deleted_at) return false;
    existing.deleted_at = now;
    existing.status = 'deactivated';
    existing.role = 'user';
    existing.admin_role = null;
    existing.email = anonymizedEmail;
    existing.name = 'Deleted User';
    existing.updated_at = now;
    return true;
  }

  public async countByRole(role: UserRole): Promise<number> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1 AND deleted_at IS NULL', [role]);
      return res.rows[0]?.count || 0;
    }

    let count = 0;
    for (const user of this.inMemoryUsers.values()) {
      if (user.role === role && !user.deleted_at) count++;
    }
    return count;
  }

  public async findEarliestUser(): Promise<UserRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1');
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    let earliest: UserRecord | null = null;
    for (const user of this.inMemoryUsers.values()) {
      if (user.deleted_at) continue;
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
      await pool.query('UPDATE users SET last_login_at = $1, last_active_at = $1, updated_at = $2 WHERE id = $3', [now, now, id]);
    } else {
      const user = this.inMemoryUsers.get(id);
      if (user) {
        user.last_login_at = now;
        user.last_active_at = now;
        user.updated_at = now;
      }
    }
  }

  public async touchLastActive(id: string): Promise<void> {
    const now = new Date();
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('UPDATE users SET last_active_at = $1 WHERE id = $2', [now, id]).catch(() => {});
    } else {
      const user = this.inMemoryUsers.get(id);
      if (user) {
        user.last_active_at = now;
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
             WHERE status = 'active' AND deleted_at IS NULL
               AND id <> $1
               AND (LOWER(email) LIKE $2 OR LOWER(COALESCE(name, '')) LIKE $2)
             ORDER BY name ASC NULLS LAST
             LIMIT $3`,
            [excludeUserId, pattern, limit]
          )
        : await pool.query(
            `SELECT id, name, email FROM users
             WHERE status = 'active' AND deleted_at IS NULL
               AND (LOWER(email) LIKE $1 OR LOWER(COALESCE(name, '')) LIKE $1)
             ORDER BY name ASC NULLS LAST
             LIMIT $2`,
            [pattern, limit]
          );
      return res.rows;
    }

    const matches: Array<{ id: string; name: string | null; email: string }> = [];
    for (const user of this.inMemoryUsers.values()) {
      if (user.status !== 'active' || user.deleted_at) continue;
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

