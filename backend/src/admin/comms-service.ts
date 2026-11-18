import { adminStore } from '../db/repositories/admin-store';
import { AdminContext, hasPermission } from './rbac';

export class CommsService {
  public async listAnnouncements() {
    return adminStore.listAnnouncements();
  }

  public async createAnnouncement(
    ctx: AdminContext,
    input: {
      title: string;
      body: string;
      severity?: 'info' | 'warning' | 'critical' | 'maintenance';
      status?: 'draft' | 'scheduled' | 'published';
      targetScope?: 'all' | 'organizations' | 'plans';
      targetIds?: string[];
      channels?: string[];
      scheduledAt?: string | null;
      expiresAt?: string | null;
    }
  ) {
    if (!input.title?.trim() || !input.body?.trim()) {
      throw new Error('Announcement title and body are required');
    }
    const status = input.status || 'draft';
    return adminStore.createAnnouncement({
      title: input.title.trim(),
      body: input.body.trim(),
      severity: input.severity || 'info',
      status,
      target_scope: input.targetScope || 'all',
      target_ids: Array.isArray(input.targetIds) ? input.targetIds : [],
      channels: Array.isArray(input.channels) && input.channels.length ? input.channels : ['in_app'],
      scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
      published_at: status === 'published' ? new Date() : null,
      expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
      created_by: ctx.userId,
    });
  }

  public async updateAnnouncement(
    id: string,
    updates: {
      title?: string;
      body?: string;
      severity?: 'info' | 'warning' | 'critical' | 'maintenance';
      status?: 'draft' | 'scheduled' | 'published' | 'archived';
      targetScope?: 'all' | 'organizations' | 'plans';
      targetIds?: string[];
      channels?: string[];
      scheduledAt?: string | null;
      expiresAt?: string | null;
    }
  ) {
    const updated = await adminStore.updateAnnouncement(id, {
      ...(updates.title ? { title: updates.title.trim() } : {}),
      ...(updates.body ? { body: updates.body.trim() } : {}),
      ...(updates.severity ? { severity: updates.severity } : {}),
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.status === 'published' ? { published_at: new Date() } : {}),
      ...(updates.targetScope ? { target_scope: updates.targetScope } : {}),
      ...(updates.targetIds ? { target_ids: updates.targetIds } : {}),
      ...(updates.channels ? { channels: updates.channels } : {}),
      ...(updates.scheduledAt !== undefined ? { scheduled_at: updates.scheduledAt ? new Date(updates.scheduledAt) : null } : {}),
      ...(updates.expiresAt !== undefined ? { expires_at: updates.expiresAt ? new Date(updates.expiresAt) : null } : {}),
    });
    if (!updated) {
      const err: any = new Error('Announcement not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  public async listAdminNotifications(ctx: AdminContext) {
    const all = await adminStore.listNotifications(80);
    const visible = all.filter((n) => {
      if (!n.target_permission) return true;
      return hasPermission(ctx, n.target_permission as any);
    });
    return {
      notifications: visible,
      unreadCount: visible.filter((n) => !n.is_read).length,
    };
  }

  public async markNotificationRead(ctx: AdminContext, id: string) {
    return adminStore.markNotificationRead(id, ctx.userId);
  }
}

export const commsService = new CommsService();

