/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Bell,
    Building2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    CreditCard,
    Database,
    DollarSign,
    FileText,
    Film,
    Flag,
    Gauge,
    HelpCircle,
    History,
    Key,
    LayoutDashboard,
    LifeBuoy,
    Lock,
    LogOut,
    Mail,
    Megaphone,
    Menu,
    MessageSquare,
    Monitor,
    Moon,
    Radio,
    Receipt,
    Repeat,
    Search,
    Server,
    Settings,
    Shield,
    ShieldAlert,
    Sliders,
    Sun,
    Tag,
    Terminal,
    UserCheck,
    UserX,
    Users,
    Video,
    Wifi,
    Wrench,
    X
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { IReduxState } from '../../app/types';
import { logout } from '../../auth/actions';
import { getAccessToken, getAuthUser } from '../../auth/functions';
import { adminApi } from '../api';
import { AdminSectionId, IAdminContextInfo, IAdminNotification } from '../types';

import BillingPage from './pages/BillingPage.web';
import CommunicationPage from './pages/CommunicationPage.web';
import ConfigurationPage from './pages/ConfigurationPage.web';
import DashboardOverview from './pages/DashboardOverview.web';
import InfrastructurePage from './pages/InfrastructurePage.web';
import LiveMonitoring from './pages/LiveMonitoring.web';
import MeetingsPage from './pages/MeetingsPage.web';
import OrganizationsPage from './pages/OrganizationsPage.web';
import SecurityPage from './pages/SecurityPage.web';
import UsersPage from './pages/UsersPage.web';
import GlobalSearchModal from './shared/GlobalSearchModal.web';
import NotificationDrawer from './shared/NotificationDrawer.web';

interface INavItem {
    icon: React.ReactNode;
    id: AdminSectionId;
    label: string;
    permission?: string;
    platformOnly?: boolean;
}

interface INavGroup {
    items: INavItem[];
    title: string;
}

