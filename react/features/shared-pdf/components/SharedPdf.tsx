import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { IReduxState } from '../../app/types';
import { getLocalParticipant } from '../../base/participants/functions';
import { PDF_STATUS } from '../constants';
import { resetSharedPdfStatus } from '../actions';

/**
 * Renders a shared PDF document using the browser's native PDF viewer.
 * The PDF is loaded from a blob URL stored in Redux (no backend required).
 */
function SharedPdf() {
    const dispatch = useDispatch();

    const documentUrl = useSelector((state: IReduxState) => state['features/shared-pdf']?.documentUrl);
    const documentId = useSelector((state: IReduxState) => state['features/shared-pdf']?.documentId);
    const status = useSelector((state: IReduxState) => state['features/shared-pdf']?.status);
    const ownerId = useSelector((state: IReduxState) => state['features/shared-pdf']?.ownerId);
    const localParticipantId = useSelector((state: IReduxState) => getLocalParticipant(state)?.id);

    const isOwner = ownerId === localParticipantId;
    const isSharing = status === PDF_STATUS.OPEN;

    const handleStopSharing = useCallback(() => {
        dispatch(resetSharedPdfStatus());
    }, [ dispatch ]);

    if (!isSharing || !documentUrl) {
        return null;
    }

    return (
        <div
            id = 'shared-pdf-container'
            style = {{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#1a1a2e',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 10
            }}>
            {/* PDF rendered via iframe for full native browser PDF viewer */}
            <iframe
                src = { documentUrl }
                style = {{
                    width: '100%',
                    flex: 1,
                    border: 'none',
                    backgroundColor: '#ffffff'
                }}
                title = 'Shared PDF' />
            {/* Bottom control bar */}
            {isOwner && (
                <div
                    style = {{
                        height: '48px',
                        width: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        padding: '0 16px',
                        flexShrink: 0
                    }}>
                    <span
                        style = {{
                            color: '#e0e0e0',
                            fontSize: '14px',
                            fontWeight: 500
                        }}>
                        📄 Sharing PDF
                    </span>
                    <button
                        onClick = { handleStopSharing }
                        style = {{
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 20px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}>
                        Stop Sharing
                    </button>
                </div>
            )}
        </div>
    );
}

export default SharedPdf;
