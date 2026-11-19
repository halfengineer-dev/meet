export type UserRole = 'admin' | 'user';

export type PlatformAdminRole =
  | 'super_admin'
  | 'platform_admin'
  | 'support_admin'
  | 'billing_admin'
  | 'technical_admin';

export type OrganizationRole =
  | 'org_owner'
  | 'org_admin'
  | 'meeting_admin'
  | 'member'
  | 'guest';

export interface UserRecord {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  email_verified: boolean;
  role: UserRole;
  admin_role?: PlatformAdminRole | null;
  organization_id?: string | null;
  country?: string | null;
  status: 'active' | 'suspended' | 'deactivated';
  pmi?: string | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  last_active_at?: Date | null;
  deleted_at?: Date | null;
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

export type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
export type SeriesStatus = 'active' | 'ended' | 'cancelled' | 'expired';
export type OccurrenceStatus = 'scheduled' | 'waiting_for_host' | 'active' | 'ended' | 'cancelled' | 'missed';
export type MeetingSessionStatus = 'active' | 'ended';
export type AudioType = 'computer' | 'telephone' | 'both';
export type AutoRecordingType = 'none' | 'local' | 'cloud';

export interface MeetingSettings {
  passcodeEnabled: boolean;
  waitingRoomEnabled: boolean;
  joinBeforeHost: boolean;
  joinBeforeHostMinutes?: number; // 0 = anytime, 5, 10, 15
  hostVideoEnabled: boolean;
  participantVideoEnabled: boolean;
  muteOnEntry: boolean;
  allowParticipantsUnmute?: boolean;
  allowScreenSharing: boolean;
  allowChat: boolean;
  allowReactions: boolean;
  allowRecording?: boolean;
  requireAuthentication: boolean;
  registrationRequired?: boolean;
  audioType?: AudioType;
  autoRecording?: AutoRecordingType;
}

export interface MeetingRecord {
  id: string;
  room_id: string;
  title: string;
  owner_user_id: string;
  status: 'active' | 'ended' | 'scheduled' | 'cancelled';
  series_status: SeriesStatus;
  scheduled_at: Date | null;
  duration_minutes: number;
  timezone: string;
  description: string | null;
  is_scheduled: boolean;
  meeting_type: 'instant' | 'scheduled' | 'recurring';
  recurrence_series_id: string | null;
  recurrence_type: RecurrenceType;
  recurrence_rule: string | null;
  recurrence_end_at: Date | null;
  recurrence_count: number | null;
  settings: MeetingSettings;
  passcode_hash: string | null;
  join_before_host_minutes: number;
  audio_type: AudioType;
  auto_recording: AutoRecordingType;
  registration_required: boolean;
  alternative_host_ids: string[];
  ended_at: Date | null;
  deleted_at: Date | null;
  expires_at: Date | null;
  organization_id?: string | null;
  is_disabled?: boolean;
  disabled_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeetingOccurrenceRecord {
  id: string;
  meeting_id: string;
  occurrence_number: number;
  scheduled_at: Date;
  scheduled_end_at: Date;
  actual_started_at: Date | null;
  actual_ended_at: Date | null;
  status: OccurrenceStatus;
  session_id: string | null;
  started_by_user_id: string | null;
  ended_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeetingSessionRecord {
  id: string;
  meeting_id: string;
  occurrence_id: string;
  jitsi_room_name: string;
  status: MeetingSessionStatus;
  started_at: Date;
  ended_at: Date | null;
  started_by_user_id: string | null;
  ended_by_user_id: string | null;
  host_joined_at: Date | null;
  host_in_room: boolean;
  termination_reason: string | null;
  created_at: Date;
}

export interface MeetingAlternativeHostRecord {
  id: string;
  meeting_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string;
  created_at: Date;
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

export interface RecurrenceInput {
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  weekdays?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  monthlyMode?: 'day_of_month' | 'nth_weekday';
  monthlyWeek?: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = Last
  monthlyWeekday?: number; // 0-6
  customRrule?: string;
  endDate?: string;
  occurrenceCount?: number;
}

export interface ScheduleMeetingDTO {
  title: string;
  description?: string;
  scheduledAt: string; // ISO 8601 string
  timezone: string;
  durationMinutes: number;
  meetingType?: 'instant' | 'scheduled' | 'recurring';
  usePmi?: boolean;
  recurrence?: RecurrenceInput;
  settings?: Partial<MeetingSettings> & { passcode?: string };
  invitees?: string[];
  alternativeHostIds?: string[];
}

export interface UpdateMeetingDTO {
  title?: string;
  description?: string;
  scheduledAt?: string;
  timezone?: string;
  durationMinutes?: number;
  recurrence?: RecurrenceInput;
  settings?: Partial<MeetingSettings> & { passcode?: string };
  alternativeHostIds?: string[];
  scope?: 'occurrence' | 'following' | 'series';
  occurrenceId?: string;
}
