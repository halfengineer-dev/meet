export interface UserRecord {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  email_verified: boolean;
  status: 'active' | 'suspended' | 'deactivated';
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

export interface MeetingRecord {
  id: string;
  room_id: string;
  title: string;
  owner_user_id: string;
  status: 'active' | 'ended';
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

