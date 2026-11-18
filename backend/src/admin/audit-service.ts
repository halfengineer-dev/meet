import { AuthenticatedRequest } from '../auth/middleware';
import { adminStore, AuditLogRecord } from '../db/repositories/admin-store';
import { AdminContext } from './rbac';

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  organizationId?: string | null;
  status?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export async function recordAudit(
  req: AuthenticatedRequest & { adminContext?: AdminContext; correlationId?: string },
  input: AuditInput
): Promise<AuditLogRecord> {
  const ctx = req.adminContext;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.ip
    || req.socket?.remoteAddress
    || null;

  return adminStore.insertAuditLog({
    actor_id: req.user?.id || ctx?.userId || null,
    actor_email: req.user?.email || ctx?.email || null,
    actor_role: ctx?.platformRole || ctx?.orgRole || req.user?.role || null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId || null,
    organization_id: input.organizationId ?? ctx?.scopedOrganizationId ?? null,
    status: input.status || 'success',
    correlation_id: req.correlationId || null,
    ip_address: ip,
    user_agent: (req.headers['user-agent'] as string) || null,
    metadata: input.metadata || {},
  });
}

export function auditLogsToCsv(logs: AuditLogRecord[]): string {
  const escape = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'id',
    'created_at',
    'actor_id',
    'actor_email',
    'actor_role',
    'action',
    'target_type',
    'target_id',
    'organization_id',
    'status',
    'correlation_id',
    'ip_address',
    'metadata',
  ];

  const rows = logs.map((l) => [
    l.id,
    l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
    l.actor_id,
    l.actor_email,
    l.actor_role,
    l.action,
    l.target_type,
    l.target_id,
    l.organization_id,
    l.status,
    l.correlation_id,
    l.ip_address,
    JSON.stringify(l.metadata || {}),
  ].map(escape).join(','));

  return [headers.join(','), ...rows].join('\n');
}

