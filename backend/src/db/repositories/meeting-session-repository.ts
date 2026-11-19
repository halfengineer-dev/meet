import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { MeetingSessionRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

/**
 * Dual-mode repository for live Jitsi conference sessions.
 * Enforces at most ONE active session per meeting occurrence:
 * - In PostgreSQL: uses row-level transaction locking + partial UNIQUE index
 *   `idx_unique_active_session_per_occurrence` (`WHERE status = 'active'`).
 * - In-memory fallback (dev/test only): uses an atomic lookup/insert guard.
 */
class SessionRepository {
  private inMemorySessions: Map<string, MeetingSessionRecord> = new Map();

  private normalizeRow(row: any): MeetingSessionRecord {
    return {
      id: row.id,
      meeting_id: row.meeting_id,
      occurrence_id: row.occurrence_id,
      jitsi_room_name: row.jitsi_room_name,
      status: row.status,
      started_at: new Date(row.started_at),
      ended_at: row.ended_at ? new Date(row.ended_at) : null,
      started_by_user_id: row.started_by_user_id || null,
      ended_by_user_id: row.ended_by_user_id || null,
      host_joined_at: row.host_joined_at ? new Date(row.host_joined_at) : null,
      host_in_room: Boolean(row.host_in_room),
      termination_reason: row.termination_reason || null,
      created_at: new Date(row.created_at),
    };
  }

  /**
   * Generates an isolated internal Jitsi MUC room name for a specific occurrence/session,
   * while preserving the permanent Faceonn public room link (e.g. faceonn.com/jd0-fmc-29f).
   */
  public buildIsolatedJitsiRoomName(publicRoomId: string): string {
    const cleanPublic = publicRoomId.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const suffix = crypto.randomBytes(5).toString('hex');
    return `faceonn-${cleanPublic}-${suffix}`;
  }

  /**
   * Atomically creates an active session for an occurrence, OR returns the already-active session
   * if two hosts/alternative hosts click Start simultaneously.
   */
  public async createOrGetActiveSession(params: {
    meetingId: string;
    occurrenceId: string;
    publicRoomId: string;
    startedByUserId: string | null;
  }): Promise<{ session: MeetingSessionRecord; created: boolean }> {
    const now = new Date();
    const id = uuidv4();
    const jitsiRoomName = this.buildIsolatedJitsiRoomName(params.publicRoomId);

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock occurrence row so concurrent start/cancel/end serialize cleanly
        const occRes = await client.query(
          'SELECT id, status FROM meeting_occurrences WHERE id = $1 FOR UPDATE',
          [params.occurrenceId]
        );
        if (!occRes.rows[0]) {
          await client.query('ROLLBACK');
          throw new Error('Meeting occurrence not found');
        }
        const occStatus = occRes.rows[0].status;
        if (occStatus === 'cancelled' || occStatus === 'ended') {
          await client.query('ROLLBACK');
          const err = new Error(`Cannot start an occurrence that is already ${occStatus}`);
          (err as any).statusCode = 409;
          (err as any).code = occStatus === 'cancelled' ? 'MEETING_CANCELLED' : 'OCCURRENCE_ENDED';
          throw err;
        }

        // Check for existing active session
        const existingRes = await client.query(
          `SELECT * FROM meeting_sessions
           WHERE occurrence_id = $1 AND status = 'active'
           LIMIT 1`,
          [params.occurrenceId]
        );
        if (existingRes.rows[0]) {
          await client.query('COMMIT');
          return { session: this.normalizeRow(existingRes.rows[0]), created: false };
        }

        const insertRes = await client.query(
          `INSERT INTO meeting_sessions
           (id, meeting_id, occurrence_id, jitsi_room_name, status, started_at, started_by_user_id, host_joined_at, host_in_room, created_at)
           VALUES ($1, $2, $3, $4, 'active', $5, $6, NULL, FALSE, $5)
           RETURNING *`,
          [id, params.meetingId, params.occurrenceId, jitsiRoomName, now, params.startedByUserId]
        );

        await client.query(
          `UPDATE meeting_occurrences
           SET status = 'active',
               session_id = $1,
               actual_started_at = COALESCE(actual_started_at, $2),
               started_by_user_id = COALESCE(started_by_user_id, $3),
               updated_at = $2
           WHERE id = $4`,
          [id, now, params.startedByUserId, params.occurrenceId]
        );

        await client.query('COMMIT');
        return { session: this.normalizeRow(insertRes.rows[0]), created: true };
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        // Unique constraint violation on active session -> fetch winning session
        if (err?.code === '23505') {
          const existing = await this.findActiveByOccurrenceId(params.occurrenceId);
          if (existing) {
            return { session: existing, created: false };
          }
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory single-process atomic path
    for (const s of this.inMemorySessions.values()) {
      if (s.occurrence_id === params.occurrenceId && s.status === 'active') {
        return { session: { ...s }, created: false };
      }
    }

    const record: MeetingSessionRecord = {
      id,
      meeting_id: params.meetingId,
      occurrence_id: params.occurrenceId,
      jitsi_room_name: jitsiRoomName,
      status: 'active',
      started_at: now,
      ended_at: null,
      started_by_user_id: params.startedByUserId,
      ended_by_user_id: null,
      host_joined_at: null,
      host_in_room: false,
      termination_reason: null,
      created_at: now,
    };

    this.inMemorySessions.set(record.id, { ...record });
    return { session: record, created: true };
  }

  public async markHostJoined(sessionId: string): Promise<MeetingSessionRecord | null> {
    const now = new Date();
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_sessions
         SET host_joined_at = COALESCE(host_joined_at, $1),
             host_in_room = TRUE
         WHERE id = $2
         RETURNING *`,
        [now, sessionId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const existing = this.inMemorySessions.get(sessionId);
    if (!existing) return null;
    existing.host_joined_at = existing.host_joined_at || now;
    existing.host_in_room = true;
    return { ...existing };
  }

  public async markHostLeft(sessionId: string): Promise<MeetingSessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_sessions
         SET host_in_room = FALSE
         WHERE id = $1
         RETURNING *`,
        [sessionId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const existing = this.inMemorySessions.get(sessionId);
    if (!existing) return null;
    existing.host_in_room = false;
    return { ...existing };
  }

  public async findActiveByOccurrenceId(occurrenceId: string): Promise<MeetingSessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT * FROM meeting_sessions
         WHERE occurrence_id = $1 AND status = 'active'
         LIMIT 1`,
        [occurrenceId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    for (const s of this.inMemorySessions.values()) {
      if (s.occurrence_id === occurrenceId && s.status === 'active') {
        return { ...s };
      }
    }
    return null;
  }

  public async findActiveByMeetingId(meetingId: string): Promise<MeetingSessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT * FROM meeting_sessions
         WHERE meeting_id = $1 AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [meetingId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    for (const s of this.inMemorySessions.values()) {
      if (s.meeting_id === meetingId && s.status === 'active') {
        return { ...s };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<MeetingSessionRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM meeting_sessions WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }
    const s = this.inMemorySessions.get(id);
    return s ? { ...s } : null;
  }

  public async endSession(
    sessionId: string,
    endedByUserId: string | null,
    reason = 'host_ended'
  ): Promise<MeetingSessionRecord | null> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_sessions
         SET status = 'ended',
             ended_at = COALESCE(ended_at, $1),
             ended_by_user_id = COALESCE(ended_by_user_id, $2),
             termination_reason = COALESCE(termination_reason, $3)
         WHERE id = $4
         RETURNING *`,
        [now, endedByUserId, reason, sessionId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const existing = this.inMemorySessions.get(sessionId);
    if (!existing) return null;
    if (existing.status !== 'ended') {
      existing.status = 'ended';
      existing.ended_at = now;
      existing.ended_by_user_id = endedByUserId;
      existing.termination_reason = reason;
    }
    return { ...existing };
  }

  public async endAllActiveForMeeting(
    meetingId: string,
    endedByUserId: string | null,
    reason = 'series_cancelled'
  ): Promise<number> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_sessions
         SET status = 'ended',
             ended_at = $1,
             ended_by_user_id = $2,
             termination_reason = $3
         WHERE meeting_id = $4 AND status = 'active'`,
        [now, endedByUserId, reason, meetingId]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    for (const s of this.inMemorySessions.values()) {
      if (s.meeting_id === meetingId && s.status === 'active') {
        s.status = 'ended';
        s.ended_at = now;
        s.ended_by_user_id = endedByUserId;
        s.termination_reason = reason;
        count++;
      }
    }
    return count;
  }

  public async listByMeetingId(meetingId: string): Promise<MeetingSessionRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_sessions WHERE meeting_id = $1 ORDER BY started_at DESC',
        [meetingId]
      );
      return res.rows.map((r) => this.normalizeRow(r));
    }

    const list: MeetingSessionRecord[] = [];
    for (const s of this.inMemorySessions.values()) {
      if (s.meeting_id === meetingId) {
        list.push({ ...s });
      }
    }
    return list.sort((a, b) => b.started_at.getTime() - a.started_at.getTime());
  }

  public async listAllActiveSessions(): Promise<MeetingSessionRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT * FROM meeting_sessions WHERE status = 'active' ORDER BY started_at DESC`
      );
      return res.rows.map((r) => this.normalizeRow(r));
    }

    const list: MeetingSessionRecord[] = [];
    for (const s of this.inMemorySessions.values()) {
      if (s.status === 'active') {
        list.push({ ...s });
      }
    }
    return list.sort((a, b) => b.started_at.getTime() - a.started_at.getTime());
  }

  public async listAllSessions(limit = 500): Promise<MeetingSessionRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_sessions ORDER BY started_at DESC LIMIT $1',
        [limit]
      );
      return res.rows.map((r) => this.normalizeRow(r));
    }

    const list: MeetingSessionRecord[] = [];
    for (const s of this.inMemorySessions.values()) {
      list.push({ ...s });
    }
    return list.sort((a, b) => b.started_at.getTime() - a.started_at.getTime()).slice(0, limit);
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_sessions');
    }
    this.inMemorySessions.clear();
  }
}

export const meetingSessionRepository = new SessionRepository();
