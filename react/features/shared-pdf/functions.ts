import { IStateful } from '../base/app/types';
import { IJitsiConference } from '../base/conference/reducer';
import { getFakeParticipants } from '../base/participants/functions';
import { toState } from '../base/redux/functions';

import {
    SHARED_PDF,
    SHARED_PDF_PARTICIPANT_NAME
} from './constants';

/**
 * Returns true if there is a PDF being shared in the meeting.
 *
 * @param {Object | Function} stateful - The Redux state or a function that gets resolved to the Redux state.
 * @returns {boolean}
 */
export function isPdfSharing(stateful: IStateful): boolean {
    let pdfSharing = false;

    for (const [ , p ] of getFakeParticipants(stateful)) {
        if (p.name === SHARED_PDF_PARTICIPANT_NAME) {
            pdfSharing = true;
            break;
        }
    }

    return pdfSharing;
}

/**
 * Returns true if shared PDF functionality is enabled and false otherwise.
 *
 * @param {IStateful} stateful - The redux store or getState function.
 * @returns {boolean}
 */
export function isSharedPdfEnabled(stateful: IStateful) {
    const state = toState(stateful);
    const { fileSharing } = state['features/base/config'] ?? {};

    return Boolean(fileSharing?.enabled && fileSharing?.apiUrl);
}

/**
 * Sends SHARED_PDF command.
 *
 * @param {Object} options - The options.
 * @returns {void}
 */
export function sendSharePdfCommand({
    documentId,
    documentUrl,
    status,
    conference,
    localParticipantId = '',
    page = 1,
    zoom = 1.0,
    scrollX = 0,
    scrollY = 0,
    rotation = 0,
    presenterMode = false
}: {
    conference?: IJitsiConference;
    documentId: string;
    documentUrl?: string;
    localParticipantId?: string;
    status: string;
    page?: number;
    zoom?: number;
    scrollX?: number;
    scrollY?: number;
    rotation?: number;
    presenterMode?: boolean;
}) {
    conference?.sendCommandOnce(SHARED_PDF, {
        value: documentId,
        attributes: {
            from: localParticipantId,
            state: status,
            documentUrl,
            page,
            zoom,
            scrollX,
            scrollY,
            rotation,
            presenterMode
        }
    });
}
