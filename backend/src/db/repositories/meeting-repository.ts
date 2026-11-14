import { v4 as uuidv4 } from 'uuid';
import { MeetingRecord, MeetingParticipantRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class MeetingRepository {
  private inMemoryMeetings: Map<string, MeetingRecord> = new Map();
  private inMemoryParticipants: Map<string, MeetingParticipantRecord> = new Map();

  public async createMeeting(data: {
    id?: string;
    room_id: string;
    title: string;
    owner_user_id: string;
  }): Promise<MeetingRecord> {
    const id = data.id || uuidv4();
    const now = new Date();

    const meeting: MeetingRecord = {
      id,
      room_id: data.room_id.toLowerCase().trim(),
      title: data.title.trim(),
      owner_user_id: data.owner_user_id,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query(
        `INSERT INTO meetings (id, room_id, title, owner_user_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [meeting.id, meeting.room_id, meeting.title, meeting.owner_user_id, meeting.status, meeting.created_at, meeting.updated_at]
      );
    } else {
      this.inMemoryMeetings.set(meeting.id, { ...meeting });
    }

    // Automatically add the owner as 'owner' participant
    await this.addParticipant(meeting.id, meeting.owner_user_id, 'owner');

    return meeting;
  }

  public async findByRoomId(roomId: string): Promise<MeetingRecord | null> {
    const normalized = roomId.toLowerCase().trim();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query('SELECT * FROM meetings WHERE room_id = $1 LIMIT 1', [normalized]);
      return res.rows[0] || null;
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
      return res.rows[0] || null;
    }

    const meeting = this.inMemoryMeetings.get(id);
    return meeting ? { ...meeting } : null;
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
      return res.rows;
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

