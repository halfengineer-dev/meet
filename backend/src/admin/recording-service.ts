import { adminStore, RecordingRecord } from '../db/repositories/admin-store';
import { userRepository } from '../db/repositories/user-repository';
import { AdminContext, assertOrgScope, hasPermission } from './rbac';

export class RecordingService {
  /**
   * Lists recording metadata only. Never exposes raw storage keys or unrestricted download URLs.
   * Respects organization isolation and privacy policies.
   */
  public async listRecordings(
    ctx: AdminContext,
    query: {
      search?: string;
      status?: string;
      organizationId?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const scopeOrgId = ctx.scopedOrganizationId || query.organizationId || undefined;
    const [recordings, users, orgs] = await Promise.all([
      adminStore.listRecordings(scopeOrgId),
      userRepository.listUsers(undefined, true),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const q = (query.search || '').trim().toLowerCase();

    const enriched = recordings
      .filter((r) => {
        if (query.status && r.status !== query.status) return false;
        if (q) {
          const host = r.host_user_id ? userMap.get(r.host_user_id) : null;
          const hay = `${r.title} ${r.room_id || ''} ${r.meeting_id || ''} ${host?.email || ''} ${host?.name || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((r) => this.sanitizeRecording(r, userMap, orgMap));

    const total = enriched.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const offset = (page - 1) * limit;

    return {
      recordings: enriched.slice(offset, offset + limit),
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      storagePipelineStatus: {
        configured: Boolean(process.env.RECORDING_S3_BUCKET || process.env.RECORDING_STORAGE_PATH),
        provider: process.env.RECORDING_STORAGE_PROVIDER || 'unconfigured',
        note:
          process.env.RECORDING_S3_BUCKET || process.env.RECORDING_STORAGE_PATH
            ? 'Recording storage backend configured.'
            : 'No Jibri/S3 cloud recording processor configured yet. Metadata pipeline ready for integration.',
      },
    };
  }

  public async getRecordingMetadata(ctx: AdminContext, id: string) {
    const rec = await adminStore.findRecordingById(id);
    if (!rec) {
      const err: any = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }

    if (ctx.scopedOrganizationId) {
      assertOrgScope(ctx, rec.organization_id);
    }

    // Privacy check: support_admin cannot view private recordings metadata by default
    if (rec.visibility === 'private' && !hasPermission(ctx, 'recordings:view')) {
      const err: any = new Error('Forbidden: Recording access denied by privacy policy');
      err.statusCode = 403;
      throw err;
    }

    const [host, org] = await Promise.all([
      rec.host_user_id ? userRepository.findById(rec.host_user_id, true) : Promise.resolve(null),
      rec.organization_id ? adminStore.findOrganizationById(rec.organization_id) : Promise.resolve(null),
    ]);

    return {
      id: rec.id,
      title: rec.title,
      meetingId: rec.meeting_id,
      roomId: rec.room_id,
      host: host ? { id: host.id, name: host.name, email: host.email } : null,
      organization: org ? { id: org.id, name: org.name } : null,
      recordedAt: rec.recorded_at.toISOString(),
      durationSeconds: rec.duration_seconds,
      fileSizeBytes: rec.file_size_bytes,
      storageProvider: rec.storage_provider,
      status: rec.status,
      failureReason: rec.failure_reason,
      visibility: rec.visibility,
      retentionDays: rec.retention_days,
      retentionExpiresAt: rec.retention_expires_at ? rec.retention_expires_at.toISOString() : null,
      deletedAt: rec.deleted_at ? rec.deleted_at.toISOString() : null,
      // Explicitly never return unrestricted download links
      mediaAccessRestricted: true,
      signedUrlAvailable: false,
    };
  }

  public async updateRetention(ctx: AdminContext, id: string, retentionDays: number) {
    const rec = await adminStore.findRecordingById(id);
    if (!rec) {
      const err: any = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, rec.organization_id);
    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      throw new Error('Retention days must be between 1 and 3650');
    }

    const retentionExpiresAt = new Date(rec.recorded_at.getTime() + retentionDays * 86400 * 1000);
    return adminStore.updateRecording(id, {
      retention_days: Math.floor(retentionDays),
      retention_expires_at: retentionExpiresAt,
    });
  }

  public async softDeleteRecording(ctx: AdminContext, id: string) {
    const rec = await adminStore.findRecordingById(id);
    if (!rec) {
      const err: any = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, rec.organization_id);
    return adminStore.updateRecording(id, {
      status: 'deleted',
      deleted_at: new Date(),
    });
  }

  public async restoreRecording(ctx: AdminContext, id: string) {
    const rec = await adminStore.findRecordingById(id);
    if (!rec) {
      const err: any = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, rec.organization_id);
    if (rec.status !== 'deleted') {
      throw new Error('Only deleted recordings can be restored');
    }
    if (rec.retention_expires_at && rec.retention_expires_at.getTime() < Date.now()) {
      throw new Error('Cannot restore recording past its retention expiration date');
    }
    return adminStore.updateRecording(id, {
      status: 'available',
      deleted_at: null,
    });
  }

  private sanitizeRecording(
    r: RecordingRecord,
    userMap: Map<string, any>,
    orgMap: Map<string, any>
  ) {
    const host = r.host_user_id ? userMap.get(r.host_user_id) : null;
    const org = r.organization_id ? orgMap.get(r.organization_id) : null;
    return {
      id: r.id,
      title: r.title,
      meetingId: r.meeting_id,
      roomId: r.room_id,
      hostName: host?.name || host?.email || null,
      organizationId: r.organization_id,
      organizationName: org?.name || null,
      recordedAt: r.recorded_at.toISOString(),
      durationSeconds: r.duration_seconds,
      fileSizeBytes: r.file_size_bytes,
      storageProvider: r.storage_provider,
      status: r.status,
      failureReason: r.failure_reason,
      visibility: r.visibility,
      retentionDays: r.retention_days,
      retentionExpiresAt: r.retention_expires_at ? r.retention_expires_at.toISOString() : null,
      deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
    };
  }
}

export const recordingService = new RecordingService();

