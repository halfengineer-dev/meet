import React, { useCallback } from 'react';
import { connect, useDispatch } from 'react-redux';

import { IReduxState } from '../../app/types';
import { getLocalParticipant } from '../../base/participants/functions';
import { participantLeft } from '../../base/participants/actions';
import { getCurrentConference } from '../../base/conference/functions';
import { PDF_STATUS } from '../constants';
import { resetSharedPdfStatus } from '../actions';

interface IProps {
    documentUrl?: string;
    documentId?: string;
    isSharing: boolean;
    isOwner: boolean;
    localParticipantId: string;
}

/**
 * Renders a shared PDF document using an iframe pointed at the Cloudflare-hosted URL.
 * The browser's native PDF viewer handles all rendering — no extra libraries needed.
 * All participants receive the same URL via XMPP, so everyone sees the same PDF.
 */
function SharedPdf(props: IProps) {
    const {
        documentUrl,
        documentId,
        isSharing,
        isOwner
    } = props;

    const dispatch = useDispatch();

    const handleStopSharing = useCallback(() => {
        if (isOwner && documentId) {
            dispatch(resetSharedPdfStatus());
        }
    }, [isOwner, documentId, dispatch]);

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
            {/* PDF rendered via iframe — uses the browser's native PDF viewer */}
            <iframe
                src={documentUrl}
                style={{
                    width: '100%',
                    height: 'calc(100% - 50px)',
                    border: 'none'
                }}
                title='Shared PDF'
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
        localParticipantId: localParticipant?.id ?? ''
    };
}

export default connect(mapStateToProps)(SharedPdf);
