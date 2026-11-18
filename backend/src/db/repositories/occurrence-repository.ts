import { v4 as uuidv4 } from 'uuid';
import { MeetingOccurrenceRecord, OccurrenceStatus } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

/**
 * Dual-mode repository for meeting occurrences (PostgreSQL + in-memory fallback).
 * Note: In-memory fallback is intended for single-instance development and automated tests only;
 * multi-instance production deployments rely on PostgreSQL unique constraints and transactions.
 */
class OccurrenceRepository {
  private inMemoryOccurrences: Map<string, MeetingOccurrenceRecord> = new Map();

  private normalizeRow(row: any): MeetingOccurrenceRecord {
    return {
      id: row.id,
      meeting_id: row.meeting_id,
      occurrence_number: Number(row.occurrence_number || 1),
      scheduled_at: new Date(row.scheduled_at),
      scheduled_end_at: new Date(row.scheduled_end_at),
      actual_started_at: row.actual_started_at ? new Date(row.actual_started_at) : null,
      actual_ended_at: row.actual_ended_at ? new Date(row.actual_ended_at) : null,
      status: row.status as OccurrenceStatus,
      session_id: row.session_id || null,
      started_by_user_id: row.started_by_user_id || null,
      ended_by_user_id: row.ended_by_user_id || null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  public async createOccurrences(
    meetingId: string,
    items: Array<{
      occurrence_number: number;
      scheduled_at: Date;
      scheduled_end_at: Date;
      status?: OccurrenceStatus;
    }>
  ): Promise<MeetingOccurrenceRecord[]> {
    const created: MeetingOccurrenceRecord[] = [];
    const now = new Date();

    for (const item of items) {
      const record: MeetingOccurrenceRecord = {
        id: uuidv4(),
        meeting_id: meetingId,
        occurrence_number: item.occurrence_number,
        scheduled_at: new Date(item.scheduled_at),
        scheduled_end_at: new Date(item.scheduled_end_at),
        actual_started_at: null,
        actual_ended_at: null,
        status: item.status || 'scheduled',
        session_id: null,
        started_by_user_id: null,
        ended_by_user_id: null,
        created_at: now,
        updated_at: now,
      };

      if (isUsingPostgres()) {
        const pool = getDatabasePool()!;
        const res = await pool.query(
          `INSERT INTO meeting_occurrences
           (id, meeting_id, occurrence_number, scheduled_at, scheduled_end_at, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (meeting_id, scheduled_at) DO NOTHING
           RETURNING *`,
          [
            record.id,
            record.meeting_id,
            record.occurrence_number,
            record.scheduled_at,
            record.scheduled_end_at,
            record.status,
            record.created_at,
            record.updated_at,
          ]
        );
        if (res.rows[0]) {
          created.push(this.normalizeRow(res.rows[0]));
        }
      } else {
        // Deduplicate by (meeting_id, scheduled_at) to match PostgreSQL UNIQUE constraint
        let duplicate = false;
        for (const existing of this.inMemoryOccurrences.values()) {
          if (
            existing.meeting_id === meetingId &&
            existing.scheduled_at.getTime() === record.scheduled_at.getTime()
          ) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate) {
          this.inMemoryOccurrences.set(record.id, { ...record });
          created.push(record);
        }
      }
    }

    return created;
  }

  public async findById(id: string): Promise<MeetingOccurrenceRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM meeting_occurrences WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const occ = this.inMemoryOccurrences.get(id);
    return occ ? { ...occ } : null;
  }

  public async listByMeetingId(meetingId: string): Promise<MeetingOccurrenceRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_occurrences WHERE meeting_id = $1 ORDER BY scheduled_at ASC',
        [meetingId]
      );
      return res.rows.map((r) => this.normalizeRow(r));
    }

    const list: MeetingOccurrenceRecord[] = [];
    for (const occ of this.inMemoryOccurrences.values()) {
      if (occ.meeting_id === meetingId) {
        list.push({ ...occ });
      }
    }
    return list.sort((a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime());
  }

  public async findActiveByMeetingId(meetingId: string): Promise<MeetingOccurrenceRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT * FROM meeting_occurrences
         WHERE meeting_id = $1 AND status = 'active'
         ORDER BY actual_started_at DESC NULLS LAST
         LIMIT 1`,
        [meetingId]
      );
      return res.rows[0] ? this.normalizeRow(res.rows[0]) : null;
    }

    const all = await this.listByMeetingId(meetingId);
    return all.find((o) => o.status === 'active') || null;
  }

  public async updateOccurrence(
    id: string,
    updates: Partial<MeetingOccurrenceRecord>
  ): Promise<MeetingOccurrenceRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Meeting occurrence not found');
    }

    const updated: MeetingOccurrenceRecord = {
      ...existing,
      ...updates,
      updated_at: new Date(),
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_occurrences
         SET scheduled_at = $1,
             scheduled_end_at = $2,
             actual_started_at = $3,
             actual_ended_at = $4,
             status = $5,
             session_id = $6,
             started_by_user_id = $7,
             ended_by_user_id = $8,
             updated_at = $9
         WHERE id = $10
         RETURNING *`,
        [
          updated.scheduled_at,
          updated.scheduled_end_at,
          updated.actual_started_at,
          updated.actual_ended_at,
          updated.status,
          updated.session_id,
          updated.started_by_user_id,
          updated.ended_by_user_id,
          updated.updated_at,
          id,
        ]
      );
      return this.normalizeRow(res.rows[0]);
    }

    this.inMemoryOccurrences.set(id, { ...updated });
    return updated;
  }

  public async cancelFutureOccurrences(meetingId: string, fromDate?: Date): Promise<number> {
    const now = new Date();
    const cutoff = fromDate ? fromDate.getTime() : 0;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = fromDate
        ? await pool.query(
            `UPDATE meeting_occurrences
             SET status = 'cancelled', updated_at = $1
             WHERE meeting_id = $2
               AND status IN ('scheduled', 'waiting_for_host')
               AND scheduled_at >= $3`,
            [now, meetingId, fromDate]
          )
        : await pool.query(
            `UPDATE meeting_occurrences
             SET status = 'cancelled', updated_at = $1
             WHERE meeting_id = $2
               AND status IN ('scheduled', 'waiting_for_host')`,
            [now, meetingId]
          );
      return res.rowCount || 0;
    }

    let count = 0;
    for (const occ of this.inMemoryOccurrences.values()) {
      if (
        occ.meeting_id === meetingId &&
        (occ.status === 'scheduled' || occ.status === 'waiting_for_host') &&
        occ.scheduled_at.getTime() >= cutoff
      ) {
        occ.status = 'cancelled';
        occ.updated_at = now;
        count++;
      }
    }
    return count;
  }

  public async deleteFutureScheduledOccurrences(meetingId: string, fromDate: Date): Promise<number> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `DELETE FROM meeting_occurrences
         WHERE meeting_id = $1
           AND status IN ('scheduled', 'waiting_for_host')
           AND scheduled_at >= $2`,
        [meetingId, fromDate]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    for (const [key, occ] of this.inMemoryOccurrences.entries()) {
      if (
        occ.meeting_id === meetingId &&
        (occ.status === 'scheduled' || occ.status === 'waiting_for_host') &&
        occ.scheduled_at.getTime() >= fromDate.getTime()
      ) {
        this.inMemoryOccurrences.delete(key);
        count++;
      }
    }
    return count;
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_occurrences');
    }
    this.inMemoryOccurrences.clear();
  }
}

export const occurrenceRepository = new OccurrenceRepository();

