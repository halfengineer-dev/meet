import { userRepository } from '../db/repositories/user-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { adminStore } from '../db/repositories/admin-store';
import { AdminContext, hasPermission } from './rbac';

export class GlobalSearchService {
  public async search(ctx: AdminContext, rawQuery: string) {
    const q = (rawQuery || '').trim().toLowerCase();
    if (q.length < 2) {
      return { users: [], organizations: [], meetings: [], recordings: [], tickets: [], payments: [] };
    }

    const scopeOrg = ctx.scopedOrganizationId || undefined;

    const [users, organizations, meetings, recordings, tickets, payments] = await Promise.all([
      hasPermission(ctx, 'users:view') ? userRepository.listUsers(q) : Promise.resolve([]),
      hasPermission(ctx, 'organizations:view') ? adminStore.listOrganizations(scopeOrg) : Promise.resolve([]),
      hasPermission(ctx, 'meetings:view') ? meetingRepository.listAllMeetings(scopeOrg) : Promise.resolve([]),
      hasPermission(ctx, 'recordings:view') ? adminStore.listRecordings(scopeOrg) : Promise.resolve([]),
      hasPermission(ctx, 'support:view') ? adminStore.listSupportTickets(scopeOrg) : Promise.resolve([]),
      hasPermission(ctx, 'billing:view') ? adminStore.listPayments(scopeOrg) : Promise.resolve([]),
    ]);

    return {
      users: users
        .filter((u) => !scopeOrg || u.organization_id === scopeOrg)
        .slice(0, 8)
        .map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status })),
      organizations: organizations
        .filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
        .slice(0, 6)
        .map((o) => ({ id: o.id, name: o.name, slug: o.slug, planSlug: o.plan_slug })),
      meetings: meetings
        .filter((m) => m.title.toLowerCase().includes(q) || m.room_id.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        .slice(0, 8)
        .map((m) => ({ id: m.id, roomId: m.room_id, title: m.title, status: m.status })),
      recordings: recordings
        .filter((r) => r.title.toLowerCase().includes(q) || (r.room_id || '').toLowerCase().includes(q))
        .slice(0, 6)
        .map((r) => ({ id: r.id, title: r.title, status: r.status })),
      tickets: tickets
        .filter((t) => t.subject.toLowerCase().includes(q) || t.ticket_number.toLowerCase().includes(q) || (t.user_email || '').toLowerCase().includes(q))
        .slice(0, 6)
        .map((t) => ({ id: t.id, ticketNumber: t.ticket_number, subject: t.subject, status: t.status, priority: t.priority })),
      payments: payments
        .filter((p) => p.id.toLowerCase().includes(q) || (p.provider_transaction_id || '').toLowerCase().includes(q) || p.status.toLowerCase().includes(q))
        .slice(0, 6)
        .map((p) => ({ id: p.id, amountCents: p.amount_cents, currency: p.currency, status: p.status })),
    };
  }
}

export const globalSearchService = new GlobalSearchService();

