/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { Bell, Check, X } from 'lucide-react';
import React from 'react';

import { IAdminNotification } from '../../types';

interface INotificationDrawerProps {
    notifications: IAdminNotification[];
    onClose: () => void;
    onMarkRead: (id: string) => void;
}

export default function NotificationDrawer({
    notifications,
    onMarkRead,
    onClose
}: INotificationDrawerProps) {
    return (
        <div
            className = 'fa-drawer-backdrop'
            onClick = { onClose }>
            <aside
                className = 'fa-drawer'
                onClick = { e => e.stopPropagation() }>
                <div className = 'fa-drawer-header'>
                    <div className = 'fa-drawer-title'>
                        <Bell size = { 18 } />
                        <h3>Admin Notifications</h3>
                    </div>
                    <button
                        className = 'fa-icon-btn'
                        onClick = { onClose }
                        type = 'button'>
                        <X size = { 18 } />
                    </button>
                </div>

                <div className = 'fa-drawer-body'>
                    {notifications.length === 0 ? (
                        <div className = 'fa-empty-state'>
                            <p>You&rsquo;re all caught up. No administrative alerts or notifications right now.</p>
                        </div>
                    ) : (
                        notifications.map(n => (
                            <div
                                className = { `fa-notif-card ${n.is_read ? 'read' : 'unread'} severity-${n.severity}` }
                                key = { n.id }>
                                <div className = 'fa-notif-top'>
                                    <span className = { `fa-badge fa-badge-${n.severity}` }>{n.category}</span>
                                    <span className = 'fa-muted-xs'>{new Date(n.created_at).toLocaleString()}</span>
                                </div>
                                <h4>{n.title}</h4>
                                <p>{n.message}</p>
                                {!n.is_read && (
                                    <button
                                        className = 'fa-link-btn'
                                        onClick = { () => onMarkRead(n.id) }
                                        type = 'button'>
                                        <Check size = { 13 } /> Mark as read
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </aside>
        </div>
    );
}
