import { batch } from 'react-redux';

import { IStore } from '../app/types';
import { CONFERENCE_JOIN_IN_PROGRESS, CONFERENCE_LEFT } from '../base/conference/actionTypes';
import { getCurrentConference } from '../base/conference/functions';
import { IJitsiConference } from '../base/conference/reducer';
import { PARTICIPANT_LEFT } from '../base/participants/actionTypes';
import { participantJoined, participantLeft, pinParticipant } from '../base/participants/actions';
import { getLocalParticipant, getParticipantById } from '../base/participants/functions';
import { FakeParticipant } from '../base/participants/types';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';

import { RESET_SHARED_PDF_STATUS, SET_SHARED_PDF_STATUS, UPDATE_LOCAL_SHARED_PDF_STATE } from './actionTypes';
import { resetSharedPdfStatus, setSharedPdfStatus } from './actions';
import { PDF_STATUS, SHARED_PDF, SHARED_PDF_PARTICIPANT_NAME } from './constants';
import { isSharedPdfEnabled, sendSharePdfCommand } from './functions';
import logger from './logger';

/**
 * Middleware that captures actions related to PDF sharing.
 *
 * @param {Store} store - The redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register(store => next => action => {
    const { dispatch, getState } = store;

    if (!isSharedPdfEnabled(getState())) {
        return next(action);
    }

    switch (action.type) {
    case CONFERENCE_JOIN_IN_PROGRESS: {
        const { conference } = action;
        const localParticipantId = getLocalParticipant(getState())?.id;

        conference.addCommandListener(SHARED_PDF,
            ({ value, attributes }: {
                attributes: {
                    from: string;
                    state: string;
                    documentUrl: string;
                    page: string;
                    zoom: string;
                    scrollX: string;
                    scrollY: string;
                    rotation: string;
                    presenterMode: string;
                };
                value: string;
            },
            from: string) => {
                const state = getState();
                const sharedPdfStatus = attributes.state;
                const { ownerId } = state['features/shared-pdf'];

                if (ownerId && ownerId !== from) {
                    logger.warn(
                        `User with id: ${from} sent shared PDF command: ${sharedPdfStatus} while we are sharing.`);
                    return;
                }

                if (sharedPdfStatus === PDF_STATUS.OPEN) {
                    handleSharingPdfStatus(store, value, attributes, conference);
                    return;
                }

                if (sharedPdfStatus === PDF_STATUS.STOP) {
                    const pdfParticipant = getParticipantById(state, value);

                    dispatch(participantLeft(value, conference, {
                        fakeParticipant: pdfParticipant?.fakeParticipant
                    }));

                    if (localParticipantId !== from) {
                        dispatch(resetSharedPdfStatus());
                    }
                }
            }
        );
        break;
    }
    case CONFERENCE_LEFT:
        dispatch(resetSharedPdfStatus());
        break;
    case PARTICIPANT_LEFT: {
        const state = getState();
        const conference = getCurrentConference(state);
        const { ownerId: stateOwnerId, documentId } = state['features/shared-pdf'];

        if (action.participant.id === stateOwnerId) {
            batch(() => {
                dispatch(resetSharedPdfStatus());
                dispatch(participantLeft(documentId ?? '', conference));
            });
        }
        break;
    }
    case SET_SHARED_PDF_STATUS: {
        const state = getState();
        const conference = getCurrentConference(state);
        const localParticipantId = getLocalParticipant(state)?.id;
        const oldStatus = state['features/shared-pdf']?.status ?? '';
        const { documentId, documentUrl, status, ownerId, presenterPage, presenterZoom, presenterScrollX, presenterScrollY, presenterRotation, presenterMode } = action;

        // If transitioning to OPEN for the first time, create the fake participant
        if (status === PDF_STATUS.OPEN && oldStatus !== PDF_STATUS.OPEN && conference && documentId) {
            dispatch(participantJoined({
                conference,
                fakeParticipant: FakeParticipant.SharedPdf,
                id: documentId,
                name: SHARED_PDF_PARTICIPANT_NAME
            }));
            dispatch(pinParticipant(documentId));
        }

        // If local user is the owner, broadcast the change via XMPP
        if (localParticipantId === ownerId && status === PDF_STATUS.OPEN) {
            sendSharePdfCommand({
                conference,
                documentId,
                documentUrl,
                localParticipantId,
                status,
                page: presenterPage,
                zoom: presenterZoom,
                scrollX: presenterScrollX,
                scrollY: presenterScrollY,
                rotation: presenterRotation,
                presenterMode
            });
        }
        break;
    }
    case UPDATE_LOCAL_SHARED_PDF_STATE: {
        const result = next(action);
        const state = getState();
        const conference = getCurrentConference(state);
        const localParticipantId = getLocalParticipant(state)?.id;
        const { ownerId, documentId, documentUrl, status, localPage, localZoom, localScrollX, localScrollY, localRotation, presenterMode } = state['features/shared-pdf'];

        if (localParticipantId === ownerId && status === PDF_STATUS.OPEN) {
            sendSharePdfCommand({
                conference,
                documentId: documentId ?? '',
                documentUrl: documentUrl ?? '',
                localParticipantId,
                status,
                page: localPage,
                zoom: localZoom,
                scrollX: localScrollX,
                scrollY: localScrollY,
                rotation: localRotation,
                presenterMode
            });
        }
        return result;
    }
    case RESET_SHARED_PDF_STATUS: {
        const state = getState();
        const localParticipantId = getLocalParticipant(state)?.id;
        const { ownerId: stateOwnerId, documentId } = state['features/shared-pdf'];

        if (!stateOwnerId) {
            break;
        }

        if (localParticipantId === stateOwnerId) {
            const conference = getCurrentConference(state);

            sendSharePdfCommand({
                conference,
                documentId: documentId ?? '',
                localParticipantId,
                status: PDF_STATUS.STOP
            });
        }
        break;
    }
    }

    return next(action);
});

/**
 * Handles the open and sync statuses for the shared PDF.
 * Dispatches participantJoined event and, if necessary, pins it.
 *
 * @param {Store} store - The redux store.
 * @param {string} documentId - The id of the shared PDF.
 * @param {Object} attributes - The attributes received from the share pdf command.
 * @param {JitsiConference} conference - The current conference.
 * @returns {void}
 */
