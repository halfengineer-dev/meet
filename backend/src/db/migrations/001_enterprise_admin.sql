-- Faceonn Enterprise Admin Control Center Migration 001
-- Normalized schema for RBAC, Organizations, Recordings, Billing, Support, Security, Config, and Infrastructure

-- 1. Extend existing users and meetings tables safely (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_meetings_org_id ON meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_type ON meetings(meeting_type);

-- 2. RBAC Tables
CREATE TABLE IF NOT EXISTS admin_roles (
    id UUID PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'platform', -- 'platform' | 'organization'
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_permissions (
    id UUID PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(60) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
    role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_slug VARCHAR(50) NOT NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, role_slug)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_roles_user ON admin_user_roles(user_id);

-- 3. Organizations & Membership
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- active | suspended | deleted
    plan_slug VARCHAR(50) NOT NULL DEFAULT 'free',
    branding JSONB NOT NULL DEFAULT '{}'::jsonb,
    policies JSONB NOT NULL DEFAULT '{}'::jsonb,
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_created ON organizations(created_at DESC);

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(40) NOT NULL DEFAULT 'member', -- org_owner | org_admin | meeting_admin | member | guest
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(40) NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);

-- 4. Recordings (Privacy-enforced metadata & retention abstraction)
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY,
    meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
    room_id VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_provider VARCHAR(40) NOT NULL DEFAULT 's3',
    storage_key TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'processing', -- processing | available | failed | deleted | expired
    failure_reason TEXT,
    visibility VARCHAR(30) NOT NULL DEFAULT 'private', -- private | organization | restricted
    retention_days INT NOT NULL DEFAULT 90,
    retention_expires_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recordings_org ON recordings(organization_id);
CREATE INDEX IF NOT EXISTS idx_recordings_host ON recordings(host_user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);

-- 5. Subscription Plans, Subscriptions, Payments, Invoices, Coupons
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly_cents INT NOT NULL DEFAULT 0,
    price_yearly_cents INT NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    max_meeting_minutes INT NOT NULL DEFAULT 40,
    max_participants INT NOT NULL DEFAULT 100,
    cloud_recording_gb INT NOT NULL DEFAULT 0,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- active | trialing | past_due | cancelled | expired
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | yearly
    amount_cents INT NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    external_provider VARCHAR(40),
    external_subscription_id VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    amount_cents INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'succeeded', -- succeeded | pending | failed | refunded
    payment_method_label VARCHAR(80), -- e.g. 'Visa ending 4242' (NEVER full card numbers)
    provider VARCHAR(40) NOT NULL DEFAULT 'manual',
    provider_transaction_id VARCHAR(120),
    failure_reason TEXT,
    refunded_cents INT NOT NULL DEFAULT 0,
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY,
    invoice_number VARCHAR(60) UNIQUE NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    amount_cents INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'paid', -- draft | open | paid | void | uncollectible
    due_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY,
    code VARCHAR(60) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percent', -- percent | fixed
    discount_value INT NOT NULL,
    max_redemptions INT,
    redemption_count INT NOT NULL DEFAULT 0,
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Support Tickets, Moderation Reports, Announcements, Admin Notifications
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY,
    ticket_number VARCHAR(30) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'other',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- open | in_progress | waiting_customer | escalated | resolved | closed
    assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sla_due_at TIMESTAMP WITH TIME ZONE,
    first_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    csat_rating INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(120),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    body TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS moderation_reports (
    id UUID PRIMARY KEY,
    reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL, -- harassment | spam | security | chat_abuse | other
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- open | investigating | action_taken | dismissed
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_announcements (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info | warning | critical | maintenance
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | scheduled | published | archived
    target_scope VARCHAR(30) NOT NULL DEFAULT 'all', -- all | organizations | plans
    target_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_notifications (
    id UUID PRIMARY KEY,
    category VARCHAR(40) NOT NULL, -- support | infrastructure | security | billing | recording | organization
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info | warning | critical
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    target_permission VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_by UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);

-- 7. Security, Audit Logs, API Keys, Platform Config, Feature Flags
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    actor_role VARCHAR(50),
    action VARCHAR(120) NOT NULL,
    target_type VARCHAR(60) NOT NULL,
    target_id VARCHAR(120),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success', -- success | failure
    correlation_id VARCHAR(80),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL, -- login_success | login_failed | password_reset | new_device | token_reuse | lockout | suspicious_login | api_key_auth_failed
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info | low | medium | high | critical
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    country VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    key_prefix VARCHAR(24) NOT NULL,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    rate_limit_per_min INT NOT NULL DEFAULT 120,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(120) PRIMARY KEY,
    category VARCHAR(60) NOT NULL DEFAULT 'general',
    value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY,
    key VARCHAR(80) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    enabled_globally BOOLEAN NOT NULL DEFAULT TRUE,
    org_overrides JSONB NOT NULL DEFAULT '{}'::jsonb, -- { [orgId]: boolean }
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Infrastructure Alerts & Metrics Snapshots
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY,
    source VARCHAR(50) NOT NULL, -- sfu | jitsi | turn | redis | socketio | api | database
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- info | warning | critical
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON system_alerts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS infrastructure_metrics (
    id UUID PRIMARY KEY,
    component VARCHAR(50) NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_infra_metrics_comp ON infrastructure_metrics(component, recorded_at DESC);

