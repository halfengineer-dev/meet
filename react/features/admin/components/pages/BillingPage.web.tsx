/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { CreditCard, DollarSign, Plus, RefreshCw, RotateCcw, Tag } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';
import { AreaLineChart } from '../shared/AdminCharts.web';
import ConfirmModal from '../shared/ConfirmModal.web';

interface IBillingPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    mode: 'billing-plans' | 'subscriptions' | 'payments' | 'invoices' | 'coupons' | 'revenue-analytics';
}

function fmtMoney(cents: number, currency = 'USD'): string {
    return `${currency === 'USD' ? '$' : `${currency} `}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function BillingPage({ accessToken, adminContext, mode }: IBillingPageProps) {
    const [ overview, setOverview ] = useState<any>(null);
    const [ plans, setPlans ] = useState<any[]>([]);
    const [ subscriptions, setSubscriptions ] = useState<any[]>([]);
    const [ payments, setPayments ] = useState<any[]>([]);
    const [ invoices, setInvoices ] = useState<any[]>([]);
    const [ coupons, setCoupons ] = useState<any[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);

    const [ showNewCoupon, setShowNewCoupon ] = useState(false);
    const [ newCoupon, setNewCoupon ] = useState({ code: '', description: '', discountType: 'percent', discountValue: 20 });
    const [ showAssignSub, setShowAssignSub ] = useState(false);
    const [ newSub, setNewSub ] = useState({ organizationId: '', planId: '', billingCycle: 'monthly', status: 'active' });
    const [ orgs, setOrgs ] = useState<any[]>([]);
    const [ confirmRefund, setConfirmRefund ] = useState<any>(null);
    const [ busy, setBusy ] = useState(false);

    const canManage = adminContext.isSuperAdmin || adminContext.permissions.includes('billing:manage');
    const canRefund = adminContext.isSuperAdmin || adminContext.permissions.includes('billing:refund');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ ov, pl ] = await Promise.all([
                adminApi.getBillingOverview(accessToken),
                adminApi.listPlans(accessToken)
            ]);

            setOverview(ov);
            setPlans(pl.plans || []);

            if (mode === 'subscriptions') {
                const [ sRes, oRes ] = await Promise.all([
                    adminApi.listSubscriptions(accessToken),
                    adminApi.listOrganizations(accessToken).catch(() => ({ organizations: [] }))
                ]);

                setSubscriptions(sRes.subscriptions || []);
                setOrgs(oRes.organizations || []);
            } else if (mode === 'payments') {
                const pRes = await adminApi.listPayments(accessToken);

                setPayments(pRes.payments || []);
            } else if (mode === 'invoices') {
                const iRes = await adminApi.listInvoices(accessToken);

                setInvoices(iRes.invoices || []);
            } else if (mode === 'coupons') {
                const cRes = await adminApi.listCoupons(accessToken);

                setCoupons(cRes.coupons || []);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load billing module');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    const metrics = overview?.metrics;

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>
                        {mode === 'billing-plans' && 'Subscription Plans'}
                        {mode === 'subscriptions' && 'Active & Historical Subscriptions'}
                        {mode === 'payments' && 'Payments & Refunds'}
                        {mode === 'invoices' && 'Invoices'}
                        {mode === 'coupons' && 'Coupons & Promotions'}
                        {mode === 'revenue-analytics' && 'Revenue Analytics'}
                    </h1>
                    <p>Commercial SaaS subscription tiers, invoice ledger, refund controls, and real revenue telemetry.</p>
                </div>
                <div className = 'fa-header-actions'>
                    {mode === 'subscriptions' && canManage && adminContext.isPlatformAdmin && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { () => setShowAssignSub(true) }
                            type = 'button'>
                            <Plus size = { 15 } /> Assign Subscription
                        </button>
                    )}
                    {mode === 'coupons' && canManage && adminContext.isPlatformAdmin && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { () => setShowNewCoupon(true) }
                            type = 'button'>
                            <Plus size = { 15 } /> Create Coupon
                        </button>
                    )}
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadData }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>
            </div>

            {overview?.paymentGateway && (
                <div className = 'fa-info-banner'>
                    <CreditCard size = { 16 } />
                    <span><strong>Payment Gateway ({overview.paymentGateway.provider}):</strong> {overview.paymentGateway.note} Card numbers are never stored.</span>
                </div>
            )}

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {notice && <div className = 'fa-alert-success'>{notice}</div>}

            {metrics && (mode === 'revenue-analytics' || mode === 'payments' || mode === 'subscriptions') && (
                <div className = 'fa-kpi-grid'>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>MRR</span><DollarSign size = { 15 } /></div><div className = 'fa-kpi-value'>{fmtMoney(metrics.mrrCents)}</div><div className = 'fa-kpi-sub'>ARR: {fmtMoney(metrics.arrCents)}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Active / Trial Subs</span></div><div className = 'fa-kpi-value'>{metrics.activeSubscriptions} / {metrics.trialSubscriptions}</div><div className = 'fa-kpi-sub'>Cancelled: {metrics.cancelledSubscriptions}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Total Collected</span></div><div className = 'fa-kpi-value'>{fmtMoney(metrics.totalRevenueCents)}</div><div className = 'fa-kpi-sub'>{metrics.successfulPayments} succeeded · {metrics.failedPayments} failed</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Total Refunded</span></div><div className = 'fa-kpi-value'>{fmtMoney(metrics.totalRefundedCents)}</div><div className = 'fa-kpi-sub'>{metrics.refundedCount} refunds · {metrics.totalInvoices} invoices</div></div>
                </div>
            )}

            {mode === 'revenue-analytics' && overview?.monthlyRevenue && (
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'>
                        <div>
                            <h3>Monthly Collected Revenue (USD)</h3>
                            <p>Computed directly from succeeded payment records over the last 6 months.</p>
                        </div>
                    </div>
                    <AreaLineChart
                        color = '#2563eb'
                        data = { overview.monthlyRevenue.map((m: any) => ({
                            label: m.month,
                            value: Math.round(m.revenueCents / 100)
                        })) }
                        primaryLabel = 'Revenue ($)' />
                </div>
            )}

            {mode === 'billing-plans' && (
                <div className = 'fa-plan-grid'>
                    {plans.map(plan => (
                        <div
                            className = 'fa-card fa-plan-card'
                            key = { plan.id }>
                            <div className = 'fa-card-header'>
                                <h3>{plan.name}</h3>
                                <span className = { `fa-badge ${plan.is_active ? 'fa-badge-active' : 'fa-badge-deactivated'}` }>
                                    {plan.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className = 'fa-plan-price'>
                                {fmtMoney(plan.price_monthly_cents, plan.currency)}<span>/mo</span>
                            </div>
                            <p className = 'fa-muted-xs'>{plan.description}</p>
                            <ul className = 'fa-plan-specs'>
                                <li>Max meeting duration: <strong>{plan.max_meeting_minutes} min</strong></li>
                                <li>Max participants: <strong>{plan.max_participants}</strong></li>
                                <li>Cloud recording storage: <strong>{plan.cloud_recording_gb} GB</strong></li>
                                <li>Annual billing: <strong>{fmtMoney(plan.price_yearly_cents, plan.currency)}/yr</strong></li>
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {mode === 'subscriptions' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Account</th><th>Plan</th><th>Cycle</th><th>Amount</th><th>Status</th><th>Renews</th><th>Action</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>Loading subscriptions...</td></tr>
                                ) : subscriptions.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>No subscriptions assigned yet.</td></tr>
                                ) : (
                                    subscriptions.map(s => (
                                        <tr key = { s.id }>
                                            <td><strong>{s.organizationName || s.userEmail || '—'}</strong></td>
                                            <td>{s.planName}</td>
                                            <td>{s.billing_cycle}</td>
                                            <td>{fmtMoney(s.amount_cents, s.currency)}</td>
                                            <td><span className = { `fa-badge fa-badge-${s.status}` }>{s.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(s.current_period_end).toLocaleDateString()}</td>
                                            <td>
                                                {canManage && s.status !== 'cancelled' && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { async () => {
                                                            await adminApi.cancelSubscription(accessToken, s.id);
                                                            setNotice('Subscription cancelled.');
                                                            await loadData();
                                                        } }
                                                        type = 'button'>
                                                        Cancel
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'payments' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Transaction</th><th>Account</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>Loading payments...</td></tr>
                                ) : payments.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>No payment transactions recorded yet.</td></tr>
                                ) : (
                                    payments.map(p => (
                                        <tr key = { p.id }>
                                            <td><code>{p.provider_transaction_id || p.id.slice(0, 8)}</code></td>
                                            <td>{p.organizationName || p.userEmail || '—'}</td>
                                            <td>{p.payment_method_label || p.provider}</td>
                                            <td><strong>{fmtMoney(p.amount_cents, p.currency)}</strong></td>
                                            <td><span className = { `fa-badge fa-badge-${p.status}` }>{p.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(p.created_at).toLocaleString()}</td>
                                            <td>
                                                {canRefund && p.status === 'succeeded' && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmRefund(p) }
                                                        type = 'button'>
                                                        <RotateCcw size = { 13 } /> Refund
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'invoices' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Invoice #</th><th>Organization</th><th>Amount</th><th>Status</th><th>Issued</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>Loading invoices...</td></tr>
                                ) : invoices.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>No invoices generated yet.</td></tr>
                                ) : (
                                    invoices.map(inv => (
                                        <tr key = { inv.id }>
                                            <td><strong>{inv.invoice_number}</strong></td>
                                            <td>{inv.organizationName || 'Personal'}</td>
                                            <td>{fmtMoney(inv.amount_cents, inv.currency)}</td>
                                            <td><span className = { `fa-badge fa-badge-${inv.status}` }>{inv.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(inv.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'coupons' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Code</th><th>Discount</th><th>Redemptions</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                                {coupons.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>No promotional coupons configured.</td></tr>
                                ) : (
                                    coupons.map(c => (
                                        <tr key = { c.id }>
                                            <td><strong><Tag size = { 13 } /> {c.code}</strong><div className = 'fa-muted-xs'>{c.description || ''}</div></td>
                                            <td>{c.discount_type === 'percent' ? `${c.discount_value}%` : fmtMoney(c.discount_value)}</td>
                                            <td>{c.redemption_count} / {c.max_redemptions || '∞'}</td>
                                            <td><span className = { `fa-badge ${c.is_active ? 'fa-badge-active' : 'fa-badge-deactivated'}` }>{c.is_active ? 'Active' : 'Disabled'}</span></td>
                                            <td>
                                                {canManage && (
                                                    <button
                                                        className = 'fa-link-btn'
                                                        onClick = { async () => {
                                                            await adminApi.toggleCoupon(accessToken, c.id, !c.is_active);
                                                            await loadData();
                                                        } }
                                                        type = 'button'>
                                                        {c.is_active ? 'Disable' : 'Enable'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showAssignSub && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowAssignSub(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'><h3>Assign Subscription Plan</h3></div>
                        <form
                            onSubmit = { async e => {
                                e.preventDefault();
                                setBusy(true);
                                try {
                                    await adminApi.assignSubscription(accessToken, newSub);
                                    setShowAssignSub(false);
                                    setNotice('Subscription assigned and invoice recorded.');
                                    await loadData();
                                } catch (err: any) {
                                    setError(err.message);
                                } finally {
                                    setBusy(false);
                                }
                            } }>
                            <div className = 'fa-field'>
                                <label>Organization *</label>
                                <select
                                    onChange = { e => setNewSub({ ...newSub, organizationId: e.target.value }) }
                                    required = { true }
                                    value = { newSub.organizationId }>
                                    <option value = ''>Select Organization...</option>
                                    {orgs.map(o => (<option
                                        key = { o.id }
                                        value = { o.id }>{o.name}</option>))}
                                </select>
                            </div>
                            <div className = 'fa-field'>
                                <label>Plan *</label>
                                <select
                                    onChange = { e => setNewSub({ ...newSub, planId: e.target.value }) }
                                    required = { true }
                                    value = { newSub.planId }>
                                    <option value = ''>Select Plan...</option>
                                    {plans.map(p => (<option
                                        key = { p.id }
                                        value = { p.id }>{p.name} ({fmtMoney(p.price_monthly_cents)}/mo)</option>))}
                                </select>
                            </div>
                            <div className = 'fa-field'>
                                <label>Billing Cycle</label>
                                <select
                                    onChange = { e => setNewSub({ ...newSub, billingCycle: e.target.value }) }
                                    value = { newSub.billingCycle }>
                                    <option value = 'monthly'>Monthly</option>
                                    <option value = 'yearly'>Yearly</option>
                                </select>
                            </div>
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowAssignSub(false) }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>{busy ? 'Assigning...' : 'Assign Plan'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showNewCoupon && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowNewCoupon(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'><h3>Create Promotion Coupon</h3></div>
                        <form
                            onSubmit = { async e => {
                                e.preventDefault();
                                setBusy(true);
                                try {
                                    await adminApi.createCoupon(accessToken, newCoupon);
                                    setShowNewCoupon(false);
                                    setNewCoupon({ code: '', description: '', discountType: 'percent', discountValue: 20 });
                                    await loadData();
                                } catch (err: any) {
                                    setError(err.message);
                                } finally {
                                    setBusy(false);
                                }
                            } }>
                            <div className = 'fa-field'><label>Coupon Code *</label><input
                                onChange = { e => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() }) }
                                required = { true }
                                type = 'text'
                                value = { newCoupon.code } /></div>
                            <div className = 'fa-field'><label>Description</label><input
                                onChange = { e => setNewCoupon({ ...newCoupon, description: e.target.value }) }
                                type = 'text'
                                value = { newCoupon.description } /></div>
                            <div className = 'fa-form-grid-2'>
                                <div className = 'fa-field'>
                                    <label>Type</label>
                                    <select
                                        onChange = { e => setNewCoupon({ ...newCoupon, discountType: e.target.value }) }
                                        value = { newCoupon.discountType }>
                                        <option value = 'percent'>Percentage (%)</option>
                                        <option value = 'fixed'>Fixed Amount (cents)</option>
                                    </select>
                                </div>
                                <div className = 'fa-field'><label>Value *</label><input
                                    min = { 1 }
                                    onChange = { e => setNewCoupon({ ...newCoupon, discountValue: Number(e.target.value) }) }
                                    required = { true }
                                    type = 'number'
                                    value = { newCoupon.discountValue } /></div>
                            </div>
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowNewCoupon(false) }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>{busy ? 'Creating...' : 'Create Coupon'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmRefund && (
                <ConfirmModal
                    confirmLabel = 'Issue Full Refund'
                    danger = { true }
                    description = { `Issue full refund of ${fmtMoney(confirmRefund.amount_cents, confirmRefund.currency)} for transaction ${confirmRefund.id.slice(0, 8)}?` }
                    isLoading = { busy }
                    onCancel = { () => setConfirmRefund(null) }
                    onConfirm = { async () => {
                        setBusy(true);
                        try {
                            await adminApi.refundPayment(accessToken, confirmRefund.id);
                            setConfirmRefund(null);
                            setNotice('Payment refunded and audit logged.');
                            await loadData();
                        } finally {
                            setBusy(false);
                        }
                    } }
                    title = 'Confirm Payment Refund' />
            )}
        </div>
    );
}
