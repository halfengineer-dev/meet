import { v4 as uuidv4 } from 'uuid';
import { MeetingInvitationRecord } from '../types';
import { getDatabasePool, isUsingPostgres } from '../database';

class InvitationRepository {
  private inMemoryInvitations: Map<string, MeetingInvitationRecord> = new Map();

  public async createInvitations(
    meetingId: string,
    emails: string[]
  ): Promise<MeetingInvitationRecord[]> {
    const results: MeetingInvitationRecord[] = [];
    const now = new Date();

    for (const email of emails) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) continue;

      const record: MeetingInvitationRecord = {
        id: uuidv4(),
        meeting_id: meetingId,
        email: normalizedEmail,
        invited_user_id: null,
        invitation_token_hash: null,
        status: 'pending',
        invited_at: now,
        responded_at: null,
        created_at: now,
        updated_at: now,
      };

      if (isUsingPostgres()) {
        const pool = getDatabasePool()!;
        await pool.query(
          `INSERT INTO meeting_invitations 
           (id, meeting_id, email, invited_user_id, invitation_token_hash, status, invited_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (meeting_id, email) DO NOTHING`,
          [
            record.id,
            record.meeting_id,
            record.email,
            record.invited_user_id,
            record.invitation_token_hash,
            record.status,
            record.invited_at,
            record.created_at,
            record.updated_at,
          ]
        );
      } else {
        const key = `${meetingId}:${normalizedEmail}`;
        if (!this.inMemoryInvitations.has(key)) {
          this.inMemoryInvitations.set(key, { ...record });
        }
      }
      results.push(record);
    }

    return results;
  }

  public async listByMeeting(meetingId: string): Promise<MeetingInvitationRecord[]> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'SELECT * FROM meeting_invitations WHERE meeting_id = $1 ORDER BY created_at ASC',
        [meetingId]
      );
      return res.rows;
    }

    const list: MeetingInvitationRecord[] = [];
    for (const record of this.inMemoryInvitations.values()) {
      if (record.meeting_id === meetingId) {
        list.push({ ...record });
      }
    }
    return list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  public async removeInvitation(meetingId: string, invitationId: string): Promise<boolean> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        'DELETE FROM meeting_invitations WHERE id = $1 AND meeting_id = $2',
        [invitationId, meetingId]
      );
      return (res.rowCount || 0) > 0;
    }

    for (const [key, record] of this.inMemoryInvitations.entries()) {
      if (record.id === invitationId && record.meeting_id === meetingId) {
        this.inMemoryInvitations.delete(key);
        return true;
      }
    }
    return false;
  }

  public async updateStatus(
    invitationId: string,
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  ): Promise<MeetingInvitationRecord | null> {
    const now = new Date();

    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      const res = await pool.query(
        `UPDATE meeting_invitations 
         SET status = $1, responded_at = $2, updated_at = $3 
         WHERE id = $4 RETURNING *`,
        [status, now, now, invitationId]
      );
      return res.rows[0] || null;
    }

    for (const record of this.inMemoryInvitations.values()) {
      if (record.id === invitationId) {
        record.status = status;
        record.responded_at = now;
        record.updated_at = now;
        return { ...record };
      }
    }
    return null;
  }

  public async clearAll(): Promise<void> {
    if (isUsingPostgres()) {
      const pool = getDatabasePool()!;
      await pool.query('DELETE FROM meeting_invitations');
    }
    this.inMemoryInvitations.clear();
  }
}

export const invitationRepository = new InvitationRepository();

