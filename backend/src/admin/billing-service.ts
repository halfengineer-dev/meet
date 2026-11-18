import { adminStore } from '../db/repositories/admin-store';
import { userRepository } from '../db/repositories/user-repository';
import { AdminContext, assertOrgScope } from './rbac';

export class BillingService {
  public async getBillingOverview(ctx: AdminContext) {
    const scopeOrg = ctx.scopedOrganizationId || undefined;
    const [plans, subs, payments, invoices, coupons] = await Promise.all([
      adminStore.listPlans(),
      adminStore.listSubscriptions(scopeOrg),
      adminStore.listPayments(scopeOrg),
      adminStore.listInvoices(scopeOrg),
      ctx.isPlatformAdmin ? adminStore.listCoupons() : Promise.resolve([]),
    ]);

    const activeSubs = subs.filter((s) => s.status === 'active');
    const trialSubs = subs.filter((s) => s.status === 'trialing');
    const cancelledSubs = subs.filter((s) => s.status === 'cancelled');

    const mrrCents = activeSubs.reduce((sum, s) => {
      return sum + (s.billing_cycle === 'yearly' ? Math.round(s.amount_cents / 12) : s.amount_cents);
    }, 0);
    const arrCents = mrrCents * 12;

    const succeededPayments = payments.filter((p) => p.status === 'succeeded');
    const failedPayments = payments.filter((p) => p.status === 'failed');
    const refundedPayments = payments.filter((p) => p.status === 'refunded' || p.refunded_cents > 0);
    const totalRevenueCents = succeededPayments.reduce((sum, p) => sum + p.amount_cents, 0);
    const totalRefundedCents = refundedPayments.reduce((sum, p) => sum + p.refunded_cents, 0);

    // Revenue by month (last 6 months from real payments)
    const monthlySeries: Array<{ month: string; revenueCents: number; count: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const matching = succeededPayments.filter((p) => {
        const pd = new Date(p.created_at);
        const pk = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, '0')}`;
        return pk === key;
      });
      monthlySeries.push({
        month: key,
        revenueCents: matching.reduce((sum, p) => sum + p.amount_cents, 0),
        count: matching.length,
      });
    }

    return {
      metrics: {
        mrrCents,
        arrCents,
        totalRevenueCents,
        totalRefundedCents,
        totalPayments: payments.length,
        successfulPayments: succeededPayments.length,
        failedPayments: failedPayments.length,
        refundedCount: refundedPayments.length,
        activeSubscriptions: activeSubs.length,
        trialSubscriptions: trialSubs.length,
        cancelledSubscriptions: cancelledSubs.length,
        totalInvoices: invoices.length,
        activeCoupons: coupons.filter((c) => c.is_active).length,
      },
      planCount: plans.length,
      monthlyRevenue: monthlySeries,
      paymentGateway: {
        provider: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'manual_ledger',
        liveConnected: Boolean(process.env.STRIPE_SECRET_KEY),
        note: process.env.STRIPE_SECRET_KEY
          ? 'Stripe billing provider configured.'
          : 'Operating in internal billing ledger mode. Configure STRIPE_SECRET_KEY to connect live card processing.',
      },
    };
  }

  public async listPlans() {
    return adminStore.listPlans();
  }

  public async createPlan(input: {
    slug: string;
    name: string;
    description?: string;
    priceMonthlyCents: number;
    priceYearlyCents: number;
    currency?: string;
    maxMeetingMinutes: number;
    maxParticipants: number;
    cloudRecordingGb?: number;
    features?: Record<string, boolean | number | string>;
  }) {
    if (!input.slug || !input.name) throw new Error('Plan slug and name are required');
    return adminStore.createPlan({
      slug: input.slug.toLowerCase().trim(),
      name: input.name.trim(),
      description: input.description || null,
      price_monthly_cents: Math.max(0, Math.floor(Number(input.priceMonthlyCents) || 0)),
      price_yearly_cents: Math.max(0, Math.floor(Number(input.priceYearlyCents) || 0)),
      currency: (input.currency || 'USD').toUpperCase(),
      max_meeting_minutes: Math.max(10, Math.floor(Number(input.maxMeetingMinutes) || 60)),
      max_participants: Math.max(2, Math.floor(Number(input.maxParticipants) || 50)),
      cloud_recording_gb: Math.max(0, Math.floor(Number(input.cloudRecordingGb) || 0)),
      features: input.features || {},
      is_active: true,
    });
  }

  public async updatePlan(id: string, updates: Record<string, any>) {
    const updated = await adminStore.updatePlan(id, {
      ...(updates.name !== undefined ? { name: String(updates.name).trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.priceMonthlyCents !== undefined ? { price_monthly_cents: Math.max(0, Number(updates.priceMonthlyCents)) } : {}),
      ...(updates.priceYearlyCents !== undefined ? { price_yearly_cents: Math.max(0, Number(updates.priceYearlyCents)) } : {}),
      ...(updates.maxMeetingMinutes !== undefined ? { max_meeting_minutes: Math.max(10, Number(updates.maxMeetingMinutes)) } : {}),
      ...(updates.maxParticipants !== undefined ? { max_participants: Math.max(2, Number(updates.maxParticipants)) } : {}),
      ...(updates.cloudRecordingGb !== undefined ? { cloud_recording_gb: Math.max(0, Number(updates.cloudRecordingGb)) } : {}),
      ...(updates.isActive !== undefined ? { is_active: Boolean(updates.isActive) } : {}),
      ...(updates.features !== undefined ? { features: updates.features } : {}),
    });
    if (!updated) {
      const err: any = new Error('Subscription plan not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  public async listSubscriptions(ctx: AdminContext, status?: string) {
    const [subs, plans, orgs, users] = await Promise.all([
      adminStore.listSubscriptions(ctx.scopedOrganizationId),
      adminStore.listPlans(),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
      userRepository.listUsers(undefined, true),
    ]);
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return subs
      .filter((s) => !status || s.status === status)
      .map((s) => ({
        ...s,
        planName: planMap.get(s.plan_id)?.name || 'Unknown',
        planSlug: planMap.get(s.plan_id)?.slug || '',
        organizationName: s.organization_id ? orgMap.get(s.organization_id)?.name || null : null,
        userEmail: s.user_id ? userMap.get(s.user_id)?.email || null : null,
      }));
  }

  public async assignSubscription(
    ctx: AdminContext,
    input: {
      organizationId?: string | null;
      userId?: string | null;
      planId: string;
      billingCycle?: 'monthly' | 'yearly';
      status?: 'active' | 'trialing';
    }
  ) {
    if (!ctx.isPlatformAdmin) {
      const err: any = new Error('Forbidden: Only platform billing admins can assign subscriptions');
      err.statusCode = 403;
      throw err;
    }
    const plans = await adminStore.listPlans();
    const plan = plans.find((p) => p.id === input.planId || p.slug === input.planId);
    if (!plan) throw new Error('Subscription plan not found');

    const cycle = input.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const amountCents = cycle === 'yearly' ? plan.price_yearly_cents : plan.price_monthly_cents;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + (cycle === 'yearly' ? 365 : 30) * 86400 * 1000);

    const sub = await adminStore.createSubscription({
      user_id: input.userId || null,
      organization_id: input.organizationId || null,
      plan_id: plan.id,
      status: input.status || 'active',
      billing_cycle: cycle,
      amount_cents: amountCents,
      currency: plan.currency,
      current_period_start: now,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      cancelled_at: null,
      external_provider: 'manual',
      external_subscription_id: null,
    });

    if (input.organizationId) {
      await adminStore.updateOrganization(input.organizationId, { plan_slug: plan.slug });
    }

    if (amountCents > 0 && sub.status === 'active') {
      const payment = await adminStore.createPayment({
        subscription_id: sub.id,
        user_id: sub.user_id,
        organization_id: sub.organization_id,
        amount_cents: amountCents,
        currency: plan.currency,
        status: 'succeeded',
        payment_method_label: 'Enterprise Invoice / Admin Assigned',
        provider: 'manual',
        provider_transaction_id: `tx_${sub.id.slice(0, 8)}`,
        failure_reason: null,
        refunded_cents: 0,
        refunded_at: null,
      });

      await adminStore.createInvoice({
        invoice_number: `INV-${Date.now().toString().slice(-8)}`,
        subscription_id: sub.id,
        payment_id: payment.id,
        user_id: sub.user_id,
        organization_id: sub.organization_id,
        amount_cents: amountCents,
        currency: plan.currency,
        status: 'paid',
        due_at: now,
        paid_at: now,
        line_items: [{ description: `Faceonn ${plan.name} (${cycle})`, quantity: 1, unit_amount_cents: amountCents }],
      });
    }

    return sub;
  }

  public async cancelSubscription(ctx: AdminContext, subscriptionId: string) {
    const subs = await adminStore.listSubscriptions(ctx.scopedOrganizationId);
    const sub = subs.find((s) => s.id === subscriptionId);
    if (!sub) {
      const err: any = new Error('Subscription not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, sub.organization_id);

    const updated = await adminStore.updateSubscription(subscriptionId, {
      status: 'cancelled',
      cancel_at_period_end: true,
      cancelled_at: new Date(),
    });

    await adminStore.createNotification({
      category: 'billing',
      severity: 'warning',
      title: 'Subscription cancelled',
      message: `Subscription ${subscriptionId.slice(0, 8)} was cancelled by ${ctx.email}.`,
      target_permission: 'billing:view',
      metadata: { subscriptionId },
    }).catch(() => {});

    return updated;
  }

  public async listPayments(ctx: AdminContext, status?: string) {
    const [payments, orgs, users] = await Promise.all([
      adminStore.listPayments(ctx.scopedOrganizationId),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
      userRepository.listUsers(undefined, true),
    ]);
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return payments
      .filter((p) => !status || p.status === status)
      .map((p) => ({
        ...p,
        organizationName: p.organization_id ? orgMap.get(p.organization_id)?.name || null : null,
        userEmail: p.user_id ? userMap.get(p.user_id)?.email || null : null,
      }));
  }

  public async refundPayment(ctx: AdminContext, paymentId: string, amountCents?: number) {
    const payments = await adminStore.listPayments();
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) {
      const err: any = new Error('Payment not found');
      err.statusCode = 404;
      throw err;
    }
    if (payment.status !== 'succeeded') {
      throw new Error('Only succeeded payments can be refunded');
    }
    const refundAmount = amountCents !== undefined ? Math.min(payment.amount_cents, Math.max(1, Math.floor(amountCents))) : payment.amount_cents;
    return adminStore.updatePayment(paymentId, {
      status: 'refunded',
      refunded_cents: refundAmount,
      refunded_at: new Date(),
    });
  }

  public async listInvoices(ctx: AdminContext) {
    const [invoices, orgs] = await Promise.all([
      adminStore.listInvoices(ctx.scopedOrganizationId),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
    ]);
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    return invoices.map((inv) => ({
      ...inv,
      organizationName: inv.organization_id ? orgMap.get(inv.organization_id)?.name || null : null,
    }));
  }

  public async listCoupons() {
    return adminStore.listCoupons();
  }

  public async createCoupon(
    ctx: AdminContext,
    input: {
      code: string;
      description?: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      maxRedemptions?: number | null;
      validUntil?: string | null;
    }
  ) {
    if (!input.code || input.code.trim().length < 3) {
      throw new Error('Coupon code must be at least 3 characters');
    }
    if (input.discountType === 'percent' && (input.discountValue < 1 || input.discountValue > 100)) {
      throw new Error('Percentage discount must be between 1 and 100');
    }
    return adminStore.createCoupon({
      code: input.code.trim().toUpperCase(),
      description: input.description || null,
      discount_type: input.discountType,
      discount_value: Math.floor(Number(input.discountValue)),
      max_redemptions: input.maxRedemptions ? Math.floor(Number(input.maxRedemptions)) : null,
      valid_until: input.validUntil ? new Date(input.validUntil) : null,
      is_active: true,
      created_by: ctx.userId,
    });
  }

  public async toggleCoupon(id: string, isActive: boolean) {
    const updated = await adminStore.toggleCoupon(id, isActive);
    if (!updated) {
      const err: any = new Error('Coupon not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }
}

export const billingService = new BillingService();

