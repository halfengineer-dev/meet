import { v4 as uuidv4 } from 'uuid';
import { MeetingRecord, MeetingParticipantRecord, MeetingSettings } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  passcodeEnabled: false,
  waitingRoomEnabled: false,
  joinBeforeHost: true,
  hostVideoEnabled: true,
  participantVideoEnabled: true,
  muteOnEntry: false,
  allowScreenSharing: true,
  allowChat: true,
  allowReactions: true,
  requireAuthentication: false,
};

class MeetingRepository {
  private inMemoryMeetings: Map<string, MeetingRecord> = new Map();
  private inMemoryParticipants: Map<string, MeetingParticipantRecord> = new Map();

  private normalizeRecord(row: any): MeetingRecord {
    let settings = DEFAULT_MEETING_SETTINGS;
    if (row.settings) {
      settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    }

    return {
      id: row.id,
      room_id: row.room_id,
      title: row.title,
      owner_user_id: row.owner_user_id,
      status: row.status,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : null,
      duration_minutes: row.duration_minutes || 30,
      timezone: row.timezone || 'UTC',
      description: row.description || null,
      is_scheduled: Boolean(row.is_scheduled),
      meeting_type: row.meeting_type || 'instant',
      recurrence_series_id: row.recurrence_series_id || null,
      recurrence_rule: row.recurrence_rule || null,
      recurrence_end_at: row.recurrence_end_at ? new Date(row.recurrence_end_at) : null,
      settings: { ...DEFAULT_MEETING_SETTINGS, ...settings },
      passcode_hash: row.passcode_hash || null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  public async createMeeting(data: {
    id?: string;
    room_id: string;
    title: string;
    owner_user_id: string;
    status?: 'active' | 'ended' | 'scheduled' | 'cancelled';
    scheduled_at?: Date | null;
    duration_minutes?: number;
    timezone?: string;
    description?: string | null;
    is_scheduled?: boolean;
    meeting_type?: 'instant' | 'scheduled' | 'recurring';
    recurrence_series_id?: string | null;
    recurrence_rule?: string | null;
    recurrence_end_at?: Date | null;
    settings?: Partial<MeetingSettings>;
    passcode_hash?: string | null;
  }): Promise<MeetingRecord> {
    const id = data.id || uuidv4();
    const now = new Date();

    const record: MeetingRecord = {
      id,
      room_id: data.room_id.toLowerCase().trim(),
      title: data.title.trim(),
      owner_user_id: data.owner_user_id,
      status: data.status || (data.is_scheduled ? 'scheduled' : 'active'),
      scheduled_at: data.scheduled_at || null,
      duration_minutes: data.duration_minutes || 30,
      timezone: data.timezone || 'UTC',
      description: data.description ? data.description.trim() : null,
      is_scheduled: Boolean(data.is_scheduled),
      meeting_type: data.meeting_type || (data.is_scheduled ? 'scheduled' : 'instant'),
      recurrence_series_id: data.recurrence_series_id || null,
      recurrence_rule: data.recurrence_rule || null,
      recurrence_end_at: data.recurrence_end_at || null,
      settings: { ...DEFAULT_MEETING_SETTINGS, ...(data.settings || {}) },
      passcode_hash: data.passcode_hash || null,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO meetings 
         (id, room_id, title, owner_user_id, status, scheduled_at, duration_minutes, timezone, 
          description, is_scheduled, meeting_type, recurrence_series_id, recurrence_rule, 
          recurrence_end_at, settings, passcode_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          record.id,
          record.room_id,
          record.title,
          record.owner_user_id,
          record.status,
          record.scheduled_at,
          record.duration_minutes,
          record.timezone,
          record.description,
          record.is_scheduled,
          record.meeting_type,
          record.recurrence_series_id,
          record.recurrence_rule,
          record.recurrence_end_at,
          JSON.stringify(record.settings),
          record.passcode_hash,
          record.created_at,
          record.updated_at,
        ]
      );
    } else {
      this.inMemoryMeetings.set(record.id, { ...record });
    }

    // Automatically add the owner as 'owner' participant
    await this.addParticipant(record.id, record.owner_user_id, 'owner');

    return record;
  }

  public async findByRoomId(roomId: string): Promise<MeetingRecord | null> {
    const normalized = roomId.toLowerCase().trim();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM meetings WHERE room_id = $1 LIMIT 1', [normalized]);
      return res.rows[0] ? this.normalizeRecord(res.rows[0]) : null;
    }

    for (const meeting of this.inMemoryMeetings.values()) {
      if (meeting.room_id === normalized) {
        return { ...meeting };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<MeetingRecord | null> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM meetings WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? this.normalizeRecord(res.rows[0]) : null;
    }

    const meeting = this.inMemoryMeetings.get(id);
    return meeting ? { ...meeting } : null;
  }

  public async updateMeeting(id: string, updates: Partial<MeetingRecord>): Promise<MeetingRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Meeting not found');
    }