function handleSharingPdfStatus(store: IStore, documentId: string,
        attributes: any, conference: IJitsiConference) {
    const { dispatch, getState } = store;
    const localParticipantId = getLocalParticipant(getState())?.id;
    const oldStatus = getState()['features/shared-pdf']?.status ?? '';
    const oldDocumentId = getState()['features/shared-pdf'].documentId;
    
    const { from, state, documentUrl, page, zoom, scrollX, scrollY, rotation, presenterMode } = attributes;

    if (oldDocumentId && oldDocumentId !== documentId) {
        logger.warn(
            `User with id: ${from} sent documentId: ${documentId} while we are sharing: ${oldDocumentId}`);

        return;
    }

    if (state === PDF_STATUS.OPEN && oldStatus !== PDF_STATUS.OPEN) {
        dispatch(participantJoined({
            conference,
            fakeParticipant: FakeParticipant.SharedPdf,
            id: documentId,
            name: SHARED_PDF_PARTICIPANT_NAME
        }));

        dispatch(pinParticipant(documentId));

        if (localParticipantId === from) {
            dispatch(setSharedPdfStatus({
                documentId,
                documentUrl,
                status: state,
                ownerId: localParticipantId,
                page: page ? Number(page) : undefined,
                zoom: zoom ? Number(zoom) : undefined,
                scrollX: scrollX ? Number(scrollX) : undefined,
                scrollY: scrollY ? Number(scrollY) : undefined,
                rotation: rotation ? Number(rotation) : undefined,
                presenterMode: presenterMode === 'true'
            }));
        }
    }

    if (localParticipantId !== from) {
        dispatch(setSharedPdfStatus({
            documentId,
            documentUrl,
            status: state,
            ownerId: from,
            page: page ? Number(page) : undefined,
            zoom: zoom ? Number(zoom) : undefined,
            scrollX: scrollX ? Number(scrollX) : undefined,
            scrollY: scrollY ? Number(scrollY) : undefined,
            rotation: rotation ? Number(rotation) : undefined,
            presenterMode: presenterMode === 'true'
        }));
    }
}
