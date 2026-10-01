import ReducerRegistry from '../base/redux/ReducerRegistry';

import {
    RESET_SHARED_PDF_STATUS,
    SET_SHARED_PDF_STATUS,
    UPDATE_LOCAL_SHARED_PDF_STATE,
    TOGGLE_PDF_FOLLOW_PRESENTER
} from './actionTypes';
import { PDF_STATUS } from './constants';

export interface ISharedPdfState {
    documentId?: string;
    documentUrl?: string; // The URL to download the PDF
    status?: string;
    ownerId?: string;

    // Presenter state (global sync)
    presenterPage?: number;
    presenterZoom?: number;
    presenterScrollX?: number;
    presenterScrollY?: number;
    presenterRotation?: number;
    presenterMode?: boolean;

    // Local state (independent exploration)
    localPage?: number;
    localZoom?: number;
    localScrollX?: number;
    localScrollY?: number;
    localRotation?: number;

    followPresenter: boolean;
}

const DEFAULT_STATE: ISharedPdfState = {
    followPresenter: true,
    localPage: 1,
    localZoom: 1.0,
    localScrollX: 0,
    localScrollY: 0,
    localRotation: 0,
    presenterPage: 1,
    presenterZoom: 1.0,
    presenterScrollX: 0,
    presenterScrollY: 0,
    presenterRotation: 0,
    presenterMode: false
};

ReducerRegistry.register<ISharedPdfState>('features/shared-pdf', (state = DEFAULT_STATE, action): ISharedPdfState => {
    switch (action.type) {
    case SET_SHARED_PDF_STATUS: {
        const { documentId, documentUrl, status, ownerId, page, zoom, scrollX, scrollY, rotation, presenterMode } = action;

        return {
            ...state,
            documentId: documentId ?? state.documentId,
            documentUrl: documentUrl ?? state.documentUrl,
            status: status ?? state.status,
            ownerId: ownerId ?? state.ownerId,
            presenterPage: page ?? state.presenterPage,
            presenterZoom: zoom ?? state.presenterZoom,
            presenterScrollX: scrollX ?? state.presenterScrollX,
            presenterScrollY: scrollY ?? state.presenterScrollY,
            presenterRotation: rotation ?? state.presenterRotation,
            presenterMode: presenterMode ?? state.presenterMode
        };
    }

    case UPDATE_LOCAL_SHARED_PDF_STATE: {
        const { page, zoom, scrollX, scrollY, rotation } = action;

        return {
            ...state,
            localPage: page ?? state.localPage,
            localZoom: zoom ?? state.localZoom,
            localScrollX: scrollX ?? state.localScrollX,
            localScrollY: scrollY ?? state.localScrollY,
            localRotation: rotation ?? state.localRotation
        };
    }

    case TOGGLE_PDF_FOLLOW_PRESENTER:
        return {
            ...state,
            followPresenter: !state.followPresenter
        };

    case RESET_SHARED_PDF_STATUS:
        return DEFAULT_STATE;
    }

    return state;
});
