/**
 * The type of the action which resets the shared PDF status.
 *
 * {
 *     type: RESET_SHARED_PDF_STATUS
 * }
 */
export const RESET_SHARED_PDF_STATUS = 'RESET_SHARED_PDF_STATUS';

/**
 * The type of the action which sets the shared PDF status.
 *
 * {
 *     type: SET_SHARED_PDF_STATUS,
 *     documentId: string,
 *     status: string,
 *     ownerId: string,
 *     page: number,
 *     zoom: number,
 *     scrollX: number,
 *     scrollY: number,
 *     rotation: number,
 *     presenterMode: boolean
 * }
 */
export const SET_SHARED_PDF_STATUS = 'SET_SHARED_PDF_STATUS';

/**
 * The type of the action which updates the local participant's PDF state (zoom, scroll, page).
 * This doesn't necessarily get broadcast unless we are the presenter in presenterMode.
 *
 * {
 *     type: UPDATE_LOCAL_SHARED_PDF_STATE,
 *     page: number,
 *     zoom: number,
 *     scrollX: number,
 *     scrollY: number,
 *     rotation: number
 * }
 */
export const UPDATE_LOCAL_SHARED_PDF_STATE = 'UPDATE_LOCAL_SHARED_PDF_STATE';

/**
 * The type of the action to toggle presenter follow mode.
 *
 * {
 *     type: TOGGLE_PDF_FOLLOW_PRESENTER
 * }
 */
export const TOGGLE_PDF_FOLLOW_PRESENTER = 'TOGGLE_PDF_FOLLOW_PRESENTER';