const NAV_GROUPS: INavGroup[] = [
    {
        title: 'Overview',
        items: [
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size = { 16 } />, permission: 'dashboard:view' },
            { id: 'live-monitoring', label: 'Live Monitoring', icon: <Radio size = { 16 } />, permission: 'live:view' },
            { id: 'platform-health', label: 'Platform Health', icon: <Activity size = { 16 } />, permission: 'health:view', platformOnly: true }
        ]
    },
    {
        title: 'Users & Organizations',
        items: [
            { id: 'users', label: 'All Users', icon: <Users size = { 16 } />, permission: 'users:view' },
            { id: 'organizations', label: 'Organizations', icon: <Building2 size = { 16 } />, permission: 'organizations:view' },
            { id: 'invitations', label: 'Invitations', icon: <Mail size = { 16 } />, permission: 'organizations:view' },
            { id: 'roles', label: 'Roles & Permissions', icon: <UserCheck size = { 16 } />, permission: 'roles:view' },
            { id: 'suspended-users', label: 'Suspended Accounts', icon: <UserX size = { 16 } />, permission: 'users:view' }
        ]
    },
    {
        title: 'Meetings & Collaboration',
        items: [
            { id: 'meetings', label: 'All Meetings', icon: <Video size = { 16 } />, permission: 'meetings:view' },
            { id: 'live-meetings', label: 'Live Meetings', icon: <Radio size = { 16 } />, permission: 'meetings:view' },
            { id: 'scheduled-meetings', label: 'Scheduled Meetings', icon: <Calendar size = { 16 } />, permission: 'meetings:view' },
            { id: 'meeting-history', label: 'Meeting History', icon: <History size = { 16 } />, permission: 'meetings:view' },
            { id: 'recurring-meetings', label: 'Recurring Meetings', icon: <Repeat size = { 16 } />, permission: 'meetings:view' },
            { id: 'recordings', label: 'Recordings', icon: <Film size = { 16 } />, permission: 'recordings:view' },
            { id: 'meeting-reports', label: 'Meeting Reports', icon: <FileText size = { 16 } />, permission: 'meetings:view' }
        ]
    },
    {
        title: 'Communication',
        items: [
            { id: 'chat-management', label: 'Chat Management', icon: <MessageSquare size = { 16 } />, permission: 'moderation:view' },
            { id: 'moderation', label: 'Reports & Moderation', icon: <ShieldAlert size = { 16 } />, permission: 'moderation:view' },
            { id: 'support-tickets', label: 'Support Tickets', icon: <LifeBuoy size = { 16 } />, permission: 'support:view' },
            { id: 'announcements', label: 'Announcements', icon: <Megaphone size = { 16 } />, permission: 'announcements:view' }
        ]
    },
    {
        title: 'Business & Billing',
        items: [
            { id: 'billing-plans', label: 'Subscription Plans', icon: <CreditCard size = { 16 } />, permission: 'billing:view' },
            { id: 'subscriptions', label: 'Subscriptions', icon: <Clock size = { 16 } />, permission: 'billing:view' },
            { id: 'payments', label: 'Payments', icon: <DollarSign size = { 16 } />, permission: 'billing:view' },
            { id: 'invoices', label: 'Invoices', icon: <Receipt size = { 16 } />, permission: 'billing:view' },
            { id: 'coupons', label: 'Coupons & Promotions', icon: <Tag size = { 16 } />, permission: 'billing:view', platformOnly: true },
            { id: 'revenue-analytics', label: 'Revenue Analytics', icon: <Gauge size = { 16 } />, permission: 'billing:view' }
        ]
    },
    {
        title: 'Infrastructure',
        items: [
            { id: 'infra-sfu', label: 'SFU Servers', icon: <Server size = { 16 } />, permission: 'infrastructure:view', platformOnly: true },
            { id: 'infra-turn', label: 'TURN Servers', icon: <Wifi size = { 16 } />, permission: 'infrastructure:view', platformOnly: true },
            { id: 'infra-jitsi', label: 'Jitsi Nodes', icon: <Monitor size = { 16 } />, permission: 'infrastructure:view', platformOnly: true },
            { id: 'infra-redis', label: 'Redis & Socket.IO', icon: <Database size = { 16 } />, permission: 'infrastructure:view', platformOnly: true },
            { id: 'infra-api', label: 'API Monitoring', icon: <Activity size = { 16 } />, permission: 'infrastructure:view', platformOnly: true },
            { id: 'infra-logs', label: 'System Logs', icon: <Terminal size = { 16 } />, permission: 'infrastructure:view', platformOnly: true }
        ]
    },
    {
        title: 'Security',
        items: [
            { id: 'security-dashboard', label: 'Security Dashboard', icon: <Shield size = { 16 } />, permission: 'security:view', platformOnly: true },
            { id: 'login-activity', label: 'Login Activity', icon: <Lock size = { 16 } />, permission: 'security:view', platformOnly: true },
            { id: 'audit-logs', label: 'Audit Logs', icon: <FileText size = { 16 } />, permission: 'audit:view' },
            { id: 'api-keys', label: 'API Keys', icon: <Key size = { 16 } />, permission: 'security:api_keys' },
            { id: 'sessions', label: 'Sessions & Devices', icon: <Monitor size = { 16 } />, permission: 'security:sessions' },
            { id: 'access-policies', label: 'Access Policies', icon: <ShieldAlert size = { 16 } />, permission: 'settings:view', platformOnly: true }
        ]
    },
    {
        title: 'Configuration',
        items: [
            { id: 'settings-general', label: 'General Settings', icon: <Settings size = { 16 } />, permission: 'settings:view', platformOnly: true },
            { id: 'settings-meetings', label: 'Meeting Policies', icon: <Sliders size = { 16 } />, permission: 'settings:view', platformOnly: true },
            { id: 'settings-recordings', label: 'Recording Policies', icon: <Film size = { 16 } />, permission: 'settings:view', platformOnly: true },
            { id: 'settings-email', label: 'Email Configuration', icon: <Mail size = { 16 } />, permission: 'settings:view', platformOnly: true },
            { id: 'settings-notifications', label: 'Notification Settings', icon: <Bell size = { 16 } />, permission: 'settings:view', platformOnly: true },
            { id: 'feature-flags', label: 'Feature Flags', icon: <Flag size = { 16 } />, permission: 'feature_flags:view', platformOnly: true },
            { id: 'maintenance-mode', label: 'Maintenance Mode', icon: <Wrench size = { 16 } />, permission: 'settings:view', platformOnly: true }
        ]
    }
];

