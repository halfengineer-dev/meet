import {
    RESET_SHARED_PDF_STATUS,
    SET_SHARED_PDF_STATUS,
    UPDATE_LOCAL_SHARED_PDF_STATE,
    TOGGLE_PDF_FOLLOW_PRESENTER
} from './actionTypes';
import { PDF_STATUS } from './constants';

/**
 * Resets the shared PDF status.
 *
 * @returns {{
 *     type: RESET_SHARED_PDF_STATUS
 * }}
 */
export function resetSharedPdfStatus() {
    return {
        type: RESET_SHARED_PDF_STATUS
    };
}

/**
 * Sets the shared PDF status.
 *
 * @param {Object} options - The options.
 * @returns {{
 *     type: SET_SHARED_PDF_STATUS,
 *     documentId: string,
 *     documentUrl: string,
 *     status: string,
 *     ownerId: string,
 *     page: number,
 *     zoom: number,
 *     scrollX: number,
 *     scrollY: number,
 *     rotation: number,
 *     presenterMode: boolean
 * }}
 */
export function setSharedPdfStatus(options: {
    documentId?: string;
    documentUrl?: string;
    status?: string;
    ownerId?: string;
    page?: number;
    zoom?: number;
    scrollX?: number;
    scrollY?: number;
    rotation?: number;
    presenterMode?: boolean;
}) {
    return {
        type: SET_SHARED_PDF_STATUS,
        ...options
    };
}

/**
 * Updates the local shared PDF state.
 *
 * @param {Object} options - The options.
 * @returns {{
 *     type: UPDATE_LOCAL_SHARED_PDF_STATE,
 *     page: number,
 *     zoom: number,
 *     scrollX: number,
 *     scrollY: number,
 *     rotation: number
 * }}
 */
export function updateLocalSharedPdfState(options: {
    page?: number;
    zoom?: number;
    scrollX?: number;
    scrollY?: number;
    rotation?: number;
}) {
    return {
        type: UPDATE_LOCAL_SHARED_PDF_STATE,
        ...options
    };
}

/**
 * Toggles the follow presenter mode.
 *
 * @returns {{
 *     type: TOGGLE_PDF_FOLLOW_PRESENTER
 * }}
 */
export function togglePdfFollowPresenter() {
    return {
        type: TOGGLE_PDF_FOLLOW_PRESENTER
    };
}
