import { v4 as uuidv4 } from 'uuid';
import { MeetingRecurrenceRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class RecurrenceRepository {
  private inMemorySeries: Map<string, MeetingRecurrenceRecord> = new Map();

  public async createSeries(data: {
    owner_user_id: string;
    recurrence_rule: string;
    timezone: string;
    start_at: Date;
    end_at?: Date | null;
    occurrence_count?: number | null;
  }): Promise<MeetingRecurrenceRecord> {
    const id = uuidv4();
    const now = new Date();

    const record: MeetingRecurrenceRecord = {
      id,
      owner_user_id: data.owner_user_id,
      recurrence_rule: data.recurrence_rule,
      timezone: data.timezone,
      start_at: data.start_at,
      end_at: data.end_at || null,
      occurrence_count: data.occurrence_count || null,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO meeting_recurrence_series
         (id, owner_user_id, recurrence_rule, timezone, start_at, end_at, occurrence_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.owner_user_id,
          record.recurrence_rule,
          record.timezone,
          record.start_at,
          record.end_at,
          record.occurrence_count,
          record.created_at,
          record.updated_at,
        ]
      );
    } else {
      this.inMemorySeries.set(record.id, { ...record });
    }

    return record;
  }

  public async findById(id: string): Promise<MeetingRecurrenceRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_recurrence_series WHERE id = $1 LIMIT 1',
        [id]
      );
      return res.rows[0] || null;
    }

    const series = this.inMemorySeries.get(id);
    return series ? { ...series } : null;
  }

  public async deleteSeries(id: string): Promise<boolean> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'DELETE FROM meeting_recurrence_series WHERE id = $1',
        [id]
      );
      return (res.rowCount || 0) > 0;
    }

    return this.inMemorySeries.delete(id);
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_recurrence_series');
    }
    this.inMemorySeries.clear();
  }
}

export const recurrenceRepository = new RecurrenceRepository();

