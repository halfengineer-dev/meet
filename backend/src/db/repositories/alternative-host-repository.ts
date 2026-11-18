import { v4 as uuidv4 } from 'uuid';
import { MeetingAlternativeHostRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';
import { userRepository } from './user-repository';

class AlternativeHostRepository {
  private inMemoryAltHosts: Map<string, MeetingAlternativeHostRecord> = new Map();

  public async setAlternativeHosts(
    meetingId: string,
    userIds: string[]
  ): Promise<MeetingAlternativeHostRecord[]> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM meeting_alternative_hosts WHERE meeting_id = $1', [meetingId]);
        for (const uid of uniqueIds) {
          await client.query(
            `INSERT INTO meeting_alternative_hosts (id, meeting_id, user_id, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (meeting_id, user_id) DO NOTHING`,
            [uuidv4(), meetingId, uid, now]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      return this.listByMeetingId(meetingId);
    }

    for (const [k, v] of this.inMemoryAltHosts.entries()) {
      if (v.meeting_id === meetingId) {
        this.inMemoryAltHosts.delete(k);
      }
    }

    for (const uid of uniqueIds) {
      const rec: MeetingAlternativeHostRecord = {
        id: uuidv4(),
        meeting_id: meetingId,
        user_id: uid,
        created_at: now,
      };
      this.inMemoryAltHosts.set(`${meetingId}:${uid}`, rec);
    }

    return this.listByMeetingId(meetingId);
  }

  public async listByMeetingId(meetingId: string): Promise<MeetingAlternativeHostRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT ah.id, ah.meeting_id, ah.user_id, ah.created_at, u.name AS user_name, u.email AS user_email
         FROM meeting_alternative_hosts ah
         JOIN users u ON u.id = ah.user_id
         WHERE ah.meeting_id = $1
         ORDER BY ah.created_at ASC`,
        [meetingId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        meeting_id: r.meeting_id,
        user_id: r.user_id,
        user_name: r.user_name,
        user_email: r.user_email,
        created_at: new Date(r.created_at),
      }));
    }

    const result: MeetingAlternativeHostRecord[] = [];
    for (const rec of this.inMemoryAltHosts.values()) {
      if (rec.meeting_id === meetingId) {
        const u = await userRepository.findById(rec.user_id);
        result.push({
          ...rec,
          user_name: u?.name || null,
          user_email: u?.email,
        });
      }
    }
    return result;
  }

  public async isAlternativeHost(meetingId: string, userId: string): Promise<boolean> {
    if (!userId) return false;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT 1 FROM meeting_alternative_hosts WHERE meeting_id = $1 AND user_id = $2 LIMIT 1',
        [meetingId, userId]
      );
      return res.rows.length > 0;
    }

    return this.inMemoryAltHosts.has(`${meetingId}:${userId}`);
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_alternative_hosts');
    }
    this.inMemoryAltHosts.clear();
  }
}

export const alternativeHostRepository = new AlternativeHostRepository();

