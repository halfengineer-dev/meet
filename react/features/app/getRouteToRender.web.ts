import { generateRoomWithoutSeparator } from '@jitsi/js-utils/random';

import AdminControlCenter from '../admin/components/AdminControlCenter.web';
import { setActiveMeetingSession } from '../auth/actions';
import { authApiClient } from '../auth/api';
import AuthLoadingScreen from '../auth/components/AuthLoadingScreen.web';
import DashboardPage from '../auth/components/DashboardPage.web';
import LandingPage from '../auth/components/LandingPage.web';
import LoginPage from '../auth/components/LoginPage.web';
import MeetingWaitingRoom from '../auth/components/MeetingWaitingRoom.web';
import { getAccessToken, getActiveMeetingSession, isAdminUser, isAuthInitializing, isAuthenticated } from '../auth/functions';
import { IStateful } from '../base/app/types';
import { setRoom } from '../base/conference/actions';
import { isRoomValid } from '../base/conference/functions';
import { isSupportedBrowser } from '../base/environment/environment';
import { setJWT } from '../base/jwt/actions';
import { toState } from '../base/redux/functions';
import Conference from '../conference/components/web/Conference';
import { getDeepLinkingPage } from '../deep-linking/functions';
import UnsupportedDesktopBrowser from '../unsupported-browser/components/UnsupportedDesktopBrowser';
import BlankPage from '../welcome/components/BlankPage.web';
import { getCustomLandingPageURL, isWelcomePageEnabled } from '../welcome/functions';


import logger from './logger';
import { IReduxState, IStore } from './types';

/**
 * Determines which route is to be rendered in order to depict a specific Redux
 * store.
 *
 * @param {(Function|Object)} stateful - The redux store, state, or
 * {@code getState} function.
 * @param {Dispatch} [dispatch] - The Redux dispatch function.
 * @returns {Promise<Object>}
 */
export async function _getRouteToRender(stateful: IStateful, dispatch?: IStore['dispatch']): Promise<any> {
    const state = toState(stateful);
    const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

    // 1. If authentication is still initializing, prevent any flash of content
    if (isAuthInitializing(state)) {
        const route = _getEmptyRoute();

        route.component = AuthLoadingScreen;

        return route;
    }

    const isUserAuth = isAuthenticated(state);

    // 2. Public route: /login
    if (pathname === '/login') {
        if (isUserAuth) {
            const redirectParam = new URLSearchParams(window.location.search).get('redirect');
            const target = redirectParam && redirectParam !== '/login' && redirectParam !== '/signup'
                ? redirectParam
                : '/dashboard';

            return { component: undefined, href: target };
        }
        const route = _getEmptyRoute();

        route.component = LoginPage;

        return route;
    }

    // 3. Public self-signup is disabled: redirect /signup to /login (or /dashboard if signed in)
    if (pathname === '/signup') {
        const redirectParam = new URLSearchParams(window.location.search).get('redirect');

        if (isUserAuth) {
            const target = redirectParam && redirectParam !== '/login' && redirectParam !== '/signup'
                ? redirectParam
                : '/dashboard';

            return { component: undefined, href: target };
        }

        const loginTarget = redirectParam && redirectParam !== '/login' && redirectParam !== '/signup'
            ? `/login?redirect=${encodeURIComponent(redirectParam)}`
            : '/login';

        return { component: undefined, href: loginTarget };
    }

    // 4. Protected route: /dashboard
    if (pathname === '/dashboard') {
        if (!isUserAuth) {
            return {
                component: undefined,
                href: `/login?redirect=${encodeURIComponent('/dashboard')}`
            };
        }
        const route = _getEmptyRoute();

        route.component = DashboardPage;

        return route;
    }

    // 4b. Protected Enterprise Admin Control Center routes: /admin and /admin/*
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        if (!isUserAuth) {
            return {
                component: undefined,
                href: `/login?redirect=${encodeURIComponent(window.location.pathname)}`
            };
        }
        if (!isAdminUser(state)) {
            return {
                component: undefined,
                href: `/dashboard?error=${encodeURIComponent('Administrator privileges required')}`
            };
        }
        const route = _getEmptyRoute();

        route.component = AdminControlCenter;

        return route;
    }

    // 5. Root / landing route: / and /test
    if (pathname === '/' || pathname === '/test') {
        const route = _getEmptyRoute();

        route.component = isUserAuth ? DashboardPage : LandingPage;

        return route;
    }

    // 6. Meeting Route (any other path, e.g. /jd0-fmc-29f)
    const publicRoomId = pathname.replace(/^\/+/, '').split('/')[0] || state['features/base/conference'].room || '';
    const reduxRoom = state['features/base/conference'].room;

    if (isRoomValid(publicRoomId) && publicRoomId) {
        const currentJwt = state['features/base/jwt']?.jwt;
        const activeSession = getActiveMeetingSession(state);

        // Already authorized with a valid Jitsi JWT + isolated occurrence session room -> enter Conference!
        if (currentJwt && activeSession && activeSession.publicRoomId === publicRoomId) {
            return _getWebConferenceRoute(state);
        }

        const accessToken = getAccessToken(state);

        // Step A: Backend-authoritative meeting resolution BEFORE connecting to Jitsi.
        // Never allows creating a conference or taking over host by opening a link.
        try {
            const publicInfo = await authApiClient.getPublicMeetingInfo(publicRoomId, accessToken);
            const resStatus = publicInfo.resolutionStatus || (publicInfo.exists ? publicInfo.status : 'not_found');

            if (
                !publicInfo.exists
                || resStatus === 'not_found'
                || resStatus === 'cancelled'
                || resStatus === 'expired'
                || resStatus === 'ended'
            ) {
                const route = _getEmptyRoute();

                route.component = MeetingWaitingRoom;

                return route;
            }

            if (resStatus === 'waiting_for_host') {
                if (publicInfo.isHost || !publicInfo.canJoinBeforeHostNow) {
                    const route = _getEmptyRoute();

                    route.component = MeetingWaitingRoom;

                    return route;
                }
            }
        } catch (publicErr) {
            logger.warn('Failed to resolve public meeting status; gating in waiting room', publicErr);
            const route = _getEmptyRoute();

            route.component = MeetingWaitingRoom;

            return route;
        }

        // Step B: Unauthenticated guests join existing meetings via the Zoom-style Guest Join / Waiting screen
        if (!isUserAuth) {
            const route = _getEmptyRoute();

            route.component = MeetingWaitingRoom;

            return route;
        }

        // Step C: Authorize authenticated user with backend and bind isolated occurrence Jitsi room
        if (dispatch && accessToken) {
            try {
                const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
                const passcode = urlParams?.get('passcode') || undefined;
                const data = await authApiClient.getMeetingToken(publicRoomId, accessToken, passcode, {
                    allowHostAutoStart: false
                });
                const jitsiRoomName = data.session?.jitsiRoomName || data.meeting.roomId;

                dispatch(setActiveMeetingSession({
                    meetingId: data.meeting.id,
                    publicRoomId: data.meeting.roomId,
                    jitsiRoomName,
                    occurrenceId: data.occurrence?.id || '',
                    sessionId: data.session?.id || '',
                    title: data.meeting.title,
                    role: data.role,
                    isHost: data.role === 'owner' || data.role === 'moderator',
                    isOwner: data.role === 'owner',
                    isRecurring: data.meeting.meetingType === 'recurring'
                }));
                dispatch(setJWT(data.token));

                if (jitsiRoomName !== reduxRoom) {
                    dispatch(setRoom(jitsiRoomName));

                    return _getWebConferenceRoute({
                        ...state,
                        'features/base/conference': {
                            ...state['features/base/conference'],
                            room: jitsiRoomName
                        }
                    });
                }
            } catch (err: any) {
                logger.warn('Meeting access gated by backend policy:', err.code, err.message);

                if (
                    err.code === 'WAITING_FOR_HOST'
                    || err.code === 'HOST_NOT_STARTED'
                    || err.code === 'PASSCODE_REQUIRED'
                    || err.code === 'INVALID_PASSCODE'
                    || err.code === 'MEETING_CANCELLED'
                    || err.code === 'MEETING_ENDED'
                    || err.code === 'MEETING_EXPIRED'
                    || err.code === 'MEETING_NOT_FOUND'
                ) {
                    const route = _getEmptyRoute();

                    route.component = MeetingWaitingRoom;

                    return route;
                }

                const errorMsg = err.message || 'Failed to authorize meeting';

                return {
                    component: undefined,
                    href: `/dashboard?error=${encodeURIComponent(errorMsg)}`
                };
            }
        }

        return _getWebConferenceRoute(state);
    }

    return _getWebWelcomePageRoute(state);
}

