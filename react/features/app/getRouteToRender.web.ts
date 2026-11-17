import { generateRoomWithoutSeparator } from '@jitsi/js-utils/random';

import { IStateful } from '../base/app/types';
import { isRoomValid } from '../base/conference/functions';
import { isSupportedBrowser } from '../base/environment/environment';
import { setJWT } from '../base/jwt/actions';
import { toState } from '../base/redux/functions';
import Conference from '../conference/components/web/Conference';
import { getDeepLinkingPage } from '../deep-linking/functions';
import UnsupportedDesktopBrowser from '../unsupported-browser/components/UnsupportedDesktopBrowser';
import BlankPage from '../welcome/components/BlankPage.web';
import { getCustomLandingPageURL, isWelcomePageEnabled } from '../welcome/functions';

import AuthLoadingScreen from '../auth/components/AuthLoadingScreen.web';
import DashboardPage from '../auth/components/DashboardPage.web';
import LandingPage from '../auth/components/LandingPage.web';
import LoginPage from '../auth/components/LoginPage.web';
import MeetingWaitingRoom from '../auth/components/MeetingWaitingRoom.web';
import SignUpPage from '../auth/components/SignUpPage.web';
import { getAccessToken, isAuthInitializing, isAuthenticated } from '../auth/functions';
import { authApiClient } from '../auth/api';

import { IReduxState, IStore } from './types';
import logger from './logger';

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

    // 3. Public route: /signup
    if (pathname === '/signup') {
        if (isUserAuth) {
            const redirectParam = new URLSearchParams(window.location.search).get('redirect');
            const target = redirectParam && redirectParam !== '/login' && redirectParam !== '/signup'
                ? redirectParam
                : '/dashboard';
            return { component: undefined, href: target };
        }
        const route = _getEmptyRoute();
        route.component = SignUpPage;
        return route;
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

    // 5. Root / landing route: / and /test
    if (pathname === '/' || pathname === '/test') {
        const route = _getEmptyRoute();
        route.component = isUserAuth ? DashboardPage : LandingPage;
        return route;
    }

    // 6. Meeting Route (any other path, e.g. /my-meeting or /7tk-wk1-x3t)
    const room = state['features/base/conference'].room
        || pathname.replace(/^\/+/, '').split('/')[0];

    if (isRoomValid(room) && room) {
        const currentJwt = state['features/base/jwt']?.jwt;

        // Already authorized with a valid Jitsi JWT (e.g. just unlocked from MeetingWaitingRoom)
        if (currentJwt) {
            return _getWebConferenceRoute(state);
        }

        const accessToken = getAccessToken(state);

        // Step A: Inspect public meeting status BEFORE forcing login or connecting to Jitsi.
        // Shows Zoom-style "Waiting for the host to start this meeting" screen for scheduled meetings.
        try {
            const publicInfo = await authApiClient.getPublicMeetingInfo(room, accessToken);

            if (publicInfo.exists) {
                if (publicInfo.status === 'cancelled' || publicInfo.status === 'ended') {
                    const route = _getEmptyRoute();
                    route.component = MeetingWaitingRoom;
                    return route;
                }

                if (publicInfo.isScheduled && publicInfo.status === 'scheduled') {
                    if (!publicInfo.isOwner && publicInfo.joinBeforeHost === false) {
                        const route = _getEmptyRoute();
                        route.component = MeetingWaitingRoom;
                        return route;
                    }

                    if (publicInfo.isOwner) {
                        const route = _getEmptyRoute();
                        route.component = MeetingWaitingRoom;
                        return route;
                    }
                }
            }
        } catch (publicErr) {
            logger.warn('Failed to fetch public meeting info, falling back to auth gate', publicErr);
        }

        // Step B: Critical business rule — unauthenticated users cannot join active rooms
        if (!isUserAuth) {
            const target = window.location.pathname + window.location.search;
            return {
                component: undefined,
                href: `/login?redirect=${encodeURIComponent(target)}`
            };
        }

        // Step C: Authorize with backend and ensure Jitsi JWT is set before connecting
        if (dispatch && accessToken) {
            try {
                const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
                const passcode = urlParams?.get('passcode') || undefined;
                const data = await authApiClient.getMeetingToken(room, accessToken, passcode, {
                    allowHostAutoStart: false
                });
                dispatch(setJWT(data.token));
            } catch (err: any) {
                logger.warn('Meeting access gated by backend policy:', err.code, err.message);

                if (
                    err.code === 'WAITING_FOR_HOST'
                    || err.code === 'HOST_NOT_STARTED'
                    || err.code === 'PASSCODE_REQUIRED'
                    || err.code === 'INVALID_PASSCODE'
                    || err.code === 'MEETING_CANCELLED'
                    || err.code === 'MEETING_ENDED'
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
