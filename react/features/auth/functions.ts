import { IReduxState } from '../app/types';
import { AUTH_STORE_NAME } from './constants';
import { IAuthState, IUser } from './types';

export function getAuthState(state: IReduxState): IAuthState {
    return (state as any)[AUTH_STORE_NAME] || {
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isInitializing: true,
        isLoading: false,
        error: null,
        redirectTarget: null
    };
}

export function getAuthUser(state: IReduxState): IUser | null {
    return getAuthState(state).user;
}

export function isAuthenticated(state: IReduxState): boolean {
    return Boolean(getAuthState(state).isAuthenticated && getAuthState(state).user);
}

export function isAuthInitializing(state: IReduxState): boolean {
    return getAuthState(state).isInitializing;
}

export function isAuthLoading(state: IReduxState): boolean {
    return getAuthState(state).isLoading;
}

export function getAccessToken(state: IReduxState): string | null {
    return getAuthState(state).accessToken;
}

export function getAuthError(state: IReduxState): string | null {
    return getAuthState(state).error;
}

export function getRedirectTarget(state: IReduxState): string | null {
    return getAuthState(state).redirectTarget;
}

