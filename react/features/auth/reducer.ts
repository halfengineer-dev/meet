import ReducerRegistry from '../base/redux/ReducerRegistry';
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
import { AUTH_STORE_NAME } from './constants';
import { IAuthState } from './types';

const DEFAULT_STATE: IAuthState = {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isInitializing: true,
    isLoading: false,
    error: null,
    redirectTarget: null
};

ReducerRegistry.register<IAuthState>(AUTH_STORE_NAME, (state = DEFAULT_STATE, action: any): IAuthState => {
    switch (action.type) {
    case AUTH_INIT_START:
        return {
            ...state,
            isInitializing: true,
            error: null
        };

    case AUTH_INIT_SUCCESS:
        return {
            ...state,
            isInitializing: false,
            isAuthenticated: true,
            user: action.user,
            accessToken: action.accessToken,
            error: null
        };

    case AUTH_INIT_FAILURE:
        return {
            ...state,
            isInitializing: false,
            isAuthenticated: false,
            user: null,
            accessToken: null
        };

    case AUTH_LOGIN_START:
    case AUTH_REGISTER_START:
        return {
            ...state,
            isLoading: true,
            error: null
        };

    case AUTH_LOGIN_SUCCESS:
    case AUTH_REGISTER_SUCCESS:
        return {
            ...state,
            isLoading: false,
            isAuthenticated: true,
            user: action.user,
            accessToken: action.accessToken,
            error: null
        };

    case AUTH_LOGIN_FAILURE:
    case AUTH_REGISTER_FAILURE:
        return {
            ...state,
            isLoading: false,
            isAuthenticated: false,
            error: action.error
        };

    case AUTH_LOGOUT:
        return {
            ...DEFAULT_STATE,
            isInitializing: false
        };

    case AUTH_CLEAR_ERROR:
        return {
            ...state,
            error: null
        };

    case AUTH_SET_REDIRECT:
        return {
            ...state,
            redirectTarget: action.target
        };

    default:
        return state;
    }
});

