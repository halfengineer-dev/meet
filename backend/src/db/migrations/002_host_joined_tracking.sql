-- Migration 002: Add host joined tracking to meeting_sessions
ALTER TABLE meeting_sessions ADD COLUMN IF NOT EXISTS host_joined_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meeting_sessions ADD COLUMN IF NOT EXISTS host_in_room BOOLEAN NOT NULL DEFAULT FALSE;

