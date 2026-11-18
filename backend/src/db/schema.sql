-- Faceonn Core Authentication and Meeting Schema

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    pmi VARCHAR(30) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Ensure PMI column exists on existing user tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS pmi VARCHAR(30) UNIQUE;

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(64) NOT NULL,
    family_id UUID NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_family_id ON sessions(family_id);

CREATE TABLE IF NOT EXISTS meeting_recurrence_series (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurrence_rule TEXT NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_at TIMESTAMP WITH TIME ZONE,
    occurrence_count INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurrence_series_owner ON meeting_recurrence_series(owner_user_id);

CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY,
    room_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INT DEFAULT 30,
    timezone VARCHAR(50) DEFAULT 'UTC',
    description TEXT,
    is_scheduled BOOLEAN DEFAULT FALSE,
    meeting_type VARCHAR(20) DEFAULT 'instant',
    recurrence_series_id UUID REFERENCES meeting_recurrence_series(id) ON DELETE SET NULL,
    recurrence_rule TEXT,
    recurrence_end_at TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}'::jsonb,
    passcode_hash VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent migrations for existing deployments (must run before indexes on new columns)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(20) DEFAULT 'instant';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence_series_id UUID REFERENCES meeting_recurrence_series(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(30) DEFAULT 'none';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence_end_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence_count INT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(128);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS join_before_host_minutes INT DEFAULT 0;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_type VARCHAR(20) DEFAULT 'computer';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS auto_recording VARCHAR(20) DEFAULT 'none';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS registration_required BOOLEAN DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS alternative_host_ids UUID[] DEFAULT ARRAY[]::UUID[];
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS series_status VARCHAR(30) DEFAULT 'active';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_meetings_room_id ON meetings(room_id);
CREATE INDEX IF NOT EXISTS idx_meetings_owner ON meetings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_series_id ON meetings(recurrence_series_id);
CREATE INDEX IF NOT EXISTS idx_meetings_series_status ON meetings(series_status);

-- Individual scheduled occurrences belonging to a meeting series
CREATE TABLE IF NOT EXISTS meeting_occurrences (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    occurrence_number INT NOT NULL DEFAULT 1,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_started_at TIMESTAMP WITH TIME ZONE,
    actual_ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    session_id UUID,
    started_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ended_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meeting_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_occurrences_meeting_id ON meeting_occurrences(meeting_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_scheduled_at ON meeting_occurrences(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_occurrences_status ON meeting_occurrences(status);
CREATE INDEX IF NOT EXISTS idx_occurrences_meeting_scheduled ON meeting_occurrences(meeting_id, scheduled_at);

-- Live conference sessions tied to a specific occurrence (isolated internal Jitsi room per session)
CREATE TABLE IF NOT EXISTS meeting_sessions (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    occurrence_id UUID NOT NULL REFERENCES meeting_occurrences(id) ON DELETE CASCADE,
    jitsi_room_name VARCHAR(180) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    started_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ended_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    termination_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meeting_sessions_meeting_id ON meeting_sessions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_sessions_occurrence_id ON meeting_sessions(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_meeting_sessions_status ON meeting_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_occurrence
    ON meeting_sessions(occurrence_id)
    WHERE status = 'active';

-- Authorized alternative hosts (validated registered Faceonn users)
CREATE TABLE IF NOT EXISTS meeting_alternative_hosts (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alt_hosts_meeting_id ON meeting_alternative_hosts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_alt_hosts_user_id ON meeting_alternative_hosts(user_id);

-- Optional meeting registrations
CREATE TABLE IF NOT EXISTS meeting_registrations (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'approved',
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meeting_id, email)
);

CREATE INDEX IF NOT EXISTS idx_registrations_meeting_id ON meeting_registrations(meeting_id);

CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'participant',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting_user ON meeting_participants(meeting_id, user_id);

CREATE TABLE IF NOT EXISTS meeting_invitations (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invitation_token_hash VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meeting_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_meeting_id ON meeting_invitations(meeting_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON meeting_invitations(email);
