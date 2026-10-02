import { AnyAction } from 'redux';
import ReducerRegistry from '../base/redux/ReducerRegistry';

import {
    RESET_SHARED_BROWSER_STATE,
    SET_SHARED_BROWSER_STATE,
    TOGGLE_SHARED_BROWSER
} from './actionTypes';

export interface ISharedBrowserState {
    isOpen: boolean;
    sessionId?: string;
    ownerId?: string;
    url?: string;
    navigationVersion: number;
    history: string[];
    currentIndex: number;
    scrollX?: number;
    scrollY?: number;
}

const DEFAULT_STATE: ISharedBrowserState = {
    isOpen: false,
    navigationVersion: 0,
    history: [],
    currentIndex: -1
};

ReducerRegistry.register('features/shared-browser', (state: ISharedBrowserState = DEFAULT_STATE, action: AnyAction) => {
    switch (action.type) {
    case SET_SHARED_BROWSER_STATE: {
        return {
            ...state,
            isOpen: action.isOpen !== undefined ? action.isOpen : state.isOpen,
            sessionId: action.sessionId || state.sessionId,
            ownerId: action.ownerId || state.ownerId,
            url: action.url !== undefined ? action.url : state.url,
            navigationVersion: action.navigationVersion !== undefined ? action.navigationVersion : state.navigationVersion,
            history: action.history !== undefined ? action.history : state.history,
            currentIndex: action.currentIndex !== undefined ? action.currentIndex : state.currentIndex,
            scrollX: action.scrollX !== undefined ? action.scrollX : state.scrollX,
            scrollY: action.scrollY !== undefined ? action.scrollY : state.scrollY
        };
    }
    case RESET_SHARED_BROWSER_STATE:
        return DEFAULT_STATE;
    default:
        return state;
    }
});
