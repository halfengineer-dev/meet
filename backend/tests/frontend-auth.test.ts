import { describe, it, expect, beforeEach } from 'vitest';
import ReducerRegistry from '../../react/features/base/redux/ReducerRegistry';
import {
    AUTH_CLEAR_ERROR,
    AUTH_INIT_FAILURE,
    AUTH_INIT_START,
    AUTH_INIT_SUCCESS,
    AUTH_LOGIN_FAILURE,
    AUTH_LOGIN_START,
    AUTH_LOGIN_SUCCESS,
    AUTH_LOGOUT,
    AUTH_SET_REDIRECT
} from '../../react/features/auth/actionTypes';
import { AUTH_STORE_NAME } from '../../react/features/auth/constants';
import { IAuthState } from '../../react/features/auth/types';
import '../../react/features/auth/reducer';
import {
    getAuthUser,
    isAuthenticated,
    isAuthInitializing,
    getAccessToken,
    getAuthError
} from '../../react/features/auth/functions';

describe('Frontend Auth State Management & Reducer', () => {
    let reducer: any;

    beforeEach(() => {
        reducer = (ReducerRegistry as any)._elements[AUTH_STORE_NAME];
    });

    it('has correct initial default state with isInitializing = true', () => {
        const state: IAuthState = reducer(undefined, { type: '@@INIT' });

        expect(state.user).toBeNull();
        expect(state.accessToken).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.isInitializing).toBe(true);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(state.redirectTarget).toBeNull();
    });

    it('handles AUTH_INIT_START correctly', () => {
        const state = reducer(undefined, { type: AUTH_INIT_START });
        expect(state.isInitializing).toBe(true);
        expect(state.error).toBeNull();
    });

    it('handles AUTH_INIT_SUCCESS restoring user and access token', () => {
        const mockUser = {
            id: 'u-123',
            name: 'Alice',
            email: 'alice@example.com',
            avatarUrl: null,
            emailVerified: true,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastLoginAt: null
        };

        const state = reducer(undefined, {
            type: AUTH_INIT_SUCCESS,
            user: mockUser,
            accessToken: 'token-xyz-123'
        });

        expect(state.isInitializing).toBe(false);
        expect(state.isAuthenticated).toBe(true);
        expect(state.user).toEqual(mockUser);
        expect(state.accessToken).toBe('token-xyz-123');
        expect(state.error).toBeNull();

        // Test selectors
        const mockReduxState: any = { [AUTH_STORE_NAME]: state };
        expect(isAuthenticated(mockReduxState)).toBe(true);
        expect(isAuthInitializing(mockReduxState)).toBe(false);
        expect(getAuthUser(mockReduxState)).toEqual(mockUser);
        expect(getAccessToken(mockReduxState)).toBe('token-xyz-123');
    });

    it('handles AUTH_INIT_FAILURE clearing auth and ending initialization', () => {
        const state = reducer(undefined, { type: AUTH_INIT_FAILURE });

        expect(state.isInitializing).toBe(false);
        expect(state.isAuthenticated).toBe(false);
        expect(state.user).toBeNull();
        expect(state.accessToken).toBeNull();

        const mockReduxState: any = { [AUTH_STORE_NAME]: state };
        expect(isAuthenticated(mockReduxState)).toBe(false);
        expect(isAuthInitializing(mockReduxState)).toBe(false);
    });

    it('handles AUTH_LOGIN_START and AUTH_LOGIN_SUCCESS lifecycle', () => {
        let state = reducer(undefined, { type: AUTH_LOGIN_START });
        expect(state.isLoading).toBe(true);
        expect(state.error).toBeNull();

        const mockUser = {
            id: 'u-456',
            name: 'Bob',
            email: 'bob@example.com',
            avatarUrl: null,
            emailVerified: false,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastLoginAt: null
        };

        state = reducer(state, {
            type: AUTH_LOGIN_SUCCESS,
            user: mockUser,
            accessToken: 'bob-access-token'
        });

        expect(state.isLoading).toBe(false);
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.email).toBe('bob@example.com');
        expect(state.accessToken).toBe('bob-access-token');
    });

    it('handles AUTH_LOGIN_FAILURE recording error message', () => {
        const state = reducer(undefined, {
            type: AUTH_LOGIN_FAILURE,
            error: 'Invalid email or password'
        });

        expect(state.isLoading).toBe(false);
        expect(state.isAuthenticated).toBe(false);
        expect(state.error).toBe('Invalid email or password');

        const mockReduxState: any = { [AUTH_STORE_NAME]: state };
        expect(getAuthError(mockReduxState)).toBe('Invalid email or password');
    });

    it('handles AUTH_LOGOUT resetting to clean unauthenticated state', () => {
        let state = reducer(undefined, {
            type: AUTH_LOGIN_SUCCESS,
            user: { id: 'u-1', email: 'test@example.com' },
            accessToken: 'tok-123'
        });
        expect(state.isAuthenticated).toBe(true);

        state = reducer(state, { type: AUTH_LOGOUT });
        expect(state.isAuthenticated).toBe(false);
        expect(state.user).toBeNull();
        expect(state.accessToken).toBeNull();
        expect(state.isInitializing).toBe(false);
    });

    it('handles AUTH_SET_REDIRECT and AUTH_CLEAR_ERROR', () => {
        let state = reducer(undefined, {
            type: AUTH_SET_REDIRECT,
            target: '/daily-scrum'
        });
        expect(state.redirectTarget).toBe('/daily-scrum');

        state = reducer(state, {
            type: AUTH_LOGIN_FAILURE,
            error: 'Some error'
        });
        expect(state.error).toBe('Some error');

        state = reducer(state, { type: AUTH_CLEAR_ERROR });
        expect(state.error).toBeNull();
    });
});

