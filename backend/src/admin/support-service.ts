import { adminStore } from '../db/repositories/admin-store';
import { userRepository } from '../db/repositories/user-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { AdminContext, assertOrgScope } from './rbac';

const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
  urgent: 2,
  high: 8,
  medium: 24,
  low: 72,
};

export class SupportService {
  public async listTickets(
    ctx: AdminContext,
    filters: { status?: string; priority?: string; category?: string; assignedAdminId?: string; search?: string }
  ) {
    const [tickets, users, orgs] = await Promise.all([
      adminStore.listSupportTickets(ctx.scopedOrganizationId),
      userRepository.listUsers(undefined, true),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const q = (filters.search || '').trim().toLowerCase();

    const items = tickets
      .filter((t) => {
        if (filters.status && t.status !== filters.status) return false;
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.category && t.category !== filters.category) return false;
        if (filters.assignedAdminId && t.assigned_admin_id !== filters.assignedAdminId) return false;
        if (q) {
          const hay = `${t.ticket_number} ${t.subject} ${t.user_email || ''} ${t.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((t) => {
        const assignee = t.assigned_admin_id ? userMap.get(t.assigned_admin_id) : null;
        const user = t.user_id ? userMap.get(t.user_id) : null;
        const org = t.organization_id ? orgMap.get(t.organization_id) : null;
        const slaBreached = Boolean(
          t.sla_due_at &&
            t.status !== 'resolved' &&
            t.status !== 'closed' &&
            new Date(t.sla_due_at).getTime() < Date.now()
        );

        return {
          ...t,
          userName: user?.name || null,
          organizationName: org?.name || null,
          assignedAdminName: assignee?.name || assignee?.email || null,
          slaBreached,
        };
      });

    // Real SLA & response metrics
    const withFirstResp = tickets.filter((t) => t.first_response_at);
    const avgFirstResponseMins = withFirstResp.length
      ? Math.round(
          withFirstResp.reduce(
            (s, t) => s + (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / 60000,
            0
          ) / withFirstResp.length
        )
      : null;

    const rated = tickets.filter((t) => typeof t.csat_rating === 'number');
    const avgCsat = rated.length
      ? Number((rated.reduce((s, t) => s + (t.csat_rating || 0), 0) / rated.length).toFixed(2))
      : null;

    return {
      tickets: items,
      total: items.length,
      metrics: {
        open: tickets.filter((t) => t.status === 'open').length,
        inProgress: tickets.filter((t) => t.status === 'in_progress').length,
        escalated: tickets.filter((t) => t.status === 'escalated').length,
        resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
        slaBreached: items.filter((t) => t.slaBreached).length,
        avgFirstResponseMinutes: avgFirstResponseMins,
        avgCsat,
      },
    };
  }

  public async createTicket(
    ctx: AdminContext,
    input: {
      subject: string;
      description: string;
      userEmail?: string;
      userId?: string | null;
      organizationId?: string | null;
      meetingId?: string | null;
      category?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    }
  ) {
    const subject = (input.subject || '').trim();
    const description = (input.description || '').trim();
    if (!subject || !description) throw new Error('Ticket subject and description are required');

    const priority = input.priority || 'medium';
    const slaHours = SLA_HOURS_BY_PRIORITY[priority] || 24;
    const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000);
    const orgId = ctx.scopedOrganizationId || input.organizationId || null;

    const ticket = await adminStore.createSupportTicket({
      subject,
      description,
      user_id: input.userId || null,
      user_email: input.userEmail || ctx.email,
      organization_id: orgId,
      meeting_id: input.meetingId || null,
      category: input.category || 'other',
      priority,
      status: 'open',
      assigned_admin_id: null,
      sla_due_at: slaDueAt,
      first_response_at: null,
      resolved_at: null,
      resolution_notes: null,
      csat_rating: null,
    });

    await adminStore.createNotification({
      category: 'support',
      severity: priority === 'urgent' ? 'critical' : 'info',
      title: `New support ticket ${ticket.ticket_number}`,
      message: `${ticket.subject} (${priority.toUpperCase()})`,
      target_permission: 'support:view',
      metadata: { ticketId: ticket.id },
    }).catch(() => {});

    return ticket;
  }

  public async getTicketDetail(ctx: AdminContext, ticketId: string) {
    const ticket = await adminStore.findSupportTicketById(ticketId);
    if (!ticket) {
      const err: any = new Error('Support ticket not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, ticket.organization_id);

    const [messages, user, meeting] = await Promise.all([
      adminStore.listSupportMessages(ticket.id),
      ticket.user_id ? userRepository.findById(ticket.user_id, true) : Promise.resolve(null),
      ticket.meeting_id ? meetingRepository.findById(ticket.meeting_id) : Promise.resolve(null),
    ]);

    return {
      ticket,
      messages,
      user: user ? { id: user.id, name: user.name, email: user.email, status: user.status } : null,
      meetingDiagnostics: meeting
        ? {
            id: meeting.id,
            roomId: meeting.room_id,
            title: meeting.title,
            status: meeting.status,
            meetingType: meeting.meeting_type,
            createdAt: meeting.created_at,
          }
        : null,
    };
  }

  public async replyToTicket(
    ctx: AdminContext,
    ticketId: string,
    input: { body: string; isInternal?: boolean }
  ) {
    const ticket = await adminStore.findSupportTicketById(ticketId);
    if (!ticket) {
      const err: any = new Error('Support ticket not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, ticket.organization_id);
    if (!input.body || !input.body.trim()) throw new Error('Reply body cannot be empty');

    const msg = await adminStore.addSupportMessage({
      ticket_id: ticket.id,
      author_user_id: ctx.userId,
      author_name: ctx.name || ctx.email,
      is_internal: Boolean(input.isInternal),
      body: input.body.trim(),
      attachments: [],
    });

    const ticketUpdates: Record<string, any> = {};
    if (!ticket.first_response_at && !input.isInternal) {
      ticketUpdates.first_response_at = new Date();
    }
    if (ticket.status === 'open') {
      ticketUpdates.status = 'in_progress';
    }
    if (!ticket.assigned_admin_id) {
      ticketUpdates.assigned_admin_id = ctx.userId;
    }
    if (Object.keys(ticketUpdates).length > 0) {
      await adminStore.updateSupportTicket(ticket.id, ticketUpdates);
    }

    return msg;
  }

  public async updateTicket(
    ctx: AdminContext,
    ticketId: string,
    updates: {
      status?: 'open' | 'in_progress' | 'waiting_customer' | 'escalated' | 'resolved' | 'closed';
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      assignedAdminId?: string | null;
      resolutionNotes?: string | null;
      csatRating?: number | null;
    }
  ) {
    const ticket = await adminStore.findSupportTicketById(ticketId);
    if (!ticket) {
      const err: any = new Error('Support ticket not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, ticket.organization_id);

    return adminStore.updateSupportTicket(ticket.id, {
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.status === 'resolved' || updates.status === 'closed' ? { resolved_at: new Date() } : {}),
      ...(updates.priority ? { priority: updates.priority } : {}),
      ...(updates.assignedAdminId !== undefined ? { assigned_admin_id: updates.assignedAdminId } : {}),
      ...(updates.resolutionNotes !== undefined ? { resolution_notes: updates.resolutionNotes } : {}),
      ...(updates.csatRating !== undefined ? { csat_rating: updates.csatRating } : {}),
    });
  }

  // ==================== MODERATION REPORTS ====================
  public async listModerationReports(ctx: AdminContext, status?: string) {
    const reports = await adminStore.listModerationReports(ctx.scopedOrganizationId);
    return reports.filter((r) => !status || r.status === status);
  }

  public async createModerationReport(
    ctx: AdminContext,
    input: {
      reportedUserId?: string | null;
      meetingId?: string | null;
      organizationId?: string | null;
      category: string;
      reason: string;
    }
  ) {
    if (!input.reason || !input.reason.trim()) throw new Error('Report reason is required');
    return adminStore.createModerationReport({
      reporter_user_id: ctx.userId,
      reported_user_id: input.reportedUserId || null,
      meeting_id: input.meetingId || null,
      organization_id: ctx.scopedOrganizationId || input.organizationId || null,
      category: input.category || 'other',
      reason: input.reason.trim(),
      status: 'open',
      resolution_notes: null,
      resolved_by: null,
    });
  }

  public async resolveModerationReport(
    ctx: AdminContext,
    reportId: string,
    updates: { status: 'investigating' | 'action_taken' | 'dismissed'; resolutionNotes?: string }
  ) {
    const reports = await adminStore.listModerationReports(ctx.scopedOrganizationId);
    const existing = reports.find((r) => r.id === reportId);
    if (!existing) {
      const err: any = new Error('Moderation report not found');
      err.statusCode = 404;
      throw err;
    }
    return adminStore.updateModerationReport(reportId, {
      status: updates.status,
      resolution_notes: updates.resolutionNotes || null,
      resolved_by: ctx.userId,
    });
  }
}

export const supportService = new SupportService();

