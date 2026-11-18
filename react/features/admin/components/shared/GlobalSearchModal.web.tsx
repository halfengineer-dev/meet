/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { Building2, CreditCard, Film, LifeBuoy, Search, Users, Video, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { AdminSectionId, IGlobalSearchResult } from '../../types';

interface IGlobalSearchModalProps {
    accessToken: string;
    onClose: () => void;
    onNavigate: (section: AdminSectionId, entityId?: string) => void;
}

export default function GlobalSearchModal({
    accessToken,
    onClose,
    onNavigate
}: IGlobalSearchModalProps) {
    const [ query, setQuery ] = useState('');
    const [ loading, setLoading ] = useState(false);
    const [ results, setResults ] = useState<IGlobalSearchResult | null>(null);

    useEffect(() => {
        const trimmed = query.trim();

        if (trimmed.length < 2) {
            setResults(null);

            return;
        }
        const timer = window.setTimeout(() => {
            setLoading(true);
            adminApi.globalSearch(accessToken, trimmed)
                .then(data => setResults(data))
                .catch(() => setResults(null))
                .finally(() => setLoading(false));
        }, 200);

        return () => window.clearTimeout(timer);
    }, [ accessToken, query ]);

    const hasAny = Boolean(
        results && (
            results.users.length
            || results.organizations.length
            || results.meetings.length
            || results.recordings.length
            || results.tickets.length
            || results.payments.length
        )
    );

    return (
        <div
            className = 'fa-modal-backdrop'
            onClick = { onClose }>
            <div
                className = 'fa-search-modal'
                onClick = { e => e.stopPropagation() }>
                <div className = 'fa-search-input-bar'>
                    <Search size = { 18 } />
                    <input
                        autoFocus = { true }
                        onChange = { e => setQuery(e.target.value) }
                        placeholder = 'Search users, organizations, meetings, recordings, tickets, payments...'
                        type = 'text'
                        value = { query } />
                    <button
                        className = 'fa-icon-btn'
                        onClick = { onClose }
                        type = 'button'>
                        <X size = { 16 } />
                    </button>
                </div>

                <div className = 'fa-search-results'>
                    {query.trim().length < 2 && (
                        <div className = 'fa-search-hint'>
                            Type at least 2 characters. Results automatically respect your administrator role permissions.
                        </div>
                    )}
                    {loading && <div className = 'fa-search-hint'>Searching Faceonn directory...</div>}
                    {!loading && results && !hasAny && (
                        <div className = 'fa-search-hint'>No matching records found for &ldquo;{query}&rdquo;.</div>
                    )}

                    {results && results.users.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><Users size = { 14 } /> Users</div>
                            {results.users.map(u => (
                                <button
                                    className = 'fa-search-item'
                                    key = { u.id }
                                    onClick = { () => {
                                        onNavigate('users', u.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>{u.name || u.email}</strong> <small>{u.email}</small></span>
                                    <span className = { `fa-badge fa-badge-${u.status}` }>{u.status}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {results && results.organizations.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><Building2 size = { 14 } /> Organizations</div>
                            {results.organizations.map(o => (
                                <button
                                    className = 'fa-search-item'
                                    key = { o.id }
                                    onClick = { () => {
                                        onNavigate('organizations', o.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>{o.name}</strong> <small>{o.slug}</small></span>
                                    <span className = 'fa-badge'>{o.planSlug}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {results && results.meetings.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><Video size = { 14 } /> Meetings</div>
                            {results.meetings.map(m => (
                                <button
                                    className = 'fa-search-item'
                                    key = { m.id }
                                    onClick = { () => {
                                        onNavigate('meetings', m.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>{m.title}</strong> <small>/{m.roomId}</small></span>
                                    <span className = { `fa-badge fa-badge-${m.status}` }>{m.status}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {results && results.recordings.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><Film size = { 14 } /> Recordings</div>
                            {results.recordings.map(r => (
                                <button
                                    className = 'fa-search-item'
                                    key = { r.id }
                                    onClick = { () => {
                                        onNavigate('recordings', r.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>{r.title}</strong></span>
                                    <span className = 'fa-badge'>{r.status}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {results && results.tickets.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><LifeBuoy size = { 14 } /> Support Tickets</div>
                            {results.tickets.map(t => (
                                <button
                                    className = 'fa-search-item'
                                    key = { t.id }
                                    onClick = { () => {
                                        onNavigate('support-tickets', t.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>{t.ticketNumber}</strong> {t.subject}</span>
                                    <span className = 'fa-badge'>{t.status}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {results && results.payments.length > 0 && (
                        <div className = 'fa-search-group'>
                            <div className = 'fa-search-group-title'><CreditCard size = { 14 } /> Payments</div>
                            {results.payments.map(p => (
                                <button
                                    className = 'fa-search-item'
                                    key = { p.id }
                                    onClick = { () => {
                                        onNavigate('payments', p.id);
                                        onClose();
                                    } }
                                    type = 'button'>
                                    <span><strong>${(p.amountCents / 100).toFixed(2)} {p.currency}</strong> <small>{p.id.slice(0, 8)}</small></span>
                                    <span className = 'fa-badge'>{p.status}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