/**
 * Returns the {@code Route} to display when trying to access a conference if
 * a valid conference is being joined.
 *
 * @param {Object} state - The redux state.
 * @returns {Promise|undefined}
 */
function _getWebConferenceRoute(state: IReduxState): Promise<any> | undefined {
    const room = state['features/base/conference'].room;

    if (!isRoomValid(room)) {
        return;
    }

    const route = _getEmptyRoute();

    const { locationURL } = state['features/base/connection'];

    if (window.location.href !== locationURL?.href) {
        route.href = locationURL?.href;

        return Promise.resolve(route);
    }

    return getDeepLinkingPage(state)
        .then(deepLinkComponent => {
            if (deepLinkComponent) {
                route.component = deepLinkComponent;
            } else if (isSupportedBrowser()) {
                route.component = Conference;
            } else {
                route.component = UnsupportedDesktopBrowser;
            }

            return route;
        });
}

/**
 * Returns the {@code Route} to display when trying to access the welcome page.
 *
 * @param {Object} state - The redux state.
 * @returns {Promise<Object>}
 */
function _getWebWelcomePageRoute(state: IReduxState) {
    const route = _getEmptyRoute();

    if (isWelcomePageEnabled(state)) {
        if (isSupportedBrowser()) {
            const customLandingPage = getCustomLandingPageURL(state);

            if (customLandingPage) {
                route.href = customLandingPage;
            } else {
                route.component = isAuthenticated(state) ? DashboardPage : LandingPage;
            }
        } else {
            route.component = UnsupportedDesktopBrowser;
        }
    } else {
        const url = new URL(window.location.href);

        url.pathname += generateRoomWithoutSeparator();
        route.href = url.href;
    }

    return Promise.resolve(route);
}

/**
 * Returns the default {@code Route}.
 *
 * @returns {Object}
 */
function _getEmptyRoute(): { component: any; href?: string; } {
    return {
        component: BlankPage,
        href: undefined
    };
}