const ALL_SECTION_IDS = new Set<string>(NAV_GROUPS.flatMap(g => g.items.map(i => i.id)));

function parseSectionFromPath(): AdminSectionId {
    const parts = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '').split('/');
    const candidate = parts[1] || 'dashboard';

    return ALL_SECTION_IDS.has(candidate) ? (candidate as AdminSectionId) : 'dashboard';
}

export default function AdminControlCenter() {
    const dispatch = useDispatch();
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));

    const [ adminContext, setAdminContext ] = useState<IAdminContextInfo | null>(null);
    const [ authError, setAuthError ] = useState<string | null>(null);
    const [ loadingContext, setLoadingContext ] = useState(true);

    const [ activeSection, setActiveSection ] = useState<AdminSectionId>(() => parseSectionFromPath());
    const [ focusEntityId, setFocusEntityId ] = useState<string | null>(null);
    const [ sidebarCollapsed, setSidebarCollapsed ] = useState(false);
    const [ mobileNavOpen, setMobileNavOpen ] = useState(false);
    const [ theme, setTheme ] = useState<'light' | 'dark'>('light');

    const [ showSearch, setShowSearch ] = useState(false);
    const [ showNotifications, setShowNotifications ] = useState(false);
    const [ showHelp, setShowHelp ] = useState(false);
    const [ showProfileMenu, setShowProfileMenu ] = useState(false);
    const [ notifications, setNotifications ] = useState<IAdminNotification[]>([]);
    const [ unreadCount, setUnreadCount ] = useState(0);

    // Body class for scrolling & dark theme
    useEffect(() => {
        document.documentElement.classList.add('faceonn-admin-html');
        document.body.classList.add('faceonn-admin-body');
        document.title = 'Faceonn — Enterprise Admin Control Center';

        if (theme === 'dark') {
            document.documentElement.classList.add('fa-theme-dark');
        } else {
            document.documentElement.classList.remove('fa-theme-dark');
        }

        return () => {
            document.documentElement.classList.remove('faceonn-admin-html', 'fa-theme-dark');
            document.body.classList.remove('faceonn-admin-body');
        };
    }, [ theme ]);

    // Cmd+K / Ctrl+K shortcut for Global Search
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setShowSearch(prev => !prev);
            } else if (e.key === 'Escape') {
                setShowSearch(false);
                setShowNotifications(false);
                setShowHelp(false);
                setShowProfileMenu(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Browser back/forward sync
    useEffect(() => {
        const onPop = () => setActiveSection(parseSectionFromPath());

        window.addEventListener('popstate', onPop);

        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Verify authoritative admin session & permissions from backend
    useEffect(() => {
        if (!accessToken) {
            setLoadingContext(false);
            setAuthError('Authentication required.');

            return;
        }
        setLoadingContext(true);
        adminApi.getAdminMe(accessToken)
            .then(res => {
                setAdminContext(res.admin);
                setAuthError(null);
            })
            .catch((err: any) => {
                setAuthError(err.message || 'Administrator privileges required to access this console.');
            })
            .finally(() => setLoadingContext(false));
    }, [ accessToken ]);

    const loadNotifications = useCallback(() => {
        if (!accessToken || !adminContext) {
            return;
        }
        adminApi.listNotifications(accessToken)
            .then(res => {
                setNotifications(res.notifications || []);
                setUnreadCount(res.unreadCount || 0);
            })
            .catch(() => {
                // Ignore transient notification fetch errors
            });
    }, [ accessToken, adminContext ]);

    useEffect(() => {
        loadNotifications();
    }, [ loadNotifications ]);

    const visibleGroups = useMemo(() => {
        if (!adminContext) {
            return [];
        }
        const perms = new Set(adminContext.permissions);

        return NAV_GROUPS
            .map(group => ({
                ...group,
                items: group.items.filter(item => {
                    if (item.platformOnly && !adminContext.isPlatformAdmin) {
                        return false;
                    }
                    if (!item.permission || adminContext.isSuperAdmin) {
                        return true;
                    }

                    return perms.has(item.permission);
                })
            }))
            .filter(group => group.items.length > 0);
    }, [ adminContext ]);

    const navigateTo = useCallback((section: AdminSectionId, entityId?: string) => {
        setActiveSection(section);
        setFocusEntityId(entityId || null);
        setMobileNavOpen(false);
        const targetPath = section === 'dashboard' ? '/admin' : `/admin/${section}`;

        if (window.location.pathname !== targetPath) {
            window.history.pushState({}, '', targetPath);
        }
    }, []);

    const activeBreadcrumb = useMemo(() => {
        for (const group of NAV_GROUPS) {
            const match = group.items.find(i => i.id === activeSection);

            if (match) {
                return { group: group.title, page: match.label };
            }
        }

        return { group: 'Overview', page: 'Dashboard' };
    }, [ activeSection ]);

    if (loadingContext) {
        return (
            <div className = 'fa-gate-screen'>
                <div className = 'fa-gate-card'>
                    <div className = 'fa-spinner' />
                    <h2>Verifying Administrator Access...</h2>
                    <p>Validating RBAC permissions with Faceonn backend.</p>
                </div>
            </div>
        );
    }

    if (authError || !adminContext || !accessToken) {
        return (
            <div className = 'fa-gate-screen'>
                <div className = 'fa-gate-card'>
                    <AlertTriangle
                        color = '#dc2626'
                        size = { 34 } />
                    <h2>Access Denied</h2>
                    <p>{authError || 'You do not have administrator privileges for this console.'}</p>
                    <button
                        className = 'fa-btn fa-btn-primary'
                        onClick = { () => {
                            window.location.href = '/dashboard';
                        } }
                        type = 'button'>
                        <ArrowLeft size = { 15 } /> Return to Faceonn Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const roleLabel = (adminContext.platformRole || adminContext.orgRole || 'admin').replace(/_/g, ' ');
    const initials = (user?.name || user?.email || 'AD').slice(0, 2).toUpperCase();

    const renderPage = () => {
        switch (activeSection) {
        case 'dashboard':
        case 'platform-health':
            return (
                <DashboardOverview
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = { activeSection }
                    onNavigate = { navigateTo } />
            );
        case 'live-monitoring':
            return (
                <LiveMonitoring
                    accessToken = { accessToken }
                    adminContext = { adminContext } />
            );
        case 'users':
        case 'suspended-users':
        case 'roles':
            return (
                <UsersPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    initialFocusId = { focusEntityId }
                    mode = { activeSection } />
            );
        case 'organizations':
        case 'invitations':
            return (
                <OrganizationsPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    initialFocusId = { focusEntityId }
                    mode = { activeSection } />
            );
        case 'meetings':
        case 'live-meetings':
        case 'scheduled-meetings':
        case 'meeting-history':
        case 'recurring-meetings':
        case 'recordings':
        case 'meeting-reports':
            return (
                <MeetingsPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    initialFocusId = { focusEntityId }
                    mode = { activeSection } />
            );
        case 'chat-management':
        case 'moderation':
        case 'support-tickets':
        case 'announcements':
            return (
                <CommunicationPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    initialFocusId = { focusEntityId }
                    mode = { activeSection } />
            );
        case 'billing-plans':
        case 'subscriptions':
        case 'payments':
        case 'invoices':
        case 'coupons':
        case 'revenue-analytics':
            return (
                <BillingPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = { activeSection } />
            );
        case 'infra-sfu':
        case 'infra-turn':
        case 'infra-jitsi':
        case 'infra-redis':
        case 'infra-api':
        case 'infra-logs':
            return (
                <InfrastructurePage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = { activeSection } />
            );
        case 'security-dashboard':
        case 'login-activity':
        case 'audit-logs':
        case 'api-keys':
        case 'sessions':
        case 'access-policies':
            return (
                <SecurityPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = { activeSection } />
            );
        case 'settings-general':
        case 'settings-meetings':
        case 'settings-recordings':
        case 'settings-email':
        case 'settings-notifications':
        case 'feature-flags':
        case 'maintenance-mode':
            return (
                <ConfigurationPage
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = { activeSection } />
            );
        default:
            return (
                <DashboardOverview
                    accessToken = { accessToken }
                    adminContext = { adminContext }
                    mode = 'dashboard'
                    onNavigate = { navigateTo } />
            );
        }
    };

    return (
        <div className = { `fa-shell ${sidebarCollapsed ? 'collapsed' : ''} ${theme === 'dark' ? 'fa-theme-dark' : ''}` }>
            {mobileNavOpen && (
                <div
                    className = 'fa-mobile-overlay'
                    onClick = { () => setMobileNavOpen(false) } />
            )}

            {/* Collapsible Enterprise Sidebar */}
            <aside className = { `fa-sidebar ${mobileNavOpen ? 'open' : ''}` }>
                <div className = 'fa-sidebar-brand'>
                    <a
                        className = 'fa-brand-link'
                        href = '/admin'
                        onClick = { e => {
                            e.preventDefault();
                            navigateTo('dashboard');
                        } }>
                        <img
                            alt = 'Faceonn'
                            className = 'fa-brand-logo'
                            src = '/images/faceonn-neon-logo.png' />
                        {!sidebarCollapsed && <span className = 'fa-brand-tag'>ADMIN</span>}
                    </a>
                    <button
                        aria-label = 'Toggle sidebar'
                        className = 'fa-icon-btn fa-collapse-btn'
                        onClick = { () => setSidebarCollapsed(c => !c) }
                        type = 'button'>
                        {sidebarCollapsed ? <ChevronRight size = { 16 } /> : <ChevronLeft size = { 16 } />}
                    </button>
                    <button
                        aria-label = 'Close navigation'
                        className = 'fa-icon-btn fa-mobile-close'
                        onClick = { () => setMobileNavOpen(false) }
                        type = 'button'>
                        <X size = { 18 } />
                    </button>
                </div>

                <nav className = 'fa-sidebar-nav'>
                    {visibleGroups.map(group => (
                        <div
                            className = 'fa-nav-group'
                            key = { group.title }>
                            {!sidebarCollapsed && <div className = 'fa-nav-group-title'>{group.title}</div>}
                            {group.items.map(item => (
                                <button
                                    className = { `fa-nav-item ${activeSection === item.id ? 'active' : ''}` }
                                    key = { item.id }
                                    onClick = { () => navigateTo(item.id) }
                                    title = { item.label }
                                    type = 'button'>
                                    <span className = 'fa-nav-icon'>{item.icon}</span>
                                    {!sidebarCollapsed && <span className = 'fa-nav-label'>{item.label}</span>}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className = 'fa-sidebar-footer'>
                    <a
                        className = 'fa-nav-item'
                        href = '/dashboard'>
                        <span className = 'fa-nav-icon'><ArrowLeft size = { 16 } /></span>
                        {!sidebarCollapsed && <span className = 'fa-nav-label'>User Dashboard</span>}
                    </a>
                    <button
                        className = 'fa-nav-item'
                        onClick = { () => setTheme(t => t === 'light' ? 'dark' : 'light') }
                        type = 'button'>
                        <span className = 'fa-nav-icon'>{theme === 'light' ? <Moon size = { 16 } /> : <Sun size = { 16 } />}</span>
                        {!sidebarCollapsed && <span className = 'fa-nav-label'>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <div className = 'fa-workspace'>
                <header className = 'fa-topbar'>
                    <div className = 'fa-topbar-left'>
                        <button
                            aria-label = 'Open menu'
                            className = 'fa-icon-btn fa-mobile-menu-btn'
                            onClick = { () => setMobileNavOpen(true) }
                            type = 'button'>
                            <Menu size = { 20 } />
                        </button>
                        <div className = 'fa-breadcrumbs'>
                            <span className = 'fa-crumb-root'>Faceonn Control Center</span>
                            <span className = 'fa-crumb-sep'>/</span>
                            <span className = 'fa-crumb-group'>{activeBreadcrumb.group}</span>
                            <span className = 'fa-crumb-sep'>/</span>
                            <strong>{activeBreadcrumb.page}</strong>
                        </div>
                    </div>

                    <div className = 'fa-topbar-right'>
                        <button
                            className = 'fa-search-trigger'
                            onClick = { () => setShowSearch(true) }
                            type = 'button'>
                            <Search size = { 14 } />
                            <span>Global Search...</span>
                            <kbd>⌘K</kbd>
                        </button>

                        <button
                            aria-label = 'Notifications'
                            className = 'fa-icon-btn fa-notif-btn'
                            onClick = { () => setShowNotifications(true) }
                            type = 'button'>
                            <Bell size = { 18 } />
                            {unreadCount > 0 && <span className = 'fa-notif-badge'>{unreadCount}</span>}
                        </button>

                        <button
                            aria-label = 'Help'
                            className = 'fa-icon-btn'
                            onClick = { () => setShowHelp(true) }
                            type = 'button'>
                            <HelpCircle size = { 18 } />
                        </button>

                        <div className = 'fa-profile-wrap'>
                            <button
                                className = 'fa-profile-trigger'
                                onClick = { () => setShowProfileMenu(p => !p) }
                                type = 'button'>
                                <span className = 'fa-avatar'>{initials}</span>
                                <div className = 'fa-profile-meta'>
                                    <strong>{user?.name || user?.email}</strong>
                                    <span>{roleLabel}</span>
                                </div>
                            </button>

                            {showProfileMenu && (
                                <div className = 'fa-dropdown'>
                                    <div className = 'fa-dropdown-head'>
                                        <strong>{user?.name || 'Administrator'}</strong>
                                        <span>{user?.email}</span>
                                        <span
                                            className = 'fa-badge'
                                            style = {{ marginTop: '6px' }}>{roleLabel}</span>
                                    </div>
                                    <button
                                        className = 'fa-dropdown-item'
                                        onClick = { () => {
                                            window.location.href = '/dashboard';
                                        } }
                                        type = 'button'>
                                        <ArrowLeft size = { 14 } /> Switch to User Dashboard
                                    </button>
                                    <button
                                        className = 'fa-dropdown-item danger'
                                        onClick = { () => dispatch(logout() as any) }
                                        type = 'button'>
                                        <LogOut size = { 14 } /> Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className = 'fa-content'>
                    {renderPage()}
                </main>
            </div>

            {showSearch && (
                <GlobalSearchModal
                    accessToken = { accessToken }
                    onClose = { () => setShowSearch(false) }
                    onNavigate = { navigateTo } />
            )}

            {showNotifications && (
                <NotificationDrawer
                    notifications = { notifications }
                    onClose = { () => setShowNotifications(false) }
                    onMarkRead = { async id => {
                        await adminApi.markNotificationRead(accessToken, id);
                        loadNotifications();
                    } } />
            )}

            {showHelp && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowHelp(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'>
                            <h3>Faceonn Enterprise Admin Guide</h3>
                            <button
                                className = 'fa-icon-btn'
                                onClick = { () => setShowHelp(false) }
                                type = 'button'>
                                <X size = { 18 } />
                            </button>
                        </div>
                        <p className = 'fa-modal-desc'>
                            Use <strong>⌘K / Ctrl+K</strong> anywhere to launch Global Command Search across users, organizations, meetings, recordings, tickets, and payments.
                        </p>
                        <ul
                            className = 'fa-plan-specs'
                            style = {{ marginTop: '12px' }}>
                            <li>Every sensitive administrative mutation is enforced by backend RBAC and recorded in <strong>Security → Audit Logs</strong>.</li>
                            <li>Organization admins are strictly isolated to their own workspace scope.</li>
                            <li>Private meetings cannot be silently joined by administrators.</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
