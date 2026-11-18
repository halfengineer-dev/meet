import { v4 as uuidv4 } from 'uuid';
import {
  AudioType,
  AutoRecordingType,
  MeetingParticipantRecord,
  MeetingRecord,
  MeetingSettings,
  RecurrenceType,
  SeriesStatus,
} from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  passcodeEnabled: false,
  waitingRoomEnabled: true,
  joinBeforeHost: false,
  joinBeforeHostMinutes: 0,
  hostVideoEnabled: true,
  participantVideoEnabled: true,
  muteOnEntry: false,
  allowParticipantsUnmute: true,
  allowScreenSharing: true,
  allowChat: true,
  allowReactions: true,
  allowRecording: false,
  requireAuthentication: false,
  registrationRequired: false,
  audioType: 'computer',
  autoRecording: 'none',
};

class MeetingRepository {
  private inMemoryMeetings: Map<string, MeetingRecord> = new Map();
  private inMemoryParticipants: Map<string, MeetingParticipantRecord> = new Map();

  private normalizeRecord(row: any): MeetingRecord {
    let settings = DEFAULT_MEETING_SETTINGS;
    if (row.settings) {
      settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    }

    const status = row.status || 'active';
    const derivedSeriesStatus: SeriesStatus =
      row.series_status ||
      (status === 'cancelled' ? 'cancelled' : status === 'ended' ? 'ended' : 'active');

    return {
      id: row.id,
      room_id: row.room_id,
      title: row.title,
      owner_user_id: row.owner_user_id,
      status,
      series_status: derivedSeriesStatus,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : null,
      duration_minutes: row.duration_minutes || 30,
      timezone: row.timezone || 'UTC',
      description: row.description || null,
      is_scheduled: Boolean(row.is_scheduled),
      meeting_type: row.meeting_type || 'instant',
      recurrence_series_id: row.recurrence_series_id || null,
      recurrence_type: (row.recurrence_type || (row.recurrence_rule ? 'weekly' : 'none')) as RecurrenceType,
      recurrence_rule: row.recurrence_rule || null,
      recurrence_end_at: row.recurrence_end_at ? new Date(row.recurrence_end_at) : null,
      recurrence_count: row.recurrence_count !== null && row.recurrence_count !== undefined
        ? Number(row.recurrence_count)
        : null,
      settings: { ...DEFAULT_MEETING_SETTINGS, ...settings },
      passcode_hash: row.passcode_hash || null,
      join_before_host_minutes: Number(row.join_before_host_minutes ?? settings.joinBeforeHostMinutes ?? 0),
      audio_type: (row.audio_type || settings.audioType || 'computer') as AudioType,
      auto_recording: (row.auto_recording || settings.autoRecording || 'none') as AutoRecordingType,
      registration_required: Boolean(row.registration_required ?? settings.registrationRequired ?? false),
      alternative_host_ids: Array.isArray(row.alternative_host_ids) ? row.alternative_host_ids : [],
      ended_at: row.ended_at ? new Date(row.ended_at) : null,
      deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
      expires_at: row.expires_at ? new Date(row.expires_at) : null,
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
    series_status?: SeriesStatus;
    scheduled_at?: Date | null;
    duration_minutes?: number;
    timezone?: string;
    description?: string | null;
    is_scheduled?: boolean;
    meeting_type?: 'instant' | 'scheduled' | 'recurring';
    recurrence_series_id?: string | null;
    recurrence_type?: RecurrenceType;
    recurrence_rule?: string | null;
    recurrence_end_at?: Date | null;
    recurrence_count?: number | null;
    settings?: Partial<MeetingSettings>;
    passcode_hash?: string | null;
    join_before_host_minutes?: number;
    audio_type?: AudioType;
    auto_recording?: AutoRecordingType;
    registration_required?: boolean;
    alternative_host_ids?: string[];
    expires_at?: Date | null;
  }): Promise<MeetingRecord> {
    const id = data.id || uuidv4();
    const now = new Date();
    const mergedSettings: MeetingSettings = { ...DEFAULT_MEETING_SETTINGS, ...(data.settings || {}) };

    const record: MeetingRecord = {
      id,
      room_id: data.room_id.toLowerCase().trim(),
      title: data.title.trim(),
      owner_user_id: data.owner_user_id,
      status: data.status || (data.is_scheduled ? 'scheduled' : 'active'),
      series_status: data.series_status || 'active',
      scheduled_at: data.scheduled_at || null,
      duration_minutes: data.duration_minutes || 30,
      timezone: data.timezone || 'UTC',
      description: data.description ? data.description.trim() : null,
      is_scheduled: Boolean(data.is_scheduled),
      meeting_type: data.meeting_type || (data.is_scheduled ? 'scheduled' : 'instant'),
      recurrence_series_id: data.recurrence_series_id || null,
      recurrence_type: data.recurrence_type || 'none',
      recurrence_rule: data.recurrence_rule || null,
      recurrence_end_at: data.recurrence_end_at || null,
      recurrence_count: data.recurrence_count ?? null,
      settings: mergedSettings,
      passcode_hash: data.passcode_hash || null,
      join_before_host_minutes: data.join_before_host_minutes ?? mergedSettings.joinBeforeHostMinutes ?? 0,
      audio_type: data.audio_type || mergedSettings.audioType || 'computer',
      auto_recording: data.auto_recording || mergedSettings.autoRecording || 'none',
      registration_required: data.registration_required ?? mergedSettings.registrationRequired ?? false,
      alternative_host_ids: data.alternative_host_ids || [],
      ended_at: null,
      deleted_at: null,
      expires_at: data.expires_at || null,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO meetings 
         (id, room_id, title, owner_user_id, status, series_status, scheduled_at, duration_minutes, timezone, 
          description, is_scheduled, meeting_type, recurrence_series_id, recurrence_type, recurrence_rule, 
          recurrence_end_at, recurrence_count, settings, passcode_hash, join_before_host_minutes, audio_type,
          auto_recording, registration_required, alternative_host_ids, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          record.id,
          record.room_id,
          record.title,
          record.owner_user_id,
          record.status,
          record.series_status,
          record.scheduled_at,
          record.duration_minutes,
          record.timezone,
          record.description,
          record.is_scheduled,
          record.meeting_type,
          record.recurrence_series_id,
          record.recurrence_type,
          record.recurrence_rule,
          record.recurrence_end_at,
          record.recurrence_count,
          JSON.stringify(record.settings),
          record.passcode_hash,
          record.join_before_host_minutes,
          record.audio_type,
          record.auto_recording,
          record.registration_required,
          record.alternative_host_ids,
          record.expires_at,
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
      const res = await pool.query(
        'SELECT * FROM meetings WHERE room_id = $1 AND deleted_at IS NULL LIMIT 1',
        [normalized]
      );
      return res.rows[0] ? this.normalizeRecord(res.rows[0]) : null;
    }

    for (const meeting of this.inMemoryMeetings.values()) {
      if (meeting.room_id === normalized && !meeting.deleted_at) {
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
         SET title = $1, status = $2, series_status = $3, scheduled_at = $4, duration_minutes = $5,
             timezone = $6, description = $7, settings = $8, passcode_hash = $9,
             recurrence_type = $10, recurrence_rule = $11, recurrence_end_at = $12, recurrence_count = $13,
             join_before_host_minutes = $14, audio_type = $15, auto_recording = $16,
             registration_required = $17, alternative_host_ids = $18,
             ended_at = $19, deleted_at = $20, expires_at = $21, updated_at = $22
         WHERE id = $23`,
        [
          updated.title,
          updated.status,
          updated.series_status,
          updated.scheduled_at,
          updated.duration_minutes,
          updated.timezone,
          updated.description,
          JSON.stringify(updated.settings),
          updated.passcode_hash,
          updated.recurrence_type,
          updated.recurrence_rule,
          updated.recurrence_end_at,
          updated.recurrence_count,
          updated.join_before_host_minutes,
          updated.audio_type,
          updated.auto_recording,
          updated.registration_required,
          updated.alternative_host_ids,
          updated.ended_at,
          updated.deleted_at,
          updated.expires_at,
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

    await this.updateMeeting(id, {
      status: 'cancelled',
      series_status: 'cancelled',
      ended_at: new Date(),
    });
    return true;
  }

  public async listUserMeetings(userId: string): Promise<MeetingRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `SELECT DISTINCT m.* FROM meetings m
         LEFT JOIN meeting_participants p ON m.id = p.meeting_id
         LEFT JOIN meeting_alternative_hosts ah ON m.id = ah.meeting_id
         WHERE (m.owner_user_id = $1 OR p.user_id = $1 OR ah.user_id = $1)
           AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC`,
        [userId]
      );
      return res.rows.map((r) => this.normalizeRecord(r));
    }

    const meetingIds = new Set<string>();
    for (const meeting of this.inMemoryMeetings.values()) {
      if (meeting.deleted_at) continue;
      if (
        meeting.owner_user_id === userId ||
        (meeting.alternative_host_ids && meeting.alternative_host_ids.includes(userId))
      ) {
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
      if (m && !m.deleted_at) result.push({ ...m });
    }
    return result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async listUpcomingMeetings(userId: string): Promise<MeetingRecord[]> {
    const all = await this.listUserMeetings(userId);
    const now = new Date();
    return all
      .filter((m) => {
        if (m.status === 'cancelled' || m.series_status === 'cancelled' || m.series_status === 'expired') {
          return false;
        }
        if (m.meeting_type === 'recurring' && m.series_status === 'active') {
          if (m.expires_at && m.expires_at.getTime() < now.getTime()) return false;
          if (m.recurrence_end_at && m.recurrence_end_at.getTime() < now.getTime()) return false;
          return true;
        }
        if (m.status === 'ended' || m.series_status === 'ended') return false;
        if (m.is_scheduled && m.scheduled_at) {
          const endTime = new Date(m.scheduled_at.getTime() + m.duration_minutes * 60 * 1000);
          return endTime.getTime() >= now.getTime() || m.status === 'active';
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
        if (m.status === 'ended' || m.status === 'cancelled' || m.series_status === 'cancelled' || m.series_status === 'expired') {
          return true;
        }
        if (m.meeting_type === 'recurring') {
          return Boolean(m.recurrence_end_at && m.recurrence_end_at.getTime() < now.getTime());
        }
        if (m.is_scheduled && m.scheduled_at && m.status !== 'active') {
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
