import { IStateful } from '../base/app/types';
import { IJitsiConference } from '../base/conference/reducer';
import { getFakeParticipants } from '../base/participants/functions';
import { toState } from '../base/redux/functions';
import { BROWSER_PLAYER_PARTICIPANT_NAME, SHARED_BROWSER, ALLOWED_PROTOCOLS } from './constants';

export function isBrowserShared(stateful: IStateful): boolean {
    const state = toState(stateful);
    return state['features/shared-browser']?.isOpen;
}

export function isSharedBrowserOwner(stateful: IStateful, participantId: string): boolean {
    const state = toState(stateful);
    return state['features/shared-browser']?.ownerId === participantId;
}

export function normalizeUrl(input: string): string {
    if (!input) {
        return '';
    }

    let trimmed = input.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        // Check if it's a search query (no dots or contains spaces)
        if (trimmed.indexOf(' ') !== -1 || trimmed.indexOf('.') === -1) {
            // The igu=1 parameter allows Google search to be embedded in an iframe 
            return `https://www.google.com/search?igu=1&q=${encodeURIComponent(trimmed)}`;
        }
        trimmed = `https://${trimmed}`;
    }

    try {
        const urlObj = new URL(trimmed);
        return urlObj.toString();
    } catch (_) {
        return '';
    }
}

export function validateBrowserUrl(url: string): boolean {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        return ALLOWED_PROTOCOLS.includes(urlObj.protocol.toLowerCase());
    } catch (_) {
        return false;
    }
}

export function sendSharedBrowserCommand({
    conference,
    commandType,
    sessionId,
    url,
    navigationVersion,
    ownerId,
    scrollX,
    scrollY
}: {
    conference: IJitsiConference;
    commandType: string;
    sessionId: string;
    url?: string;
    navigationVersion: number;
    ownerId: string;
    scrollX?: number;
    scrollY?: number;
}) {
    conference?.sendCommandOnce(SHARED_BROWSER, {
        value: commandType,
        attributes: {
            sessionid: sessionId,
            url: url || '',
            version: navigationVersion,
            ownerid: ownerId,
            scrollx: scrollX ?? 0,
            scrolly: scrollY ?? 0
        }
    });
}