    const updated: MeetingRecord = {
      ...existing,
      ...updates,
      updated_at: new Date(),
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `UPDATE meetings 
         SET title = $1, status = $2, scheduled_at = $3, duration_minutes = $4, timezone = $5,
             description = $6, settings = $7, passcode_hash = $8, updated_at = $9
         WHERE id = $10`,
        [
          updated.title,
          updated.status,
          updated.scheduled_at,
          updated.duration_minutes,
          updated.timezone,
          updated.description,
          JSON.stringify(updated.settings),
          updated.passcode_hash,
          updated.updated_at,
          id,
        ]
      );
    } else {
      this.inMemoryMeetings.set(id, { ...updated });
    }

    return updated;
  }

  public async cancelMeeting(id: string, userId: string): Promise<boolean> {
    const meeting = await this.findById(id);
    if (!meeting) return false;
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized to cancel this meeting');
    }

    await this.updateMeeting(id, { status: 'cancelled' });
    return true;
  }

  public async listUserMeetings(userId: string): Promise<MeetingRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT DISTINCT m.* FROM meetings m
         LEFT JOIN meeting_participants p ON m.id = p.meeting_id
         WHERE m.owner_user_id = $1 OR p.user_id = $1
         ORDER BY m.created_at DESC`,
        [userId]
      );
      return res.rows.map((r) => this.normalizeRecord(r));
    }

    const meetingIds = new Set<string>();
    for (const meeting of this.inMemoryMeetings.values()) {
      if (meeting.owner_user_id === userId) {
        meetingIds.add(meeting.id);
      }
    }
    for (const p of this.inMemoryParticipants.values()) {
      if (p.user_id === userId) {
        meetingIds.add(p.meeting_id);
      }
    }

    const result: MeetingRecord[] = [];
    for (const id of meetingIds) {
      const m = this.inMemoryMeetings.get(id);
      if (m) result.push({ ...m });
    }
    return result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async listUpcomingMeetings(userId: string): Promise<MeetingRecord[]> {
    const all = await this.listUserMeetings(userId);
    const now = new Date();
    // Return meetings scheduled or active that haven't ended or been cancelled, sorted by scheduled time
    return all
      .filter((m) => {
        if (m.status === 'cancelled') return false;
        if (m.status === 'ended') return false;
        if (m.is_scheduled && m.scheduled_at) {
          // Keep if scheduled in the future OR started within duration window
          const endTime = new Date(m.scheduled_at.getTime() + m.duration_minutes * 60 * 1000);
          return endTime.getTime() >= now.getTime();
        }
        return m.status === 'active';
      })
      .sort((a, b) => {
        const timeA = a.scheduled_at ? a.scheduled_at.getTime() : a.created_at.getTime();
        const timeB = b.scheduled_at ? b.scheduled_at.getTime() : b.created_at.getTime();
        return timeA - timeB;
      });
  }

  public async listPastMeetings(userId: string): Promise<MeetingRecord[]> {
    const all = await this.listUserMeetings(userId);
    const now = new Date();
    return all
      .filter((m) => {
        if (m.status === 'ended' || m.status === 'cancelled') return true;
        if (m.is_scheduled && m.scheduled_at) {
          const endTime = new Date(m.scheduled_at.getTime() + m.duration_minutes * 60 * 1000);
          return endTime.getTime() < now.getTime();
        }
        return false;
      })
      .sort((a, b) => {
        const timeA = a.scheduled_at ? a.scheduled_at.getTime() : a.created_at.getTime();
        const timeB = b.scheduled_at ? b.scheduled_at.getTime() : b.created_at.getTime();
        return timeB - timeA;
      });
  }

  public async listBySeriesId(seriesId: string): Promise<MeetingRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meetings WHERE recurrence_series_id = $1 ORDER BY scheduled_at ASC',
        [seriesId]
      );
      return res.rows.map((r) => this.normalizeRecord(r));
    }

    const result: MeetingRecord[] = [];
    for (const m of this.inMemoryMeetings.values()) {
      if (m.recurrence_series_id === seriesId) {
        result.push({ ...m });
      }
    }
    return result.sort((a, b) => {
      const timeA = a.scheduled_at ? a.scheduled_at.getTime() : 0;
      const timeB = b.scheduled_at ? b.scheduled_at.getTime() : 0;
      return timeA - timeB;
    });
  }

  public async addParticipant(
    meetingId: string,
    userId: string,
    role: 'owner' | 'moderator' | 'participant'
  ): Promise<MeetingParticipantRecord> {
    const key = `${meetingId}:${userId}`;
    const now = new Date();

    const record: MeetingParticipantRecord = {
      id: uuidv4(),
      meeting_id: meetingId,
      user_id: userId,
      role,
      created_at: now,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO meeting_participants (id, meeting_id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (meeting_id, user_id) 
         DO UPDATE SET role = EXCLUDED.role`,
        [record.id, record.meeting_id, record.user_id, record.role, record.created_at]
      );
    } else {
      this.inMemoryParticipants.set(key, { ...record });
    }

    return record;
  }

  public async getParticipant(
    meetingId: string,
    userId: string
  ): Promise<MeetingParticipantRecord | null> {
    const key = `${meetingId}:${userId}`;

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 LIMIT 1',
        [meetingId, userId]
      );
      return res.rows[0] || null;
    }

    const p = this.inMemoryParticipants.get(key);
    return p ? { ...p } : null;
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_participants');
      await pool.query('DELETE FROM meetings');
    }
    this.inMemoryMeetings.clear();
    this.inMemoryParticipants.clear();
  }
}

export const meetingRepository = new MeetingRepository();
