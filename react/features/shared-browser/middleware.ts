import { IStore } from '../app/types';
import { CONFERENCE_JOIN_IN_PROGRESS, CONFERENCE_LEFT } from '../base/conference/actionTypes';
import { getCurrentConference } from '../base/conference/functions';
import { PARTICIPANT_LEFT } from '../base/participants/actionTypes';
import { participantJoined, participantLeft, pinParticipant } from '../base/participants/actions';
import { getLocalParticipant, getParticipantById } from '../base/participants/functions';
import { FakeParticipant } from '../base/participants/types';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';

import { resetSharedBrowserState, setSharedBrowserState } from './actions';
import {
    BROWSER_EVENTS,
    BROWSER_PLAYER_PARTICIPANT_NAME,
    SHARED_BROWSER
} from './constants';
import {
    sendSharedBrowserCommand,
    validateBrowserUrl
} from './functions';
import { TOGGLE_SHARED_BROWSER } from './actionTypes';

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15);
}

MiddlewareRegistry.register(store => next => action => {
    const { dispatch, getState } = store;

    switch (action.type) {
    case CONFERENCE_JOIN_IN_PROGRESS: {
        const { conference } = action;
        const localParticipantId = getLocalParticipant(getState())?.id;

        conference.addCommandListener(SHARED_BROWSER,
            ({ value, attributes }: { value: string; attributes: any }, from: string) => {
                const state = getState();
                const sharedBrowserState = state['features/shared-browser'];
                const commandType = value;
                const { url, sessionid, version, ownerid } = attributes;

                // Validate URL if present
                if (url && !validateBrowserUrl(url)) {
                    return;
                }

                // If already open, ignore older versions
                if (sharedBrowserState.isOpen && 
                    sharedBrowserState.sessionId === sessionid &&
                    commandType !== BROWSER_EVENTS.OPEN &&
                    commandType !== BROWSER_EVENTS.CLOSE &&
                    Number(version) <= sharedBrowserState.navigationVersion &&
                    localParticipantId !== from) {
                    return; // Ignore stale events
                }

                if (commandType === BROWSER_EVENTS.OPEN || commandType === BROWSER_EVENTS.NAVIGATE || commandType === BROWSER_EVENTS.SYNC_STATE || commandType === BROWSER_EVENTS.SYNC_SCROLL) {
                    if (!sharedBrowserState.isOpen) {
                        // Create fake participant
                        dispatch(participantJoined({
                            conference,
                            fakeParticipant: FakeParticipant.SharedBrowser,
                            id: sessionid,
                            name: BROWSER_PLAYER_PARTICIPANT_NAME
                        }));

                        dispatch(pinParticipant(sessionid));
                    }

                    // For navigate, add to history if it's a new navigation
                    let newHistory = sharedBrowserState.history || [];
                    let newIndex = sharedBrowserState.currentIndex !== undefined ? sharedBrowserState.currentIndex : -1;

                    if (commandType === BROWSER_EVENTS.NAVIGATE && url && localParticipantId !== from) {
                        newHistory = newHistory.slice(0, newIndex + 1);
                        newHistory.push(url);
                        newIndex = newHistory.length - 1;
                    }

                    dispatch(setSharedBrowserState({
                        isOpen: true,
                        sessionId: sessionid,
                        ownerId: ownerid,
                        url: url || sharedBrowserState.url,
                        navigationVersion: Number(version),
                        history: newHistory,
                        currentIndex: newIndex,
                        scrollX: attributes.scrollx ? Number(attributes.scrollx) : undefined,
                        scrollY: attributes.scrolly ? Number(attributes.scrolly) : undefined
                    }));

                } else if (commandType === BROWSER_EVENTS.CLOSE) {
                    dispatch(participantLeft(sessionid, conference, {
                        fakeParticipant: FakeParticipant.SharedBrowser
                    }));
                    dispatch(resetSharedBrowserState());
                }
            }
        );
        break;
    }
    case CONFERENCE_LEFT:
        dispatch(resetSharedBrowserState());
        break;
    case PARTICIPANT_LEFT: {
        const state = getState();
        const conference = getCurrentConference(state);
        const { ownerId, sessionId } = state['features/shared-browser'];

        if (action.participant.id === ownerId && sessionId) {
            dispatch(participantLeft(sessionId, conference, {
                fakeParticipant: FakeParticipant.SharedBrowser
            }));
            dispatch(resetSharedBrowserState());
        }
        break;
    }
    case TOGGLE_SHARED_BROWSER: {
        const state = getState();
        const conference = getCurrentConference(state);
        const localParticipantId = getLocalParticipant(state)?.id;
        const sharedBrowserState = state['features/shared-browser'];

        if (sharedBrowserState.isOpen) {
            if (sharedBrowserState.ownerId === localParticipantId && conference) {
                sendSharedBrowserCommand({
                    conference,
                    commandType: BROWSER_EVENTS.CLOSE,
                    sessionId: sharedBrowserState.sessionId || '',
                    navigationVersion: sharedBrowserState.navigationVersion,
                    ownerId: localParticipantId || ''
                });
                
                dispatch(participantLeft(sharedBrowserState.sessionId || '', conference, {
                    fakeParticipant: FakeParticipant.SharedBrowser
                }));
                dispatch(resetSharedBrowserState());
            }
        } else {
            const sessionId = `browser-${generateSessionId()}`;
            dispatch(setSharedBrowserState({
                isOpen: true,
                sessionId,
                ownerId: localParticipantId,
                navigationVersion: 1,
                history: [],
                currentIndex: -1
            }));

            dispatch(participantJoined({
                conference,
                fakeParticipant: FakeParticipant.SharedBrowser,
                id: sessionId,
                name: BROWSER_PLAYER_PARTICIPANT_NAME
            }));

            dispatch(pinParticipant(sessionId));

            if (conference) {
                sendSharedBrowserCommand({
                    conference,
                    commandType: BROWSER_EVENTS.OPEN,
                    sessionId,
                    navigationVersion: 1,
                    ownerId: localParticipantId || ''
                });
            }
        }
        
        return next(action);
    }
    }

    return next(action);
});
