export interface UserRecord {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  email_verified: boolean;
  status: 'active' | 'suspended' | 'deactivated';
  pmi?: string | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date;
  user_agent: string | null;
  ip_address: string | null;
}

export interface MeetingSettings {
  passcodeEnabled: boolean;
  waitingRoomEnabled: boolean;
  joinBeforeHost: boolean;
  hostVideoEnabled: boolean;
  participantVideoEnabled: boolean;
  muteOnEntry: boolean;
  allowScreenSharing: boolean;
  allowChat: boolean;
  allowReactions: boolean;
  requireAuthentication: boolean;
}

export interface MeetingRecord {
  id: string;
  room_id: string;
  title: string;
  owner_user_id: string;
  status: 'active' | 'ended' | 'scheduled' | 'cancelled';
  scheduled_at: Date | null;
  duration_minutes: number;
  timezone: string;
  description: string | null;
  is_scheduled: boolean;
  meeting_type: 'instant' | 'scheduled' | 'recurring';
  recurrence_series_id: string | null;
  recurrence_rule: string | null;
  recurrence_end_at: Date | null;
  settings: MeetingSettings;
  passcode_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeetingParticipantRecord {
  id: string;
  meeting_id: string;
  user_id: string;
  role: 'owner' | 'moderator' | 'participant';
  created_at: Date;
}

export interface MeetingInvitationRecord {
  id: string;
  meeting_id: string;
  email: string;
  invited_user_id: string | null;
  invitation_token_hash: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  invited_at: Date;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeetingRecurrenceRecord {
  id: string;
  owner_user_id: string;
  recurrence_rule: string;
  timezone: string;
  start_at: Date;
  end_at: Date | null;
  occurrence_count: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleMeetingDTO {
  title: string;
  description?: string;
  scheduledAt: string; // ISO 8601 string
  timezone: string;
  durationMinutes: number;
  meetingType?: 'instant' | 'scheduled' | 'recurring';
  usePmi?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    weekdays?: number[]; // 0 = Sun, 1 = Mon ...
    endDate?: string;
    occurrenceCount?: number;
  };
  settings?: Partial<MeetingSettings> & { passcode?: string };
  invitees?: string[];
}

export interface UpdateMeetingDTO {
  title?: string;
  description?: string;
  scheduledAt?: string;
  timezone?: string;
  durationMinutes?: number;
  settings?: Partial<MeetingSettings> & { passcode?: string };
  scope?: 'occurrence' | 'series';
}
