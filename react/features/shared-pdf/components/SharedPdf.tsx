import React, { useCallback, useMemo } from 'react';
import { connect, useDispatch } from 'react-redux';

import { IReduxState } from '../../app/types';
import { getLocalParticipant } from '../../base/participants/functions';
import { PDF_STATUS } from '../constants';
import { updateLocalSharedPdfState, togglePdfFollowPresenter, resetSharedPdfStatus } from '../actions';
import { isPdfSharing, sendSharePdfCommand } from '../functions';
import { getCurrentConference } from '../../base/conference/functions';

interface IProps {
    documentUrl?: string;
    documentId?: string;
    isSharing: boolean;
    isOwner: boolean;
    presenterPage: number;
    presenterZoom: number;
    presenterRotation: number;
    localPage: number;
    localZoom: number;
    localRotation: number;
    followPresenter: boolean;
    localParticipantId: string;
    conference: any;
}

/**
 * Renders a shared PDF document using an embedded object/iframe.
 * The PDF is loaded from a data URL stored in Redux (no backend required).
 */
function SharedPdf(props: IProps) {
    const {
        documentUrl,
        documentId,
        isSharing,
        isOwner,
        localParticipantId,
        conference
    } = props;

    const dispatch = useDispatch();

    const handleStopSharing = useCallback(() => {
        if (isOwner && documentId) {
            sendSharePdfCommand({
                conference,
                documentId,
                localParticipantId,
                status: PDF_STATUS.STOP
            });
            dispatch(resetSharedPdfStatus());
        }
    }, [isOwner, documentId, conference, localParticipantId, dispatch]);

    if (!isSharing || !documentUrl) {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#2a2a2a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
        }}>
            {/* PDF rendered via embed for full native browser PDF viewer */}
            <embed
                src={documentUrl}
                type='application/pdf'
                style={{
                    width: '100%',
                    height: 'calc(100% - 50px)',
                    border: 'none'
                }}
            />
            {/* Bottom control bar */}
            <div style={{
                height: '50px',
                width: '100%',
                backgroundColor: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                padding: '0 16px'
            }}>
                <span style={{
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 500
                }}>
                    📄 PDF Shared
                </span>
                {isOwner && (
                    <button
                        onClick={handleStopSharing}
                        style={{
                            backgroundColor: '#location',
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 16px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s'
                        }}
                    >
                        Stop Sharing
                    </button>
                )}
            </div>
        </div>
    );
}

function mapStateToProps(state: IReduxState) {
    const sharedPdfState = state['features/shared-pdf'];
    const localParticipant = getLocalParticipant(state);

    return {
        isSharing: sharedPdfState?.status === PDF_STATUS.OPEN,
        documentUrl: sharedPdfState?.documentUrl,
        documentId: sharedPdfState?.documentId,
        isOwner: sharedPdfState?.ownerId === localParticipant?.id,
        presenterPage: sharedPdfState?.presenterPage ?? 1,
        presenterZoom: sharedPdfState?.presenterZoom ?? 1.0,
        presenterRotation: sharedPdfState?.presenterRotation ?? 0,
        localPage: sharedPdfState?.localPage ?? 1,
        localZoom: sharedPdfState?.localZoom ?? 1.0,
        localRotation: sharedPdfState?.localRotation ?? 0,
        followPresenter: sharedPdfState?.followPresenter ?? true,
        localParticipantId: localParticipant?.id ?? '',
        conference: getCurrentConference(state)
    };
}

export default connect(mapStateToProps)(SharedPdf);
