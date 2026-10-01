import {
    RESET_SHARED_BROWSER_STATE,
    SET_SHARED_BROWSER_STATE,
    TOGGLE_SHARED_BROWSER
} from './actionTypes';

export function setSharedBrowserState(state: any) {
    return {
        type: SET_SHARED_BROWSER_STATE,
        ...state
    };
}

export function resetSharedBrowserState() {
    return {
        type: RESET_SHARED_BROWSER_STATE
    };
}

export function toggleSharedBrowser() {
    return {
        type: TOGGLE_SHARED_BROWSER
    };
}
