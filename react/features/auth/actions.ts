import { IStore } from '../app/types';
import { setJWT } from '../base/jwt/actions';
import {
    AUTH_CLEAR_ERROR,
    AUTH_INIT_FAILURE,
    AUTH_INIT_START,
    AUTH_INIT_SUCCESS,
    AUTH_LOGIN_FAILURE,
    AUTH_LOGIN_START,
    AUTH_LOGIN_SUCCESS,
    AUTH_LOGOUT,
    AUTH_REGISTER_FAILURE,
    AUTH_REGISTER_START,
    AUTH_REGISTER_SUCCESS,
    AUTH_SET_REDIRECT
} from './actionTypes';
import { authApiClient } from './api';
import { AUTH_ROUTES } from './constants';
import { getAccessToken, getRedirectTarget } from './functions';
import { IUser } from './types';

export function clearAuthError() {
    return {
        type: AUTH_CLEAR_ERROR
    };
}

export function setRedirectTarget(target: string | null) {
    return {
        type: AUTH_SET_REDIRECT,
        target
    };
}

export function initAuth() {
    return async (dispatch: IStore['dispatch']) => {
        dispatch({ type: AUTH_INIT_START });

        try {
            const data = await authApiClient.refresh();
            dispatch({
                type: AUTH_INIT_SUCCESS,
                user: data.user,
                accessToken: data.accessToken
            });
            return data.user;
        } catch (_) {
            dispatch({ type: AUTH_INIT_FAILURE });
            return null;
        }
    };
}

export function login(email: string, password: string, redirectTarget?: string | null) {
    return async (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        dispatch({ type: AUTH_LOGIN_START });

        try {
            const data = await authApiClient.login({ email, password });
            dispatch({
                type: AUTH_LOGIN_SUCCESS,
                user: data.user,
                accessToken: data.accessToken
            });

            const destination = redirectTarget || getRedirectTarget(getState()) || AUTH_ROUTES.DASHBOARD;
            dispatch(setRedirectTarget(null));

            // Navigate to target destination
            if (typeof window !== 'undefined' && window.location) {
                (window.location as any).href = destination;
            }
            return data.user;
        } catch (err: any) {
            dispatch({
                type: AUTH_LOGIN_FAILURE,
                error: err.message || 'Login failed. Please check your credentials.'
            });
            throw err;
        }
    };
}

export function register(name: string, email: string, password: string, redirectTarget?: string | null) {
    return async (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        dispatch({ type: AUTH_REGISTER_START });

        try {
            const data = await authApiClient.register({ name, email, password });
            dispatch({
                type: AUTH_REGISTER_SUCCESS,
                user: data.user,
                accessToken: data.accessToken
            });

            const destination = redirectTarget || getRedirectTarget(getState()) || AUTH_ROUTES.DASHBOARD;
            dispatch(setRedirectTarget(null));

            // Navigate to target destination
            if (typeof window !== 'undefined' && window.location) {
                (window.location as any).href = destination;
            }
            return data.user;
        } catch (err: any) {
            dispatch({
                type: AUTH_REGISTER_FAILURE,
                error: err.message || 'Registration failed'
            });
            throw err;
        }
    };
}

export function logout() {
    return async (dispatch: IStore['dispatch']) => {
        try {
            await authApiClient.logout();
        } catch (_) {
            // Ignore failure on logout
        } finally {
            dispatch({ type: AUTH_LOGOUT });
            dispatch(setJWT(undefined));
            if (typeof window !== 'undefined' && window.location) {
                (window.location as any).href = AUTH_ROUTES.ROOT;
            }
        }
    };
}

export function createMeeting(title?: string) {
    return async (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        const token = getAccessToken(getState());
        if (!token) {
            throw new Error('User not authenticated');
        }

        const data = await authApiClient.createMeeting(title, token);
        dispatch(setJWT(data.token));

        if (typeof window !== 'undefined' && window.location) {
            (window.location as any).href = `/${data.meeting.roomId}`;
        }
        return data;
    };
}

export function authorizeMeeting(roomId: string) {
    return async (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        const token = getAccessToken(getState());
        if (!token) {
            throw new Error('User not authenticated');
        }

        const data = await authApiClient.getMeetingToken(roomId, token);
        dispatch(setJWT(data.token));
        return data;
    };
}
