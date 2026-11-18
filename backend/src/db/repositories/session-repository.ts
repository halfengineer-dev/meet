import { v4 as uuidv4 } from 'uuid';
import { SessionRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class SessionRepository {
  private inMemorySessions: Map<string, SessionRecord> = new Map();

  public async createSession(data: {
    id?: string;
    user_id: string;
    refresh_token_hash: string;
    family_id?: string;
    expires_at: Date;
    user_agent?: string | null;
    ip_address?: string | null;
  }): Promise<SessionRecord> {
    const id = data.id || uuidv4();
    const family_id = data.family_id || uuidv4();
    const now = new Date();

    const record: SessionRecord = {
      id,
      user_id: data.user_id,
      refresh_token_hash: data.refresh_token_hash,
      family_id,
      expires_at: data.expires_at,
      revoked_at: null,
      created_at: now,
      last_used_at: now,
      user_agent: data.user_agent || null,
      ip_address: data.ip_address || null,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, expires_at, revoked_at, created_at, last_used_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.user_id,
          record.refresh_token_hash,
          record.family_id,
          record.expires_at,
          record.revoked_at,
          record.created_at,
          record.last_used_at,
          record.user_agent,
          record.ip_address,
        ]
      );
    } else {
      this.inMemorySessions.set(record.id, { ...record });
    }

    return record;
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM sessions WHERE refresh_token_hash = $1 LIMIT 1',
        [tokenHash]
      );
      return res.rows[0] || null;
    }

    for (const session of this.inMemorySessions.values()) {
      if (session.refresh_token_hash === tokenHash) {
        return { ...session };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<SessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM sessions WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] || null;
    }

    const session = this.inMemorySessions.get(id);
    return session ? { ...session } : null;
  }

  public async rotateRefreshToken(
    oldSessionId: string,
    newTokenHash: string,
    newExpiresAt: Date
  ): Promise<SessionRecord | null> {
    const oldSession = await this.findById(oldSessionId);
    if (!oldSession) return null;

    // Mark old session as revoked
    await this.revokeSession(oldSessionId);

    // Create new session in the same family
    return this.createSession({
      user_id: oldSession.user_id,
      refresh_token_hash: newTokenHash,
      family_id: oldSession.family_id,
      expires_at: newExpiresAt,
      user_agent: oldSession.user_agent,
      ip_address: oldSession.ip_address,
    });
  }

  public async revokeSession(id: string): Promise<void> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('UPDATE sessions SET revoked_at = $1 WHERE id = $2', [now, id]);
    } else {
      const session = this.inMemorySessions.get(id);
      if (session) {
        session.revoked_at = now;
      }
    }
  }

  public async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        'UPDATE sessions SET revoked_at = $1 WHERE family_id = $2 AND revoked_at IS NULL',
        [now, familyId]
      );
    } else {
      for (const session of this.inMemorySessions.values()) {
        if (session.family_id === familyId && !session.revoked_at) {
          session.revoked_at = now;
        }
      }
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        'UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL',
        [now, userId]
      );
    } else {
      for (const session of this.inMemorySessions.values()) {
        if (session.user_id === userId && !session.revoked_at) {
          session.revoked_at = now;
        }
      }
    }
  }

  public async listUserSessions(userId: string): Promise<SessionRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC',
        [userId]
      );
      return res.rows;
    }

    const now = new Date();
    const result: SessionRecord[] = [];
    for (const session of this.inMemorySessions.values()) {
      if (session.user_id === userId && !session.revoked_at && session.expires_at > now) {
        result.push({ ...session });
      }
    }
    return result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM sessions');
    }
    this.inMemorySessions.clear();
  }
}

export const sessionRepository = new SessionRepository();
